import { dynamicTool, experimental_createMCPClient as createMCPClient } from 'ai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { sanitizeSchema, sanitizeToolParameters } from './schema-sanitizer';
import { enrichToolResult, initializeWithActiveServers } from './id-enrichment/id-enrichment';

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface MCPServerConfig {
  name?: string;
  url: string;
  type: 'sse' | 'http';
  headers?: KeyValuePair[];
  /** Optional per-server tool invocation timeout override (ms) */
  toolTimeoutMs?: number;
}

export interface MCPClientManager {
  tools: Record<string, any>;
  clients: any[];
  cleanup: () => Promise<void>;
  toolsByServer: Map<string, { config: MCPServerConfig; tools: Record<string, any> }>;
}

// Simple in-memory cache (per server URL + headers signature) to avoid reconnecting every request
interface CachedClientEntry {
  client: any;
  tools: Record<string, any>;
  lastUsed: number;
}

const CLIENT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const clientCache = new Map<string, CachedClientEntry>();

// Tool metrics & invocation tracking (in-memory)
interface ToolMetric {
  name: string;
  count: number;
  success: number;
  error: number;
  timeout: number;
  totalMs: number;
  lastMs?: number;
  lastStatus?: 'success' | 'error' | 'timeout';
  lastError?: string;
  lastInvokedAt?: number;
}

const toolMetrics = new Map<string, ToolMetric>();
let currentInvocationBatch: Array<{
  tool: string;
  startedAt: number;
  durationMs?: number;
  status?: 'success' | 'error' | 'timeout';
  error?: string;
}> = [];

export function resetMCPInvocationLog() {
  currentInvocationBatch = [];
}

export function getMCPMetrics(options: { includeInvocations?: boolean } = {}) {
  const metrics = Array.from(toolMetrics.values()).map(m => ({
    ...m,
    avgMs: m.count ? Math.round(m.totalMs / m.count) : 0,
    successRate: m.count ? +(m.success / m.count * 100).toFixed(1) : 0
  }));
  metrics.sort((a,b) => (b.lastInvokedAt || 0) - (a.lastInvokedAt || 0));
  return {
    metrics,
    invocations: options.includeInvocations ? currentInvocationBatch.slice() : undefined
  };
}

// Periodic cleanup (runs once per module load lifecycle)
if (typeof globalThis !== 'undefined' && !(globalThis as any).__mcpClientCacheCleanup) {
  (globalThis as any).__mcpClientCacheCleanup = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of clientCache.entries()) {
      if (now - entry.lastUsed > CLIENT_TTL_MS) {
        try { entry.client.disconnect?.(); } catch {}
        clientCache.delete(key);
      }
    }
  }, 60_000).unref?.();
}

function cacheKey(server: MCPServerConfig) {
  const headersSig = (server.headers || []).map(h => `${h.key}=${h.value}`).sort().join('&');
  // Include timeout in key so changing timeout in config forces re-wrap of tools
  return `${server.type}:${server.url}?${headersSig}&to=${server.toolTimeoutMs || 'def'}`;
}


const DEFAULT_TOOL_TIMEOUT_MS = (() => {
  const raw = process.env.MCP_TOOL_TIMEOUT_MS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 1000 ? n : 30000; // 30s default
})();

function wrapWithTimeout(fn: any, name: string, timeoutMs: number) {
  if (typeof fn !== 'function') return fn;
  if ((fn as any).__wrappedWithTimeout) return fn; // idempotent
  const wrapped = async (...args: any[]) => {
    let timer: any;
    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (cb: () => void) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cb();
        }
      };
      timer = setTimeout(() => {
        finish(() => reject(new Error(`Tool '${name}' timed out after ${timeoutMs}ms`)));
      }, timeoutMs);
      Promise.resolve()
        .then(() => fn(...args))
        .then(result => finish(() => resolve(result)))
        .catch(err => finish(() => reject(err)));
    });
  };
  (wrapped as any).__wrappedWithTimeout = true;
  return wrapped;
}

