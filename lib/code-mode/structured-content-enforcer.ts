/**
 * structuredContent Enforcement for MCP Code Mode
 *
 * This module enforces that MCP servers return structuredContent according to the spec,
 * provides detailed diagnostics when they don't, and offers fallback parsing strategies.
 */

export interface StructuredContentValidationResult {
  isValid: boolean;
  hasStructuredContent: boolean;
  contentType: 'structured' | 'text' | 'markdown' | 'json' | 'mixed' | 'unknown';
  issues: StructuredContentIssue[];
  metadata: {
    serverKey?: string;
    toolName?: string;
    responseKeys?: string[];
    hasContent?: boolean;
    contentLength?: number;
  };
}

export interface StructuredContentIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  fix?: string;
}

export interface EnforcementOptions {
  /** Strict mode: fail on missing structuredContent */
  strict?: boolean;
  /** Enable automatic fallback parsing */
  enableFallback?: boolean;
  /** Log warnings to console */
  logWarnings?: boolean;
  /** Server key for diagnostics */
  serverKey?: string;
  /** Tool name for diagnostics */
  toolName?: string;
}

export interface StructuredData {
  ok: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  _source: 'structuredContent' | 'fallback' | 'error';
  _validation?: StructuredContentValidationResult;
}

/**
 * Validate that an MCP response contains structuredContent
 */
export function validateStructuredContent(
  response: any,
  options: EnforcementOptions = {}
): StructuredContentValidationResult {
  const issues: StructuredContentIssue[] = [];
  const metadata: StructuredContentValidationResult['metadata'] = {
    serverKey: options.serverKey,
    toolName: options.toolName,
  };

  // Check if response is defined
  if (!response || typeof response !== 'object') {
    issues.push({
      severity: 'error',
      code: 'INVALID_RESPONSE',
      message: 'Response is not a valid object',
      fix: 'Ensure MCP server returns a valid JSON object',
    });
    return {
      isValid: false,
      hasStructuredContent: false,
      contentType: 'unknown',
      issues,
      metadata,
    };
  }

  metadata.responseKeys = Object.keys(response);

  // Check for structuredContent field
  const hasStructuredContent = 'structuredContent' in response;

  if (!hasStructuredContent) {
    issues.push({
      severity: options.strict ? 'error' : 'warning',
      code: 'MISSING_STRUCTURED_CONTENT',
      message: 'Response does not contain structuredContent field',
      fix: 'MCP servers should return { structuredContent: {...data} } for Code Mode compatibility',
    });
  }

  // Validate structuredContent is an object
  if (hasStructuredContent && typeof response.structuredContent !== 'object') {
    issues.push({
      severity: 'error',
      code: 'INVALID_STRUCTURED_CONTENT_TYPE',
      message: `structuredContent must be an object, got ${typeof response.structuredContent}`,
      fix: 'Ensure structuredContent is a JSON object, not a primitive',
    });
  }

  // Check for legacy 'content' field (but don't add issue if structuredContent exists)
  if ('content' in response) {
    metadata.hasContent = true;
    const content = response.content;

    if (Array.isArray(content) && content.length > 0) {
      const firstContent = content[0];
      metadata.contentLength = firstContent?.text?.length;

      if (firstContent?.type === 'text' && !hasStructuredContent) {
        issues.push({
          severity: 'info',
          code: 'LEGACY_TEXT_CONTENT',
          message: 'Response uses legacy content[].text format instead of structuredContent',
          fix: 'Migrate to structuredContent for better Code Mode integration',
        });
      }
    }
  }

  // Determine content type
  let contentType: StructuredContentValidationResult['contentType'] = 'unknown';

  if (hasStructuredContent && typeof response.structuredContent === 'object') {
    contentType = 'structured';
  } else if (response.content && Array.isArray(response.content)) {
    if (response.content.length > 1) {
      // Multiple content items = mixed
      contentType = 'mixed';
    } else if (response.content.length === 1 && response.content[0]?.type === 'text') {
      const text = response.content[0].text || '';
      if (text.includes('```json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        contentType = 'json';
      } else if (text.includes('##') || text.includes('**') || text.includes('|')) {
        contentType = 'markdown';
      } else {
        contentType = 'text';
      }
    } else if (response.content.length === 1) {
      // Single non-text content
      contentType = 'mixed';
    }
  }

  const isValid = issues.filter(i => i.severity === 'error').length === 0;

  return {
    isValid: hasStructuredContent && isValid,
    hasStructuredContent,
    contentType,
    issues,
    metadata,
  };
}

/**
 * Extract structured data from MCP response with fallback strategies
 */
export function extractStructuredData(
  response: any,
  options: EnforcementOptions = {}
): StructuredData {
  const validation = validateStructuredContent(response, options);

  // Log warnings if enabled
  if (options.logWarnings) {
    for (const issue of validation.issues) {
      if (issue.severity === 'error') {
        console.error(
          `[structuredContent] ${issue.code}: ${issue.message}`,
          validation.metadata
        );
      } else if (issue.severity === 'warning') {
        console.warn(
          `[structuredContent] ${issue.code}: ${issue.message}`,
          validation.metadata
        );
      }
    }
  }

  // PRIORITY 1: structuredContent (MCP spec)
  if (validation.hasStructuredContent && validation.isValid) {
    const structured = response.structuredContent;

    // Check if it's an error in structured format
    if (structured.success === false || structured.error) {
      return {
        ok: false,
        error: {
          code: structured.code || structured.error?.code || 'STRUCTURED_ERROR',
          message: structured.message || structured.error?.message || 'Tool execution failed',
          details: structured,
        },
        _source: 'structuredContent',
        _validation: validation,
      };
    }

    // Return structured data
    return {
      ok: true,
      data: structured,
      _source: 'structuredContent',
      _validation: validation,
    };
  }

  // PRIORITY 2: Fallback parsing (if enabled)
  if (options.enableFallback) {
    const fallbackData = attemptFallbackParsing(response, validation);
    if (fallbackData) {
      return {
        ok: true,
        data: fallbackData,
        _source: 'fallback',
        _validation: validation,
      };
    }
  }

  // PRIORITY 3: Strict mode enforcement
  if (options.strict) {
    return {
      ok: false,
      error: {
        code: 'STRUCTURED_CONTENT_REQUIRED',
        message: 'Server must return structuredContent in strict mode',
        details: {
          validation,
          availableKeys: Object.keys(response),
        },
      },
      _source: 'error',
      _validation: validation,
    };
  }

  // PRIORITY 4: Pass through raw response
  return {
    ok: true,
    data: response,
    _source: 'fallback',
    _validation: validation,
  };
}

/**
 * Attempt to parse structured data from legacy formats
 */
function attemptFallbackParsing(
  response: any,
  validation: StructuredContentValidationResult
): any | null {
  // Strategy 1: Parse JSON from markdown code blocks or embedded JSON
  if (validation.contentType === 'json' || validation.contentType === 'markdown' || validation.contentType === 'text') {
    const text = response.content?.[0]?.text || '';

    // Try extracting JSON from code blocks
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      try {
        return JSON.parse(jsonBlockMatch[1]);
      } catch {
        // Continue to next strategy
      }
    }

    // Try extracting JSON object from text (greedy match for complete object)
    const jsonObjectMatch = text.match(/\{(?:[^{}]|\{[^{}]*\})*\}/);
    if (jsonObjectMatch) {
      try {
        const parsed = JSON.parse(jsonObjectMatch[0]);
        // Validate it's actually an object with data
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch {
        // Continue to next strategy
      }
    }

    // Try extracting JSON array from text
    const jsonArrayMatch = text.match(/\[(?:[^\[\]]|\[[^\[\]]*\])*\]/);
    if (jsonArrayMatch) {
      try {
        const parsed = JSON.parse(jsonArrayMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // Continue to next strategy
      }
    }
  }

  // Strategy 2: Parse markdown tables
  if (validation.contentType === 'markdown') {
    const text = response.content?.[0]?.text || '';
    const tableData = parseMarkdownTable(text);
    if (tableData && tableData.length > 0) {
      return tableData;
    }
  }

  // Strategy 3: Return raw text as data
  if (validation.contentType === 'text') {
    const text = response.content?.[0]?.text || '';
    if (text) {
      return { text, _rawText: true };
    }
  }

  return null;
}

/**
 * Parse markdown tables into structured data
 */
function parseMarkdownTable(text: string): any[] | null {
  const lines = text.split('\n');
  const tableLines: string[] = [];
  let inTable = false;

  // Find table lines
  for (const line of lines) {
    if (line.trim().startsWith('|')) {
      inTable = true;
      tableLines.push(line);
    } else if (inTable && !line.trim().startsWith('|')) {
      break;
    }
  }

  if (tableLines.length < 2) return null;

  // Parse header
  const headerLine = tableLines[0];
  const headers = headerLine
    .split('|')
    .map(h => h.trim())
    .filter(h => h.length > 0);

  // Skip separator line (tableLines[1])

  // Parse data rows
  const rows: any[] = [];
  for (let i = 2; i < tableLines.length; i++) {
    const cells = tableLines[i]
      .split('|')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    if (cells.length === headers.length) {
      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = cells[idx];
      });
      rows.push(row);
    }
  }

  return rows.length > 0 ? rows : null;
}

