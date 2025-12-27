/**
 * Schema sanitization utilities for MCP tool schemas.
 * Ensures all schemas have proper 'type' fields for AI provider compatibility.
 */

/**
 * Robust schema sanitizer: ensure every object property has a type; default to string or object
 */
export function sanitizeSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return { type: 'object', additionalProperties: true };

  const clone = Array.isArray(schema) ? [] : { ...schema };

  // If this node represents a schema without a type but has schema-like keys
  if (!clone.type) {
    if (clone.properties) clone.type = 'object';
    else if (clone.items) clone.type = 'array';
    else if (Array.isArray(clone.anyOf) || Array.isArray(clone.oneOf) || Array.isArray(clone.allOf)) clone.type = 'object';
  }

  // Recurse properties (deep clone to avoid mutation)
  if (clone.properties && typeof clone.properties === 'object') {
    clone.properties = { ...clone.properties };
    for (const [k, v] of Object.entries(clone.properties)) {
      // If leaf value isn't an object, coerce to schema
      if (!v || typeof v !== 'object') {
        clone.properties[k] = { type: 'string' };
        continue;
      }
      clone.properties[k] = sanitizeSchema(v);
      if (!clone.properties[k].type) {
        // Fallback if still missing
        clone.properties[k].type = 'string';
      }
    }
  }

  // Recurse array items
  if (clone.type === 'array') {
    if (!clone.items) {
      clone.items = { type: 'string' };
    } else {
      clone.items = sanitizeSchema(clone.items);
      if (!clone.items.type) clone.items.type = 'string';
    }
  }

  // Normalize anyOf/oneOf/allOf by sanitizing members
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (Array.isArray((clone as any)[key])) {
      (clone as any)[key] = (clone as any)[key].map((n: any) => sanitizeSchema(n));
    }
  }

  // Ensure additionalProperties present for objects (OpenAI lenient)
  if (clone.type === 'object' && clone.additionalProperties === undefined) {
    clone.additionalProperties = true;
  }

  // Strip unsupported keywords if present
  delete (clone as any).$schema;
  delete (clone as any).$id;
  delete (clone as any).$defs;

  return clone;
}

/**
 * Sanitize tool parameters from various MCP server formats
 */
export function sanitizeToolParameters(tool: any): any {
  if (!tool) return tool;
  const t = { ...tool };
  // Common nested locations: inputSchema, parameters, schema
  if (t.inputSchema) t.inputSchema = sanitizeSchema(t.inputSchema);
  if (t.parameters) t.parameters = sanitizeSchema(t.parameters);
  // Some MCP servers supply a nested parameters.jsonSchema object
  if (t.parameters?.jsonSchema) {
    try {
      t.parameters.jsonSchema = sanitizeSchema(t.parameters.jsonSchema);
    } catch {}
  }
  // Unify to 'parameters' if only inputSchema exists
  if (!t.parameters && t.inputSchema) t.parameters = t.inputSchema;
  return t;
}
