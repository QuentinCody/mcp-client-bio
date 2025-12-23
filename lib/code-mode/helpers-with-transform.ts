/**
 * Enhanced helpers implementation that integrates response transformation
 * This generates JavaScript code that will run in the Cloudflare Worker
 */

import type { MCPServerConfig } from '@/lib/mcp-client';
import {
  extractStructuredData,
  validateStructuredContent,
  type EnforcementOptions,
} from './structured-content-enforcer';
import { generateSQLHelpersImplementation } from './sql-helpers';

/**
 * Generate helpers implementation with integrated response transformation
 */
export function generateTransformingHelpersImplementation(
  serverToolMap: Map<string, { config: MCPServerConfig; tools: Record<string, any> }>,
  aliasMap: Record<string, string> = {},
  options: { enforceStructuredContent?: boolean; strictMode?: boolean } = {}
): string {
  const { enforceStructuredContent = true, strictMode = false } = options;

  const lines: string[] = [
    '// structuredContent Enforcement & Response Transformation',
    '// Auto-generated from lib/code-mode/structured-content-enforcer.ts',
    '',
    'function validateStructuredContent(response, serverKey, toolName) {',
    '  const issues = [];',
    '  const metadata = { serverKey, toolName };',
    '  ',
    '  if (!response || typeof response !== "object") {',
    '    return {',
    '      isValid: false,',
    '      hasStructuredContent: false,',
    '      contentType: "unknown",',
    '      issues: [{ severity: "error", code: "INVALID_RESPONSE", message: "Response is not a valid object" }]',
    '    };',
    '  }',
    '  ',
    '  metadata.responseKeys = Object.keys(response);',
    '  const hasStructuredContent = "structuredContent" in response;',
    '  ',
    '  if (!hasStructuredContent) {',
    '    issues.push({',
    '      severity: ' + (strictMode ? '"error"' : '"warning"') + ',',
    '      code: "MISSING_STRUCTURED_CONTENT",',
    '      message: "Response does not contain structuredContent field"',
    '    });',
    '  }',
    '  ',
    '  if (hasStructuredContent && typeof response.structuredContent !== "object") {',
    '    issues.push({',
    '      severity: "error",',
    '      code: "INVALID_STRUCTURED_CONTENT_TYPE",',
    '      message: "structuredContent must be an object"',
    '    });',
    '  }',
    '  ',
    '  let contentType = "unknown";',
    '  if (hasStructuredContent && typeof response.structuredContent === "object") {',
    '    contentType = "structured";',
    '  } else if (response.content?.[0]?.type === "text") {',
    '    const text = response.content[0].text || "";',
    '    if (text.includes("```json") || text.trim().startsWith("{")) {',
    '      contentType = "json";',
    '    } else if (text.includes("##") || text.includes("**")) {',
    '      contentType = "markdown";',
    '    } else {',
    '      contentType = "text";',
    '    }',
    '  }',
    '  ',
    '  const isValid = issues.filter(i => i.severity === "error").length === 0;',
    '  ',
    '  return {',
    '    isValid: hasStructuredContent && isValid,',
    '    hasStructuredContent,',
    '    contentType,',
    '    issues,',
    '    metadata',
    '  };',
    '}',
    '',
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
    'function hasValue(value) {',
    '  if (value === null || value === undefined) return false;',
    '  if (typeof value === "string") return value.trim().length > 0;',
    '  if (Array.isArray(value)) return value.length > 0;',
    '  if (typeof value === "object") return Object.keys(value).length > 0;',
    '  return true;',
    '}',
    '',
    'function safeGet(input, path, fallback = null) {',
    '  if (!path) return input ?? fallback;',
    '  const parts = Array.isArray(path) ? path : String(path).split(".");',
    '  let current = input;',
    '  for (const part of parts) {',
    '    if (current && Object.prototype.hasOwnProperty.call(current, part)) {',
    '      current = current[part];',
    '    } else {',
    '      return fallback;',
    '    }',
    '  }',
    '  return current ?? fallback;',
    '}',
    '',
    'function compactArgs(args) {',
    '  if (!args || typeof args !== "object") return args;',
    '  const result = Array.isArray(args) ? [] : {};',
    '  for (const [key, value] of Object.entries(args)) {',
    '    if (hasValue(value)) result[key] = value;',
    '  }',
    '  return result;',
    '}',
    '',
    'function validateRequiredArgs(args, schema) {',
    '  const required = schema?.required || [];',
    '  if (!required.length) return { ok: true, missing: [] };',
    '  const missing = required.filter((name) => !hasValue(args?.[name]));',
    '  return { ok: missing.length === 0, missing };',
    '}',
    '',
    'function buildMinimalArgs(args, schema) {',
    '  const required = schema?.required || [];',
    '  if (!required.length) return compactArgs(args);',
    '  const minimal = {};',
    '  for (const name of required) {',
    '    if (hasValue(args?.[name])) minimal[name] = args[name];',
    '  }',
    '  return minimal;',
    '}',
    '',
    'function summarizeToolError({ server, tool, args, error, validation }) {',
    '  return {',
    '    server,',
    '    tool,',
    '    args: compactArgs(args),',
    '    error: {',
    '      message: error?.message || String(error),',
    '      code: error?.code || error?.name || "UNKNOWN_ERROR"',
    '    },',
    '    validation',
    '  };',
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
    '// GraphQL null-safety validation',
    '// Detects and handles GraphQL responses with null data fields',
    'function validateGraphQLData(data, path = "data") {',
    '  const issues = [];',
    '  ',
    '  // Check if this looks like a GraphQL response (has a "data" field at root)',
    '  if (typeof data === "object" && data !== null && "data" in data) {',
    '    const graphqlData = data.data;',
    '    ',
    '    // Case 1: data is null',
    '    if (graphqlData === null) {',
    '      issues.push({',
    '        severity: "error",',
    '        code: "GRAPHQL_NULL_DATA",',
    '        message: `GraphQL query returned null data. The query might not match any records, or the field name is incorrect.`,',
    '        hint: "Check that your query uses the correct field names and filters."',
    '      });',
    '      return { valid: false, issues, nullFields: ["data"] };',
    '    }',
    '    ',
    '    // Case 2: data exists but contains null fields',
    '    if (typeof graphqlData === "object") {',
    '      const nullFields = [];',
    '      ',
    '      for (const [key, value] of Object.entries(graphqlData)) {',
    '        if (value === null) {',
    '          nullFields.push(key);',
    '          issues.push({',
    '            severity: "warning",',
    '            code: "GRAPHQL_NULL_FIELD",',
    '            message: `GraphQL field "${key}" is null. This field might not exist for the queried entity.`,',
    '            hint: `Check if "${key}" is the correct field name or if the entity has this property.`',
    '          });',
    '        } else if (typeof value === "object" && value !== null) {',
    '          // Recursively check nested objects for null fields',
    '          const nestedCheck = validateGraphQLData(value, `${path}.${key}`);',
    '          if (nestedCheck.nullFields.length > 0) {',
    '            nullFields.push(...nestedCheck.nullFields.map(f => `${key}.${f}`));',
    '            issues.push(...nestedCheck.issues);',
    '          }',
    '        }',
    '      }',
    '      ',
    '      if (nullFields.length > 0) {',
    '        return { valid: false, issues, nullFields };',
    '      }',
    '    }',
    '  }',
    '  ',
    '  return { valid: true, issues: [], nullFields: [] };',
    '}',
    '',
    '// Safe property access for GraphQL responses',
    '// Wraps data in a Proxy that returns helpful errors instead of throwing',
    'function safeGraphQLAccess(data, serverKey, toolName) {',
    '  if (typeof data !== "object" || data === null) return data;',
    '  ',
    '  return new Proxy(data, {',
    '    get(target, prop) {',
    '      const value = target[prop];',
    '      ',
    '      // If accessing a property that\'s null, provide a helpful error',
    '      if (value === null && prop !== "constructor" && prop !== "__proto__") {',
    '        console.error(`[GraphQL] Attempted to access null field "${String(prop)}" in ${serverKey}.${toolName} response`);',
    '        console.error(`[GraphQL] Hint: The GraphQL query succeeded but "${String(prop)}" is null. This usually means:`);',
    '        console.error(`[GraphQL]   1. The field name is misspelled`);',
    '        console.error(`[GraphQL]   2. The queried entity doesn\'t have this property`);',
    '        console.error(`[GraphQL]   3. The filter didn\'t match any records`);',
    '        ',
    '        // Return null instead of throwing to allow code to handle it gracefully',
    '        return null;',
    '      }',
    '      ',
    '      // If value is an object, wrap it recursively',
    '      if (typeof value === "object" && value !== null) {',
    '        return safeGraphQLAccess(value, serverKey, toolName);',
    '      }',
    '      ',
    '      return value;',
    '    }',
    '  });',
    '}',
    '',
    'function transformResponse(response, toolName, serverKey) {',
    '  // If already in good format, pass through',
    '  if (response?.ok !== undefined || response?.data !== undefined) {',
    '    return { ok: response.ok ?? !response.error, data: response.data ?? response, error: response.error };',
    '  }',
    '',
    '  // Check for structuredContent (custom extension for Code Mode)',
    '  // Note: This is NOT part of MCP spec - standard MCP uses content[].text',
    '  const validation = validateStructuredContent(response, serverKey, toolName);',
    '',
    '  // PRIORITY: Check for structuredContent first (custom Code Mode extension)',
    '  // Some servers (like our own) return structuredContent for direct data access',
    '  if (validation.hasStructuredContent && validation.isValid) {',
    '    const structured = response.structuredContent;',
    '    console.log("[transformResponse] ✓ Found valid structuredContent:", Object.keys(structured).slice(0, 10));',
    '',
    '    // Check if it\'s an error in structured format',
    '    if (structured.success === false || structured.error) {',
    '      return {',
    '        ok: false,',
    '        error: {',
    '          code: structured.code || structured.error?.code || "STRUCTURED_ERROR",',
    '          message: structured.message || structured.error?.message || "Tool execution failed",',
    '          details: structured',
    '        },',
    '        _validation: validation',
    '      };',
    '    }',
    '',
    '    // GraphQL null-safety check',
    '    const graphqlValidation = validateGraphQLData(structured);',
    '    if (!graphqlValidation.valid) {',
    '      const errorMessage = graphqlValidation.issues',
    '        .filter(i => i.severity === "error")',
    '        .map(i => i.message)',
    '        .join("; ") || "GraphQL query returned null data";',
    '      ',
    '      const hints = graphqlValidation.issues',
    '        .filter(i => i.hint)',
    '        .map(i => `  • ${i.hint}`)',
    '        .join("\\n");',
    '      ',
    '      console.error(`[GraphQL] ${serverKey}.${toolName}: ${errorMessage}`);',
    '      if (graphqlValidation.nullFields.length > 0) {',
    '        console.error(`[GraphQL] Null fields detected: ${graphqlValidation.nullFields.join(", ")}`);',
    '      }',
    '      if (hints) {',
    '        console.error(`[GraphQL] Hints:\\n${hints}`);',
    '      }',
    '      ',
    '      // Return error with helpful guidance',
    '      return {',
    '        ok: false,',
    '        error: {',
    '          code: "GRAPHQL_NULL_DATA",',
    '          message: errorMessage + (hints ? "\\n" + hints : ""),',
    '          nullFields: graphqlValidation.nullFields,',
    '          details: structured',
    '        },',
    '        _validation: validation,',
    '        _graphqlValidation: graphqlValidation',
    '      };',
    '    }',
    '',
    '    // Wrap GraphQL data in safe proxy to prevent null access errors',
    '    const safeData = "data" in structured',
    '      ? safeGraphQLAccess(structured, serverKey, toolName)',
    '      : structured;',
    '',
    '    // Return structured data directly (this is what Code Mode needs!)',
    '    console.log("[transformResponse] Returning structured data with keys:", Object.keys(structured).slice(0, 10));',
    '    return { ok: true, data: safeData, _validation: validation, _graphqlValidation: graphqlValidation };',
    '  }',
    '  ',
    '  // FALLBACK: Parse standard MCP content[].text responses',
    '  // This is the normal path for most MCP servers',
    '',
    '  // Check for errors',
    '  if (detectError(response)) {',
    '    return { ok: false, error: extractError(response), _raw: response, _validation: validation };',
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
    '// Tool name normalization and resolution',
    'function normalizeToolTokens(name, serverKey) {',
    '  const raw = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");',
    '  const tokens = raw.split("_").filter(Boolean);',
    '  if (!serverKey) return tokens;',
    '  const serverNorm = String(serverKey).toLowerCase().replace(/[^a-z0-9]+/g, "_");',
    '  const serverTokens = new Set([serverNorm, serverNorm.replace(/s$/, ""), "mcp", "tool"]);',
    '  return tokens.filter(token => !serverTokens.has(token));',
    '}',
    '',
    'function resolveToolName(toolName, availableTools, serverKey) {',
    '  if (availableTools.includes(toolName)) return toolName;',
    '  if (availableTools.length === 1) return availableTools[0];',
    '  const candidateTokens = normalizeToolTokens(toolName, serverKey);',
    '  const normalizedCandidate = candidateTokens.join("_");',
    '  const normalizedMap = new Map();',
    '  const sortedMap = new Map();',
    '  availableTools.forEach((tool) => {',
    '    const tokens = normalizeToolTokens(tool, serverKey);',
    '    const normalized = tokens.join("_");',
    '    if (!normalizedMap.has(normalized)) normalizedMap.set(normalized, []);',
    '    normalizedMap.get(normalized).push(tool);',
    '    const sorted = [...tokens].sort().join("_");',
    '    if (!sortedMap.has(sorted)) sortedMap.set(sorted, []);',
    '    sortedMap.get(sorted).push(tool);',
    '  });',
    '  const exact = normalizedMap.get(normalizedCandidate);',
    '  if (exact && exact.length === 1) return exact[0];',
    '  const sorted = sortedMap.get([...candidateTokens].sort().join("_"));',
    '  if (sorted && sorted.length === 1) return sorted[0];',
    '  const scored = availableTools.map((tool) => {',
    '    const tokens = normalizeToolTokens(tool, serverKey);',
    '    const overlap = tokens.filter(t => candidateTokens.includes(t)).length;',
    '    const score = overlap / Math.max(tokens.length, candidateTokens.length, 1);',
    '    return { tool, score };',
    '  }).sort((a, b) => b.score - a.score);',
    '  if (scored[0] && scored[0].score >= 0.6 && (!scored[1] || scored[0].score > scored[1].score)) {',
    '    return scored[0].tool;',
    '  }',
    '  const normalized = candidateTokens.join("_");',
    '  const containsMatches = availableTools.filter((tool) =>',
    '    normalizeToolTokens(tool, serverKey).join("_").includes(normalized)',
    '  );',
    '  if (containsMatches.length === 1) return containsMatches[0];',
    '  return toolName;',
    '}',
    '',
    'function coerceArgsToSchema(args, schema) {',
    '  if (!schema || typeof schema !== "object") return args;',
    '  const props = schema.properties || {};',
    '  const required = Array.isArray(schema.required) ? schema.required : [];',
    '  const result = { ...(args || {}) };',
    '  const missing = required.filter((key) => result[key] === undefined);',
    '  if (missing.length === 0) return result;',
    '  if (missing.length === 1) {',
    '    const key = missing[0];',
    '    const candidates = Object.entries(result).filter(([k, v]) => k !== key && v !== undefined);',
    '    if (candidates.length === 1) {',
    '      result[key] = candidates[0][1];',
    '    }',
    '  }',
    '  if (missing.includes("query")) {',
    '    const queryKeys = Object.keys(result).filter((key) => /^query_|^filter_/i.test(key));',
    '    if (queryKeys.length > 0) {',
    '      result.query = queryKeys.map((key) => String(result[key])).join(" ");',
    '    } else {',
    '      const textParts = Object.entries(result)',
    '        .filter(([, value]) => typeof value === "string" || typeof value === "number")',
    '        .map(([key, value]) => `${key}:${value}`);',
    '      if (textParts.length > 0) result.query = textParts.join(" AND ");',
    '    }',
    '  }',
    '  if (missing.includes("sql") && result.query && !result.sql) {',
    '    result.sql = result.query;',
    '  }',
    '  return result;',
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
    lines.push(`    `);
    lines.push(`    // DETERMINISTIC VALIDATION: Check if tool exists (with alias resolution)`);
    lines.push(`    const availableTools = ${JSON.stringify(toolNames)};`);
    lines.push(`    const resolvedTool = resolveToolName(toolName, availableTools, '${serverKey}');`);
    lines.push(`    if (!availableTools.includes(resolvedTool)) {`);
    lines.push(`      // Try to find similar tools using substring matching`);
    lines.push(`      const similar = availableTools.filter(t => `);
    lines.push(`        t.toLowerCase().includes(toolName.toLowerCase()) ||`);
    lines.push(`        toolName.toLowerCase().includes(t.toLowerCase())`);
    lines.push(`      ).slice(0, 3);`);
    lines.push(`      `);
    lines.push(`      let errorMsg = \`Tool '\${toolName}' does not exist on server '${serverKey}'.\\n\\n\`;`);
    lines.push(`      `);
    lines.push(`      if (similar.length > 0) {`);
    lines.push(`        errorMsg += \`Did you mean one of these?\\n  - \${similar.join('\\n  - ')}\\n\\n\`;`);
    lines.push(`      }`);
    lines.push(`      `);
    lines.push(`      errorMsg += \`Available tools on ${serverKey}:\\n  - \${availableTools.slice(0, 5).join('\\n  - ')}\`;`);
    lines.push(`      if (availableTools.length > 5) {`);
    lines.push(`        errorMsg += \`\\n  ... and \${availableTools.length - 5} more\`;`);
    lines.push(`      }`);
    lines.push(`      errorMsg += \`\\n\\nUse helpers.${serverKey}.listTools() to see all available tools.\`;`);
    lines.push(`      `);
    lines.push(`      throw new Error(errorMsg);`);
    lines.push(`    }`);
    lines.push(`    `);
    lines.push(`    // Get schema and coerce arguments`);
    lines.push(`    const schemas = ${JSON.stringify(
      Object.fromEntries(
        toolNames.map(name => [
          name,
          tools[name].parameters?.jsonSchema || tools[name].parameters || tools[name].inputSchema || null,
        ])
      )
    )};`);
    lines.push(`    const schema = schemas[resolvedTool];`);
    lines.push(`    const finalArgs = coerceArgsToSchema(args, schema);`);
    lines.push(`    const requiredCheck = validateRequiredArgs(finalArgs, schema);`);
    lines.push(`    if (!requiredCheck.ok) {`);
    lines.push(`      const err = new Error(\`Missing required arguments: \${requiredCheck.missing.join(", ")}\`);`);
    lines.push(`      err.code = "MISSING_REQUIRED_PARAM";`);
    lines.push(`      err.server = '${serverKey}';`);
    lines.push(`      err.toolName = resolvedTool;`);
    lines.push(`      err.args = finalArgs;`);
    lines.push(`      throw err;`);
    lines.push(`    }`);
    lines.push(`    `);
    lines.push(`    let rawResponse;`);
    lines.push(`    try {`);
    lines.push(`      rawResponse = await __invokeMCPTool('${serverKey}', resolvedTool, finalArgs);`);
    lines.push(`    } catch (error) {`);
    lines.push(`      const message = error?.message || String(error);`);
    lines.push(`      if (resolvedTool !== toolName && (message.includes('not found') || message.includes('not callable'))) {`);
    lines.push(`        rawResponse = await __invokeMCPTool('${serverKey}', toolName, finalArgs);`);
    lines.push(`      } else {`);
    lines.push(`        throw error;`);
    lines.push(`      }`);
    lines.push(`    }`);
    lines.push(`    const transformed = transformResponse(rawResponse, resolvedTool, '${serverKey}');`);
    lines.push(`    if (!transformed.ok) {`);
    lines.push(`      const errMsg = transformed.error?.message || 'Tool execution failed';`);
    lines.push(`      const err = new Error(errMsg);`);
    lines.push(`      err.code = transformed.error?.code || 'TOOL_ERROR';`);
    lines.push(`      err.details = transformed.error?.details || {};`);
    lines.push(`      err.toolName = resolvedTool;`);
    lines.push(`      err.server = '${serverKey}';`);
    lines.push(`      err.args = finalArgs;`);
    lines.push(`      err.validation = transformed._validation;`);
    lines.push(`      err.summary = summarizeToolError({`);
    lines.push(`        server: '${serverKey}',`);
    lines.push(`        tool: resolvedTool,`);
    lines.push(`        args: finalArgs,`);
    lines.push(`        error: err,`);
    lines.push(`        validation: transformed._validation`);
    lines.push(`      });`);
    lines.push(`      const minimalArgs = buildMinimalArgs(finalArgs, schema);`);
    lines.push(`      if (options.retryOnError !== false && JSON.stringify(minimalArgs) !== JSON.stringify(finalArgs)) {`);
    lines.push(`        const retryResponse = await __invokeMCPTool('${serverKey}', resolvedTool, minimalArgs);`);
    lines.push(`        const retryTransformed = transformResponse(retryResponse, resolvedTool, '${serverKey}');`);
    lines.push(`        if (retryTransformed.ok) {`);
    lines.push(`          return options.returnFormat === 'raw' ? retryResponse : retryTransformed.data;`);
    lines.push(`        }`);
    lines.push(`      }`);
    lines.push(`      if (options.throwOnError !== false) {`);
    lines.push(`        throw err;`);
    lines.push(`      }`);
    lines.push(`      return { ok: false, error: err, meta: err.summary };`);
    lines.push(`    }`);
    lines.push(`    const data = options.returnFormat === 'raw' ? rawResponse : transformed.data;`);
    lines.push(`    if (options.returnFormat === 'envelope') {`);
    lines.push(`      return { ok: true, data, meta: { server: '${serverKey}', tool: resolvedTool, args: finalArgs } };`);
    lines.push(`    }`);
    lines.push(`    return data;`);
    lines.push(`  },`);
    lines.push(`  async invokeWithMeta(toolName, args, options = {}) {`);
    lines.push(`    return this.invoke(toolName, args, { ...options, returnFormat: 'envelope', throwOnError: false });`);
    lines.push(`  },`);

    // getData - automatic staging handling
    lines.push(`  async getData(toolName, args) {`);
    lines.push(`    if (typeof __invokeMCPTool !== 'function') {`);
    lines.push(`      throw new Error('MCP tool invocation not available');`);
    lines.push(`    }`);
    lines.push(`    `);
    lines.push(`    // Tool resolution with same logic as invoke`);
    lines.push(`    const availableTools = ${JSON.stringify(toolNames)};`);
    lines.push(`    const resolvedTool = resolveToolName(toolName, availableTools, '${serverKey}');`);
    lines.push(`    if (!availableTools.includes(resolvedTool)) {`);
    lines.push(`      const similar = availableTools.filter(t => `);
    lines.push(`        t.toLowerCase().includes(toolName.toLowerCase()) ||`);
    lines.push(`        toolName.toLowerCase().includes(t.toLowerCase())`);
    lines.push(`      ).slice(0, 3);`);
    lines.push(`      `);
    lines.push(`      let errorMsg = \`Tool '\${toolName}' does not exist on server '${serverKey}'.\\n\\n\`;`);
    lines.push(`      if (similar.length > 0) {`);
    lines.push(`        errorMsg += \`Did you mean one of these?\\n  - \${similar.join('\\n  - ')}\\n\\n\`;`);
    lines.push(`      }`);
    lines.push(`      errorMsg += \`Available tools on ${serverKey}:\\n  - \${availableTools.slice(0, 5).join('\\n  - ')}\`;`);
    lines.push(`      if (availableTools.length > 5) {`);
    lines.push(`        errorMsg += \`\\n  ... and \${availableTools.length - 5} more\`;`);
    lines.push(`      }`);
    lines.push(`      errorMsg += \`\\n\\nUse helpers.${serverKey}.listTools() to see all available tools.\`;`);
    lines.push(`      throw new Error(errorMsg);`);
    lines.push(`    }`);
    lines.push(`    `);
    lines.push(`    // Argument coercion`);
    lines.push(`    const schemas = ${JSON.stringify(
      Object.fromEntries(
        toolNames.map(name => [
          name,
          tools[name].parameters?.jsonSchema || tools[name].parameters || tools[name].inputSchema || null,
        ])
      )
    )};`);
    lines.push(`    const schema = schemas[resolvedTool];`);
    lines.push(`    const finalArgs = coerceArgsToSchema(args, schema);`);
    lines.push(`    `);
    lines.push(`    let rawResponse;`);
    lines.push(`    try {`);
    lines.push(`      rawResponse = await __invokeMCPTool('${serverKey}', resolvedTool, finalArgs);`);
    lines.push(`    } catch (error) {`);
    lines.push(`      const message = error?.message || String(error);`);
    lines.push(`      if (resolvedTool !== toolName && (message.includes('not found') || message.includes('not callable'))) {`);
    lines.push(`        rawResponse = await __invokeMCPTool('${serverKey}', toolName, finalArgs);`);
    lines.push(`      } else {`);
    lines.push(`        throw error;`);
    lines.push(`      }`);
    lines.push(`    }`);
    lines.push(`    const transformed = transformResponse(rawResponse, resolvedTool, '${serverKey}');`);
    lines.push(`    if (!transformed.ok) {`);
    lines.push(`      const err = new Error(transformed.error?.message || 'Tool execution failed');`);
    lines.push(`      err.code = transformed.error?.code;`);
    lines.push(`      err.validation = transformed._validation;`);
    lines.push(`      err.args = finalArgs;`);
    lines.push(`      err.summary = summarizeToolError({`);
    lines.push(`        server: '${serverKey}',`);
    lines.push(`        tool: resolvedTool,`);
    lines.push(`        args: finalArgs,`);
    lines.push(`        error: err,`);
    lines.push(`        validation: transformed._validation`);
    lines.push(`      });`);
    lines.push(`      const minimalArgs = buildMinimalArgs(finalArgs, schema);`);
    lines.push(`      if (JSON.stringify(minimalArgs) !== JSON.stringify(finalArgs)) {`);
    lines.push(`        const retryResponse = await __invokeMCPTool('${serverKey}', resolvedTool, minimalArgs);`);
    lines.push(`        const retryTransformed = transformResponse(retryResponse, resolvedTool, '${serverKey}');`);
    lines.push(`        if (retryTransformed.ok) {`);
    lines.push(`          return retryTransformed.data;`);
    lines.push(`        }`);
    lines.push(`      }`);
    lines.push(`      throw err;`);
    lines.push(`    }`);
    lines.push(`    // If data is staged, automatically query it`);
    lines.push(`    if (transformed.staged?.dataAccessId && transformed.data?.table) {`);
    lines.push(`      return this.queryStagedData(transformed.staged.dataAccessId, \`SELECT * FROM \${transformed.data.table} LIMIT 100\`);`);
    lines.push(`    }`);
    lines.push(`    if (Array.isArray(transformed.data?.results)) return transformed.data.results;`);
    lines.push(`    if (Array.isArray(transformed.data?.data?.results)) return transformed.data.data.results;`);
    lines.push(`    return transformed.data;`);
    lines.push(`  },`);
    lines.push(`  async getDataWithMeta(toolName, args) {`);
    lines.push(`    return this.invokeWithMeta(toolName, args);`);
    lines.push(`  },`);

    // queryStagedData
    lines.push(`  async queryStagedData(dataAccessId, sql) {`);
    lines.push(`    const rawResponse = await __invokeMCPTool('${serverKey}', 'data_manager', {`);
    lines.push(`      operation: 'query',`);
    lines.push(`      data_access_id: dataAccessId,`);
    lines.push(`      sql`);
    lines.push(`    });`);
    lines.push(`    const transformed = transformResponse(rawResponse, 'data_manager', '${serverKey}');`);
    lines.push(`    if (!transformed.ok) {`);
    lines.push(`      const err = new Error(transformed.error?.message || 'Query failed');`);
    lines.push(`      err.code = transformed.error?.code;`);
    lines.push(`      err.validation = transformed._validation;`);
    lines.push(`      if (err.code === 'TABLE_NOT_FOUND' && transformed.error?.details?.originalText) {`);
    lines.push(`        err.message += ' (Tip: Use queryStagedData to list available tables)';`);
    lines.push(`      }`);
    lines.push(`      throw err;`);
    lines.push(`    }`);
    lines.push(`    if (transformed.data?._rawText && typeof transformed.data.text === 'string') {`);
    lines.push(`      const jsonData = extractJsonData(transformed.data.text);`);
    lines.push(`      if (jsonData) {`);
    lines.push(`        if (Array.isArray(jsonData)) return jsonData;`);
    lines.push(`        if (jsonData.rows) return jsonData.rows;`);
    lines.push(`        if (jsonData.result?.rows) return jsonData.result.rows;`);
    lines.push(`        if (jsonData.data?.rows) return jsonData.data.rows;`);
    lines.push(`        if (jsonData.results) return jsonData.results;`);
    lines.push(`        return jsonData;`);
    lines.push(`      }`);
    lines.push(`      return transformed.data;`);
    lines.push(`    }`);
    lines.push(`    // Extract rows from various response structures`);
    lines.push(`    if (Array.isArray(transformed.data)) return transformed.data;`);
    lines.push(`    if (transformed.data?.rows) return transformed.data.rows;`);
    lines.push(`    if (transformed.data?.rows?.items) return transformed.data.rows.items;`);
    lines.push(`    if (transformed.data?.data?.rows) return transformed.data.data.rows;`);
    lines.push(`    if (transformed.data?.data?.rows?.items) return transformed.data.data.rows.items;`);
    lines.push(`    if (transformed.data?.result?.rows) return transformed.data.result.rows;`);
    lines.push(`    if (transformed.data?.result?.data?.rows) return transformed.data.result.data.rows;`);
    lines.push(`    if (transformed.data?.results) return transformed.data.results;`);
    lines.push(`    if (transformed.data?.data?.result?.rows) return transformed.data.data.result.rows;`);
    lines.push(`    if (transformed.data?.data?.result?.data?.rows) return transformed.data.data.result.data.rows;`);
    lines.push(`    if (transformed.data?.data?.results) return transformed.data.data.results;`);
    lines.push(`    if (transformed.data?.data?.data?.rows) return transformed.data.data.data.rows;`);
    lines.push(`    const dataKeys = transformed.data && typeof transformed.data === 'object' ? Object.keys(transformed.data) : [];`);
    lines.push(`    const err = new Error(\`Could not extract rows from query response. Keys: \${dataKeys.join(', ')}\`);`);
    lines.push(`    err.code = 'ROWS_NOT_FOUND';`);
    lines.push(`    err.details = { dataKeys, sample: transformed.data };`);
    lines.push(`    throw err;`);
    lines.push(`  },`);
    lines.push(``);

    // Generate individual methods for each tool
    // This allows TypeScript-style API: helpers.server.toolName(args) instead of helpers.server.invoke('toolName', args)
    for (const [toolName, toolDef] of Object.entries(tools)) {
      // Check if tool name is a valid JavaScript identifier
      const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(toolName);
      const methodName = isValidIdentifier ? toolName : `[${JSON.stringify(toolName)}]`;

      // Create direct method for this tool
      const description = toolDef.description || toolName;
      lines.push(`  /** ${description} */`);
      lines.push(`  async ${methodName}(args) {`);
      lines.push(`    return this.getData('${toolName}', args);`);
      lines.push(`  },`);
    }

    // Remove trailing comma from last method
    const lastLine = lines[lines.length - 1];
    if (lastLine.endsWith(',')) {
      lines[lines.length - 1] = lastLine.slice(0, -1);
    }

    lines.push(`};`);
    lines.push(`helpers.${serverKey} = new Proxy(helpers.${serverKey}, {`);
    lines.push(`  get(target, prop) {`);
    lines.push(`    if (prop in target) return target[prop];`);
    lines.push(`    if (typeof prop === 'string') {`);
    lines.push(`      if (prop === 'then') return undefined;`);
    lines.push(`      return async (args, options) => target.invoke(prop, args, options);`);
    lines.push(`    }`);
    lines.push(`    return undefined;`);
    lines.push(`  }`);
    lines.push(`});`);
    lines.push('');
  }

  lines.push('// Shared helper utilities');
  lines.push('helpers.utils = {');
  lines.push('  safeGet,');
  lines.push('  hasValue,');
  lines.push('  compactArgs,');
  lines.push('  summarizeToolError');
  lines.push('};');
  lines.push('');

  // Add aliases
  for (const [aliasName, targetKey] of Object.entries(aliasMap)) {
    if (!aliasName || !targetKey) continue;
    lines.push(`if (helpers.${targetKey}) helpers.${aliasName} = helpers.${targetKey};`);
  }

  lines.push('');
  lines.push('// Export helpers');
  lines.push('globalThis.helpers = helpers;');
  lines.push('');
  lines.push('// SQL Query Helpers for working with staged data');
  lines.push(generateSQLHelpersImplementation());

  return lines.join('\n');
}
