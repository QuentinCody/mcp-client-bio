import { experimental_createMCPClient as createMCPClient } from 'ai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface MCPServerConfig {
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

// Robust schema sanitizer: ensure every object property has a type; default to string or object
function sanitizeSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return { type: 'object', additionalProperties: true };

  const clone = Array.isArray(schema) ? [] : { ...schema };

  // If this node represents a schema without a type but has schema-like keys
  if (!clone.type) {
    if (clone.properties) clone.type = 'object';
    else if (clone.items) clone.type = 'array';
    else if (Array.isArray(clone.anyOf) || Array.isArray(clone.oneOf) || Array.isArray(clone.allOf)) clone.type = 'object';
  }

  // Recurse properties
  if (clone.properties && typeof clone.properties === 'object') {
    for (const [k, v] of Object.entries(clone.properties)) {
      // If leaf value isn't an object, coerce to schema
      if (!v || typeof v !== 'object') {
        clone.properties[k] = { type: 'string' };
        continue;
      }
      clone.properties[k] = sanitizeSchema(v);
      if (!clone.properties[k].type) {
        // Fallback if still missing
        clone.properties[k].type = 'string';
      }
    }
  }

  // Recurse array items
  if (clone.type === 'array') {
    if (!clone.items) {
      clone.items = { type: 'string' };
    } else {
      clone.items = sanitizeSchema(clone.items);
      if (!clone.items.type) clone.items.type = 'string';
    }
  }

  // Normalize anyOf/oneOf/allOf by sanitizing members
  for (const key of ['anyOf','oneOf','allOf'] as const) {
    if (Array.isArray((clone as any)[key])) {
      (clone as any)[key] = (clone as any)[key].map((n: any) => sanitizeSchema(n));
    }
  }

  // Ensure additionalProperties present for objects (OpenAI lenient)
  if (clone.type === 'object' && clone.additionalProperties === undefined) {
    clone.additionalProperties = true;
  }

  // Strip unsupported keywords if present
  delete (clone as any).$schema;
  delete (clone as any).$id;
  delete (clone as any).$defs;

  return clone;
}

