# Code Mode Setup Instructions

## Current Status
❌ **Code Mode is NOT active** - The LLM can only use direct MCP tool calls  
✅ **After setup** - The LLM will be able to write JavaScript code that uses MCP tools

## Why This Matters
Right now, when you ask the LLM to search DataCite or query NCI GDC, it calls those tools directly. This is inefficient because:
- Each tool call requires a round-trip through the LLM
- Tool definitions consume thousands of tokens
- Complex multi-step queries are slow

With Code Mode enabled, the LLM can write JavaScript code like:
```javascript
const papers = await helpers.datacite.invoke('search_works', { query: 'NSCLC' });
const filtered = papers.filter(p => p.year >= 2020);
return { papers: filtered, count: filtered.length };
```

All in ONE step, much faster and cheaper!

---

## Setup Steps

### Step 1: Get Your Next.js App URL

**If deploying to production (Vercel/etc):**
- Your URL might be: `https://your-app.vercel.app`

**If testing locally:**
- You'll need to expose localhost using ngrok or similar
- Run: `ngrok http 3000`
- Use the ngrok URL (e.g., `https://abc123.ngrok.io`)

**Your Next.js URL:** `_________________` ← Fill this in

---

### Step 2: Create .env.local File

Create a file called `.env.local` in your project root with these contents:

```bash
# =============================================================================
# CODE MODE CONFIGURATION
# =============================================================================

# LEAVE THIS EMPTY FOR NOW - You'll fill it in after deploying the worker
CODEMODE_WORKER_URL=

# Authentication tokens (generated for you)
CODEMODE_WORKER_TOKEN=8abee00847b88a63293c44d0517bb2c4e1e613a36f199b54dc4d32969e8d566e
CODEMODE_PROXY_TOKEN=ab5978a630813b1f5615ccaa488f4428b126961f22469daef7263396581a33ac

# Add your existing environment variables here (database, API keys, etc.)
# DATABASE_URL=...
# OPENAI_API_KEY=...
# ANTHROPIC_API_KEY=...
```

---

### Step 3: Update wrangler.toml

Edit `workers/codemode/wrangler.toml` and update the `[vars]` section:

```toml
[vars]
# Replace 'your-app-domain' with your actual Next.js URL from Step 1
PROXY_URL = "https://your-app-domain/api/codemode/proxy"

# These must match the tokens in .env.local
PROXY_TOKEN = "ab5978a630813b1f5615ccaa488f4428b126961f22469daef7263396581a33ac"
CODEMODE_CLIENT_TOKEN = "8abee00847b88a63293c44d0517bb2c4e1e613a36f199b54dc4d32969e8d566e"
```

**Important:** Replace `https://your-app-domain` with your actual URL!

---

### Step 4: Deploy the Cloudflare Worker

**Prerequisites:**
- Cloudflare account (free tier is fine)
- Wrangler CLI installed: `npm install -g wrangler`
- Logged in: `wrangler login`

**Deploy:**
```bash
cd workers/codemode
npx wrangler deploy
```

**You should see output like:**
```
Published codemode-sandbox (X.XX sec)
  https://codemode-sandbox.your-account.workers.dev
```

**Copy that URL!** ← This is your `CODEMODE_WORKER_URL`

---

### Step 5: Update .env.local with Worker URL

Open `.env.local` and add the worker URL:

```bash
# Update this line with the URL from Step 4
CODEMODE_WORKER_URL=https://codemode-sandbox.your-account.workers.dev
```

---

### Step 6: Restart Your Next.js App

```bash
# Stop your dev server (Ctrl+C) and restart
pnpm dev
```

---

### Step 7: Test the Proxy Endpoint

First, make sure your Next.js app is running, then test the proxy:

```bash
curl -X POST http://localhost:3000/api/codemode/proxy \
  -H "Content-Type: application/json" \
  -H "x-codemode-token: ab5978a630813b1f5615ccaa488f4428b126961f22469daef7263396581a33ac" \
  -d '{"server":"datacite","tool":"search_works","args":{"query":"test","limit":1}}'
```

**Expected:** You should see search results from DataCite  
**If error:** Check that your tokens match between `.env.local` and the curl command

---

### Step 8: Test End-to-End in Chat

Open your app in the browser and try this prompt:

```
Use the codemode sandbox to search DataCite for papers about "lung cancer" 
published after 2020, and return just the titles.
```

**What should happen:**
1. The LLM recognizes it should use `codemode_sandbox` tool
2. It writes JavaScript code that calls `helpers.datacite.invoke()`
3. The code executes in the Cloudflare Worker
4. Results come back to the LLM
5. The LLM formats the titles for you

**Check the browser console/network tab** to see the tool call happening!

### Use Entrez via MCP helpers instead of `fetch`

Code Mode forbids reaching `https://eutils.ncbi.nlm.nih.gov` directly, so any `fetch` to Entrez will fail with “fetch failed.” Instead, let the sandbox call the Entrez MCP helper that’s already wired through `app/api/codemode/proxy`.

