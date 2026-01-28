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
import { generateUsageExamples, generateResponseTypeHints, generateCompactResponseTypeHints } from './helper-docs';

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

describe('Server-Specific Guidance', () => {
  it('includes DGIdb drug-gene interaction examples', () => {
    const examples = generateUsageExamples();

    expect(examples).toContain('dgidb');
    expect(examples).toMatch(/drug.*interaction|interaction.*drug/i);
  });

  it('includes ClinicalTrials query examples', () => {
    const examples = generateUsageExamples();

    expect(examples).toContain('clinicaltrials');
    expect(examples).toMatch(/trial|condition|intervention/i);
  });

  it('includes CIViC variant examples', () => {
    const examples = generateUsageExamples();

    expect(examples).toContain('civic');
    expect(examples).toMatch(/variant|evidence/i);
  });

  it('includes Pharos target examples', () => {
    const examples = generateUsageExamples();

    expect(examples).toContain('pharos');
  });

  it('includes NCI GDC mutation examples', () => {
    const examples = generateUsageExamples();

    expect(examples).toMatch(/gdc|nci/i);
    expect(examples).toMatch(/mutation|cancer/i);
  });

  it('includes a server ID requirements table', () => {
    const examples = generateUsageExamples();

    // Should have a table showing what each server accepts
    expect(examples).toMatch(/\|.*Server.*\|.*Accepts.*\|/i);
  });

  it('includes common ID resolution chains', () => {
    const examples = generateUsageExamples();

    // Should show common patterns like Gene → Protein, Gene → Drugs
    expect(examples).toMatch(/gene.*→.*protein|gene.*→.*drug|gene.*→.*structure/i);
  });

  it('includes a comprehensive multi-server pipeline example', () => {
    const examples = generateUsageExamples();

    // Should show a complete example using multiple servers
    expect(examples).toMatch(/comprehensive|complete|pipeline/i);
    expect(examples).toMatch(/step\s*1|step\s*2|step\s*3|step\s*4/i);
  });
});

describe('Response Type Hints', () => {
  describe('generateResponseTypeHints', () => {
    it('documents common response wrapper patterns', () => {
      const hints = generateResponseTypeHints();

      expect(hints).toContain('results');
      expect(hints).toContain('nodes');
      expect(hints).toContain('studies');
      expect(hints).toContain('idlist');
    });

    it('includes UniProt response shapes', () => {
      const hints = generateResponseTypeHints();

      expect(hints).toContain('UniProt');
      expect(hints).toContain('primaryAccession');
      expect(hints).toMatch(/response\?\.results/);
    });

    it('includes OpenTargets response shapes', () => {
      const hints = generateResponseTypeHints();

      expect(hints).toContain('OpenTargets');
      expect(hints).toMatch(/data.*search.*hits|associatedTargets/);
    });

    it('includes CIViC response shapes', () => {
      const hints = generateResponseTypeHints();

      expect(hints).toContain('CIViC');
      expect(hints).toContain('nodes');
      expect(hints).toContain('edges');
    });

    it('includes defensive extraction patterns', () => {
      const hints = generateResponseTypeHints();

      expect(hints).toMatch(/Array\.isArray/);
      expect(hints).toMatch(/\|\| \[\]/);
      expect(hints).toMatch(/\?\./);
    });

    it('shows correct and incorrect examples', () => {
      const hints = generateResponseTypeHints();

      expect(hints).toMatch(/CORRECT|WRONG/);
      expect(hints).toContain('TypeError');
    });
  });

  describe('generateCompactResponseTypeHints', () => {
    it('is shorter than the full version', () => {
      const full = generateResponseTypeHints();
      const compact = generateCompactResponseTypeHints();

      expect(compact.length).toBeLessThan(full.length);
    });

    it('includes essential response patterns table', () => {
      const hints = generateCompactResponseTypeHints();

      expect(hints).toMatch(/\|.*API.*\|.*Response.*\|/i);
      expect(hints).toContain('UniProt');
      expect(hints).toContain('OpenTargets');
      expect(hints).toContain('CIViC');
    });

    it('includes mandatory defensive patterns', () => {
      const hints = generateCompactResponseTypeHints();

      expect(hints).toMatch(/Array\.isArray/);
      expect(hints).toMatch(/\?\./);
      expect(hints).toMatch(/\|\| \[\]/);
    });

    it('shows safe extraction patterns for common APIs', () => {
      const hints = generateCompactResponseTypeHints();

      expect(hints).toContain('response?.results || []');
      expect(hints).toContain('response?.nodes || []');
      expect(hints).toContain('response?.studies || []');
    });
  });
});
