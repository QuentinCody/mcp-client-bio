/**
 * ID Enrichment Module Tests
 *
 * This module enriches tool results with cross-reference metadata
 * to help LLMs understand ID relationships across different biological databases.
 *
 * This is infrastructure-level improvement - NOT prompt modification.
 * The enrichment adds structured metadata to tool results that the LLM
 * naturally sees as part of the tool response.
 */

import { describe, it, expect } from 'vitest';
import {
  detectBiologicalIds,
  enrichWithCrossReferences,
  IdType,
  DetectedId,
  EnrichedResult,
} from './id-enrichment';

describe('ID Pattern Detection', () => {
  describe('detectBiologicalIds', () => {
    it('detects UniProt accession numbers', () => {
      const text = 'The protein P04637 is involved in tumor suppression';
      const ids = detectBiologicalIds(text);

      expect(ids).toContainEqual(
        expect.objectContaining({
          id: 'P04637',
          type: IdType.UNIPROT_ACCESSION,
          confidence: 'high',
        })
      );
    });

    it('detects Ensembl gene IDs', () => {
      const text = 'Gene ENSG00000141510 encodes TP53';
      const ids = detectBiologicalIds(text);

      expect(ids).toContainEqual(
        expect.objectContaining({
          id: 'ENSG00000141510',
          type: IdType.ENSEMBL_GENE,
          confidence: 'high',
        })
      );
    });

    it('detects NCBI Gene IDs', () => {
      const text = 'NCBI Gene ID: 7157 corresponds to TP53';
      const ids = detectBiologicalIds(text);

      expect(ids).toContainEqual(
        expect.objectContaining({
          id: '7157',
          type: IdType.NCBI_GENE,
          confidence: 'medium', // Numbers alone have lower confidence
        })
      );
    });

    it('detects PDB structure IDs', () => {
      const text = 'Crystal structure 1TUP shows the DNA-binding domain';
      const ids = detectBiologicalIds(text);

      expect(ids).toContainEqual(
        expect.objectContaining({
          id: '1TUP',
          type: IdType.PDB,
          confidence: 'high',
        })
      );
    });

    it('detects ClinicalTrials.gov NCT IDs', () => {
      const text = 'Trial NCT04585750 studies pembrolizumab';
      const ids = detectBiologicalIds(text);

      expect(ids).toContainEqual(
        expect.objectContaining({
          id: 'NCT04585750',
          type: IdType.NCT,
          confidence: 'high',
        })
      );
    });

    it('detects PubMed IDs (PMIDs)', () => {
      const text = 'See PMID:12345678 for the original study';
      const ids = detectBiologicalIds(text);

      expect(ids).toContainEqual(
        expect.objectContaining({
          id: '12345678',
          type: IdType.PMID,
          confidence: 'high',
        })
      );
    });

    it('detects ChEMBL compound IDs', () => {
      const text = 'CHEMBL941 is the compound identifier';
      const ids = detectBiologicalIds(text);

      expect(ids).toContainEqual(
        expect.objectContaining({
          id: 'CHEMBL941',
          type: IdType.CHEMBL,
          confidence: 'high',
        })
      );
    });

    it('detects ORCID identifiers', () => {
      const text = 'Author ORCID: 0000-0002-1825-0097';
      const ids = detectBiologicalIds(text);

      expect(ids).toContainEqual(
        expect.objectContaining({
          id: '0000-0002-1825-0097',
          type: IdType.ORCID,
          confidence: 'high',
        })
      );
    });

    it('detects ROR identifiers', () => {
      const text = 'Organization ROR: 03yrm5c26';
      const ids = detectBiologicalIds(text);

      expect(ids).toContainEqual(
        expect.objectContaining({
          id: '03yrm5c26',
          type: IdType.ROR,
          confidence: 'medium',
        })
      );
    });

    it('detects Crossref Funder IDs', () => {
      const text = 'Funded by 10.13039/100000001 (NSF)';
      const ids = detectBiologicalIds(text);

      expect(ids).toContainEqual(
        expect.objectContaining({
          id: '10.13039/100000001',
          type: IdType.CROSSREF_FUNDER,
          confidence: 'high',
        })
      );
    });

    it('detects multiple IDs in complex text', () => {
      const text = `
        UniProt: P04637 (TP53)
        Ensembl: ENSG00000141510
        PDB structures: 1TUP, 2XWR
        Related trial: NCT04585750
      `;
      const ids = detectBiologicalIds(text);

      expect(ids.length).toBeGreaterThanOrEqual(5);
      expect(ids.map(i => i.type)).toContain(IdType.UNIPROT_ACCESSION);
      expect(ids.map(i => i.type)).toContain(IdType.ENSEMBL_GENE);
      expect(ids.map(i => i.type)).toContain(IdType.PDB);
      expect(ids.map(i => i.type)).toContain(IdType.NCT);
    });

    it('handles JSON objects with nested IDs', () => {
      const data = {
        gene: { symbol: 'TP53', ensemblId: 'ENSG00000141510' },
        proteins: [
          { accession: 'P04637', name: 'Tumor protein p53' }
        ],
        crossReferences: {
          pdb: ['1TUP', '2XWR'],
          pubmed: ['12345678']
        }
      };

      const ids = detectBiologicalIds(data);

      expect(ids).toContainEqual(
        expect.objectContaining({ id: 'ENSG00000141510', type: IdType.ENSEMBL_GENE })
      );
      expect(ids).toContainEqual(
        expect.objectContaining({ id: 'P04637', type: IdType.UNIPROT_ACCESSION })
      );
      expect(ids).toContainEqual(
        expect.objectContaining({ id: '1TUP', type: IdType.PDB })
      );
    });

    it('returns empty array for text with no biological IDs', () => {
      const text = 'This is a general text without any identifiers';
      const ids = detectBiologicalIds(text);

      expect(ids).toEqual([]);
    });

    it('avoids false positives for common words', () => {
      const text = 'The DNA sequence was analyzed using Python';
      const ids = detectBiologicalIds(text);

      // Should not detect 'DNA' or 'Python' as IDs
      expect(ids.every(id => id.id !== 'DNA')).toBe(true);
      expect(ids.every(id => id.id !== 'Python')).toBe(true);
    });
  });
});

