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

/**
 * Extract server key from MCP server config
 * Uses URL path or domain as identifier
 */
export function extractServerKey(server: MCPServerConfig): string {
  try {
    const url = new URL(server.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Prefer last path segment as key (e.g., /mcp/entrez -> entrez)
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      return lastPart.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }

    // Fallback to subdomain if available
    const hostParts = url.hostname.split('.');
    if (hostParts.length > 2) {
      return hostParts[0].toLowerCase().replace(/[^a-z0-9]/g, '_');
    }

    // Fallback to domain name
    return url.hostname.replace(/\./g, '_').replace(/[^a-z0-9_]/g, '');
  } catch {
    // If URL parsing fails, create key from entire URL
    return server.url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
  }
}

/**
 * Group tools by server
 */
export function groupToolsByServer(
  tools: Record<string, any>,
  serverConfigs: MCPServerConfig[]
): Map<string, { config: MCPServerConfig; tools: Record<string, any> }> {
  const serverMap = new Map<string, { config: MCPServerConfig; tools: Record<string, any> }>();

  // Initialize map with server configs
  for (const config of serverConfigs) {
    const key = extractServerKey(config);
    serverMap.set(key, { config, tools: {} });
  }

  // If we only have one server, assign all tools to it
  if (serverConfigs.length === 1) {
    const key = extractServerKey(serverConfigs[0]);
    serverMap.set(key, { config: serverConfigs[0], tools });
    return serverMap;
  }

  // For multiple servers, try to group by tool name prefixes or assign to generic
  for (const [toolName, toolDef] of Object.entries(tools)) {
    let assigned = false;

    // Try to match tool to server by name patterns
    for (const [serverKey, serverData] of serverMap.entries()) {
      if (toolName.toLowerCase().includes(serverKey) ||
          serverKey.includes(toolName.split('_')[0].toLowerCase())) {
        serverData.tools[toolName] = toolDef;
        assigned = true;
        break;
      }
    }

    // If no match found, assign to first server (fallback)
    if (!assigned && serverMap.size > 0) {
      const firstKey = Array.from(serverMap.keys())[0];
      serverMap.get(firstKey)!.tools[toolName] = toolDef;
    }
  }

  return serverMap;
}

/**
 * Generate helper API definitions to send to the code execution environment
 * This creates the actual JavaScript code that implements the helpers object
 */
export function generateHelpersImplementation(
  serverToolMap: Map<string, { config: MCPServerConfig; tools: Record<string, any> }>
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
    lines.push(`    return await __invokeMCPTool(toolName, args);`);
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