```javascript
const response = await helpers.entrez.invoke('entrez_query', {
  term: 'KRAS',
  retmax: 10,
  retmode: 'json',
});

const ids = response?.idList || response?.ids || [];

if (!ids.length) {
  return { markdown: 'No PubMed IDs found for KRAS.' };
}

const summaries = await helpers.entrez.invoke('entrez_data', {
  ids,
  retmode: 'json',
});

return {
  markdown: ids
    .map((id, index) => `- PubMed ID ${id}: ${summaries?.[index]?.title ?? 'Title missing'}`)
    .join('\n'),
  ids,
  summaries,
};
```

This keeps the HTTP request inside the MCP server (which can reach Entrez) while the sandbox only talks to your helper API.

---

## Verification Checklist

After setup, verify these things:

### In Browser DevTools Console:
```
[API /chat] tools count= XX model= ...
```
Should show `codemode_sandbox` in the tools list

### In Cloudflare Worker Logs:
```bash
npx wrangler tail codemode-sandbox
```
You should see execution logs when the LLM uses the tool

### Expected Behavior Change:
- **Before:** LLM calls `datacite_search_works` directly, takes 2-3 seconds
- **After:** LLM uses `codemode_sandbox`, writes code, returns results, takes 1-2 seconds

---

## Troubleshooting

### "Tool codemode_sandbox not available"
- Check that `CODEMODE_WORKER_URL` is set in `.env.local`
- Restart Next.js dev server after adding environment variables

### "Unauthorized" error from worker
- Verify `CODEMODE_WORKER_TOKEN` matches in both `.env.local` and `wrangler.toml` (as `CODEMODE_CLIENT_TOKEN`)

### "Proxy error" from sandbox
- Verify `CODEMODE_PROXY_TOKEN` (in `.env.local`) matches `PROXY_TOKEN` (in `wrangler.toml`)
- Check that your Next.js app URL is correct in `wrangler.toml` as `PROXY_URL`
- If using ngrok for local testing, make sure ngrok is running

### Worker deploys but doesn't work
- Check worker logs: `npx wrangler tail codemode-sandbox`
- Verify the `PROXY_URL` is accessible from the internet (not `localhost`)

### LLM still uses direct tools instead of code mode
- The LLM chooses which tool to use based on the task
- Try being explicit: "Use the codemode sandbox to..."
- For complex queries, the LLM is more likely to choose code mode
- Check that the system prompt emphasizes using available tools

---

## Architecture Diagram

```
┌─────────────┐
│  User asks  │
│  question   │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────┐
│  LLM in Next.js                      │
│  - Sees 'codemode_sandbox' tool     │
│  - Writes JavaScript code            │
└──────┬───────────────────────────────┘
       │
       │ POST { goal, code }
       │ + CODEMODE_WORKER_TOKEN
       ▼
┌──────────────────────────────────────┐
│  Cloudflare Worker                   │
│  - Creates isolated environment      │
│  - Provides helpers.datacite/ncigdc  │
│  - Executes user code                │
└──────┬───────────────────────────────┘
       │
       │ helpers.datacite.invoke()
       │ + CODEMODE_PROXY_TOKEN
       ▼
┌──────────────────────────────────────┐
│  Next.js Proxy                       │
│  (/api/codemode/proxy)               │
│  - Validates token                   │
│  - Calls MCP server                  │
└──────┬───────────────────────────────┘
       │
       │ MCP Request
       ▼
┌──────────────────────────────────────┐
│  MCP Server (DataCite/NCI GDC)       │
│  - Returns data                      │
└──────┬───────────────────────────────┘
       │
       │ Results bubble back up
       ▼
┌──────────────────────────────────────┐
│  User sees formatted results         │
└──────────────────────────────────────┘
```

---

## Token Usage Comparison

### Traditional Direct MCP (Current):
```
User: "Search DataCite for lung cancer papers from 2020+"
→ Tool definitions: ~5,000 tokens
→ Tool call: datacite_search_works
→ Result: ~2,000 tokens
→ Total: ~7,000 tokens
```

### Code Mode (After Setup):
```
User: "Search DataCite for lung cancer papers from 2020+"
→ Tool definition (codemode_sandbox): ~500 tokens
→ Generated code: ~200 tokens
→ Result: ~2,000 tokens
→ Total: ~2,700 tokens
```

**Savings: ~60% fewer tokens + faster execution!**

---

## Next Steps After Setup

Once Code Mode is working, you can:

1. **Add more MCP servers** - Edit `app/api/codemode/proxy/route.ts` to whitelist new servers
2. **Monitor usage** - Check Cloudflare Worker analytics for execution metrics
3. **Optimize prompts** - Encourage the LLM to use code mode for complex queries
4. **Add TypeScript support** - Compile TypeScript code before execution
5. **Enable caching** - Add Redis/KV for persistent state between executions

See `docs/codemode-architecture.md` for more details!

---

## Support

If you run into issues:
1. Check the troubleshooting section above
2. Review `docs/codemode-architecture.md` for technical details
3. Check Cloudflare Worker logs: `npx wrangler tail codemode-sandbox`
4. Check Next.js server logs for proxy errors
5. Verify all tokens match between `.env.local` and `wrangler.toml`

