/**
 * Markdown Response Parser for MCP Tools
 *
 * Parses markdown-formatted MCP responses into structured data for code execution.
 * This is a transitional solution until all MCP servers support dual-mode responses.
 */

export interface ParsedResponse {
  dataAccessId?: string;
  table?: string;
  operation?: string;
  entities?: number;
  payloadSize?: number;
  data?: any;
  error?: string;
  errorCode?: string;
  rawText: string;
  success: boolean;
  metadata?: Record<string, any>;
}

export interface ParseOptions {
  strategy?: 'aggressive' | 'conservative';
  toolName?: string;
  expectedFields?: string[];
  extractJson?: boolean;
}

/**
 * Parse a markdown-formatted MCP response into structured data
 */
export function parseMarkdownResponse(
  text: string,
  options: ParseOptions = {}
): ParsedResponse {
  const {
    strategy = 'aggressive',
    toolName,
    expectedFields = [],
    extractJson = true
  } = options;

  const result: ParsedResponse = {
    rawText: text,
    success: true
  };

  // Quick check for error indicators
  if (isErrorResponse(text)) {
    result.success = false;
    result.error = extractError(text);
    result.errorCode = extractErrorCode(text);
    return result;
  }

  // Extract data access ID (most critical field for staging workflow)
  result.dataAccessId = extractDataAccessId(text, strategy);

  // Extract table name (needed for SQL queries)
  result.table = extractTableName(text);

  // Extract operation type
  result.operation = extractOperation(text);

  // Extract numeric fields
  result.entities = extractNumericField(text, ['entities', 'records', 'results']);
  result.payloadSize = extractPayloadSize(text);

  // Extract structured data from JSON code blocks
  if (extractJson) {
    result.data = extractJsonBlocks(text);
  }

  // Extract metadata (additional fields)
  result.metadata = extractMetadata(text);

  return result;
}

/**
 * Check if response indicates an error
 */
function isErrorResponse(text: string): boolean {
  const errorIndicators = [
    /error:/i,
    /failed:/i,
    /exception:/i,
    /invalid/i,
    /not found/i,
    /❌/,
    /⚠️/
  ];

  return errorIndicators.some(pattern => pattern.test(text));
}

/**
 * Extract error message from response
 */
