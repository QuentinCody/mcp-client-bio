/**
 * Error handling utilities for Code Mode sandbox
 * Converts raw errors into user-friendly messages with recovery suggestions
 */

export interface EnhancedError {
  message: string;
  userMessage: string;
  category: 'validation' | 'network' | 'tool' | 'syntax' | 'runtime' | 'unknown';
  suggestions: string[];
  recoverable: boolean;
}

/**
 * Error patterns and their user-friendly transformations
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  category: EnhancedError['category'];
  transform: (match: RegExpMatchArray, original: string) => Partial<EnhancedError>;
}> = [
  // Missing/undefined variable
  {
    pattern: /(\w+) is not defined/,
    category: 'runtime',
    transform: (match) => ({
      userMessage: `Variable "${match[1]}" was not found`,
      suggestions: [
        'Check for typos in the variable name',
        'Ensure the variable is defined before use',
        'If using a helper, check it exists: helpers.serverName.listTools()'
      ],
      recoverable: true
    })
  },

  // Missing helper/server
  {
    pattern: /helpers\.(\w+) is undefined|Cannot read.*helpers\.(\w+)/,
    category: 'validation',
    transform: (match) => ({
      userMessage: `Server "${match[1] || match[2]}" is not available`,
      suggestions: [
        'Check the server name spelling',
        'List available servers in the system prompt',
        'The server may not be connected - check MCP server status'
      ],
      recoverable: true
    })
  },

  // Network/proxy errors
  {
    pattern: /Failed to reach Code Mode proxy|ECONNREFUSED|ETIMEDOUT|network/i,
    category: 'network',
    transform: () => ({
      userMessage: 'Could not connect to the tool server',
      suggestions: [
        'This is usually temporary - try again in a moment',
        'Check if the MCP servers are running',
        'The external API may be experiencing issues'
      ],
      recoverable: true
    })
  },

  // HTTP errors
  {
    pattern: /HTTP (\d+)|Status: (\d+)/,
    category: 'tool',
    transform: (match, original) => {
      const status = parseInt(match[1] || match[2]);
      let userMessage = 'The tool returned an error';
      const suggestions: string[] = [];

      if (status === 400) {
        userMessage = 'Invalid parameters were sent to the tool';
        suggestions.push('Check required parameters with getToolSchema()');
        suggestions.push('Verify parameter types (string vs number)');
      } else if (status === 401 || status === 403) {
        userMessage = 'Authentication failed for this tool';
        suggestions.push('The API may require authentication');
        suggestions.push('Check if API keys are configured');
      } else if (status === 404) {
        userMessage = 'The requested resource was not found';
        suggestions.push('Check if the ID or query is correct');
        suggestions.push('The data may not exist in the database');
      } else if (status === 429) {
        userMessage = 'Rate limit exceeded';
        suggestions.push('Wait a moment and try again');
        suggestions.push('Reduce the number of API calls');
      } else if (status >= 500) {
        userMessage = 'The external service is temporarily unavailable';
        suggestions.push('This is not your fault - the upstream API has issues');
        suggestions.push('Try again in a few moments');
      }

      return { userMessage, suggestions, recoverable: status !== 401 && status !== 403 };
    }
  },

  // Missing required parameter
  {
    pattern: /missing required|required parameter|MISSING_REQUIRED_PARAM/i,
    category: 'validation',
    transform: (_, original) => ({
      userMessage: 'A required parameter is missing',
      suggestions: [
        'Use getToolSchema(toolName) to see required parameters',
        'Check the tool documentation for required fields'
      ],
      recoverable: true
    })
  },

  // Invalid argument type
  {
    pattern: /invalid.*argument|type.*error|expected.*got|INVALID_ARGUMENTS/i,
    category: 'validation',
    transform: () => ({
      userMessage: 'Parameter type mismatch',
      suggestions: [
        'Check if strings should be numbers or vice versa',
        'Arrays should be passed as [...] not "..."',
        'Use getToolSchema() to see expected types'
      ],
      recoverable: true
    })
  },

  // JSON parse errors
  {
    pattern: /JSON.*parse|Unexpected token|SyntaxError.*JSON/i,
    category: 'syntax',
    transform: () => ({
      userMessage: 'Invalid data format received',
      suggestions: [
        'The tool may have returned unexpected data',
        'Try a simpler query first',
        'Check if the tool is working correctly'
      ],
      recoverable: true
    })
  },

  // TypeScript syntax in code
  {
    pattern: /TypeScript syntax is not allowed/i,
    category: 'syntax',
    transform: () => ({
      userMessage: 'TypeScript syntax is not supported in Code Mode',
      suggestions: [
        'Remove type annotations (: string, : number, etc.)',
        'Remove "as Type" casts',
        'Use plain JavaScript syntax'
      ],
      recoverable: true
    })
  },

  // Function declarations
  {
    pattern: /Function declarations are not allowed/i,
    category: 'syntax',
    transform: () => ({
      userMessage: 'Function declarations are not supported',
      suggestions: [
        'Use top-level code instead of function declarations',
        'Write code that executes directly, not wrapped in functions'
      ],
      recoverable: true
    })
  },

  // Timeout
  {
    pattern: /timeout|timed out|ETIMEDOUT/i,
    category: 'network',
    transform: () => ({
      userMessage: 'The request took too long',
      suggestions: [
        'Try a simpler query with fewer results',
        'The external API may be slow - try again',
        'Break the query into smaller parts'
      ],
      recoverable: true
    })
  }
];

/**
 * Enhance an error with user-friendly message and suggestions
 */
export function enhanceError(error: Error | string): EnhancedError {
  const message = typeof error === 'string' ? error : error.message;

  // Try to match against known patterns
  for (const { pattern, category, transform } of ERROR_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const transformed = transform(match, message);
      return {
        message,
        userMessage: transformed.userMessage || message,
        category,
        suggestions: transformed.suggestions || [],
        recoverable: transformed.recoverable ?? true
      };
    }
  }

  // Fallback for unknown errors
  return {
    message,
    userMessage: 'An unexpected error occurred',
    category: 'unknown',
    suggestions: [
      'Try simplifying your query',
      'Check if the tool name is correct',
      'Review the error details for more information'
    ],
    recoverable: true
  };
}

/**
 * Format enhanced error for display
 */
export function formatErrorForUser(enhanced: EnhancedError): string {
  const lines: string[] = [enhanced.userMessage];

  if (enhanced.suggestions.length > 0) {
    lines.push('');
    lines.push('Suggestions:');
    enhanced.suggestions.forEach(s => lines.push(`• ${s}`));
  }

  return lines.join('\n');
}

/**
 * Create a friendly error response for the sandbox
 */
export function createFriendlyErrorResponse(error: Error | string, logs: string[] = []): {
  error: string;
  errorCode: string;
  userFriendly: boolean;
  suggestions: string[];
  recoverable: boolean;
  logs: string[];
} {
  const enhanced = enhanceError(error);

  return {
    error: formatErrorForUser(enhanced),
    errorCode: enhanced.category.toUpperCase(),
    userFriendly: true,
    suggestions: enhanced.suggestions,
    recoverable: enhanced.recoverable,
    logs
  };
}
