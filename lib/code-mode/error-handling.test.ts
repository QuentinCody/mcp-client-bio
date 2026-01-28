/**
 * Tests for Code Mode error handling improvements
 * Task #93-96: User-friendly errors, auto-retry, fallback results
 */

import { describe, it, expect } from 'vitest';
import { generateTransformingHelpersImplementation } from './helpers-with-transform';
import type { MCPServerConfig } from '@/lib/mcp-client';

// Mock server config
const mockConfig: MCPServerConfig = {
  name: 'testserver',
  type: 'streamable-http',
  url: 'https://test.example.com/mcp',
};

// Mock tools with proper schemas
const mockTools = {
  search_proteins: {
    name: 'search_proteins',
    description: 'Search for proteins',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results' },
        organism: { type: 'string', enum: ['human', 'mouse', 'rat'] },
      },
    },
  },
  get_protein: {
    name: 'get_protein',
    description: 'Get protein by ID',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'UniProt ID' },
      },
    },
  },
  fetch_structure: {
    name: 'fetch_structure',
    description: 'Fetch protein structure',
    inputSchema: {
      type: 'object',
      required: ['pdbId'],
      properties: {
        pdbId: { type: 'string', description: 'PDB ID' },
        format: { type: 'string', enum: ['pdb', 'cif'] },
      },
    },
  },
};

const serverToolMap = new Map([
  ['testserver', { config: mockConfig, tools: mockTools }],
]);

describe('Error handling in generated helpers', () => {
  describe('Invalid tool name suggestions', () => {
    it('generates code with "Did you mean" logic for invalid tools', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // Should include tool validation logic
      expect(code).toContain('availableTools.includes');
      expect(code).toContain('Did you mean one of these?');

      // Should include similar tool finding
      expect(code).toContain('similar');
      expect(code).toContain('toLowerCase().includes');
    });

    it('lists available tools in error message', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // Should list available tools
      expect(code).toContain('Available tools on testserver');
      expect(code).toContain('listTools()');
    });
  });

  describe('Missing required parameter errors', () => {
    it('generates code that detects missing required params', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // Should validate required args
      expect(code).toContain('validateRequiredArgs');
      expect(code).toContain('MISSING_REQUIRED_PARAM');
    });

    it('generates example calls with placeholders', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // Should build example calls
      expect(code).toContain('exampleArgs');
      expect(code).toContain('exampleCall');
      expect(code).toContain('Example call');

      // Should include parameter type info
      expect(code).toContain('Required parameters');
    });

    it('includes parameter schema info in errors', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // Should include type and enum info
      expect(code).toContain('prop.type');
      expect(code).toContain('prop.enum');
      expect(code).toContain('prop.description');
    });
  });

  describe('Fallback result generation (Task #96)', () => {
    it('generates generateFallbackResult function', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // Should include fallback function
      expect(code).toContain('function generateFallbackResult');
      expect(code).toContain('Task #96');
    });

    it('handles NOT_FOUND errors gracefully', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // Should detect not found patterns
      expect(code).toContain('NOT_FOUND');
      expect(code).toContain('no results');
      expect(code).toContain('HTTP 404');

      // Should return empty array for not found
      expect(code).toContain('data: []');
    });

    it('handles rate limit errors gracefully', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // Should detect rate limit patterns
      expect(code).toContain('RATE_LIMITED');
      expect(code).toContain('HTTP 429');
      expect(code).toContain('rate_limited');
    });

    it('handles timeout errors gracefully', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // Should detect timeout patterns
      expect(code).toContain('TIMEOUT');
      expect(code).toContain('timeout');
      expect(code).toContain('timed out');
    });

    it('handles server errors gracefully', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // Should detect 5xx errors
      expect(code).toContain('HTTP 5');
      expect(code).toContain('server_error');
      expect(code).toContain('internal server error');
    });

    it('integrates fallback into invoke() error handling', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // invoke() should call fallback
      expect(code).toContain('options.useFallback');
      expect(code).toContain('generateFallbackResult(err');
    });

    it('integrates fallback into getData() error handling', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // getData() should call fallback
      expect(code).toContain('[getData] Returning fallback result');
    });
  });

  describe('Error extraction and hints', () => {
    it('extracts error hints from validation errors', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // Should extract hints
      expect(code).toContain('extractError');
      expect(code).toContain('hints');
      expect(code).toContain('Missing required parameter');
    });

    it('provides parameter name corrections', () => {
      const code = generateTransformingHelpersImplementation(serverToolMap);

      // Should have correction mappings
      expect(code).toContain('corrections');
      expect(code).toContain('query');
      expect(code).toContain('term');
    });
  });
});

describe('Tool name resolution', () => {
  it('includes resolveToolName function', () => {
    const code = generateTransformingHelpersImplementation(serverToolMap);
    expect(code).toContain('function resolveToolName');
  });

  it('handles alias resolution', () => {
    const code = generateTransformingHelpersImplementation(serverToolMap, {
      search: 'testserver',
    });
    // Should add alias mapping
    expect(code).toContain('helpers.search');
    expect(code).toContain('helpers.testserver');
  });
});

describe('Safe array extraction (Task #4)', () => {
  it('generates extractArray function', () => {
    const code = generateTransformingHelpersImplementation(serverToolMap);
    expect(code).toContain('function extractArray');
    expect(code).toContain('Task #4');
  });

  it('auto-detects common array paths', () => {
    const code = generateTransformingHelpersImplementation(serverToolMap);
    // Should check common paths
    expect(code).toContain('"data"');
    expect(code).toContain('"results"');
    expect(code).toContain('"items"');
    expect(code).toContain('"hits"');
    expect(code).toContain('"structuredContent.data"');
  });

  it('generates safeMap helper', () => {
    const code = generateTransformingHelpersImplementation(serverToolMap);
    expect(code).toContain('function safeMap');
    expect(code).toContain('extractArray(result, path)');
    expect(code).toContain('arr.map(mapFn)');
  });

  it('generates extractFirst helper', () => {
    const code = generateTransformingHelpersImplementation(serverToolMap);
    expect(code).toContain('function extractFirst');
    expect(code).toContain('arr[0]');
  });

  it('exposes utilities on helpers.utils', () => {
    const code = generateTransformingHelpersImplementation(serverToolMap);
    expect(code).toContain('helpers.utils');
    expect(code).toContain('extractArray,');
    expect(code).toContain('safeMap,');
    expect(code).toContain('extractFirst');
  });

  it('returns fallback when result is null', () => {
    const code = generateTransformingHelpersImplementation(serverToolMap);
    // Should handle null/undefined gracefully
    expect(code).toContain('if (result == null) return fallback');
  });

  it('handles result that is already an array', () => {
    const code = generateTransformingHelpersImplementation(serverToolMap);
    // Should pass through arrays
    expect(code).toContain('if (Array.isArray(result)) return result');
  });
});
