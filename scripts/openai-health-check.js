#!/usr/bin/env node
/*
 * Simple OpenAI API health check:
 * - Lists one model (HEAD + GET)
 * - Makes a minimal non-stream responses call (gpt-4o-mini)
 * Reports latency and status codes. Exits non-zero on failure.
 */
require('dotenv').config();
const fetch = (...a) => import('node-fetch').then(m => m.default(...a));

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('OPENAI_API_KEY missing');
  process.exit(2);
}

const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

(async () => {
  const results = [];
  async function step(name, fn) {
    const start = Date.now();
    try {
      const out = await fn();
      const ms = Date.now() - start;
      results.push({ name, ok: true, ms, detail: out });
    } catch (e) {
      const ms = Date.now() - start;
      results.push({ name, ok: false, ms, error: e.message || e.toString() });
    }
  }

  await step('HEAD /v1/models (latency probe)', async () => {
    const res = await fetch('https://api.openai.com/v1/models', { method: 'HEAD', headers });
    return { status: res.status, ok: res.ok };
  });

  await step('GET /v1/models (single page)', async () => {
    const res = await fetch('https://api.openai.com/v1/models', { headers });
    const txt = await res.text();
    if (!res.ok) throw new Error(`status ${res.status}: ${txt.slice(0,200)}`);
    return { status: res.status, size: txt.length };
  });

  await step('POST /v1/responses (gpt-4o-mini non-stream)', async () => {
    const body = {
      model: 'gpt-4o-mini',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
      stream: false,
      temperature: 0
    };
    const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers, body: JSON.stringify(body) });
    const txt = await res.text();
    if (!res.ok) throw new Error(`status ${res.status}: ${txt.slice(0,300)}`);
    return { status: res.status, bodySample: txt.slice(0,80) };
  });

  console.log('\nOpenAI Health Check Results:');
  let allOk = true;
  for (const r of results) {
    if (!r.ok) allOk = false;
    console.log(`- ${r.name}: ${r.ok ? 'OK' : 'FAIL'} (${r.ms}ms)` + (r.ok ? '' : ` -> ${r.error}`));
  }
  if (!allOk) process.exit(1);
})();
