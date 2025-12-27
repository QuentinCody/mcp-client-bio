import { describe, it, expect } from 'vitest';
import { sanitizeSchema, sanitizeToolParameters } from './schema-sanitizer';

describe('sanitizeSchema', () => {
  describe('handles null/undefined/invalid input', () => {
    it('returns fallback schema for null input', () => {
      const result = sanitizeSchema(null);
      expect(result).toEqual({ type: 'object', additionalProperties: true });
    });

    it('returns fallback schema for undefined input', () => {
      const result = sanitizeSchema(undefined);
      expect(result).toEqual({ type: 'object', additionalProperties: true });
    });

    it('returns fallback schema for primitive input', () => {
      expect(sanitizeSchema('string')).toEqual({ type: 'object', additionalProperties: true });
      expect(sanitizeSchema(123)).toEqual({ type: 'object', additionalProperties: true });
      expect(sanitizeSchema(true)).toEqual({ type: 'object', additionalProperties: true });
    });
  });

  describe('infers type from schema structure', () => {
    it('infers object type from properties', () => {
      const schema = {
        properties: {
          name: { type: 'string' }
        }
      };
      const result = sanitizeSchema(schema);
      expect(result.type).toBe('object');
    });

    it('infers array type from items', () => {
      const schema = {
        items: { type: 'string' }
      };
      const result = sanitizeSchema(schema);
      expect(result.type).toBe('array');
    });

    it('infers object type from anyOf', () => {
      const schema = {
        anyOf: [{ type: 'string' }, { type: 'number' }]
      };
      const result = sanitizeSchema(schema);
      expect(result.type).toBe('object');
    });

    it('infers object type from oneOf', () => {
      const schema = {
        oneOf: [{ type: 'string' }, { type: 'number' }]
      };
      const result = sanitizeSchema(schema);
      expect(result.type).toBe('object');
    });

    it('infers object type from allOf', () => {
      const schema = {
        allOf: [{ type: 'object' }, { properties: { id: { type: 'string' } } }]
      };
      const result = sanitizeSchema(schema);
      expect(result.type).toBe('object');
    });
  });

  describe('recursively sanitizes nested properties', () => {
    it('sanitizes properties without type', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { description: 'User name' }  // Missing type!
        }
      };
      const result = sanitizeSchema(schema);
      expect(result.properties.name.type).toBe('string');
    });

    it('coerces non-object property values to string schema', () => {
      const schema = {
        type: 'object',
        properties: {
          broken: null,
          alsobroken: 'not a schema'
        }
      };
      const result = sanitizeSchema(schema);
      expect(result.properties.broken).toEqual({ type: 'string' });
      expect(result.properties.alsobroken).toEqual({ type: 'string' });
    });

    it('recursively sanitizes deeply nested properties', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            properties: {
              profile: {
                properties: {
                  bio: { description: 'Biography' }  // 3 levels deep, missing type
                }
              }
            }
          }
        }
      };
      const result = sanitizeSchema(schema);
      expect(result.properties.user.type).toBe('object');
      expect(result.properties.user.properties.profile.type).toBe('object');
      expect(result.properties.user.properties.profile.properties.bio.type).toBe('string');
    });
  });

  describe('handles array schemas', () => {
    it('adds default items schema when missing', () => {
      const schema = { type: 'array' };
      const result = sanitizeSchema(schema);
      expect(result.items).toEqual({ type: 'string' });
    });

    it('sanitizes array items', () => {
      const schema = {
        type: 'array',
        items: {
          properties: { id: { type: 'string' } }
        }
      };
      const result = sanitizeSchema(schema);
      expect(result.items.type).toBe('object');
    });

    it('adds type to items if missing after sanitization', () => {
      const schema = {
        type: 'array',
        items: { description: 'An item' }
      };
      const result = sanitizeSchema(schema);
      expect(result.items.type).toBe('string');
    });
  });

  describe('handles anyOf/oneOf/allOf', () => {
    it('sanitizes anyOf members', () => {
      const schema = {
        anyOf: [
          { properties: { a: { type: 'string' } } },
          { type: 'null' }
        ]
      };
      const result = sanitizeSchema(schema);
      expect(result.anyOf[0].type).toBe('object');
      expect(result.anyOf[1].type).toBe('null');
    });

    it('sanitizes oneOf members', () => {
      const schema = {
        oneOf: [
          { items: { type: 'number' } },
          { type: 'string' }
        ]
      };
      const result = sanitizeSchema(schema);
      expect(result.oneOf[0].type).toBe('array');
    });

    it('sanitizes allOf members', () => {
      const schema = {
        allOf: [
          { properties: { base: { type: 'string' } } },
          { properties: { extended: { description: 'ext' } } }
        ]
      };
      const result = sanitizeSchema(schema);
      expect(result.allOf[0].type).toBe('object');
      expect(result.allOf[1].type).toBe('object');
      expect(result.allOf[1].properties.extended.type).toBe('string');
    });
  });

  describe('adds additionalProperties for objects', () => {
    it('adds additionalProperties: true when undefined', () => {
      const schema = { type: 'object', properties: {} };
      const result = sanitizeSchema(schema);
      expect(result.additionalProperties).toBe(true);
    });

    it('preserves existing additionalProperties: false', () => {
      const schema = { type: 'object', properties: {}, additionalProperties: false };
      const result = sanitizeSchema(schema);
      expect(result.additionalProperties).toBe(false);
    });

    it('preserves additionalProperties schema', () => {
      const schema = {
        type: 'object',
        additionalProperties: { type: 'string' }
      };
      const result = sanitizeSchema(schema);
      expect(result.additionalProperties).toEqual({ type: 'string' });
    });
  });

  describe('strips unsupported keywords', () => {
    it('removes $schema', () => {
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object'
      };
      const result = sanitizeSchema(schema);
      expect(result.$schema).toBeUndefined();
    });

    it('removes $id', () => {
      const schema = {
        $id: 'https://example.com/schema',
        type: 'object'
      };
      const result = sanitizeSchema(schema);
      expect(result.$id).toBeUndefined();
    });

    it('removes $defs', () => {
      const schema = {
        $defs: { name: { type: 'string' } },
        type: 'object'
      };
      const result = sanitizeSchema(schema);
      expect(result.$defs).toBeUndefined();
    });

    it('preserves other keywords', () => {
      const schema = {
        type: 'object',
        title: 'MySchema',
        description: 'A schema',
        required: ['id']
      };
      const result = sanitizeSchema(schema);
      expect(result.title).toBe('MySchema');
      expect(result.description).toBe('A schema');
      expect(result.required).toEqual(['id']);
    });
  });

  describe('does not mutate original schema', () => {
    it('returns a new object', () => {
      const schema = { type: 'object', properties: { a: { type: 'string' } } };
      const result = sanitizeSchema(schema);
      expect(result).not.toBe(schema);
      expect(result.properties).not.toBe(schema.properties);
    });
  });
});