describe('Cross-Reference Enrichment', () => {
  describe('enrichWithCrossReferences', () => {
    it('adds UniProt cross-reference hints from config', () => {
      const detectedIds: DetectedId[] = [
        { id: 'P04637', type: IdType.UNIPROT_ACCESSION, confidence: 'high', source: 'text' }
      ];

      const enriched = enrichWithCrossReferences(detectedIds);

      expect(enriched.crossReferenceHints).toContainEqual(
        expect.objectContaining({
          fromId: 'P04637',
          fromType: IdType.UNIPROT_ACCESSION,
          // Servers that accept uniprot_accession from config
          relatedServers: expect.arrayContaining(['UniProt', 'RCSB PDB']),
        })
      );
    });

    it('adds Ensembl cross-reference hints for OpenTargets', () => {
      const detectedIds: DetectedId[] = [
        { id: 'ENSG00000141510', type: IdType.ENSEMBL_GENE, confidence: 'high', source: 'text' }
      ];

      const enriched = enrichWithCrossReferences(detectedIds);

      expect(enriched.crossReferenceHints).toContainEqual(
        expect.objectContaining({
          fromId: 'ENSG00000141510',
          fromType: IdType.ENSEMBL_GENE,
          relatedServers: expect.arrayContaining(['OpenTargets']),
        })
      );
      // Verify usage hint exists and mentions the server capabilities
      const ensemblHint = enriched.crossReferenceHints.find(h => h.fromType === IdType.ENSEMBL_GENE);
      expect(ensemblHint?.usageHint).toBeDefined();
    });

    it('adds PDB cross-reference hints', () => {
      const detectedIds: DetectedId[] = [
        { id: '1TUP', type: IdType.PDB, confidence: 'high', source: 'text' }
      ];

      const enriched = enrichWithCrossReferences(detectedIds);

      expect(enriched.crossReferenceHints).toContainEqual(
        expect.objectContaining({
          fromId: '1TUP',
          fromType: IdType.PDB,
          // Servers that accept pdb from config
          relatedServers: expect.arrayContaining(['RCSB PDB']),
        })
      );
    });

    it('generates summary of available cross-references', () => {
      const detectedIds: DetectedId[] = [
        { id: 'P04637', type: IdType.UNIPROT_ACCESSION, confidence: 'high', source: 'text' },
        { id: 'ENSG00000141510', type: IdType.ENSEMBL_GENE, confidence: 'high', source: 'text' },
      ];

      const enriched = enrichWithCrossReferences(detectedIds);

      // Summary should mention the IDs and their types
      expect(enriched.summary).toMatch(/uniprot.*P04637/i);
      expect(enriched.summary).toMatch(/ensembl.*ENSG00000141510/i);
    });

    it('provides server-specific ID format hints from config', () => {
      const detectedIds: DetectedId[] = [
        { id: 'P04637', type: IdType.UNIPROT_ACCESSION, confidence: 'high', source: 'text' }
      ];

      const enriched = enrichWithCrossReferences(detectedIds);
      const uniprotHint = enriched.crossReferenceHints.find(h => h.fromId === 'P04637');

      // serverIdFormats should contain hints from the config
      expect(uniprotHint?.serverIdFormats).toBeDefined();
      expect(Object.keys(uniprotHint?.serverIdFormats || {}).length).toBeGreaterThan(0);
      // Should have hints for servers that accept this ID type
      expect(uniprotHint?.serverIdFormats?.['UniProt']).toBeDefined();
    });

    it('handles empty ID list gracefully', () => {
      const enriched = enrichWithCrossReferences([]);

      expect(enriched.crossReferenceHints).toEqual([]);
      expect(enriched.summary).toBe('');
    });
  });
});

