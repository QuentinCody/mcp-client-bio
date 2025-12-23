import { experimental_createMCPClient as createMCPClient } from 'ai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface MCPServerConfig {
  name?: string;
  url: string;
  type: 'sse' | 'http';
  headers?: KeyValuePair[];
}

export interface MCPClientManager {
  tools: Record<string, any>;
  clients: any[];
  cleanup: () => Promise<void>;
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
      if (ap && typeof ap === "object" && !Array.isArray(ap) && (!ap.type || Object.keys(ap).length === 0)) {
        node.additionalProperties = true;
      }
    } else if (node.type === "object" && !("additionalProperties" in node)) {
      node.additionalProperties = true;
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
      let finalProp = zProp;
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
    // Handle the nested structure where the actual schema is in tool.parameters.jsonSchema
    let schemaToTransform = tool.parameters;
    
    // If there's a nested jsonSchema, transform that instead
    if (tool.parameters?.jsonSchema) {
      try {
        schemaToTransform = tool.parameters.jsonSchema;
        const zodSchema = jsonSchemaToZod(schemaToTransform);
        (zodSchema as any).__originalJSONSchema = schemaToTransform;
        transformedTools[name] = { ...tool, parameters: zodSchema };
        continue;
      } catch {/* fallback below */}
    }

    // Fallback path
    const transformedSchema = coerceToOpenAIToolParams(schemaToTransform);
    let parameters: any = transformedSchema;
    if (!parameters || typeof parameters !== 'object' || !('_def' in parameters)) {
      const originalJSONSchema = parameters;
      parameters = z.object({}).strict();
      (parameters as any).__originalJSONSchema = originalJSONSchema;
    }

    if (name.endsWith('_graphql_query')) {
      parameters = z.object({
        query: z.string().describe('GraphQL query string'),
        variables_json: z.string().describe('JSON-encoded GraphQL variables object (use {} if none)')
      }).strict();
      const adaptArgs = (args: any) => {
        if (args && typeof args === 'object') {
          if (!args.variables && typeof args.variables_json === 'string') {
            try { const parsed = JSON.parse(args.variables_json); if (parsed && typeof parsed === 'object') args = { ...args, variables: parsed }; } catch {}
          }
          if (args.variables_json === undefined) args.variables_json = '{}';
        }
        return args;
      };
  type AnyToolFn = (args: any) => Promise<any> | any;
  const wrapCallable = (fn?: AnyToolFn) => fn ? (async (a: any) => fn(adaptArgs(a))) : undefined;
      const wrapped: any = { ...tool, parameters };
      if (tool.call) wrapped.call = wrapCallable(tool.call);
      if (tool.execute) wrapped.execute = wrapCallable(tool.execute);
      if (tool.run) wrapped.run = wrapCallable(tool.run);
      if (tool.invoke) wrapped.invoke = wrapCallable(tool.invoke);
      transformedTools[name] = wrapped;
      continue;
    }

    transformedTools[name] = {
      ...tool,
      parameters,
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
  // Initialize tools
  let tools = {};
  const mcpClients: any[] = [];

  // Process each MCP server configuration
  for (const mcpServer of mcpServers) {
    try {
      const headers = mcpServer.headers?.reduce((acc, header) => {
        if (header.key) acc[header.key] = header.value || '';
        return acc;
      }, {} as Record<string, string>);

      const transport = mcpServer.type === 'sse'
        ? {
          type: 'sse' as const,
          url: mcpServer.url,
          headers,
        }
        : new StreamableHTTPClientTransport(new URL(mcpServer.url), {
          requestInit: {
            headers,
          },
        });

      const mcpClient = await createMCPClient({ transport });
      mcpClients.push(mcpClient);

      const mcptools = await mcpClient.tools();

      // MCP client log commented out - not relevant to JSON response debugging
      // console.log(`MCP tools from ${mcpServer.url}:`, Object.keys(mcptools));

      // Add MCP tools to tools object
      tools = { ...tools, ...mcptools };
    } catch (error) {
      console.error("Failed to initialize MCP client:", error);
      // Continue with other servers instead of failing the entire request
    }
  }

  // Register cleanup for all clients if an abort signal is provided
  if (abortSignal && mcpClients.length > 0) {
    abortSignal.addEventListener('abort', async () => {
      await cleanupMCPClients(mcpClients);
    });
  }

  return {
    tools,
    clients: mcpClients,
    cleanup: async () => await cleanupMCPClients(mcpClients)
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
