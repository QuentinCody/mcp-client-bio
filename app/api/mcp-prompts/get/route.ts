import { NextRequest, NextResponse } from 'next/server';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

function normalizeHeaders(headers?: Array<{ key?: string; value?: string }> | Record<string, string>) {
  if (!headers) return {} as Record<string, string>;
  if (Array.isArray(headers)) {
    const normalized: Record<string, string> = {};
    for (const header of headers) {
      if (!header?.key) continue;
      normalized[header.key] = header.value ?? "";
    }
    return normalized;
  }
  if (typeof headers === "object") {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!key) continue;
      normalized[key] = String(value ?? "");
    }
    return normalized;
  }
  return {} as Record<string, string>;
}

export async function POST(req: NextRequest) {
  let client: Client | undefined;
  try {
    type PromptRequest = {
      url?: string;
      type?: "http" | "sse";
      name?: string;
      headers?: Array<{ key?: string; value?: string }> | Record<string, string>;
      args?: Record<string, unknown>;
    };

    const body = (await req.json().catch(() => ({}))) as PromptRequest;
    const { url, type, name, headers, args } = body;
    if (!url || !name || !type) {
      return NextResponse.json({ error: 'url, type and name are required' }, { status: 400 });
    }
    const baseUrl = new URL(url);
    client = new Client({ name: 'mcp-prompt-get', version: '1.0.0' });
    const headerEntries = normalizeHeaders(headers);
    // Required for DeepSense MCP servers (they filter by User-Agent)
    if (!headerEntries['User-Agent']) {
      headerEntries['User-Agent'] = 'claude-code/2.0';
    }
    if (type === 'http') {
      const transport = new StreamableHTTPClientTransport(baseUrl, {
        requestInit: { headers: headerEntries },
      });
      await client.connect(transport);
    } else {
      const transport = new SSEClientTransport(baseUrl, {
        requestInit: { headers: headerEntries },
      });
      await client.connect(transport);
    }
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('prompts/get timeout')), 30000));
    const normalizedArgs: Record<string, string> = {};
    if (args && typeof args === "object") {
      for (const [key, value] of Object.entries(args)) {
        if (key) normalizedArgs[key] = String(value ?? "");
      }
    }
    try {
      const res: any = await Promise.race([
        client.getPrompt({ name, arguments: normalizedArgs }),
        timeout,
      ]);
      const messages = Array.isArray(res?.messages) ? res.messages : [];
      const description = typeof res?.description === "string" ? res.description : undefined;
      return NextResponse.json({ messages, description });
    } catch (err: any) {
      return NextResponse.json({ messages: [], description: undefined, error: err?.message || 'prompts/get not supported' }, { status: 200 });
    }
  } catch (err: any) {
    return NextResponse.json({ messages: [], description: undefined, error: err?.message || 'Unknown error' }, { status: 200 });
  } finally {
    try { await client?.close(); } catch {}
  }
}
