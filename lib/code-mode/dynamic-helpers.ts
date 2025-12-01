/**
 * Dynamic helper API generation for Code Mode
 * Converts all MCP tools into a structured helpers object for sandboxed code execution
 */

import type { MCPServerConfig } from '@/lib/mcp-client';

export interface HelperAPI {
  listTools(): Promise<string[]>;
  invoke(toolName: string, args: any): Promise<any>;
  searchTools(query: string): Promise<Array<{ name: string; description: string }>>;
}

export interface HelpersObject {
  [serverKey: string]: HelperAPI;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^_+|_+$/g, '');
}

/**
 * Extract server key from MCP server config
 */
export function extractServerKey(server: MCPServerConfig): string {
  if (server.name) {
    const fromName = normalizeKey(server.name);
    if (fromName) return fromName;
  }

  try {
    const url = new URL(server.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      const sanitized = normalizeKey(lastPart);
      if (sanitized) return sanitized;
    }

    const hostParts = url.hostname.split('.');
    if (hostParts.length > 2) {
      const sanitized = normalizeKey(hostParts[0]);
      if (sanitized) return sanitized;
    }

    const fallback = normalizeKey(url.hostname.replace(/\./g, ''));
    if (fallback) return fallback;
  } catch {
    // ignore
  }

  return 'mcp';
}

/**
 * Group tools by server
 */
export function groupToolsByServer(
  toolsByServer: Map<string, { config: MCPServerConfig; tools: Record<string, any> }>,
  serverConfigs: MCPServerConfig[]
): Map<string, { config: MCPServerConfig; tools: Record<string, any> }> {
  const serverMap = new Map<string, { config: MCPServerConfig; tools: Record<string, any> }>();

  for (const config of serverConfigs) {
    const key = extractServerKey(config);
    const entry = toolsByServer.get(config.url);
    serverMap.set(key, { config, tools: entry?.tools || {} });
  }

  return serverMap;
}

/**
 * Generate helper API definitions to send to the code execution environment
 * This creates the actual JavaScript code that implements the helpers object
 */
export function generateHelpersImplementation(
  serverToolMap: Map<string, { config: MCPServerConfig; tools: Record<string, any> }>,
  aliasMap: Record<string, string> = {}
): string {
  const lines: string[] = [
    '// Auto-generated helpers implementation',
    'const helpers = {};',
    '',
  ];

  for (const [serverKey, { tools }] of serverToolMap.entries()) {
    const toolNames = Object.keys(tools);

    lines.push(`// ${serverKey} helper`);
    lines.push(`helpers.${serverKey} = {`);
    lines.push(`  async listTools() {`);
    lines.push(`    return ${JSON.stringify(toolNames)};`);
    lines.push(`  },`);
    lines.push(`  async invoke(toolName, args) {`);
    lines.push(`    if (typeof __invokeMCPTool !== 'function') {`);
    lines.push(`      throw new Error('MCP tool invocation not available in this environment');`);
    lines.push(`    }`);
    lines.push(`    return await __invokeMCPTool('${serverKey}', toolName, args);`);
    lines.push(`  },`);
    lines.push(`  async searchTools(query) {`);
    lines.push(`    const q = query.toLowerCase();`);
    lines.push(`    const tools = ${JSON.stringify(
      toolNames.map(name => ({
        name,
        description: tools[name].description || '',
      }))
    )};`);
    lines.push(`    return tools.filter(t => `);
    lines.push(`      t.name.toLowerCase().includes(q) || `);
    lines.push(`      t.description.toLowerCase().includes(q)`);
    lines.push(`    );`);
    lines.push(`  },`);
    lines.push(`};`);
    lines.push('');
  }

  for (const [aliasName, targetKey] of Object.entries(aliasMap)) {
    if (!aliasName || !targetKey) continue;
    lines.push(`if (helpers.${targetKey}) {`);
    lines.push(`  helpers.${aliasName} = helpers.${targetKey};`);
    lines.push(`}`);
  }

  lines.push('// Export helpers for code execution');
  lines.push('globalThis.helpers = helpers;');

  return lines.join('\n');
}

/**
 * Create a tool invocation registry for the Worker/sandbox
 * Maps tool names to actual execution functions
 */
export interface ToolRegistry {
  [toolName: string]: (args: any) => Promise<any>;
}

export function createToolRegistry(tools: Record<string, any>): ToolRegistry {
  const registry: ToolRegistry = {};

  for (const [toolName, toolDef] of Object.entries(tools)) {
    // Find the execution method
    const executor =
      toolDef.call ||
      toolDef.execute ||
      toolDef.run ||
      toolDef.invoke;

    if (typeof executor === 'function') {
      registry[toolName] = async (args: any) => {
        try {
          return await executor.call(toolDef, args);
        } catch (error: any) {
          throw new Error(`Tool ${toolName} failed: ${error.message || error}`);
        }
      };
    } else {
      registry[toolName] = async () => {
        throw new Error(`Tool ${toolName} is not executable`);
      };
    }
  }

  return registry;
}

/**
 * Generate metadata about available helpers for the system prompt
 */
export function generateHelpersMetadata(
  serverToolMap: Map<string, { config: MCPServerConfig; tools: Record<string, any> }>
): {
  servers: Array<{ key: string; toolCount: number; toolNames: string[] }>;
  totalTools: number;
} {
  const servers = Array.from(serverToolMap.entries()).map(([key, { tools }]) => ({
    key,
    toolCount: Object.keys(tools).length,
    toolNames: Object.keys(tools),
  }));

  const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);

  return { servers, totalTools };
}