function extractError(text: string): string {
  const patterns = [
    /(?:Error|Failed|Exception):\s*([^\n]+)/i,
    /❌\s*\*\*([^*]+)\*\*/,
    /⚠️\s*([^\n]+)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return 'Unknown error occurred';
}

/**
 * Extract error code from response
 */
function extractErrorCode(text: string): string | undefined {
  const codePatterns = [
    /error code:\s*([A-Z_]+)/i,
    /\[([A-Z_]+)\]/,
    /SQLITE_([A-Z_]+)/
  ];

  for (const pattern of codePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Extract data access ID with multiple fallback patterns
 */
function extractDataAccessId(text: string, strategy: 'aggressive' | 'conservative'): string | undefined {
  // Pattern priority: most specific to most general
  const patterns = [
    // Exact markdown bold pattern
    /Data Access ID:\s*\*\*([a-zA-Z0-9_]+)\*\*/,

    // With various spacing/formatting
    /data_access_id[:\s]*["']?([a-zA-Z0-9_]+)["']?/i,

    // Common ID pattern (operation_timestamp_random)
    /(?:ID|id):\s*([a-z]+_[a-z]+_\d+_[a-z0-9]+)/,

    // More aggressive: any field ending with _id
    strategy === 'aggressive' ? /([a-z]+_[a-z]+_\d{10,}_[a-z0-9]{6,})/ : null,
  ].filter(Boolean) as RegExp[];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = cleanExtractedValue(match[1]);

      // Validate: should look like "operation_table_timestamp_random"
      if (isValidDataAccessId(cleaned)) {
        return cleaned;
      }
    }
  }

  return undefined;
}

/**
 * Validate data access ID format
 */
function isValidDataAccessId(value: string): boolean {
  // Should match pattern: word_word_digits_alphanumeric
  const pattern = /^[a-z]+_[a-z]+_\d{10,}_[a-z0-9]{4,}$/;
  return pattern.test(value);
}

/**
 * Extract table name from SQL examples or text
 */
function extractTableName(text: string): string | undefined {
  const patterns = [
    // FROM clause in SQL
    /FROM\s+([a-z_][a-z0-9_]*)/i,

    // Table: protein
    /table:\s*["']?([a-z_]+)["']?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const table = match[1].toLowerCase();
      // Filter out SQL keywords
      if (!['select', 'where', 'limit', 'join'].includes(table)) {
        return table;
      }
    }
  }

  return undefined;
}

/**
 * Extract operation type
 */
function extractOperation(text: string): string | undefined {
  const patterns = [
    /Operation:\s*\*\*([^*]+)\*\*/,
    /operation[:\s]*["']?([a-z_]+)["']?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return undefined;
}

/**
 * Extract numeric field with multiple possible field names
 */
function extractNumericField(text: string, fieldNames: string[]): number | undefined {
  for (const field of fieldNames) {
    const pattern = new RegExp(`${field}[:\\s]*\\*\\*?(\\d+)\\*\\*?`, 'i');
    const match = text.match(pattern);
    if (match?.[1]) {
      return parseInt(match[1], 10);
    }
  }

  return undefined;
}

/**
 * Extract payload size in bytes
 */
function extractPayloadSize(text: string): number | undefined {
  const match = text.match(/Payload Size:\s*\*\*?(\d+)\s*(KB|MB|bytes)?\*\*?/i);
  if (match?.[1]) {
    const value = parseInt(match[1], 10);
    const unit = match[2]?.toLowerCase();

    if (unit === 'kb') return value * 1024;
    if (unit === 'mb') return value * 1024 * 1024;
    return value;
  }

  return undefined;
}

/**
 * Extract JSON code blocks from markdown
 */
function extractJsonBlocks(text: string): any {
  // Look for ```json or ``` code blocks
  const patterns = [
    /```json\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/g,
    /```\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/g,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length > 0) {
      try {
        // Try to parse the first match
        const parsed = JSON.parse(matches[0][1]);
        return parsed;
      } catch {
        // Invalid JSON, try next pattern
        continue;
      }
    }
  }

  return undefined;
}

/**
 * Extract additional metadata from markdown
 */
function extractMetadata(text: string): Record<string, any> | undefined {
  const metadata: Record<string, any> = {};

  // Extract all "Field: **Value**" patterns
  const fieldPattern = /([A-Za-z\s]+):\s*\*\*([^*]+)\*\*/g;
  const matches = Array.from(text.matchAll(fieldPattern));

  for (const match of matches) {
    const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
    const value = cleanText(match[2]);

    // Skip if already extracted to top-level fields
    if (!['data_access_id', 'operation', 'entities'].includes(key)) {
      metadata[key] = value;
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Clean extracted text value
 */
function cleanText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Clean extracted identifier (remove emojis, special chars)
 */
function cleanExtractedValue(value: string): string {
  return value
    .replace(/[^\w\-_]/g, '') // Remove non-alphanumeric except dash/underscore
    .replace(/^[\-_]+|[\-_]+$/g, '') // Trim leading/trailing dash/underscore
    .trim();
}

/**
 * Get expected fields for a specific tool (for validation)
 */
export function getExpectedFields(toolName: string): string[] {
  const fieldMap: Record<string, string[]> = {
    'uniprot_search': ['dataAccessId', 'table', 'operation', 'entities'],
    'uniprot_entry': ['dataAccessId', 'accession'],
    'data_manager': ['data', 'rowCount'],
    'entrez_query': ['dataAccessId', 'count'],
  };

  return fieldMap[toolName] || [];
}

/**
 * Validate parsed response against expected fields
 */
export function validateParsedResponse(
  parsed: ParsedResponse,
  expectedFields: string[]
): boolean {
  if (!parsed.success) {
    return false; // Error responses are "valid" in that they parsed correctly
  }

  // Check if at least some expected fields are present
  const foundFields = expectedFields.filter(field => {
    return parsed[field as keyof ParsedResponse] !== undefined;
  });

  // Consider valid if at least 50% of expected fields found
  return foundFields.length >= Math.ceil(expectedFields.length * 0.5);
}
