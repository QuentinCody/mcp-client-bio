import { NextRequest, NextResponse } from 'next/server';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export async function POST(req: NextRequest) {
  let client: Client | undefined;
  try {
    const { url, type, name, headers, args } = await req.json();
    if (!url || !name || !type) {
      return NextResponse.json({ error: 'url, type and name are required' }, { status: 400 });
    }
    const baseUrl = new URL(url);
    client = new Client({ name: 'mcp-prompt-get', version: '1.0.0' });
    if (type === 'http') {
      const transport = new StreamableHTTPClientTransport(baseUrl, { requestInit: { headers: (headers || []).reduce((acc: any, h: any) => { if (h.key) acc[h.key] = h.value || ''; return acc; }, {}) } });
      await client.connect(transport);
    } else {
      const transport = new SSEClientTransport(baseUrl);
      await client.connect(transport);
    }
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('prompts/get timeout')), 7000));
    const res: any = await Promise.race([client.getPrompt({ name, arguments: args || {} }), timeout]);
    const messages = Array.isArray(res?.messages) ? res.messages : [];
    const simplified = messages.map((m: any) => ({ role: m.role, text: m.content?.text ?? '' }));
    return NextResponse.json({ messages: simplified });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  } finally {
    try { await client?.close(); } catch {}
  }
}