function attachTimeoutsToTool(toolName: string, toolDef: any, timeoutMs: number) {
  const copy = { ...toolDef };
  const candidateFns = ['call', 'execute', 'run', 'invoke'];
  // Capture a schema reference (original JSON schema if available) for arg adaptation
  const paramSchema: any = (toolDef.parameters && (toolDef.parameters.jsonSchema || (toolDef.parameters.__originalJSONSchema))) || toolDef.parameters;

  // Helper: adapt arguments coming from model before validation/execution
  function adaptArgsForSchema(args: any[]): any[] {
    if (!args || !Array.isArray(args) || args.length === 0) return args;
    const first = args[0];
    if (!first || typeof first !== 'object' || Array.isArray(first)) return args;
    if (!paramSchema || typeof paramSchema !== 'object') return args;

    const required: string[] = Array.isArray(paramSchema.required) ? paramSchema.required : [];
    const properties: Record<string, any> = (paramSchema.properties && typeof paramSchema.properties === 'object') ? paramSchema.properties : {};

    for (const key of Object.keys(first)) {
      const val = (first as any)[key];
      if (val === '') {
        const prop = properties[key];
        if (prop && typeof prop === 'object') {
          let enums: any[] | undefined = undefined;
          if (Array.isArray(prop.enum)) enums = prop.enum;
          // Basic extraction from oneOf/anyOf of const literals
          if (!enums && Array.isArray(prop.oneOf)) {
            const lits = prop.oneOf.map((o: any) => o?.const).filter((v: any) => v !== undefined);
            if (lits.length) enums = lits;
          }
            if (!enums && Array.isArray(prop.anyOf)) {
              const lits = prop.anyOf.map((o: any) => o?.const).filter((v: any) => v !== undefined);
              if (lits.length) enums = lits;
            }
          if (enums && enums.length) {
            if (required.includes(key)) {
              // Provide deterministic default (first enum) instead of empty string
              (first as any)[key] = enums[0];
            } else {
              // Omit optional empty enum field entirely
              delete (first as any)[key];
            }
          } else {
            // No enum constraint known; drop empty strings to reduce invalid arg noise
            delete (first as any)[key];
          }
        } else {
          // No schema info; drop empty string
          delete (first as any)[key];
        }
      }
    }
    return args;
  }
  for (const key of candidateFns) {
    if (copy[key]) {
      const original = wrapWithTimeout(copy[key], toolName, timeoutMs);
      // Wrap again to record metrics & invocation details
      copy[key] = async (...args: any[]) => {
  // Sanitize / adapt arguments (e.g., remove empty-string enum values)
  try { args = adaptArgsForSchema(args); } catch {}
        const startedAt = Date.now();
        const batchEntry: { tool: string; startedAt: number; durationMs?: number; status?: 'success' | 'error' | 'timeout'; error?: string } = { tool: toolName, startedAt };
        currentInvocationBatch.push(batchEntry);
        let metric = toolMetrics.get(toolName);
        if (!metric) {
          metric = { name: toolName, count: 0, success: 0, error: 0, timeout: 0, totalMs: 0 };
          toolMetrics.set(toolName, metric);
        }
        metric.count += 1;
        metric.lastInvokedAt = startedAt;
        try {
          let result;
          let attempted = false;
          const invoke = async () => await original(...args);
          try {
            result = await invoke();
          } catch (err: any) {
            const msg = err instanceof Error ? err.message : String(err);
            // Retry once if invalid enum value errors and we can auto-fill from schema
            if (!attempted && /invalid_enum_value/i.test(msg) && paramSchema?.properties && Array.isArray(args) && args[0] && typeof args[0] === 'object') {
              attempted = true;
              const obj = args[0];
              for (const [propName, propDef] of Object.entries(paramSchema.properties)) {
                if (obj[propName] === '' && propDef && typeof propDef === 'object' && Array.isArray((propDef as any).enum) && (propDef as any).enum.length) {
                  obj[propName] = (propDef as any).enum[0];
                }
              }
              // second attempt
              try {
                result = await invoke();
              } catch (err2) {
                // If still failing, surface structured error as result to satisfy AI SDK
                const finalMsg = err2 instanceof Error ? err2.message : String(err2);
                result = { error: finalMsg };
              }
            } else {
              // Non enum validation errors propagate as structured result (avoid missing tool result)
              result = { error: msg };
            }
          }
          if (result === undefined) {
            // Provide a placeholder to ensure a tool result message exists
            result = { ok: true };
          }
          const duration = Date.now() - startedAt;
            metric.success += 1;
            metric.totalMs += duration;
            metric.lastMs = duration;
            metric.lastStatus = 'success';
            batchEntry.durationMs = duration;
            batchEntry.status = 'success';
          return result;
        } catch (err: any) {
          const duration = Date.now() - startedAt;
          metric.totalMs += duration;
          metric.lastMs = duration;
          batchEntry.durationMs = duration;
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes('timed out')) {
            metric.timeout += 1;
            metric.lastStatus = 'timeout';
            batchEntry.status = 'timeout';
            // Surface diagnostic to help identify chronic 30s stalls
            console.warn(`[MCP] Tool timeout: ${toolName} after ${timeoutMs}ms`);
          } else {
            metric.error += 1;
            metric.lastStatus = 'error';
            metric.lastError = message;
            batchEntry.status = 'error';
            batchEntry.error = message;
          }
          throw err;
        }
      };
    }
  }
  return copy;
}

