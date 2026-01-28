/**
 * Schema Validator for Code Mode
 *
 * Validates tool arguments against JSON Schema and provides
 * helpful suggestions when validation fails.
 */

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  suggestions: string[];
}

export interface ValidationError {
  path: string;
  message: string;
  expected?: string;
  received?: string;
}

/**
 * Extract schema from tool definition
 */
export function extractToolSchema(toolDef: any): any {
  if (!toolDef || typeof toolDef !== 'object') return null;

  return (
    toolDef.parameters?.jsonSchema ||
    toolDef.parameters ||
    toolDef.inputSchema ||
    null
  );
}

/**
 * Validate arguments against a JSON Schema
 * Returns helpful suggestions on failure
 */
export function validateArgs(
  args: Record<string, any>,
  schema: any,
  toolName: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const suggestions: string[] = [];

  if (!schema || typeof schema !== 'object') {
    // No schema to validate against - pass through
    return { valid: true, errors: [], suggestions: [] };
  }

  const properties = schema.properties || {};
  const required = Array.isArray(schema.required) ? schema.required : [];

  // Check for missing required parameters
  for (const param of required) {
    if (!(param in args) || args[param] === undefined || args[param] === null) {
      const propSchema = properties[param] || {};
      errors.push({
        path: param,
        message: `Missing required parameter: ${param}`,
        expected: propSchema.type || 'any',
        received: 'undefined',
      });

      // Add suggestion with example value
      const example = generateExampleValue(propSchema);
      suggestions.push(`Add required parameter "${param}": ${JSON.stringify({ [param]: example })}`);
    }
  }

  // Check for unknown parameters (typos)
  const knownParams = new Set(Object.keys(properties));
  for (const param of Object.keys(args)) {
    if (!knownParams.has(param) && knownParams.size > 0) {
      // Try to find similar parameter name
      const similar = findSimilarParam(param, knownParams);

      errors.push({
        path: param,
        message: `Unknown parameter: ${param}`,
        expected: `one of: ${Array.from(knownParams).join(', ')}`,
        received: param,
      });

      if (similar) {
        suggestions.push(`Did you mean "${similar}" instead of "${param}"?`);
      } else {
        suggestions.push(`Valid parameters: ${Array.from(knownParams).join(', ')}`);
      }
    }
  }

  // Check parameter types
  for (const [param, value] of Object.entries(args)) {
    const propSchema = properties[param];
    if (!propSchema) continue;

    const typeError = validateType(value, propSchema, param);
    if (typeError) {
      errors.push(typeError);
      suggestions.push(generateTypeSuggestion(param, propSchema, value));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    suggestions,
  };
}

/**
 * Validate a value against its expected type
 */
function validateType(value: any, schema: any, path: string): ValidationError | null {
  const expectedType = schema.type;
  if (!expectedType) return null;

  const actualType = Array.isArray(value) ? 'array' : typeof value;

  // Type coercion checks
  if (expectedType === 'string' && actualType !== 'string') {
    return {
      path,
      message: `Expected string, got ${actualType}`,
      expected: 'string',
      received: actualType,
    };
  }

  if (expectedType === 'number' || expectedType === 'integer') {
    if (actualType !== 'number') {
      // Check if it's a numeric string that could be coerced
      if (actualType === 'string' && !isNaN(Number(value))) {
        return null; // Allow numeric strings
      }
      return {
        path,
        message: `Expected ${expectedType}, got ${actualType}`,
        expected: expectedType,
        received: actualType,
      };
    }
  }

  if (expectedType === 'boolean' && actualType !== 'boolean') {
    return {
      path,
      message: `Expected boolean, got ${actualType}`,
      expected: 'boolean',
      received: actualType,
    };
  }

  if (expectedType === 'array' && !Array.isArray(value)) {
    return {
      path,
      message: `Expected array, got ${actualType}`,
      expected: 'array',
      received: actualType,
    };
  }

  if (expectedType === 'object' && (actualType !== 'object' || Array.isArray(value))) {
    return {
      path,
      message: `Expected object, got ${actualType}`,
      expected: 'object',
      received: actualType,
    };
  }

  // Enum validation
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return {
      path,
      message: `Value "${value}" is not in allowed values`,
      expected: schema.enum.slice(0, 5).join(', ') + (schema.enum.length > 5 ? '...' : ''),
      received: String(value),
    };
  }

  return null;
}

