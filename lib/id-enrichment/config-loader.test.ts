/**
 * Configuration Loader Tests
 *
 * Tests for dynamically loading ID patterns and server capabilities
 * from configuration files, making the system extensible.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadIdPatterns,
  loadServerCapabilities,
  buildCrossReferenceMap,
  type IdPatternConfig,
  type ServerCapabilities,
  type DynamicCrossReferenceMap,
} from './config-loader';

describe('Configuration Loader', () => {
  describe('loadIdPatterns', () => {
    it('loads patterns from config file', () => {
      const patterns = loadIdPatterns();

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('each pattern has required fields', () => {
      const patterns = loadIdPatterns();

      for (const pattern of patterns) {
        expect(pattern.id).toBeDefined();
        expect(typeof pattern.id).toBe('string');
        expect(pattern.name).toBeDefined();
        expect(pattern.confidence).toMatch(/^(high|medium|low)$/);
      }
    });

    it('patterns with regex can be compiled', () => {
      const patterns = loadIdPatterns();
      const regexPatterns = patterns.filter(p => p.regex !== null);

      for (const pattern of regexPatterns) {
        expect(() => new RegExp(pattern.regex!, pattern.flags || 'g')).not.toThrow();
      }
    });

    it('includes core biological ID types', () => {
      const patterns = loadIdPatterns();
      const patternIds = patterns.map(p => p.id);

      expect(patternIds).toContain('uniprot_accession');
      expect(patternIds).toContain('ensembl_gene');
      expect(patternIds).toContain('pdb');
      expect(patternIds).toContain('nct');
      expect(patternIds).toContain('pmid');
    });
  });

  describe('loadServerCapabilities', () => {
    it('loads capabilities from server config', () => {
      const capabilities = loadServerCapabilities();

      expect(capabilities).toBeDefined();
      expect(typeof capabilities).toBe('object');
      expect(Object.keys(capabilities).length).toBeGreaterThan(0);
    });

    it('each server has accepts and produces arrays', () => {
      const capabilities = loadServerCapabilities();

      for (const [serverName, caps] of Object.entries(capabilities)) {
        expect(Array.isArray(caps.accepts)).toBe(true);
        expect(Array.isArray(caps.produces)).toBe(true);
      }
    });

    it('includes known servers', () => {
      const capabilities = loadServerCapabilities();
      const serverNames = Object.keys(capabilities);

      expect(serverNames).toContain('UniProt');
      expect(serverNames).toContain('OpenTargets');
      expect(serverNames).toContain('ClinicalTrials');
    });

    it('server hints are optional but typed correctly when present', () => {
      const capabilities = loadServerCapabilities();

      for (const [serverName, caps] of Object.entries(capabilities)) {
        if (caps.hints) {
          expect(typeof caps.hints).toBe('object');
          for (const hint of Object.values(caps.hints)) {
            expect(typeof hint).toBe('string');
          }
        }
      }
    });
  });

  describe('buildCrossReferenceMap', () => {
    it('builds map from server capabilities', () => {
      const capabilities = loadServerCapabilities();
      const crossRefMap = buildCrossReferenceMap(capabilities);

      expect(crossRefMap).toBeDefined();
      expect(typeof crossRefMap).toBe('object');
    });

    it('maps ID types to servers that accept them', () => {
      const capabilities = loadServerCapabilities();
      const crossRefMap = buildCrossReferenceMap(capabilities);

      // UniProt accepts uniprot_accession
      expect(crossRefMap['uniprot_accession']).toBeDefined();
      expect(crossRefMap['uniprot_accession'].servers).toContain('UniProt');
    });

    it('includes usage hints from server config', () => {
      const capabilities = loadServerCapabilities();
      const crossRefMap = buildCrossReferenceMap(capabilities);

      const uniprotRef = crossRefMap['uniprot_accession'];
      expect(uniprotRef).toBeDefined();
      expect(uniprotRef.serverHints).toBeDefined();
    });

    it('handles ID types not accepted by any server', () => {
      const capabilities: Record<string, ServerCapabilities> = {
        'TestServer': {
          accepts: ['ensembl_gene'],
          produces: ['ensembl_gene'],
          hints: {},
        },
      };

      const crossRefMap = buildCrossReferenceMap(capabilities);

      // uniprot_accession not in any accepts list
      expect(crossRefMap['uniprot_accession']).toBeUndefined();
      expect(crossRefMap['ensembl_gene']).toBeDefined();
    });

    it('aggregates multiple servers for same ID type', () => {
      const capabilities = loadServerCapabilities();
      const crossRefMap = buildCrossReferenceMap(capabilities);

      // Multiple servers accept pdb
      const pdbRef = crossRefMap['pdb'];
      expect(pdbRef).toBeDefined();
      expect(pdbRef.servers.length).toBeGreaterThan(1);
    });
  });

  describe('Dynamic Server Addition/Removal', () => {
    it('can build map with custom server list', () => {
      const customCapabilities: Record<string, ServerCapabilities> = {
        'NewServer': {
          accepts: ['uniprot_accession', 'custom_id'],
          produces: ['uniprot_accession'],
          hints: {
            'uniprot_accession': 'Use for protein queries',
          },
        },
        'AnotherServer': {
          accepts: ['custom_id'],
          produces: ['custom_id'],
          hints: {},
        },
      };

      const crossRefMap = buildCrossReferenceMap(customCapabilities);

      expect(crossRefMap['uniprot_accession'].servers).toContain('NewServer');
      expect(crossRefMap['custom_id'].servers).toContain('NewServer');
      expect(crossRefMap['custom_id'].servers).toContain('AnotherServer');
    });

    it('generates usage hint from available server hints', () => {
      const capabilities: Record<string, ServerCapabilities> = {
        'Server1': {
          accepts: ['test_id'],
          produces: [],
          hints: { 'test_id': 'Use for Server1 queries' },
        },
        'Server2': {
          accepts: ['test_id'],
          produces: [],
          hints: { 'test_id': 'Use for Server2 queries' },
        },
      };

      const crossRefMap = buildCrossReferenceMap(capabilities);

      expect(crossRefMap['test_id'].serverHints['Server1']).toBe('Use for Server1 queries');
      expect(crossRefMap['test_id'].serverHints['Server2']).toBe('Use for Server2 queries');
    });

    it('handles empty capabilities gracefully', () => {
      const crossRefMap = buildCrossReferenceMap({});

      expect(crossRefMap).toEqual({});
    });

    it('handles servers with no ID capabilities', () => {
      const capabilities: Record<string, ServerCapabilities> = {
        'EmptyServer': {
          accepts: [],
          produces: [],
          hints: {},
        },
      };

      const crossRefMap = buildCrossReferenceMap(capabilities);

      expect(crossRefMap).toEqual({});
    });
  });
});

describe('Integration with Active Server List', () => {
  it('can filter cross-references to only active servers', () => {
    const allCapabilities = loadServerCapabilities();
    const activeServers = ['UniProt', 'OpenTargets']; // Simulated active servers

    // Filter to only active servers
    const activeCapabilities: Record<string, ServerCapabilities> = {};
    for (const server of activeServers) {
      if (allCapabilities[server]) {
        activeCapabilities[server] = allCapabilities[server];
      }
    }

    const crossRefMap = buildCrossReferenceMap(activeCapabilities);

    // Should only include servers that are active
    for (const idType of Object.keys(crossRefMap)) {
      for (const server of crossRefMap[idType].servers) {
        expect(activeServers).toContain(server);
      }
    }
  });
});
