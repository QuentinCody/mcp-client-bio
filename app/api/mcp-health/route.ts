import { NextRequest, NextResponse } from 'next/server';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// Connection pool for MCP clients following best practices
const connectionPool = new Map<string, { client: Client; lastUsed: number }>();

// Cleanup stale connections every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [url, { client, lastUsed }] of connectionPool.entries()) {
    if (now - lastUsed > 60000) { // 1 minute timeout
      client.close().catch(() => {}); // Ignore cleanup errors
      connectionPool.delete(url);
    }
  }
}, 30000);

let parseErrorCount = 0; // retained for logic but no logging

type HeaderInput = Array<{ key?: string; value?: string }> | Record<string, string> | undefined;

function normalizeHeaders(input: HeaderInput): Record<string, string> {
  if (!input) return {};
  if (Array.isArray(input)) {
    const entries: Record<string, string> = {};
    for (const header of input) {
      if (!header?.key) continue;
      entries[header.key] = header.value ?? "";
    }
    return entries;
  }
  if (typeof input === "object") {
    const entries: Record<string, string> = {};
    for (const [key, value] of Object.entries(input)) {
      if (!key) continue;
      entries[key] = String(value ?? "");
    }
    return entries;
  }
  return {};
}

export async function POST(req: NextRequest) {
  let client: Client | undefined;
  const startTime = Date.now();

  try {
    // Robust body parsing: tolerate empty / aborted bodies quietly
    let requestData: any = {};
    try {
      // Read raw text first to distinguish empty body
      const raw = await req.text();
      if (raw && raw.trim().length > 0) {
        try {
          requestData = JSON.parse(raw);
        } catch (jsonErr) {
          parseErrorCount++;
          // logging suppressed
          return NextResponse.json({ ready: false, error: 'Invalid JSON body' }, { status: 400 });
        }
      } else {
        // No body provided – treat as malformed
        return NextResponse.json({ ready: false, error: 'Request body required' }, { status: 400 });
      }
    } catch (readErr: any) {
      // Likely an aborted request – keep noise low
  // logging suppressed
      return NextResponse.json({ ready: false, error: 'Body read error' }, { status: 400 });
    }

    const { url, headers, preferredType } = requestData;

    if (!url) {
      return NextResponse.json({ 
        ready: false, 
        error: 'URL is required' 
      }, { status: 400 });
    }

    const normalizedHeaders = normalizeHeaders(headers);
    // Required for DeepSense MCP servers (they filter by User-Agent)
    if (!normalizedHeaders['User-Agent']) {
      normalizedHeaders['User-Agent'] = 'claude-code/2.0';
    }

    // Check connection pool first
    const poolKey = `${url}-${JSON.stringify(normalizedHeaders)}`;
    const pooledConnection = connectionPool.get(poolKey);

    if (pooledConnection) {
      connectionPool.set(poolKey, { ...pooledConnection, lastUsed: Date.now() });
  // logging suppressed
      
      try {
        const tools = await pooledConnection.client.listTools();
        return NextResponse.json({
          ready: true,
          cached: true,
          tools: tools.tools?.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          })) || []
        });
      } catch (poolError) {
  // logging suppressed
        pooledConnection.client.close().catch(() => {});
        connectionPool.delete(poolKey);
      }
    }

    const baseUrl = new URL(url);
    let transportType = 'unknown';
    let connectionError: Error | undefined;

    // Decide transport order based on preferredType hint
    const tryOrder: ("streamable-http" | "sse")[] = preferredType === 'sse'
      ? ['sse', 'streamable-http']
      : ['streamable-http', 'sse'];

    // Try transports in order
    for (const attempt of tryOrder) {
      try {
        if (client) {
          await client.close().catch(() => {});
        }
        client = new Client({
          name: 'mcp-health-client',
          version: '1.0.0'
        });
        if (attempt === 'streamable-http') {
          const transport = new StreamableHTTPClientTransport(baseUrl, {
            requestInit: {
              headers: normalizedHeaders,
              credentials: 'include',
              mode: 'cors',
            },
          });
          await client.connect(transport);
        } else {
          const sseTransport = new SSEClientTransport(baseUrl, {
            requestInit: {
              headers: normalizedHeaders,
            },
          });
          await client.connect(sseTransport);
        }
        transportType = attempt;
  // logging suppressed
        connectionError = undefined;
        break; // success
      } catch (err) {
        connectionError = err as Error;
  // logging suppressed
      }
    }
    if (connectionError) {
      return NextResponse.json({
        ready: false,
        error: `Connection failed (${tryOrder.join(' -> ')}): ${connectionError.message}`,
        transportAttempted: tryOrder
      }, { status: 503 });
    }

    if (!client) {
      return NextResponse.json({
        ready: false,
        error: 'Failed to create client connection'
      }, { status: 503 });
    }

    // Get tools with timeout
    const toolsPromise = client.listTools();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Tool listing timeout')), 5000);
    });

    try {
      const tools = await Promise.race([toolsPromise, timeoutPromise]);
      // Also attempt to list prompts (soft-fail if unsupported)
      let prompts: any = { prompts: [] };
      try {
        const promptsTimeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Prompt listing timeout')), 4000));
        prompts = await Promise.race([client.listPrompts(), promptsTimeout]).catch(() => ({ prompts: [] }));
      } catch {
        prompts = { prompts: [] };
      }
      const connectionTime = Date.now() - startTime;
      
  // logging suppressed
      
      // Add to connection pool for reuse
      connectionPool.set(poolKey, { client, lastUsed: Date.now() });

      const listed = tools?.tools || [];
      const promptList = Array.isArray(prompts?.prompts) ? prompts.prompts : [];
      return NextResponse.json({
        ready: true,
        transport: transportType,
        connectionTime,
        toolCount: listed.length,
        tools: listed.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        })),
        prompts: promptList.map((p: any) => ({
          name: p.name,
          title: p.title,
          description: p.description,
          arguments: p.arguments || []
        }))
      });
    } catch (toolsError) {
  // logging suppressed
      await client.close().catch(() => {});
      
      return NextResponse.json({
        ready: false,
        error: `Tools listing failed: ${toolsError instanceof Error ? toolsError.message : 'Unknown error'}`,
        transport: transportType
      }, { status: 503 });
    }

  } catch (error) {
    const connectionTime = Date.now() - startTime;
  // logging suppressed
    
    if (client) {
      await client.close().catch(() => {});
    }
    
    return NextResponse.json({
      ready: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      connectionTime
    }, { status: 503 });
  }
} 