// Minimal JSON Schema -> Zod converter for common primitive/object cases
function jsonSchemaToZod(schema: any): any {
  if (!schema || typeof schema !== 'object') return z.any();
  if (schema.type === 'string') return z.string();
  if (schema.type === 'number' || schema.type === 'integer') return z.number();
  if (schema.type === 'boolean') return z.boolean();
  if (schema.type === 'array') {
    const item = Array.isArray(schema.items) ? schema.items[0] : schema.items;
    return z.array(jsonSchemaToZod(item || {}));
  }
  if (schema.type === 'object' || schema.properties) {
    const shape: Record<string, any> = {};
    const properties = schema.properties || {};
    const requiredProps = Array.isArray(schema.required)
      ? schema.required.filter((prop: string) => prop in properties)
      : [];

    for (const [key, propSchema] of Object.entries(properties)) {
      const zProp = jsonSchemaToZod(propSchema);
      let finalProp = requiredProps.includes(key) ? zProp : zProp.optional();
      const desc = (propSchema as any)?.description;
      if (typeof desc === 'string') finalProp = finalProp.describe(desc);
      shape[key] = finalProp;
    }
    return z.object(shape).passthrough();
  }
  return z.any();
}

/**
 * Transform MCP tools to be compatible with OpenAI Responses API
 * Handles the nested structure where the actual schema is in tool.parameters.jsonSchema
 */
export function transformMCPToolsForResponsesAPI(tools: Record<string, any>): Record<string, any> {
  const transformedTools: Record<string, any> = {};

  for (const [name, tool] of Object.entries(tools)) {
    const schemaCandidate =
      tool.parameters?.jsonSchema ?? tool.parameters ?? { type: 'object', additionalProperties: true };

    let zodSchema: any;
    try {
      zodSchema = jsonSchemaToZod(schemaCandidate);
    } catch {
      zodSchema = undefined;
    }

    if (!zodSchema || typeof zodSchema !== 'object' || !('_def' in zodSchema)) {
      zodSchema = z.object({}).passthrough();
    }

    const resolveExecutor = (wrappedTool: any) => {
      const candidates = ['call', 'execute', 'run', 'invoke'];
      for (const candidate of candidates) {
        if (typeof wrappedTool[candidate] === 'function') {
          return wrappedTool[candidate].bind(wrappedTool);
        }
      }
      return undefined;
    };

    const baseExecute = resolveExecutor(tool);

    const createExecutor = (adapt?: (args: any) => any) => {
      if (!baseExecute) {
        return async () => {
          throw new Error(`Tool '${name}' is not callable`);
        };
      }

      return async (args: unknown) => {
        const normalizedArgs =
          typeof adapt === 'function' && args !== undefined ? adapt(structuredClone(args)) : args;
        const result = await baseExecute(normalizedArgs);
        // Enrich result with cross-reference metadata for biological IDs
        return enrichToolResult(result, name);
      };
    };

    // Special handling: GraphQL tools need arbitrary variable keys.
    if (name.endsWith('_graphql_query')) {
      const adaptArgs = (args: any) => {
        if (args && typeof args === 'object') {
          if (!args.variables && typeof args.variables_json === 'string') {
            try {
              const parsed = JSON.parse(args.variables_json);
              if (parsed && typeof parsed === 'object') {
                args = { ...args, variables: parsed };
              }
            } catch {
              // ignore JSON parse errors – keep original args
            }
          }

          if (args.variables_json === undefined) {
            args.variables_json = '{}';
          }
        }

        return args;
      };

      const graphQLSchema = z
        .object({
          query: z.string().describe('GraphQL query string'),
          variables_json: z
            .string()
            .describe('JSON-encoded GraphQL variables object (use {} if none)'),
        })
        .passthrough();

      transformedTools[name] = dynamicTool({
        description: tool.description,
        providerOptions: tool.providerOptions,
        inputSchema: graphQLSchema,
        execute: createExecutor(adaptArgs),
        toModelOutput: tool.toModelOutput,
      });

      continue;
    }

    transformedTools[name] = dynamicTool({
      description: tool.description,
      providerOptions: tool.providerOptions,
      inputSchema: zodSchema,
      execute: createExecutor(),
      toModelOutput: tool.toModelOutput,
    });
  }

  return transformedTools;
}

/**
 * Initialize MCP clients for API calls
 * This uses the already running persistent HTTP or SSE servers
 */
