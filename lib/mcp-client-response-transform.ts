/**
 * Response transformation layer for MCP tools
 * Transforms chat-style responses into code-friendly structures
 */

export interface CodeModeResponse {
  ok: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  staged?: {
    dataAccessId: string;
    tables: string[];
    primaryTable?: string;
    rowCount?: number;
    payloadSize?: number;
  };
  _raw?: any;
  _parsed?: boolean;
}

/**
 * Check if response indicates an error
 */
function detectError(response: any): boolean {
  // Check isError flag
  if (response.isError === true) return true;

  // Check content for error indicators
  if (response.content?.[0]?.text) {
    const text = response.content[0].text;
    const errorPatterns = [
      /\berror\b:/i,
      /\bfailed\b:/i,
      /\bexception\b:/i,
      /\binvalid\b/i,
      /\bnot found\b/i,
      /❌/,
      /⚠️/,
      /Query failed/i,
      /Manager Error/i
    ];
    return errorPatterns.some(pattern => pattern.test(text));
  }

  return false;
}

/**
 * Extract error details from response
 */
function extractError(response: any): { code: string; message: string; details?: any } {
  if (!response.content?.[0]?.text) {
    return {
      code: 'UNKNOWN_ERROR',
      message: 'Tool execution failed',
      details: response
    };
  }

  const text = response.content[0].text;

  // Extract error message
  const messagePatterns = [
    /(?:Error|Failed|Exception):\s*([^\n]+)/i,
    /❌\s*\*\*([^*]+)\*\*/,
    /⚠️\s*([^\n]+)/,
    /Data Manager Error:\s*([^\n]+)/i
  ];

  let message = 'Unknown error occurred';
  for (const pattern of messagePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      message = match[1].trim();
      break;
    }
  }

  // Extract error code
  let code = 'UNKNOWN_ERROR';
  const codePatterns = [
    /SQLITE_([A-Z_]+)/,
    /\[([A-Z_]+)\]/,
    /error code:\s*([A-Z_]+)/i
  ];

  for (const pattern of codePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      code = match[1];
      break;
    }
  }

  // Check for specific error types
  if (text.includes('no such table')) {
    code = 'TABLE_NOT_FOUND';
  } else if (text.includes('Invalid arguments')) {
    code = 'INVALID_ARGUMENTS';
  } else if (text.includes('timed out')) {
    code = 'TIMEOUT';
  } else if (text.includes('not found')) {
    code = 'NOT_FOUND';
  }

  return {
    code,
    message,
    details: { originalText: text }
  };
}

/**
 * Extract staging metadata from response
 */
