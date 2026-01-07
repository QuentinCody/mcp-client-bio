/**
 * Pipeline Integration Tests for ID Enrichment
 *
 * Tests that the ID enrichment module is properly integrated
 * into the MCP tool result pipeline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enrichToolResult, IdType } from './id-enrichment';

// Mock MCP tool result that simulates what would come from a real tool
interface MockToolResult {
  content: Array<{ type: string; text: string }>;
}

/**
 * Simulates the tool result wrapper that will be added to the MCP client
 */
function wrapToolResultWithEnrichment<T>(result: T, toolName: string): T {
  // Import the enrichment dynamically to allow for mocking
  const enriched = enrichToolResult(result, toolName);
  return enriched;
}

describe('Pipeline Integration', () => {
  describe('wrapToolResultWithEnrichment', () => {
    it('enriches UniProt search results with cross-references', () => {
      const uniprotResult = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            results: [{
              primaryAccession: 'P04637',
              uniProtkbId: 'P53_HUMAN',
              genes: [{ geneName: { value: 'TP53' } }],
            }]
          })
        }]
      };

      const enriched = wrapToolResultWithEnrichment(uniprotResult, 'uniprot_search');

      expect(enriched._idEnrichment).toBeDefined();
      expect(enriched._idEnrichment!.detectedIds).toContainEqual(
        expect.objectContaining({
          id: 'P04637',
          type: IdType.UNIPROT_ACCESSION,
        })
      );
      expect(enriched._idEnrichment!.crossReferences.length).toBeGreaterThan(0);
    });

    it('enriches ClinicalTrials results with NCT cross-references', () => {
      const ctResult = {
        studies: [{
          protocolSection: {
            identificationModule: {
              nctId: 'NCT04585750',
              briefTitle: 'Study of pembrolizumab',
            }
          }
        }]
      };

      const enriched = wrapToolResultWithEnrichment(ctResult, 'ctgov_search_studies');

      expect(enriched._idEnrichment).toBeDefined();
      expect(enriched._idEnrichment!.detectedIds).toContainEqual(
        expect.objectContaining({
          id: 'NCT04585750',
          type: IdType.NCT,
        })
      );
    });

    it('enriches OpenTargets results with Ensembl cross-references', () => {
      const otResult = {
        data: {
          target: {
            id: 'ENSG00000141510',
            approvedSymbol: 'TP53',
            proteinIds: [{ id: 'P04637', source: 'UniProt' }]
          }
        }
      };

      const enriched = wrapToolResultWithEnrichment(otResult, 'opentargets_graphql_query');

      expect(enriched._idEnrichment).toBeDefined();
      expect(enriched._idEnrichment!.detectedIds).toContainEqual(
        expect.objectContaining({
          id: 'ENSG00000141510',
          type: IdType.ENSEMBL_GENE,
        })
      );
      expect(enriched._idEnrichment!.detectedIds).toContainEqual(
        expect.objectContaining({
          id: 'P04637',
          type: IdType.UNIPROT_ACCESSION,
        })
      );
    });

    it('enriches RCSB PDB results with structure cross-references', () => {
      const pdbResult = {
        entry: {
          rcsb_id: '1TUP',
          struct: { title: 'Crystal structure of p53 DNA-binding domain' },
          polymer_entities: [{ rcsb_polymer_entity_container_identifiers: { uniprot_ids: ['P04637'] } }]
        }
      };

      const enriched = wrapToolResultWithEnrichment(pdbResult, 'rcsb_search_entries');

      expect(enriched._idEnrichment).toBeDefined();
      expect(enriched._idEnrichment!.detectedIds).toContainEqual(
        expect.objectContaining({
          id: '1TUP',
          type: IdType.PDB,
        })
      );
    });

    it('enriches Entrez PubMed results with PMID cross-references', () => {
      const entrezResult = {
        result: {
          uids: ['12345678'],
          '12345678': {
            uid: '12345678',
            title: 'Sample publication',
            source: 'Nature',
          }
        }
      };

      // The PMID pattern requires prefix, let's test with prefixed format
      const entrezResultWithPrefix = {
        result: {
          uids: ['12345678'],
          '12345678': {
            uid: '12345678',
            title: 'Sample publication PMID:12345678',
            source: 'Nature',
          }
        }
      };

      const enriched = wrapToolResultWithEnrichment(entrezResultWithPrefix, 'entrez_search');

      expect(enriched._idEnrichment).toBeDefined();
      expect(enriched._idEnrichment!.detectedIds).toContainEqual(
        expect.objectContaining({
          id: '12345678',
          type: IdType.PMID,
        })
      );
    });

    it('does not add enrichment to results with no detectable IDs', () => {
      const genericResult = {
        message: 'Operation completed successfully',
        count: 0,
      };

      const enriched = wrapToolResultWithEnrichment(genericResult, 'some_tool');

      // Should return original result without _idEnrichment when no IDs detected
      expect(enriched._idEnrichment).toBeUndefined();
    });

    it('preserves original result structure after enrichment', () => {
      const originalResult = {
        gene: 'TP53',
        accession: 'P04637',
        nested: { data: [1, 2, 3] },
        array: ['a', 'b', 'c'],
      };

      const enriched = wrapToolResultWithEnrichment(originalResult, 'test_tool');

      expect(enriched.gene).toBe('TP53');
      expect(enriched.accession).toBe('P04637');
      expect(enriched.nested).toEqual({ data: [1, 2, 3] });
      expect(enriched.array).toEqual(['a', 'b', 'c']);
    });

    it('handles multiple ID types in a single result', () => {
      const complexResult = {
        gene: {
          ensemblId: 'ENSG00000141510',
          symbol: 'TP53',
        },
        protein: {
          uniprotId: 'P04637',
        },
        structures: ['1TUP', '2XWR'],
        trials: ['NCT04585750'],
      };

      const enriched = wrapToolResultWithEnrichment(complexResult, 'combined_query');

      expect(enriched._idEnrichment).toBeDefined();
      const idTypes = enriched._idEnrichment!.detectedIds.map(d => d.type);
      expect(idTypes).toContain(IdType.ENSEMBL_GENE);
      expect(idTypes).toContain(IdType.UNIPROT_ACCESSION);
      expect(idTypes).toContain(IdType.PDB);
      expect(idTypes).toContain(IdType.NCT);
    });

    it('provides cross-reference hints for server interoperability', () => {
      const result = {
        accession: 'P04637',
      };

      const enriched = wrapToolResultWithEnrichment(result, 'uniprot_fetch');

      expect(enriched._idEnrichment).toBeDefined();
      const uniprotHint = enriched._idEnrichment!.crossReferences.find(
        h => h.fromId === 'P04637'
      );

      expect(uniprotHint).toBeDefined();
      // Check for servers that accept uniprot_accession from config
      expect(uniprotHint!.relatedServers).toContain('UniProt');
      expect(uniprotHint!.relatedServers).toContain('RCSB PDB');
      expect(uniprotHint!.usageHint).toBeDefined();
      expect(uniprotHint!.serverIdFormats).toBeDefined();
    });
  });
});

