import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

interface PromptListRequest {
  url?: string;
  type?: 'http' | 'sse';
  headers?: Array<{ key?: string; value?: string }> | Record<string, string>;
  cursor?: string | null;
}

function normalizeHeaders(headers?: Array<{ key?: string; value?: string }> | Record<string, string>) {
  if (!headers) return {} as Record<string, string>;
  if (Array.isArray(headers)) {
    const normalized: Record<string, string> = {};
    for (const header of headers) {
      if (!header?.key) continue;
      normalized[header.key] = header.value ?? '';
    }
    return normalized;
  }
  if (typeof headers === 'object') {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!key) continue;
      normalized[key] = String(value ?? '');
    }
    return normalized;
  }
  return {} as Record<string, string>;
}

export async function POST(req: NextRequest) {
  let client: Client | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as PromptListRequest;
    const { url, type, headers, cursor } = body;
    if (!url || !type) {
      return NextResponse.json({ error: 'url and type are required' }, { status: 400 });
    }

    const baseUrl = new URL(url);
    client = new Client({ name: 'mcp-prompt-list', version: '1.0.0' });
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

    try {
      const result = await client.listPrompts({ cursor: cursor ?? undefined });
      const prompts = Array.isArray(result?.prompts) ? result.prompts : [];
      return NextResponse.json({ prompts, nextCursor: result?.nextCursor ?? null });
    } catch (error: any) {
      return NextResponse.json(
        {
          prompts: [],
          nextCursor: null,
          error: error?.message || 'prompts/list not supported',
        },
        { status: 200 }
      );
    }
  } catch (error: any) {
    return NextResponse.json({ prompts: [], nextCursor: null, error: error?.message || 'Unknown error' }, { status: 200 });
  } finally {
    try {
      await client?.close();
    } catch {}
  }
}
