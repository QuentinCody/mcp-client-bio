/**
 * Enhanced Helper API for Code Mode
 *
 * Provides smart response parsing and convenient methods for working with MCP servers
 * in programmatic code execution contexts.
 *
 * Features:
 * - Automatic markdown parsing for legacy servers
 * - Direct data access methods
 * - Staging workflow shortcuts
 * - Type-safe error handling
 */

import {
  parseMarkdownResponse,
  getExpectedFields,
  validateParsedResponse,
  type ParsedResponse,
  type ParseOptions
} from './markdown-parser';

export interface EnhancedHelperAPI {
  // Basic methods
  listTools(): Promise<string[]>;
  searchTools(query: string): Promise<Array<{ name: string; description: string }>>;

  // Enhanced invoke with parsing
  invoke(
    toolName: string,
    args: any,
    options?: InvokeOptions
  ): Promise<any>;

  // Convenience methods
  getData(toolName: string, args: any): Promise<any>;
  queryStagedData(dataAccessId: string, sql: string): Promise<any[]>;
  getWithRetry(toolName: string, args: any, retries?: number): Promise<any>;
}

export interface InvokeOptions {
  /** Response format: 'raw' = no parsing, 'parsed' = parse markdown, 'auto' = detect */
  returnFormat?: 'raw' | 'parsed' | 'auto';

  /** Parsing strategy: 'aggressive' = try harder to extract, 'conservative' = strict patterns */
  parseStrategy?: 'aggressive' | 'conservative';

  /** Throw error on parse failure? */
  throwOnParseError?: boolean;

  /** Request headers to send to server */
  headers?: Record<string, string>;
}

export interface ToolInvocationResult {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  parsed?: ParsedResponse;
  rawResponse?: any;
}

/**
 * Create enhanced helper API for a specific server
 */
export function createEnhancedHelper(
  serverKey: string,
  tools: Record<string, any>,
  invokeFunction: (toolName: string, args: any, headers?: Record<string, string>) => Promise<any>
): EnhancedHelperAPI {
  const toolNames = Object.keys(tools);

  return {
    async listTools() {
      return toolNames;
    },

    async searchTools(query: string) {
      const q = query.toLowerCase();
      return toolNames
        .filter(name => {
          const tool = tools[name];
          return (
            name.toLowerCase().includes(q) ||
            (tool.description || '').toLowerCase().includes(q)
          );
        })
        .map(name => ({
          name,
          description: tools[name].description || '',
        }));
    },

    async invoke(toolName: string, args: any, options: InvokeOptions = {}) {
      const {
        returnFormat = 'auto',
        parseStrategy = 'aggressive',
        throwOnParseError = false,
        headers = {}
      } = options;

      // Add execution context headers
      const requestHeaders = {
        'X-Execution-Context': 'code',
        'X-Response-Format': 'json',
        ...headers
      };

      try {
        const rawResponse = await invokeFunction(toolName, args, requestHeaders);

        // Check if server returned dual-mode response (new format)
        if (isDualModeResponse(rawResponse)) {
          return handleDualModeResponse(rawResponse);
        }

        // Check if server returned legacy markdown response
        if (isMarkdownResponse(rawResponse)) {
          return handleMarkdownResponse(
            rawResponse,
            toolName,
            returnFormat,
            parseStrategy,
            throwOnParseError
          );
        }

        // Direct structured response (ideal case)
        return rawResponse;
      } catch (error) {
        throw enhanceError(error, { serverKey, toolName, args });
      }
    },

    async getData(toolName: string, args: any) {
      const response = await this.invoke(toolName, args, {
        returnFormat: 'parsed',
        parseStrategy: 'aggressive'
      });

      // If data is staged, automatically query it
      if (response.dataAccessId && response.table) {
        console.log(`[${serverKey}] Data staged, querying table: ${response.table}`);
        return this.queryStagedData(
          response.dataAccessId,
          `SELECT * FROM ${response.table} LIMIT 100`
        );
      }

      // Return data directly
      return response.data || response;
    },

    async queryStagedData(dataAccessId: string, sql: string) {
      const response = await this.invoke('data_manager', {
        operation: 'query',
        data_access_id: dataAccessId,
        sql
      }, {
        returnFormat: 'parsed'
      });

      // Extract rows from various response structures
      if (Array.isArray(response)) return response;
      if (response.rows) return response.rows;
      if (response.data?.rows) return response.data.rows;
      if (response.data && Array.isArray(response.data)) return response.data;

      throw new Error('Could not extract rows from query response');
    },

    async getWithRetry(toolName: string, args: any, retries = 3) {
      let lastError: any;

      for (let i = 0; i < retries; i++) {
        try {
          return await this.getData(toolName, args);
        } catch (error) {
          lastError = error;
          console.warn(`[${serverKey}] Attempt ${i + 1} failed:`, error);

          // Wait before retry (exponential backoff)
          if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
          }
        }
      }

      throw lastError;
    }
  };
}

/**
 * Check if response is dual-mode format (new)
 */
function isDualModeResponse(response: any): boolean {
  return (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    'metadata' in response &&
    response.metadata?.operation !== undefined
  );
}

/**
 * Handle dual-mode response (ideal case)
 */
function handleDualModeResponse(response: any): any {
  const { data, metadata, display } = response;

  // If data is staged, return with query helper
  if (metadata.status === 'staged' && data.dataAccessId) {
    return {
      ...data,
      _staged: true,
      _metadata: metadata
    };
  }

  // Return data directly
  return data;
}