export async function initializeMCPClients(
  mcpServers: MCPServerConfig[] = [],
  abortSignal?: AbortSignal
): Promise<MCPClientManager> {
  let aggregatedTools: Record<string, any> = {};
  const acquiredClients: any[] = [];
  const toolsByServer = new Map<string, { config: MCPServerConfig; tools: Record<string, any> }>();

  // Filter duplicates by URL + headers signature
  const uniqueServers: MCPServerConfig[] = [];
  const seen = new Set<string>();
  for (const s of mcpServers) {
    const key = cacheKey(s);
    if (!seen.has(key)) { seen.add(key); uniqueServers.push(s); }
  }

  // Parallel connect with per-server timeout & reuse cache
  const connectionPromises = uniqueServers.map(async (server) => {
    const key = cacheKey(server);

    // Reuse cached client if valid
    const cached = clientCache.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      aggregatedTools = { ...aggregatedTools, ...cached.tools };
      acquiredClients.push(cached.client); // track so caller can cleanup if needed
      toolsByServer.set(server.url, { config: server, tools: cached.tools });
      return;
    }

    const headersObj =
      server.headers?.reduce((acc, header) => {
        if (header.key) acc[header.key] = header.value || '';
        return acc;
      }, {} as Record<string, string>) ?? {};
    if (server.type !== 'sse') {
      headersObj['Accept'] = headersObj['Accept'] ?? 'application/json, text/event-stream';
    }
    // Required for DeepSense MCP servers (they filter by User-Agent)
    headersObj['User-Agent'] = headersObj['User-Agent'] ?? 'claude-code/2.0';

    const connectTimeoutMs = server.type === 'sse' ? 8000 : 6000;

    const transport = server.type === 'sse'
      ? {
        type: 'sse' as const,
        url: server.url,
        headers: headersObj,
      }
      : new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: { headers: headersObj },
      });

    const connectPromise = (async () => {
      const client = await createMCPClient({ transport });
      const rawTools = await client.tools();
      // Sanitize + wrap each tool with timeout
      const sanitizedTools: Record<string, any> = {};
      const perServerTimeout = (typeof server.toolTimeoutMs === 'number' && server.toolTimeoutMs > 0)
        ? server.toolTimeoutMs
        : DEFAULT_TOOL_TIMEOUT_MS;
      for (const [toolName, toolDef] of Object.entries(rawTools)) {
        const sanitized = sanitizeToolParameters(toolDef);
        sanitizedTools[toolName] = attachTimeoutsToTool(toolName, sanitized, perServerTimeout);
      }
      clientCache.set(key, { client, tools: sanitizedTools, lastUsed: Date.now() });
      aggregatedTools = { ...aggregatedTools, ...sanitizedTools };
      acquiredClients.push(client);
      toolsByServer.set(server.url, { config: server, tools: sanitizedTools });
    })();

    // Enforce timeout
    const timeoutPromise = new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => {
        reject(new Error(`MCP connect timeout after ${connectTimeoutMs}ms: ${server.url}`));
      }, connectTimeoutMs);
      connectPromise.then(() => { clearTimeout(to); resolve(); }).catch(err => { clearTimeout(to); reject(err); });
    });

    try {
      await timeoutPromise;
    } catch (err) {
      // Swallow error, continue other servers
    }
  });

  // Apply overall budget (e.g., 10s)
  const overallBudgetMs = 10000;
  const overall = Promise.all(connectionPromises);
  const overallWithCap = Promise.race([
    overall,
    new Promise<void>(resolve => setTimeout(resolve, overallBudgetMs))
  ]);
  await overallWithCap;

  // Attach abort cleanup only for newly acquired (not cached) clients
  if (abortSignal && acquiredClients.length > 0) {
    abortSignal.addEventListener('abort', async () => {
      await cleanupMCPClients(acquiredClients);
    });
  }

  // Initialize ID enrichment cross-references with only the active/connected servers
  // This ensures cross-reference hints only point to servers that are actually available
  const activeServerNames = Array.from(toolsByServer.values()).map(v => v.config.name).filter(Boolean) as string[];
  if (activeServerNames.length > 0) {
    initializeWithActiveServers(activeServerNames);
  }

  return {
    tools: aggregatedTools,
    toolsByServer,
    clients: acquiredClients,
    cleanup: async () => await cleanupMCPClients(acquiredClients)
  };
}

/**
 * Clean up MCP clients
 */
async function cleanupMCPClients(clients: any[]): Promise<void> {
  await Promise.all(
    clients.map(async (client) => {
      try {
        await client.disconnect?.();
      } catch (error) {
        console.error("Error during MCP client cleanup:", error);
      }
    })
  );
} 