/**
 * Generate an example value for a parameter based on its schema
 */
function generateExampleValue(schema: any): any {
  if (!schema) return '...';

  if (schema.default !== undefined) return schema.default;
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  switch (schema.type) {
    case 'string':
      return schema.description?.toLowerCase().includes('id') ? 'example_id' : 'example';
    case 'number':
    case 'integer':
      return schema.minimum ?? 10;
    case 'boolean':
      return true;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return '...';
  }
}

/**
 * Find a similar parameter name (for typo detection)
 */
function findSimilarParam(input: string, known: Set<string>): string | null {
  const inputLower = input.toLowerCase();
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const param of known) {
    const score = similarity(inputLower, param.toLowerCase());
    if (score > bestScore && score > 0.6) {
      bestScore = score;
      bestMatch = param;
    }
  }

  return bestMatch;
}

/**
 * Simple string similarity (Dice coefficient)
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.substring(i, i + 2);
    bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
  }

  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.substring(i, i + 2);
    const count = bigrams.get(bigram) || 0;
    if (count > 0) {
      bigrams.set(bigram, count - 1);
      matches++;
    }
  }

  return (2 * matches) / (a.length + b.length - 2);
}

/**
 * Generate a type suggestion message
 */
function generateTypeSuggestion(param: string, schema: any, value: any): string {
  const expectedType = schema.type;

  if (expectedType === 'number' || expectedType === 'integer') {
    if (typeof value === 'string') {
      return `Convert "${param}" to number: ${param}: ${Number(value) || 0}`;
    }
  }

  if (expectedType === 'string') {
    return `Convert "${param}" to string: ${param}: "${String(value)}"`;
  }

  if (expectedType === 'array') {
    return `Wrap "${param}" in array: ${param}: [${JSON.stringify(value)}]`;
  }

  return `Parameter "${param}" should be ${expectedType}`;
}

/**
 * Format validation result as a user-friendly error message
 */
export function formatValidationError(
  result: ValidationResult,
  toolName: string,
  serverKey: string
): string {
  if (result.valid) return '';

  const lines: string[] = [
    `Parameter validation failed for ${serverKey}/${toolName}:`,
    '',
  ];

  // List errors
  for (const error of result.errors) {
    lines.push(`  - ${error.message}`);
    if (error.expected && error.received) {
      lines.push(`    Expected: ${error.expected}`);
      lines.push(`    Received: ${error.received}`);
    }
  }

  // Add suggestions
  if (result.suggestions.length > 0) {
    lines.push('');
    lines.push('Suggestions:');
    for (const suggestion of result.suggestions.slice(0, 3)) {
      lines.push(`  * ${suggestion}`);
    }
  }

  // Add discovery hint
  lines.push('');
  lines.push(`Tip: Use helpers.${serverKey}.getToolSchema('${toolName}') to see full parameter requirements.`);

  return lines.join('\n');
}

/**
 * Generate a compact schema summary for error messages
 */
export function generateSchemaSummary(schema: any): string {
  if (!schema || typeof schema !== 'object') return 'No schema available';

  const properties = schema.properties || {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);

  const params = Object.entries(properties).map(([name, propSchema]) => {
    const prop = propSchema as any;
    const isRequired = required.has(name);
    const type = prop.type || 'any';
    return `${name}${isRequired ? '' : '?'}: ${type}`;
  });

  if (params.length === 0) return 'No parameters';

  return `{ ${params.join(', ')} }`;
}
