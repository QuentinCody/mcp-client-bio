/**
 * Configuration Loader for ID Enrichment
 *
 * Dynamically loads ID patterns and server capabilities from configuration files,
 * making the system extensible without code changes.
 */

import idPatternsConfig from '../../config/id-patterns.json';
import mcpServersConfig from '../../config/mcp-servers.json';

export interface IdPatternConfig {
  id: string;
  name: string;
  description: string;
  regex: string | null;
  flags: string | null;
  confidence: 'high' | 'medium' | 'low';
  examples: string[];
  notes?: string;
}

export interface ServerCapabilities {
  accepts: string[];
  produces: string[];
  hints: Record<string, string>;
}

export interface CrossReferenceEntry {
  servers: string[];
  serverHints: Record<string, string>;
}

export type DynamicCrossReferenceMap = Record<string, CrossReferenceEntry>;

/**
 * Load ID patterns from configuration file
 */
export function loadIdPatterns(): IdPatternConfig[] {
  return idPatternsConfig.patterns as IdPatternConfig[];
}

/**
 * Load server capabilities from MCP servers configuration
 */
export function loadServerCapabilities(): Record<string, ServerCapabilities> {
  const capabilities: Record<string, ServerCapabilities> = {};

  for (const server of mcpServersConfig.servers) {
    // Skip servers without idCapabilities
    const serverAny = server as Record<string, unknown>;
    if (!serverAny.idCapabilities) {
      continue;
    }

    const serverName = server.name;
    const caps = serverAny.idCapabilities as {
      accepts?: string[];
      produces?: string[];
      hints?: Record<string, string>;
    };

    capabilities[serverName] = {
      accepts: caps.accepts || [],
      produces: caps.produces || [],
      hints: caps.hints || {},
    };
  }

  return capabilities;
}

/**
 * Build cross-reference map from server capabilities
 *
 * This creates a map from ID types to the servers that accept them,
 * along with usage hints for each server.
 */
export function buildCrossReferenceMap(
  capabilities: Record<string, ServerCapabilities>
): DynamicCrossReferenceMap {
  const crossRefMap: DynamicCrossReferenceMap = {};

  // Iterate through all servers and their accepted ID types
  for (const [serverName, caps] of Object.entries(capabilities)) {
    for (const idType of caps.accepts) {
      // Initialize entry if not exists
      if (!crossRefMap[idType]) {
        crossRefMap[idType] = {
          servers: [],
          serverHints: {},
        };
      }

      // Add server to the list
      crossRefMap[idType].servers.push(serverName);

      // Add hint if available
      if (caps.hints[idType]) {
        crossRefMap[idType].serverHints[serverName] = caps.hints[idType];
      }
    }
  }

  return crossRefMap;
}

/**
 * Build cross-reference map filtered to only active/connected servers
 *
 * @param activeServerNames - List of currently active/connected server names
 * @returns Cross-reference map filtered to active servers
 */
export function buildActiveServerCrossReferenceMap(
  activeServerNames: string[]
): DynamicCrossReferenceMap {
  const allCapabilities = loadServerCapabilities();

  // Filter to only active servers
  const activeCapabilities: Record<string, ServerCapabilities> = {};
  for (const serverName of activeServerNames) {
    if (allCapabilities[serverName]) {
      activeCapabilities[serverName] = allCapabilities[serverName];
    }
  }

  return buildCrossReferenceMap(activeCapabilities);
}

/**
 * Compile ID patterns from config into executable regex patterns
 */
export function compileIdPatterns(): Array<{
  id: string;
  name: string;
  regex: RegExp;
  confidence: 'high' | 'medium' | 'low';
}> {
  const patterns = loadIdPatterns();
  const compiled: Array<{
    id: string;
    name: string;
    regex: RegExp;
    confidence: 'high' | 'medium' | 'low';
  }> = [];

  for (const pattern of patterns) {
    // Skip patterns without regex (like gene_symbol which uses context)
    if (!pattern.regex) {
      continue;
    }

    compiled.push({
      id: pattern.id,
      name: pattern.name,
      regex: new RegExp(pattern.regex, pattern.flags || 'g'),
      confidence: pattern.confidence,
    });
  }

  return compiled;
}