function sanitizeToolParameters(tool: any): any {
  if (!tool) return tool;
  const t = { ...tool };
  // Common nested locations: inputSchema, parameters, schema
  if (t.inputSchema) t.inputSchema = sanitizeSchema(t.inputSchema);
  if (t.parameters) t.parameters = sanitizeSchema(t.parameters);
  // Some MCP servers supply a nested parameters.jsonSchema object that is never
  // passed through sanitizeSchema above. This is the raw schema we later feed
  // into transformMCPToolsForResponsesAPI. If its properties contain entries
  // without a "type" (e.g. { description: "..." } only), OpenAI will reject
  // the tool with: "Invalid schema ... schema must have a 'type' key". We fix
  // that here so downstream conversion (to Zod or coercion) always sees a
  // well-formed schema.
  if (t.parameters?.jsonSchema) {
    try {
      t.parameters.jsonSchema = sanitizeSchema(t.parameters.jsonSchema);
    } catch {}
  }
  // Unify to 'parameters' if only inputSchema exists
  if (!t.parameters && t.inputSchema) t.parameters = t.inputSchema;
  return t;
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

/**
 * Coerce MCP inputSchema to OpenAI-safe schema for Responses API
 * Based on OpenAI's recommended approach for handling MCP tool schemas
 */
function coerceToOpenAIToolParams(schema: any): any {
  const copy = JSON.parse(JSON.stringify(schema ?? {}));

  // Ensure a proper object schema at root
  if (typeof copy !== "object" || Array.isArray(copy)) return { type: "object", additionalProperties: true };
  if (!copy.type) copy.type = "object";
  if (!("properties" in copy)) copy.properties = {};

  // Recursively fix bad patterns
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;

    if ("additionalProperties" in node) {
      const ap = node.additionalProperties;
      // Collapse any empty or typeless object schema into boolean true for OpenAI validator
      if (ap && typeof ap === "object" && !Array.isArray(ap) && (!ap.type || Object.keys(ap).length === 0)) {
        node.additionalProperties = true;
      }
    } else if (node.type === "object" && !("additionalProperties" in node)) {
      node.additionalProperties = true; // default permissive
    }

    // Normalize nullable fields (common MCP servers use nullable without union)
    if (node.nullable === true && typeof node.type === "string") {
      node.type = [node.type, "null"];
      delete node.nullable;
    }

    // Recurse
    if (node.properties && typeof node.properties === "object") {
      for (const k of Object.keys(node.properties)) visit(node.properties[k]);
    }
    if (node.items) visit(node.items);
    if (Array.isArray(node.anyOf)) node.anyOf.forEach(visit);
    if (Array.isArray(node.oneOf)) node.oneOf.forEach(visit);
    if (Array.isArray(node.allOf)) node.allOf.forEach(visit);

    // Strip rarely supported keywords if present (keeps validator happy)
    delete node.$id;
    delete node.$defs;
    delete node.$schema;
  };

  visit(copy);
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
    for (const [key, propSchema] of Object.entries(schema.properties || {})) {
      const zProp = jsonSchemaToZod(propSchema);
      let finalProp = zProp; // force required
      const desc = (propSchema as any)?.description;
      if (typeof desc === 'string') finalProp = finalProp.describe(desc);
      shape[key] = finalProp;
    }
    return z.object(shape).strict();
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
    let transformedParameters = tool.parameters;
    
    // If the tool has the nested jsonSchema structure, we need to transform that
    if (tool.parameters?.jsonSchema) {
      // Use original jsonSchema to build a strict Zod schema so OpenAI sees additionalProperties: false
      try {
        transformedParameters = jsonSchemaToZod(tool.parameters.jsonSchema);
        (transformedParameters as any).__originalJSONSchema = tool.parameters.jsonSchema;
      } catch {
        const transformedJsonSchema = coerceToOpenAIToolParams(tool.parameters.jsonSchema);
        transformedParameters = transformedJsonSchema;
      }
    } else {
      // If it's a flat structure and looks like JSON schema, attempt conversion
      if (tool.parameters && (tool.parameters.properties || tool.parameters.type)) {
        try {
          transformedParameters = jsonSchemaToZod(tool.parameters);
          (transformedParameters as any).__originalJSONSchema = tool.parameters;
        } catch {
          transformedParameters = coerceToOpenAIToolParams(tool.parameters);
        }
      } else {
        transformedParameters = coerceToOpenAIToolParams(tool.parameters);
      }
    }
    
    // AI SDK internally expects a Zod schema (accesses parameters._def.typeName). If we replaced
    // the original Zod schema with plain JSON, it triggers the "Cannot read properties of undefined (reading 'typeName')" error.
    // To avoid this while still loosening validation for GPT-5 Responses API, wrap in a permissive Zod schema.
    if (!transformedParameters || typeof transformedParameters !== 'object' || !('_def' in transformedParameters)) {
      const originalJSONSchema = transformedParameters;
      transformedParameters = z.object({}).strict();
      (transformedParameters as any).__originalJSONSchema = originalJSONSchema;
    }

    // Special handling: GraphQL tools need arbitrary variable keys. Replace variables property with catchall.
    if (name.endsWith('_graphql_query')) {
      transformedParameters = z.object({
        query: z.string().describe('GraphQL query string'),
        variables_json: z.string().describe('JSON-encoded GraphQL variables object (use {} if none)')
      }).strict();

      // Wrap underlying execution to convert variables_json -> variables
      const adaptArgs = (args: any) => {
        if (args && typeof args === 'object') {
          // Backward compatibility: if variables already provided, leave
          if (!args.variables && typeof args.variables_json === 'string') {
            try {
              const parsed = JSON.parse(args.variables_json);
              if (parsed && typeof parsed === 'object') {
                args = { ...args, variables: parsed };
              }
            } catch {}
          }
          // Allow empty/missing variables_json despite being listed required (model may supply empty string)
          if (args.variables_json === undefined) args.variables_json = '{}';
        }
        return args;
      };
  type AnyToolFn = (args: any) => Promise<any> | any;
  const wrapCallable = (fn?: AnyToolFn) => fn ? (async (args: any) => fn(adaptArgs(args))) : undefined;
      const wrapped: any = { ...tool, parameters: transformedParameters };
      // Common possible method names
      if (tool.call) wrapped.call = wrapCallable(tool.call);
      if (tool.execute) wrapped.execute = wrapCallable(tool.execute);
      if (tool.run) wrapped.run = wrapCallable(tool.run);
      if (tool.invoke) wrapped.invoke = wrapCallable(tool.invoke);
      transformedTools[name] = wrapped;
      continue; // already pushed
    }

    transformedTools[name] = {
      ...tool,
      parameters: transformedParameters,
    };
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
      return;
    }

    const headersObj = server.headers?.reduce((acc, header) => {
      if (header.key) acc[header.key] = header.value || '';
      return acc;
    }, {} as Record<string, string>);

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

  return {
    tools: aggregatedTools,
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