/**
 * Check if response is markdown format (legacy)
 */
function isMarkdownResponse(response: any): boolean {
  return (
    response &&
    typeof response === 'object' &&
    Array.isArray(response.content) &&
    response.content[0]?.type === 'text'
  );
}

/**
 * Handle markdown response with parsing
 */
function handleMarkdownResponse(
  response: any,
  toolName: string,
  returnFormat: 'raw' | 'parsed' | 'auto',
  parseStrategy: 'aggressive' | 'conservative',
  throwOnParseError: boolean
): any {
  const text = response.content[0]?.text || '';

  // Return raw if requested
  if (returnFormat === 'raw') {
    return response;
  }

  // Attempt to parse
  try {
    const parsed = parseMarkdownResponse(text, {
      strategy: parseStrategy,
      toolName,
      expectedFields: getExpectedFields(toolName),
      extractJson: true
    });

    // Check if parsing was successful
    const expectedFields = getExpectedFields(toolName);
    const isValid = validateParsedResponse(parsed, expectedFields);

    if (!isValid && throwOnParseError) {
      throw new Error(`Failed to parse response for ${toolName}: missing expected fields`);
    }

    // Return parsed structure
    if (parsed.success) {
      // Extract most useful data
      const result: any = {};

      if (parsed.dataAccessId) result.dataAccessId = parsed.dataAccessId;
      if (parsed.table) result.table = parsed.table;
      if (parsed.operation) result.operation = parsed.operation;
      if (parsed.entities !== undefined) result.entities = parsed.entities;
      if (parsed.data) result.data = parsed.data;
      if (parsed.metadata) result.metadata = parsed.metadata;

      // Include raw text for debugging
      result._rawText = parsed.rawText;
      result._parsed = true;

      return result;
    } else {
      // Error response
      throw new Error(parsed.error || 'Tool execution failed');
    }
  } catch (error) {
    if (throwOnParseError) {
      throw error;
    }

    // Fallback: return raw response with warning
    console.warn(`[Parser] Failed to parse ${toolName} response:`, error);
    return {
      _rawText: text,
      _parseError: error instanceof Error ? error.message : String(error),
      _rawResponse: response
    };
  }
}

/**
 * Enhance error with context
 */
function enhanceError(error: any, context: {
  serverKey: string;
  toolName: string;
  args: any;
}): Error {
  const message = error instanceof Error ? error.message : String(error);
  const enhanced = new Error(
    `[${context.serverKey}.${context.toolName}] ${message}`
  );

  // Attach context
  (enhanced as any).context = context;
  (enhanced as any).originalError = error;

  return enhanced;
}

/**
 * Generate helpers implementation with enhanced API
 */
export function generateEnhancedHelpersImplementation(
  serverToolMap: Map<string, { config: any; tools: Record<string, any> }>,
  aliasMap: Record<string, string> = {}
): string {
  const lines: string[] = [
    '// Enhanced helpers implementation with smart parsing',
    'const helpers = {};',
    '',
  ];

  for (const [serverKey, { tools }] of serverToolMap.entries()) {
    const toolNames = Object.keys(tools);

    lines.push(`// ${serverKey} enhanced helper`);
    lines.push(`helpers.${serverKey} = {`);

    // listTools
    lines.push(`  async listTools() {`);
    lines.push(`    return ${JSON.stringify(toolNames)};`);
    lines.push(`  },`);

    // searchTools
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

    // invoke
    lines.push(`  async invoke(toolName, args, options = {}) {`);
    lines.push(`    if (typeof __invokeMCPTool !== 'function') {`);
    lines.push(`      throw new Error('MCP tool invocation not available');`);
    lines.push(`    }`);
    lines.push(`    const response = await __invokeMCPTool('${serverKey}', toolName, args, options.headers);`);
    lines.push(`    return __parseResponse(response, toolName, options);`);
    lines.push(`  },`);

    // getData
    lines.push(`  async getData(toolName, args) {`);
    lines.push(`    const response = await this.invoke(toolName, args, { returnFormat: 'parsed' });`);
    lines.push(`    if (response.dataAccessId && response.table) {`);
    lines.push(`      return this.queryStagedData(response.dataAccessId, \`SELECT * FROM \${response.table} LIMIT 100\`);`);
    lines.push(`    }`);
    lines.push(`    return response.data || response;`);
    lines.push(`  },`);

    // queryStagedData
    lines.push(`  async queryStagedData(dataAccessId, sql) {`);
    lines.push(`    const response = await this.invoke('data_manager', {`);
    lines.push(`      operation: 'query',`);
    lines.push(`      data_access_id: dataAccessId,`);
    lines.push(`      sql`);
    lines.push(`    }, { returnFormat: 'parsed' });`);
    lines.push(`    if (Array.isArray(response)) return response;`);
    lines.push(`    if (response.rows) return response.rows;`);
    lines.push(`    if (response.data?.rows) return response.data.rows;`);
    lines.push(`    throw new Error('Could not extract rows from query response');`);
    lines.push(`  }`);

    lines.push(`};`);
    lines.push('');
  }

  // Add aliases
  for (const [aliasName, targetKey] of Object.entries(aliasMap)) {
    if (!aliasName || !targetKey) continue;
    lines.push(`if (helpers.${targetKey}) {`);
    lines.push(`  helpers.${aliasName} = helpers.${targetKey};`);
    lines.push(`}`);
  }

  lines.push('// Export helpers');
  lines.push('globalThis.helpers = helpers;');

  return lines.join('\n');
}