describe('Tool Result Enrichment Integration', () => {
  describe('enrichToolResult', () => {
    it('enriches UniProt search results with cross-references', async () => {
      // Simulated UniProt tool result
      const toolResult = {
        results: [
          {
            primaryAccession: 'P04637',
            uniProtkbId: 'P53_HUMAN',
            genes: [{ geneName: { value: 'TP53' } }],
            organism: { scientificName: 'Homo sapiens' }
          }
        ]
      };

      const { enrichToolResult } = await import('./id-enrichment');
      const enriched = enrichToolResult(toolResult, 'uniprot_search');

      expect(enriched._idEnrichment).toBeDefined();
      expect(enriched._idEnrichment.detectedIds).toContainEqual(
        expect.objectContaining({ id: 'P04637', type: IdType.UNIPROT_ACCESSION })
      );
      expect(enriched._idEnrichment.crossReferences.length).toBeGreaterThan(0);
    });

    it('enriches OpenTargets results with cross-references', async () => {
      const toolResult = {
        data: {
          target: {
            id: 'ENSG00000141510',
            approvedSymbol: 'TP53',
            proteinIds: [
              { id: 'P04637', source: 'UniProt' }
            ]
          }
        }
      };

      const { enrichToolResult } = await import('./id-enrichment');
      const enriched = enrichToolResult(toolResult, 'opentargets_graphql_query');

      expect(enriched._idEnrichment.detectedIds).toContainEqual(
        expect.objectContaining({ id: 'ENSG00000141510', type: IdType.ENSEMBL_GENE })
      );
      expect(enriched._idEnrichment.detectedIds).toContainEqual(
        expect.objectContaining({ id: 'P04637', type: IdType.UNIPROT_ACCESSION })
      );
    });

    it('enriches ClinicalTrials results with NCT cross-references', async () => {
      const toolResult = {
        studies: [
          {
            protocolSection: {
              identificationModule: {
                nctId: 'NCT04585750',
                briefTitle: 'Study of pembrolizumab'
              }
            }
          }
        ]
      };

      const { enrichToolResult } = await import('./id-enrichment');
      const enriched = enrichToolResult(toolResult, 'ctgov_search_studies');

      expect(enriched._idEnrichment.detectedIds).toContainEqual(
        expect.objectContaining({ id: 'NCT04585750', type: IdType.NCT })
      );
    });

    it('preserves original result structure', async () => {
      const toolResult = {
        gene: 'TP53',
        accession: 'P04637',
        nested: { data: [1, 2, 3] }
      };

      const { enrichToolResult } = await import('./id-enrichment');
      const enriched = enrichToolResult(toolResult, 'test_tool');

      expect(enriched.gene).toBe('TP53');
      expect(enriched.accession).toBe('P04637');
      expect(enriched.nested).toEqual({ data: [1, 2, 3] });
    });

    it('does not modify non-object results', async () => {
      const { enrichToolResult } = await import('./id-enrichment');

      const stringResult = enrichToolResult('Simple string result', 'test_tool');
      expect(stringResult).toBe('Simple string result');

      const numberResult = enrichToolResult(42, 'test_tool');
      expect(numberResult).toBe(42);
    });
  });
});