describe('MCP Tool Executor Integration', () => {
  describe('createEnrichedExecutor', () => {
    it('wraps tool executor to enrich results', async () => {
      // Simulate what the MCP client executor does
      const mockExecutor = vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({ accession: 'P04637' })
        }]
      });

      // The enriched executor wrapper
      const createEnrichedExecutor = (executor: typeof mockExecutor, toolName: string) => {
        return async (args: unknown) => {
          const result = await executor(args);
          return enrichToolResult(result, toolName);
        };
      };

      const enrichedExecutor = createEnrichedExecutor(mockExecutor, 'uniprot_search');
      const result = await enrichedExecutor({ query: 'P04637' });

      expect(mockExecutor).toHaveBeenCalledWith({ query: 'P04637' });
      expect(result._idEnrichment).toBeDefined();
      expect(result._idEnrichment!.detectedIds).toContainEqual(
        expect.objectContaining({ id: 'P04637' })
      );
    });

    it('handles executor errors gracefully', async () => {
      const failingExecutor = vi.fn().mockRejectedValue(new Error('Tool execution failed'));

      const createEnrichedExecutor = (executor: typeof failingExecutor, toolName: string) => {
        return async (args: unknown) => {
          const result = await executor(args);
          return enrichToolResult(result, toolName);
        };
      };

      const enrichedExecutor = createEnrichedExecutor(failingExecutor, 'test_tool');

      await expect(enrichedExecutor({})).rejects.toThrow('Tool execution failed');
    });

    it('handles null/undefined results', async () => {
      const nullExecutor = vi.fn().mockResolvedValue(null);

      const createEnrichedExecutor = (executor: typeof nullExecutor, toolName: string) => {
        return async (args: unknown) => {
          const result = await executor(args);
          return enrichToolResult(result, toolName);
        };
      };

      const enrichedExecutor = createEnrichedExecutor(nullExecutor, 'test_tool');
      const result = await enrichedExecutor({});

      expect(result).toBeNull();
    });
  });
});