function extractStagingMetadata(text: string): CodeModeResponse['staged'] | undefined {
  // Check if response indicates staging
  if (!text.includes('Data Staged') && !text.includes('data_access_id')) {
    return undefined;
  }

  const staged: CodeModeResponse['staged'] = {
    dataAccessId: '',
    tables: []
  };

  // Extract data access ID with multiple fallback patterns
  const idPatterns = [
    /Data Access ID:\s*\*\*\s*([a-zA-Z0-9_]+)\s*\*\*/,
    /data_access_id[:\s]*["']?([a-zA-Z0-9_]+)["']?/i,
    /([a-z]+_[a-z]+_\d{10,}_[a-z0-9]{4,})/
  ];

  for (const pattern of idPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      // Clean extracted value (remove emojis, special chars)
      const cleaned = match[1]
        .replace(/[^\w\-_]/g, '')
        .replace(/^[\-_]+|[\-_]+$/g, '')
        .trim();

      // Validate format: operation_table_timestamp_random
      if (/^[a-z]+_[a-z]+_\d{10,}_[a-z0-9]{4,}$/.test(cleaned)) {
        staged.dataAccessId = cleaned;
        break;
      }
    }
  }

  if (!staged.dataAccessId) {
    return undefined; // Invalid staging response
  }

  // Extract table names from SQL examples
  const tableMatches = text.matchAll(/FROM\s+([a-z_][a-z0-9_]*)/gi);
  const tableSet = new Set<string>();
  for (const match of tableMatches) {
    const table = match[1].toLowerCase();
    // Filter out SQL keywords
    if (!['select', 'where', 'limit', 'join', 'order', 'group'].includes(table)) {
      tableSet.add(table);
    }
  }
  staged.tables = Array.from(tableSet);

  // Extract primary table (first mentioned or most common)
  if (staged.tables.length > 0) {
    staged.primaryTable = staged.tables[0];
  }

  // Extract row count
  const entityMatch = text.match(/(?:Entities|Records|Results):\s*\*\*?(\d+)\*\*?/i);
  if (entityMatch?.[1]) {
    staged.rowCount = parseInt(entityMatch[1], 10);
  }

  // Extract payload size
  const sizeMatch = text.match(/Payload Size:\s*\*\*?(\d+)\s*(KB|MB|bytes)?\*\*?/i);
  if (sizeMatch?.[1]) {
    const value = parseInt(sizeMatch[1], 10);
    const unit = sizeMatch[2]?.toLowerCase();
    staged.payloadSize = unit === 'kb' ? value * 1024 : unit === 'mb' ? value * 1024 * 1024 : value;
  }

  return staged;
}

/**
 * Extract structured data from JSON code blocks
 */
function extractJsonData(text: string): any {
  // Look for JSON code blocks
  const patterns = [
    /```json\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/g,
    /```\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/g
  ];

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length > 0) {
      try {
        return JSON.parse(matches[0][1]);
      } catch {
        continue;
      }
    }
  }

  // Check if entire content is JSON (for OpenTargets and similar)
  if ((text.trimStart().startsWith('{') || text.trimStart().startsWith('['))) {
    try {
      return JSON.parse(text);
    } catch {
      // Not JSON
    }
  }

  return undefined;
}

/**
 * Transform MCP response to code-friendly format
 */
export function transformResponseForCodeMode(response: any, toolName: string): CodeModeResponse {
  // If response is already in a good format (has data/ok fields), pass through
  if (response && typeof response === 'object' && ('ok' in response || 'data' in response)) {
    return {
      ok: response.ok ?? !response.error,
      data: response.data ?? response,
      error: response.error,
      _raw: response
    };
  }

  // Check for errors first
  if (detectError(response)) {
    return {
      ok: false,
      error: extractError(response),
      _raw: response
    };
  }

  // Extract text content
  let text = '';
  if (response.content?.[0]?.text) {
    text = response.content[0].text;
  } else if (typeof response === 'string') {
    text = response;
  }

  if (!text) {
    // No text content, return raw response
    return {
      ok: true,
      data: response,
      _raw: response
    };
  }

  // Check for staging
  const staged = extractStagingMetadata(text);

  // Try to extract JSON data
  const jsonData = extractJsonData(text);

  // Build code-friendly response
  const result: CodeModeResponse = {
    ok: true,
    _raw: response,
    _parsed: true
  };

  if (staged) {
    result.staged = staged;
    result.data = {
      dataAccessId: staged.dataAccessId,
      table: staged.primaryTable,
      tables: staged.tables,
      rowCount: staged.rowCount,
      payloadSize: staged.payloadSize
    };
  } else if (jsonData) {
    result.data = jsonData;
  } else {
    // Return parsed text as data
    result.data = {
      text: text,
      _rawText: true
    };
  }

  return result;
}

/**
 * Wrap tool executor to transform responses for code mode
 */
export function wrapToolForCodeMode(
  toolExecutor: (...args: any[]) => Promise<any>,
  toolName: string
): (...args: any[]) => Promise<any> {
  return async (...args: any[]) => {
    const rawResponse = await toolExecutor(...args);
    return transformResponseForCodeMode(rawResponse, toolName);
  };
}