/**
 * Generate a compliance report for an MCP server
 */
export function generateComplianceReport(
  validations: StructuredContentValidationResult[]
): {
  totalResponses: number;
  compliantResponses: number;
  complianceRate: number;
  issuesSummary: Record<string, number>;
  recommendations: string[];
} {
  const totalResponses = validations.length;
  const compliantResponses = validations.filter(v => v.hasStructuredContent && v.isValid).length;
  const complianceRate = totalResponses > 0 ? compliantResponses / totalResponses : 0;

  const issuesSummary: Record<string, number> = {};
  for (const validation of validations) {
    for (const issue of validation.issues) {
      issuesSummary[issue.code] = (issuesSummary[issue.code] || 0) + 1;
    }
  }

  const recommendations: string[] = [];

  // Only add recommendations if there are actual responses
  if (totalResponses > 0) {
    if (issuesSummary.MISSING_STRUCTURED_CONTENT) {
      recommendations.push(
        'Implement structuredContent field for all tool responses to improve Code Mode compatibility'
      );
    }
    if (issuesSummary.LEGACY_TEXT_CONTENT) {
      recommendations.push(
        'Migrate from legacy content[].text format to structuredContent for better integration'
      );
    }
    if (complianceRate < 0.5) {
      recommendations.push(
        'Server compliance is below 50% - prioritize structuredContent implementation'
      );
    }
  }

  return {
    totalResponses,
    compliantResponses,
    complianceRate: parseFloat((complianceRate * 100).toFixed(1)),
    issuesSummary,
    recommendations,
  };
}
