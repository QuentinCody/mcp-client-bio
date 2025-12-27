/**
 * TDD Tests for Cross-Server ID Resolution Guidance
 *
 * These tests verify that the helper documentation includes guidance
 * for LLMs on how to chain tools across servers to resolve identifiers.
 *
 * Example: User asks "What structures exist for BRCA1?"
 * LLM needs to:
 * 1. Use UniProt to resolve gene name → UniProt accession
 * 2. Use that accession to query RCSB PDB for structures
 */

import { describe, it, expect } from 'vitest';
import { generateUsageExamples } from './helper-docs';

describe('Cross-Server ID Resolution Guidance', () => {
  describe('generateUsageExamples', () => {
    it('includes guidance for resolving gene names to UniProt accessions', () => {
      const examples = generateUsageExamples();

      // The examples should explain how to get a UniProt accession from a gene name
      expect(examples).toContain('gene');
      expect(examples).toContain('UniProt');
      // Should show the ID resolution workflow
      expect(examples.toLowerCase()).toMatch(/resolv|map|convert|lookup/);
    });

    it('includes ID resolution patterns section', () => {
      const examples = generateUsageExamples();

      // Should have a dedicated section for ID resolution
      expect(examples).toMatch(/id.*resolution|resolv.*id|cross.*server/i);
    });

    it('documents UniProt ID mapping for cross-server queries', () => {
      const examples = generateUsageExamples();

      // Should mention uniprot_id_mapping tool
      expect(examples).toContain('uniprot_id_mapping');
      // Should show how to use it
      expect(examples).toMatch(/from_db|to_db|Gene_Name/);
    });

    it('shows example of gene name to Ensembl ID resolution for OpenTargets', () => {
      const examples = generateUsageExamples();

      // OpenTargets requires Ensembl IDs, should show how to get them
      expect(examples).toMatch(/ensembl|ENSG/i);
      expect(examples).toContain('opentargets');
    });

    it('includes a multi-server chaining example', () => {
      const examples = generateUsageExamples();

      // Should show a complete workflow that chains multiple servers
      // e.g., Gene name → UniProt → get accession → query another server
      expect(examples).toMatch(/step\s*1|first.*then|chain/i);
    });

    it('explains when to use ID resolution vs direct queries', () => {
      const examples = generateUsageExamples();

      // Should explain decision making
      expect(examples).toMatch(/don't have|don't know|need.*id|require.*id/i);
    });
  });
});

describe('ID Resolution Server Mapping', () => {
  it('documents which servers provide IDs', () => {
    const examples = generateUsageExamples();

    // Should document ID providers
    expect(examples).toMatch(/uniprot.*accession|gene.*id|ensembl.*id/i);
  });

  it('documents which servers consume specific ID types', () => {
    const examples = generateUsageExamples();

    // Should document what IDs each server needs
    // OpenTargets needs Ensembl IDs
    // RCSB PDB needs UniProt accessions or PDB IDs
    expect(examples).toMatch(/opentargets.*ensembl|pdb.*uniprot/i);
  });
});
