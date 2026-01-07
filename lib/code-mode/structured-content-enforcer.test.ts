/**
 * Comprehensive test suite for structuredContent enforcement
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateStructuredContent,
  extractStructuredData,
  generateComplianceReport,
  type StructuredContentValidationResult,
} from './structured-content-enforcer';

describe('structuredContent Enforcement', () => {
  describe('validateStructuredContent', () => {
    it('should validate compliant responses with structuredContent', () => {
      const response = {
        structuredContent: {
          results: [{ id: 1, name: 'Test' }],
          count: 1,
        },
      };

      const result = validateStructuredContent(response);

      expect(result.isValid).toBe(true);
      expect(result.hasStructuredContent).toBe(true);
      expect(result.contentType).toBe('structured');
      expect(result.issues).toHaveLength(0);
    });

    it('should detect missing structuredContent', () => {
      const response = {
        content: [{ type: 'text', text: 'Some text response' }],
      };

      const result = validateStructuredContent(response);

      expect(result.isValid).toBe(false);
      expect(result.hasStructuredContent).toBe(false);
      // Should have 2 issues: MISSING_STRUCTURED_CONTENT and LEGACY_TEXT_CONTENT
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      expect(result.issues.some(i => i.code === 'MISSING_STRUCTURED_CONTENT')).toBe(true);
      // MISSING_STRUCTURED_CONTENT is 'info' level since structuredContent is optional
      expect(result.issues.find(i => i.code === 'MISSING_STRUCTURED_CONTENT')?.severity).toBe('info');
    });

    it('should enforce strict mode for missing structuredContent', () => {
      const response = {
        content: [{ type: 'text', text: 'Some text' }],
      };

      const result = validateStructuredContent(response, { strict: true });

      expect(result.issues[0].severity).toBe('error');
    });

    it('should reject invalid structuredContent types', () => {
      const response = {
        structuredContent: 'not an object',
      };

      const result = validateStructuredContent(response);

      expect(result.isValid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'INVALID_STRUCTURED_CONTENT_TYPE',
        })
      );
    });

    it('should identify legacy text content', () => {
      const response = {
        content: [{ type: 'text', text: 'Legacy response format' }],
      };

      const result = validateStructuredContent(response);

      expect(result.contentType).toBe('text');
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: 'LEGACY_TEXT_CONTENT',
          severity: 'info',
        })
      );
    });

    it('should detect JSON in text content', () => {
      const response = {
        content: [
          {
            type: 'text',
            text: '```json\n{"results": [1, 2, 3]}\n```',
          },
        ],
      };

      const result = validateStructuredContent(response);

      expect(result.contentType).toBe('json');
    });

    it('should detect markdown in text content', () => {
      const response = {
        content: [
          {
            type: 'text',
            text: '## Results\n\n**Found:** 5 items\n\n| ID | Name |\n|---|---|\n| 1 | Test |',
          },
        ],
      };

      const result = validateStructuredContent(response);

      expect(result.contentType).toBe('markdown');
    });

    it('should include metadata', () => {
      const response = { structuredContent: { data: [] } };

      const result = validateStructuredContent(response, {
        serverKey: 'test-server',
        toolName: 'test-tool',
      });

      expect(result.metadata.serverKey).toBe('test-server');
      expect(result.metadata.toolName).toBe('test-tool');
      expect(result.metadata.responseKeys).toEqual(['structuredContent']);
    });

    it('should handle null/undefined responses', () => {
      const nullResult = validateStructuredContent(null as any);
      const undefinedResult = validateStructuredContent(undefined as any);

      expect(nullResult.isValid).toBe(false);
      expect(nullResult.issues[0].code).toBe('INVALID_RESPONSE');
      expect(undefinedResult.isValid).toBe(false);
      expect(undefinedResult.issues[0].code).toBe('INVALID_RESPONSE');
    });
  });

  describe('extractStructuredData', () => {
    it('should extract valid structuredContent', () => {
      const response = {
        structuredContent: {
          results: [{ id: 1 }, { id: 2 }],
          metadata: { total: 2 },
        },
      };

      const result = extractStructuredData(response);

      expect(result.ok).toBe(true);
      expect(result.data).toEqual(response.structuredContent);
      expect(result._source).toBe('structuredContent');
      expect(result._validation).toBeDefined();
    });

    it('should handle structuredContent errors', () => {
      const response = {
        structuredContent: {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Resource not found',
          },
        },
      };

      const result = extractStructuredData(response);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
      expect(result.error?.message).toBe('Resource not found');
      expect(result._source).toBe('structuredContent');
    });

    it('should attempt fallback parsing when enabled', () => {
      const response = {
        content: [
          {
            type: 'text',
            text: '```json\n{"parsed": true, "value": 42}\n```',
          },
        ],
      };

      const result = extractStructuredData(response, {
        enableFallback: true,
      });

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ parsed: true, value: 42 });
      expect(result._source).toBe('fallback');
    });

    it('should parse markdown tables as fallback', () => {
      const response = {
        content: [
          {
            type: 'text',
            text: `
| ID | Name | Value |
|---|---|---|
| 1 | Item A | 10 |
| 2 | Item B | 20 |
`,
          },
        ],
      };

      const result = extractStructuredData(response, {
        enableFallback: true,
      });

      expect(result.ok).toBe(true);
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({ ID: '1', Name: 'Item A', Value: '10' });
    });

    it('should fail in strict mode without structuredContent', () => {
      const response = {
        content: [{ type: 'text', text: 'Plain text' }],
      };

      const result = extractStructuredData(response, {
        strict: true,
        enableFallback: false,
      });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('STRUCTURED_CONTENT_REQUIRED');
      expect(result._source).toBe('error');
    });

    it('should pass through raw response when fallback enabled and parsing fails', () => {
      const response = {
        content: [{ type: 'text', text: 'Unparseable content' }],
      };

      const result = extractStructuredData(response, {
        enableFallback: true,
      });

      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
      expect(result._source).toBe('fallback');
    });

    it('should extract JSON from plain text', () => {
      const response = {
        content: [
          {
            type: 'text',
            text: 'Here is the data: {"count": 5, "items": ["a", "b"]}',
          },
        ],
      };

      const result = extractStructuredData(response, {
        enableFallback: true,
      });

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ count: 5, items: ['a', 'b'] });
    });

    it('should log errors when logWarnings is true and errors exist', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Response with invalid structuredContent type produces an 'error' level issue
      const response = {
        structuredContent: 'not an object', // Invalid - must be object
      };

      extractStructuredData(response, {
        logWarnings: true,
        serverKey: 'test-server',
        toolName: 'test-tool',
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate report with 100% compliance', () => {
      const validations: StructuredContentValidationResult[] = [
        {
          isValid: true,
          hasStructuredContent: true,
          contentType: 'structured',
          issues: [],
          metadata: {},
        },
        {
          isValid: true,
          hasStructuredContent: true,
          contentType: 'structured',
          issues: [],
          metadata: {},
        },
      ];

      const report = generateComplianceReport(validations);

      expect(report.totalResponses).toBe(2);
      expect(report.compliantResponses).toBe(2);
      expect(report.complianceRate).toBe(100);
      expect(report.recommendations).toHaveLength(0);
    });

    it('should generate report with partial compliance', () => {
      const validations: StructuredContentValidationResult[] = [
        {
          isValid: true,
          hasStructuredContent: true,
          contentType: 'structured',
          issues: [],
          metadata: {},
        },
        {
          isValid: false,
          hasStructuredContent: false,
          contentType: 'text',
          issues: [
            {
              severity: 'warning',
              code: 'MISSING_STRUCTURED_CONTENT',
              message: 'Missing structuredContent',
            },
          ],
          metadata: {},
        },
      ];

      const report = generateComplianceReport(validations);

      expect(report.totalResponses).toBe(2);
      expect(report.compliantResponses).toBe(1);
      expect(report.complianceRate).toBe(50);
      expect(report.issuesSummary).toHaveProperty('MISSING_STRUCTURED_CONTENT', 1);
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.includes('structuredContent'))).toBe(true);
    });

    it('should summarize issue counts', () => {
      const validations: StructuredContentValidationResult[] = [
        {
          isValid: false,
          hasStructuredContent: false,
          contentType: 'text',
          issues: [
            {
              severity: 'warning',
              code: 'MISSING_STRUCTURED_CONTENT',
              message: 'Missing',
            },
          ],
          metadata: {},
        },
        {
          isValid: false,
          hasStructuredContent: false,
          contentType: 'text',
          issues: [
            {
              severity: 'warning',
              code: 'MISSING_STRUCTURED_CONTENT',
              message: 'Missing',
            },
            {
              severity: 'info',
              code: 'LEGACY_TEXT_CONTENT',
              message: 'Legacy format',
            },
          ],
          metadata: {},
        },
      ];

      const report = generateComplianceReport(validations);

      expect(report.issuesSummary).toEqual({
        MISSING_STRUCTURED_CONTENT: 2,
        LEGACY_TEXT_CONTENT: 1,
      });
    });

    it('should recommend migration from legacy format', () => {
      const validations: StructuredContentValidationResult[] = [
        {
          isValid: false,
          hasStructuredContent: false,
          contentType: 'text',
          issues: [
            {
              severity: 'info',
              code: 'LEGACY_TEXT_CONTENT',
              message: 'Legacy',
            },
          ],
          metadata: {},
        },
      ];

      const report = generateComplianceReport(validations);

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.includes('legacy') || r.includes('structuredContent'))).toBe(true);
    });

    it('should prioritize compliance when below 50%', () => {
      const validations: StructuredContentValidationResult[] = [
        {
          isValid: true,
          hasStructuredContent: true,
          contentType: 'structured',
          issues: [],
          metadata: {},
        },
        {
          isValid: false,
          hasStructuredContent: false,
          contentType: 'text',
          issues: [
            {
              severity: 'warning',
              code: 'MISSING_STRUCTURED_CONTENT',
              message: 'Missing',
            },
          ],
          metadata: {},
        },
        {
          isValid: false,
          hasStructuredContent: false,
          contentType: 'text',
          issues: [
            {
              severity: 'warning',
              code: 'MISSING_STRUCTURED_CONTENT',
              message: 'Missing',
            },
          ],
          metadata: {},
        },
      ];

      const report = generateComplianceReport(validations);

      expect(report.complianceRate).toBe(33.3);
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.includes('50%') || r.includes('compliance'))).toBe(true);
    });

    it('should handle empty validations array', () => {
      const report = generateComplianceReport([]);

      expect(report.totalResponses).toBe(0);
      expect(report.compliantResponses).toBe(0);
      expect(report.complianceRate).toBe(0);
      expect(report.issuesSummary).toEqual({});
      expect(report.recommendations).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle nested structuredContent', () => {
      const response = {
        structuredContent: {
          data: {
            nested: {
              deeply: {
                value: 'test',
              },
            },
          },
        },
      };

      const result = extractStructuredData(response);

      expect(result.ok).toBe(true);
      expect(result.data.data.nested.deeply.value).toBe('test');
    });

    it('should handle empty structuredContent', () => {
      const response = {
        structuredContent: {},
      };

      const result = extractStructuredData(response);

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should handle arrays in structuredContent', () => {
      const response = {
        structuredContent: [1, 2, 3, 4, 5],
      };

      const validation = validateStructuredContent(response);

      // Arrays are technically objects in JavaScript
      expect(validation.hasStructuredContent).toBe(true);
    });

    it('should handle malformed JSON in fallback', () => {
      const response = {
        content: [
          {
            type: 'text',
            text: '```json\n{invalid json here}\n```',
          },
        ],
      };

      const result = extractStructuredData(response, {
        enableFallback: true,
      });

      // Should fall back to raw text
      expect(result.ok).toBe(true);
      expect(result._source).toBe('fallback');
    });

    it('should handle mixed content types', () => {
      const response = {
        content: [
          { type: 'text', text: 'Some text' },
          { type: 'image', url: 'https://example.com/img.png' },
        ],
      };

      const validation = validateStructuredContent(response);

      expect(validation.contentType).toBe('mixed');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle typical MCP search response (compliant)', () => {
      const response = {
        structuredContent: {
          results: [
            { pmid: '12345', title: 'Study A', year: 2023 },
            { pmid: '67890', title: 'Study B', year: 2024 },
          ],
          metadata: {
            total: 2,
            query: 'cancer research',
            database: 'pubmed',
          },
        },
      };

      const result = extractStructuredData(response);

      expect(result.ok).toBe(true);
      expect(result.data.results).toHaveLength(2);
      expect(result.data.metadata.total).toBe(2);
      expect(result._validation?.isValid).toBe(true);
    });

    it('should handle typical MCP search response (non-compliant)', () => {
      const response = {
        content: [
          {
            type: 'text',
            text: `Found 2 results:

| PMID | Title | Year |
|---|---|---|
| 12345 | Study A | 2023 |
| 67890 | Study B | 2024 |
`,
          },
        ],
      };

      const result = extractStructuredData(response, {
        enableFallback: true,
        logWarnings: false,
      });

      expect(result.ok).toBe(true);
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data).toHaveLength(2);
      expect(result._source).toBe('fallback');
      expect(result._validation?.hasStructuredContent).toBe(false);
    });

    it('should handle error responses with structuredContent', () => {
      const response = {
        structuredContent: {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'API rate limit exceeded, retry after 60 seconds',
          },
          metadata: {
            retryAfter: 60,
            limit: 100,
            remaining: 0,
          },
        },
      };

      const result = extractStructuredData(response);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(result.error?.details.metadata.retryAfter).toBe(60);
    });

    it('should handle data staging responses', () => {
      const response = {
        structuredContent: {
          staged: true,
          dataAccessId: 'pubmed_search_1234567890_ab12',
          tables: ['article', 'author', 'keyword'],
          primaryTable: 'article',
          rowCount: 150,
          sizeBytes: 45600,
        },
      };

      const result = extractStructuredData(response);

      expect(result.ok).toBe(true);
      expect(result.data.staged).toBe(true);
      expect(result.data.dataAccessId).toMatch(/^pubmed_search_\d{10}_[a-z0-9]+$/);
      expect(result.data.tables).toContain('article');
    });
  });
});
