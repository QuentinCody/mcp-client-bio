/**
 * Enhanced helpers implementation that integrates response transformation
 * This generates JavaScript code that will run in the Cloudflare Worker
 */

import type { MCPServerConfig } from '@/lib/mcp-client';

/**
 * Generate helpers implementation with integrated response transformation
 */
export function generateTransformingHelpersImplementation(
  serverToolMap: Map<string, { config: MCPServerConfig; tools: Record<string, any> }>,
  aliasMap: Record<string, string> = {}
): string {
  const lines: string[] = [
    '// Response transformation utilities',
    'function detectError(response) {',
    '  if (response?.isError === true) return true;',
    '  const text = response?.content?.[0]?.text || "";',
    '',
    '  // Check for actual error indicators, but NOT warning emojis in informational messages',
    '  // Informational messages often contain ⚠️ but start with success indicators like 📊, 📄, 🆔',
    '  const hasSuccessIndicator = /^[📊📄🆔📋💡]/m.test(text);',
    '  if (hasSuccessIndicator) return false; // Success messages with warnings are not errors',
    '',
    '  // Check for actual error patterns',
    '  const errorPatterns = [',
    '    /\\berror\\b:/i,           // "error:" or "Error:"',
    '    /\\bfailed\\b:/i,          // "failed:" or "Failed:"',
    '    /Query failed/i,          // Specific error message',
    '    /Manager Error/i,         // Specific error message',
    '    /^❌/,                    // Error emoji at start',
    '    /MCP error -\\d+:/,       // MCP protocol errors',
    '    /validation error:/i,     // Validation errors',
    '    /Invalid arguments/i,     // Argument errors',
    '  ];',
    '',
    '  return errorPatterns.some(pattern => pattern.test(text));',
    '}',
    '',
    'function extractError(response) {',
    '  const text = response?.content?.[0]?.text || "";',
    '',
    '  // Extract error message - handle multi-line errors',
    '  let message = "Tool execution failed";',
    '  const hints = [];',
    '',
    '  // Try to extract structured error message (stop at double newline or new section)',
    '  const errorMatch = text.match(/(?:Error|Failed|Exception):\\s*(.+?)(?=\\n\\n|\\n(?:[A-Z]|$)|$)/s);',
    '  if (errorMatch?.[1]) {',
    '    message = errorMatch[1].trim();',
    '  } else if (text.length > 0 && text.length < 500) {',
    '    // If no structured error found and text is short, use it as message',
    '    message = text.trim();',
    '  } else if (text.length >= 500) {',
    '    // For long text, take first 200 chars',
    '    message = text.substring(0, 200).trim() + "...";',
    '  }',
    '',
    '  // Extract required parameter information from validation errors',
    '  const requiredMatch = text.match(/"path":\\s*\\[\\s*"([^"]+)"\\s*\\]/);',
    '  if (requiredMatch?.[1]) {',
    '    hints.push(`Missing required parameter: "${requiredMatch[1]}"`);',
    '  }',
    '',
    '  // Extract expected values from enum validation errors',
    '  const expectedMatch = text.match(/"expected":\\s*"([^"]+)"/);',
    '  if (expectedMatch?.[1]) {',
    '    hints.push(`Expected one of: ${expectedMatch[1]}`);',
    '  }',
    '',
    '  // Extract "received" parameter to suggest corrections',
    '  const receivedMatch = text.match(/"received":\\s*"([^"]+)"/);',
    '  if (receivedMatch?.[1]) {',
    '    const received = receivedMatch[1];',
    '    // Common parameter name corrections',
    '    const corrections = {',
    '      "query": "term",',
    '      "search": "term",',
    '      "search_term": "term",',
    '      "q": "term",',
    '      "db": "database",',
    '      "id": "ids",',
    '      "tool_name": "tool",',
    '      "toolName": "tool",',
    '      "retType": "rettype",',
    '      "retMode": "retmode"',
    '    };',
    '    if (corrections[received]) {',
    '      hints.push(`Did you mean "${corrections[received]}" instead of "${received}"?`);',
    '    }',
    '  }',
    '',
    '  // Determine error code and add helpful hints',
    '  let code = "UNKNOWN_ERROR";',
    '  if (text.includes("no such table")) {',
    '    code = "TABLE_NOT_FOUND";',
    '    hints.push("Query the staging schema first to see available tables");',
    '  } else if (text.includes("Invalid arguments") || text.includes("validation error")) {',
    '    code = "INVALID_ARGUMENTS";',
    '    hints.push("Use helpers.serverName.getToolSchema(toolName) to see all required and optional parameters");',
    '  } else if (text.includes("timed out")) {',
    '    code = "TIMEOUT";',
    '    hints.push("Try a simpler query or increase timeout");',
    '  } else if (text.includes("required") || text.includes("Required")) {',
    '    code = "MISSING_REQUIRED_PARAM";',
    '    hints.push("Use helpers.serverName.getToolSchema(toolName) to see required parameters");',
    '  } else if (text.includes("not found") || text.includes("not callable")) {',
    '    code = "NOT_FOUND";',
    '    hints.push("Use helpers.serverName.listTools() to see available tools");',
    '  }',
    '',
    '  // Add hints to message if present',
    '  if (hints.length > 0) {',
    '    message += "\\n" + hints.map(h => `  • ${h}`).join("\\n");',
    '  }',
    '',
    '  return {',
    '    code,',
    '    message,',
    '    // Only include full text in details if it differs from message and is useful',
    '    details: (text !== message && text.length < 2000) ? { fullError: text } : undefined',
    '  };',
    '}',
    '',
    'function extractDataAccessId(text) {',
    '  const patterns = [',
    '    /Data Access ID:\\s*\\*\\*\\s*([a-zA-Z0-9_]+)\\s*\\*\\*/,',
    '    /data_access_id[:\\s]*["\']?([a-zA-Z0-9_]+)["\']?/i,',
    '    /([a-z]+_[a-z]+_\\d{10,}_[a-z0-9]{4,})/',
    '  ];',
    '  for (const pattern of patterns) {',
    '    const match = text.match(pattern);',
    '    if (match?.[1]) {',
    '      const cleaned = match[1].replace(/[^\\w\\-_]/g, "").trim();',
    '      if (/^[a-z]+_[a-z]+_\\d{10,}_[a-z0-9]{4,}$/.test(cleaned)) return cleaned;',
    '    }',
    '  }',
    '  return null;',
    '}',
    '',
    'function extractTableNames(text) {',
    '  const tables = new Set();',
    '  const matches = text.matchAll(/FROM\\s+([a-z_][a-z0-9_]*)/gi);',
    '  const keywords = ["select", "where", "limit", "join", "order", "group"];',
    '  for (const match of matches) {',
    '    const table = match[1].toLowerCase();',
    '    if (!keywords.includes(table)) tables.add(table);',
    '  }',
    '  return Array.from(tables);',
    '}',
    '',
    'function extractJsonData(text) {',
    '  const patterns = [',
    '    /```json\\s*(\\{[\\s\\S]*?\\}|\\[[\\s\\S]*?\\])\\s*```/g,',
    '    /```\\s*(\\{[\\s\\S]*?\\}|\\[[\\s\\S]*?\\])\\s*```/g',
    '  ];',
    '  for (const pattern of patterns) {',
    '    const matches = Array.from(text.matchAll(pattern));',
    '    if (matches.length > 0) {',
    '      try { return JSON.parse(matches[0][1]); } catch {}',
    '    }',
    '  }',
    '  if (text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) {',
    '    try { return JSON.parse(text); } catch {}',
    '  }',
    '  return null;',
    '}',
    '',
    'function transformResponse(response, toolName) {',
    '  // If already in good format, pass through',
    '  if (response?.ok !== undefined || response?.data !== undefined) {',
    '    return { ok: response.ok ?? !response.error, data: response.data ?? response, error: response.error };',
    '  }',
    '',
    '  // PRIORITY: Check for structuredContent first (MCP spec)',
    '  // This is the primary way servers return structured data for Code Mode',
    '  if (response?.structuredContent && typeof response.structuredContent === "object") {',
    '    const structured = response.structuredContent;',
    '    console.log("[transformResponse] Found structuredContent:", Object.keys(structured).slice(0, 10));',
    '',
    '    // Check if it\'s an error in structured format',
    '    if (structured.success === false || structured.error) {',
    '      return {',
    '        ok: false,',
    '        error: {',
    '          code: structured.code || structured.error?.code || "STRUCTURED_ERROR",',
    '          message: structured.message || structured.error?.message || "Tool execution failed",',
    '          details: structured',
    '        }',
    '      };',
    '    }',
    '',
    '    // Return structured data directly (this is what Code Mode needs!)',
    '    console.log("[transformResponse] Returning structured data with keys:", Object.keys(structured).slice(0, 10));',
    '    return { ok: true, data: structured };',
    '  }',
    '  ',
    '  // DEBUG: Log what we received if no structuredContent',
    '  if (response) {',
    '    console.log("[transformResponse] No structuredContent found. Response keys:", Object.keys(response).slice(0, 10));',
    '    if (response.content?.[0]) {',
    '      console.log("[transformResponse] First content item:", Object.keys(response.content[0]));',
    '    }',
    '  }',
    '',
    '  // Check for errors',
    '  if (detectError(response)) {',
    '    return { ok: false, error: extractError(response), _raw: response };',
    '  }',
    '',
    '  const text = response?.content?.[0]?.text || "";',
    '  if (!text) return { ok: true, data: response };',
    '',
    '  // Check for staging',
    '  const dataAccessId = extractDataAccessId(text);',
    '  if (dataAccessId) {',
    '    const tables = extractTableNames(text);',
    '    const entityMatch = text.match(/(?:Entities|Records|Results):\\s*\\*\\*?(\\d+)\\*\\*?/i);',
    '    return {',
    '      ok: true,',
    '      data: {',
    '        dataAccessId,',
    '        table: tables[0] || "protein",',
    '        tables,',
    '        rowCount: entityMatch?.[1] ? parseInt(entityMatch[1], 10) : undefined',
    '      },',
    '      staged: { dataAccessId, tables, primaryTable: tables[0] }',
    '    };',
    '  }',
    '',
    '  // Try to extract JSON',
    '  const jsonData = extractJsonData(text);',
    '  if (jsonData) return { ok: true, data: jsonData };',
    '',
    '  // Return text as data',
    '  return { ok: true, data: { text, _rawText: true } };',
    '}',
    '',
    '// Helpers object',
    'const helpers = {};',
    '',
  ];

  for (const [serverKey, { tools }] of serverToolMap.entries()) {
    const toolNames = Object.keys(tools);

    lines.push(`// ${serverKey} helper with response transformation`);
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
    lines.push(`    return tools.filter(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));`);
    lines.push(`  },`);

    // getToolSchema - NEW: Inspect tool parameters
    lines.push(`  async getToolSchema(toolName) {`);
    lines.push(`    const schemas = ${JSON.stringify(
      Object.fromEntries(
        toolNames.map(name => [
          name,
          {
            name,
            description: tools[name].description || '',
            // MCP client may store schema in parameters, parameters.jsonSchema, or inputSchema
            inputSchema: tools[name].parameters?.jsonSchema || tools[name].parameters || tools[name].inputSchema || null,
          }
        ])
      )
    )};`);
    lines.push(`    const schema = schemas[toolName];`);
    lines.push(`    if (!schema) {`);
    lines.push(`      throw new Error(\`Tool '\${toolName}' not found. Available tools: \${Object.keys(schemas).join(', ')}\`);`);
    lines.push(`    }`);
    lines.push(`    `);
    lines.push(`    // Extract required and optional parameters from schema`);
    lines.push(`    const params = schema.inputSchema?.properties || {};`);
    lines.push(`    const required = schema.inputSchema?.required || [];`);
    lines.push(`    `);
    lines.push(`    const result = {`);
    lines.push(`      tool: toolName,`);
    lines.push(`      description: schema.description,`);
    lines.push(`      required: required.map(name => ({`);
    lines.push(`        name,`);
    lines.push(`        type: params[name]?.type || 'unknown',`);
    lines.push(`        description: params[name]?.description,`);
    lines.push(`        enum: params[name]?.enum`);
    lines.push(`      })),`);
    lines.push(`      optional: Object.keys(params).filter(name => !required.includes(name)).map(name => ({`);
    lines.push(`        name,`);
    lines.push(`        type: params[name]?.type || 'unknown',`);
    lines.push(`        description: params[name]?.description,`);
    lines.push(`        enum: params[name]?.enum,`);
    lines.push(`        default: params[name]?.default`);
    lines.push(`      }))`);
    lines.push(`    };`);
    lines.push(`    `);
    lines.push(`    console.log(\`[getToolSchema] \${toolName} - Required: \${required.join(', ')}\`);`);
    lines.push(`    return result;`);
    lines.push(`  },`);

    // invoke with transformation
    lines.push(`  async invoke(toolName, args, options = {}) {`);
    lines.push(`    if (typeof __invokeMCPTool !== 'function') {`);
    lines.push(`      throw new Error('MCP tool invocation not available');`);
    lines.push(`    }`);
    lines.push(`    const rawResponse = await __invokeMCPTool('${serverKey}', toolName, args);`);
    lines.push(`    const transformed = transformResponse(rawResponse, toolName);`);
    lines.push(`    if (!transformed.ok && options.throwOnError !== false) {`);
    lines.push(`      const errMsg = transformed.error?.message || 'Tool execution failed';`);
    lines.push(`      const err = new Error(errMsg);`);
    lines.push(`      err.code = transformed.error?.code || 'TOOL_ERROR';`);
    lines.push(`      err.details = transformed.error?.details || {};`);
    lines.push(`      err.toolName = toolName;`);
    lines.push(`      err.server = '${serverKey}';`);
    lines.push(`      err.args = args;`);
    lines.push(`      throw err;`);
    lines.push(`    }`);
    lines.push(`    return options.returnFormat === 'raw' ? rawResponse : transformed.data;`);
    lines.push(`  },`);

    // getData - automatic staging handling
    lines.push(`  async getData(toolName, args) {`);
    lines.push(`    const rawResponse = await __invokeMCPTool('${serverKey}', toolName, args);`);
    lines.push(`    const transformed = transformResponse(rawResponse, toolName);`);
    lines.push(`    if (!transformed.ok) {`);
    lines.push(`      const err = new Error(transformed.error?.message || 'Tool execution failed');`);
    lines.push(`      err.code = transformed.error?.code;`);
    lines.push(`      throw err;`);
    lines.push(`    }`);
    lines.push(`    // If data is staged, automatically query it`);
    lines.push(`    if (transformed.staged?.dataAccessId && transformed.data?.table) {`);
    lines.push(`      return this.queryStagedData(transformed.staged.dataAccessId, \`SELECT * FROM \${transformed.data.table} LIMIT 100\`);`);
    lines.push(`    }`);
    lines.push(`    return transformed.data;`);
    lines.push(`  },`);

    // queryStagedData
    lines.push(`  async queryStagedData(dataAccessId, sql) {`);
    lines.push(`    const rawResponse = await __invokeMCPTool('${serverKey}', 'data_manager', {`);
    lines.push(`      operation: 'query',`);
    lines.push(`      data_access_id: dataAccessId,`);
    lines.push(`      sql`);
    lines.push(`    });`);
    lines.push(`    const transformed = transformResponse(rawResponse, 'data_manager');`);
    lines.push(`    if (!transformed.ok) {`);
    lines.push(`      const err = new Error(transformed.error?.message || 'Query failed');`);
    lines.push(`      err.code = transformed.error?.code;`);
    lines.push(`      if (err.code === 'TABLE_NOT_FOUND' && transformed.error?.details?.originalText) {`);
    lines.push(`        err.message += ' (Tip: Use queryStagedData to list available tables)';`);
    lines.push(`      }`);
    lines.push(`      throw err;`);
    lines.push(`    }`);
    lines.push(`    // Extract rows from various response structures`);
    lines.push(`    if (Array.isArray(transformed.data)) return transformed.data;`);
    lines.push(`    if (transformed.data?.rows) return transformed.data.rows;`);
    lines.push(`    if (transformed.data?.data?.rows) return transformed.data.data.rows;`);
    lines.push(`    throw new Error('Could not extract rows from query response');`);
    lines.push(`  }`);

    lines.push(`};`);
    lines.push('');
  }

  // Add aliases
  for (const [aliasName, targetKey] of Object.entries(aliasMap)) {
    if (!aliasName || !targetKey) continue;
    lines.push(`if (helpers.${targetKey}) helpers.${aliasName} = helpers.${targetKey};`);
  }

  lines.push('');
  lines.push('// Export helpers');
  lines.push('globalThis.helpers = helpers;');

  return lines.join('\n');
}