describe('sanitizeToolParameters', () => {
  it('returns null/undefined as-is', () => {
    expect(sanitizeToolParameters(null)).toBe(null);
    expect(sanitizeToolParameters(undefined)).toBe(undefined);
  });

  it('sanitizes inputSchema', () => {
    const tool = {
      name: 'myTool',
      inputSchema: {
        properties: { query: { description: 'Search query' } }
      }
    };
    const result = sanitizeToolParameters(tool);
    expect(result.inputSchema.type).toBe('object');
    expect(result.inputSchema.properties.query.type).toBe('string');
  });

  it('sanitizes parameters', () => {
    const tool = {
      name: 'myTool',
      parameters: {
        properties: { id: { description: 'ID' } }
      }
    };
    const result = sanitizeToolParameters(tool);
    expect(result.parameters.type).toBe('object');
    expect(result.parameters.properties.id.type).toBe('string');
  });

  it('sanitizes nested parameters.jsonSchema', () => {
    const tool = {
      name: 'myTool',
      parameters: {
        jsonSchema: {
          properties: { data: { description: 'Data' } }
        }
      }
    };
    const result = sanitizeToolParameters(tool);
    expect(result.parameters.jsonSchema.type).toBe('object');
    expect(result.parameters.jsonSchema.properties.data.type).toBe('string');
  });

  it('unifies inputSchema to parameters when parameters missing', () => {
    const tool = {
      name: 'myTool',
      inputSchema: { type: 'object', properties: {} }
    };
    const result = sanitizeToolParameters(tool);
    expect(result.parameters).toEqual(result.inputSchema);
  });

  it('does not mutate original tool', () => {
    const tool = {
      name: 'myTool',
      inputSchema: { properties: {} }
    };
    const result = sanitizeToolParameters(tool);
    expect(result).not.toBe(tool);
  });
});
