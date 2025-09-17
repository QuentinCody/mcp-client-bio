import { NextRequest, NextResponse } from 'next/server';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

function normalizeHeaders(headers?: Array<{ key?: string; value?: string }> | Record<string, string>) {
  if (Array.isArray(headers)) {
    return headers.reduce<Record<string, string>>((acc, header) => {
      if (header?.key) acc[header.key] = header.value ?? "";
      return acc;
    }, {});
  }
  if (headers && typeof headers === 'object') {
    return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, String(v ?? "")]));
  }
  return {};
}

export async function POST(req: NextRequest) {
  let client: Client | undefined;
  try {
    type CompletionRequest = {
      url?: string;
      type?: "http" | "sse";
      headers?: Array<{ key?: string; value?: string }> | Record<string, string>;
      promptName?: string;
      argumentName?: string;
      value?: string;
      contextArgs?: Record<string, string>;
    };

    const body = (await req.json().catch(() => ({}))) as CompletionRequest;
    const { url, type, headers, promptName, argumentName, value, contextArgs } = body;
    if (!url || !type || !promptName || !argumentName) {
      return NextResponse.json({ error: 'url, type, promptName, and argumentName are required' }, { status: 400 });
    }

    const baseUrl = new URL(url);
    client = new Client({ name: 'mcp-prompt-complete', version: '1.0.0' });
    if (type === 'http') {
      const headerEntries = normalizeHeaders(headers);
      const transport = new StreamableHTTPClientTransport(baseUrl, {
        requestInit: { headers: headerEntries, credentials: 'include', mode: 'cors' },
      });
      await client.connect(transport);
    } else {
      const headerEntries = normalizeHeaders(headers);
      const transport = new SSEClientTransport(baseUrl, {
        requestInit: { headers: headerEntries },
      });
      await client.connect(transport);
    }

    try {
      const completion = await client.complete({
        ref: { type: 'ref/prompt', name: promptName },
        argument: { name: argumentName, value: value ?? '' },
        context: { arguments: contextArgs ?? {} },
      });

      const result = completion?.completion;
      return NextResponse.json({
        values: Array.isArray(result?.values) ? result.values : [],
        hasMore: result?.hasMore ?? false,
        total: result?.total,
      });
    } catch (error: any) {
      return NextResponse.json({ values: [], hasMore: false, total: 0, error: error?.message || 'completion/complete not supported' }, { status: 200 });
    }
  } catch (error: any) {
    return NextResponse.json({ values: [], hasMore: false, total: 0, error: error?.message || 'Unknown error' }, { status: 200 });
  } finally {
    try { await client?.close(); } catch {}
  }
}
