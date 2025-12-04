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
    '  return /\\berror\\b:|\\bfailed\\b:|Query failed|Manager Error|❌|⚠️/i.test(text);',
    '}',
    '',
    'function extractError(response) {',
    '  const text = response?.content?.[0]?.text || "";',
    '',
    '  // Extract error message - handle multi-line errors',
    '  let message = "Tool execution failed";',
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
    '  // Determine error code',
    '  let code = "UNKNOWN_ERROR";',
    '  if (text.includes("no such table")) code = "TABLE_NOT_FOUND";',
    '  else if (text.includes("Invalid arguments")) code = "INVALID_ARGUMENTS";',
    '  else if (text.includes("timed out")) code = "TIMEOUT";',
    '  else if (text.includes("required")) code = "MISSING_REQUIRED_PARAM";',
    '  else if (text.includes("not found")) code = "NOT_FOUND";',
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
