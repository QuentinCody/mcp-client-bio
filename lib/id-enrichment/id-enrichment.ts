/**
 * ID Enrichment Module
 *
 * Enriches tool results with cross-reference metadata to help LLMs
 * understand ID relationships across different biological databases.
 *
 * This is infrastructure-level improvement that adds structured metadata
 * to tool results without modifying prompts or system messages.
 *
 * Configuration-driven: ID patterns and server capabilities are loaded
 * from config files, making the system extensible without code changes.
 */

import {
  loadIdPatterns,
  loadServerCapabilities,
  buildCrossReferenceMap,
  compileIdPatterns,
  type DynamicCrossReferenceMap,
  type ServerCapabilities,
} from './config-loader';

/**
 * Types of biological identifiers we can detect
 * These are derived from the id-patterns.json config
 */
export enum IdType {
  UNIPROT_ACCESSION = 'uniprot_accession',
  ENSEMBL_GENE = 'ensembl_gene',
  ENSEMBL_TRANSCRIPT = 'ensembl_transcript',
  ENSEMBL_PROTEIN = 'ensembl_protein',
  NCBI_GENE = 'ncbi_gene',
  PDB = 'pdb',
  NCT = 'nct',
  PMID = 'pmid',
  DOI = 'doi',
  CHEMBL = 'chembl',
  DRUGBANK = 'drugbank',
  HGNC = 'hgnc',
  ORCID = 'orcid',
  ROR = 'ror',
  CROSSREF_FUNDER = 'crossref_funder',
  GENE_SYMBOL = 'gene_symbol',
}

/**
 * A detected biological identifier
 */
export interface DetectedId {
  id: string;
  type: IdType;
  confidence: 'high' | 'medium' | 'low';
  source: string;
}

/**
 * Cross-reference hint for a detected ID
 */
export interface CrossReferenceHint {
  fromId: string;
  fromType: IdType;
  relatedServers: string[];
  usageHint?: string;
  serverIdFormats?: Record<string, string>;
}

/**
 * Enriched result with cross-reference metadata
 */
export interface EnrichedResult {
  crossReferenceHints: CrossReferenceHint[];
  summary: string;
}

/**
 * Cached compiled patterns and cross-reference map
 * Loaded once on first use for performance
 */
let cachedPatterns: Array<{
  id: string;
  name: string;
  regex: RegExp;
  confidence: 'high' | 'medium' | 'low';
}> | null = null;

let cachedCrossRefMap: DynamicCrossReferenceMap | null = null;

/**
 * Get compiled patterns (cached)
 */
function getPatterns() {
  if (!cachedPatterns) {
    cachedPatterns = compileIdPatterns();
  }
  return cachedPatterns;
}

/**
 * Get cross-reference map (cached)
 */
function getCrossRefMap(): DynamicCrossReferenceMap {
  if (!cachedCrossRefMap) {
    const capabilities = loadServerCapabilities();
    cachedCrossRefMap = buildCrossReferenceMap(capabilities);
  }
  return cachedCrossRefMap;
}

/**
 * Clear cached data (useful for testing or when config changes)
 */
export function clearCache(): void {
  cachedPatterns = null;
  cachedCrossRefMap = null;
}

/**
 * Set a custom cross-reference map (for filtering to active servers)
 */
export function setCrossRefMap(map: DynamicCrossReferenceMap): void {
  cachedCrossRefMap = map;
}

/**
 * Extract text content from any input type
 */
function extractText(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input === null || input === undefined) {
    return '';
  }
  if (typeof input === 'object') {
    return JSON.stringify(input);
  }
  return String(input);
}

/**
 * Convert pattern ID to IdType enum value
 */
function patternIdToIdType(patternId: string): IdType | null {
  const mapping: Record<string, IdType> = {
    uniprot_accession: IdType.UNIPROT_ACCESSION,
    ensembl_gene: IdType.ENSEMBL_GENE,
    ensembl_transcript: IdType.ENSEMBL_TRANSCRIPT,
    ensembl_protein: IdType.ENSEMBL_PROTEIN,
    ncbi_gene: IdType.NCBI_GENE,
    pdb: IdType.PDB,
    nct: IdType.NCT,
    pmid: IdType.PMID,
    doi: IdType.DOI,
    chembl: IdType.CHEMBL,
    drugbank: IdType.DRUGBANK,
    hgnc: IdType.HGNC,
    orcid: IdType.ORCID,
    ror: IdType.ROR,
    crossref_funder: IdType.CROSSREF_FUNDER,
    gene_symbol: IdType.GENE_SYMBOL,
  };
  return mapping[patternId] || null;
}

/**
 * Detect biological identifiers in text or objects
 */
export function detectBiologicalIds(input: string | object): DetectedId[] {
  const text = extractText(input);
  const detectedIds: DetectedId[] = [];
  const seenIds = new Set<string>();
  const patterns = getPatterns();

  for (const pattern of patterns) {
    // Reset regex state
    pattern.regex.lastIndex = 0;

    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      // Get the captured group (first group if exists, otherwise full match)
      const id = match[1] || match[0];

      // Create unique key to avoid duplicates
      const key = `${pattern.id}:${id}`;
      if (seenIds.has(key)) continue;
      seenIds.add(key);

      const idType = patternIdToIdType(pattern.id);
      if (idType) {
        detectedIds.push({
          id,
          type: idType,
          confidence: pattern.confidence,
          source: 'text',
        });
      }
    }
  }

  return detectedIds;
}

/**
 * Enrich detected IDs with cross-reference metadata
 */
export function enrichWithCrossReferences(detectedIds: DetectedId[]): EnrichedResult {
  if (detectedIds.length === 0) {
    return {
      crossReferenceHints: [],
      summary: '',
    };
  }

  const crossRefMap = getCrossRefMap();
  const crossReferenceHints: CrossReferenceHint[] = [];

  for (const detected of detectedIds) {
    const crossRef = crossRefMap[detected.type];
    if (crossRef && crossRef.servers.length > 0) {
      // Build usage hint from server hints
      const hintParts: string[] = [];
      for (const server of crossRef.servers) {
        if (crossRef.serverHints[server]) {
          hintParts.push(`${server}: ${crossRef.serverHints[server]}`);
        }
      }
      const usageHint = hintParts.length > 0
        ? hintParts.join('. ')
        : `Can be used with: ${crossRef.servers.join(', ')}`;

      crossReferenceHints.push({
        fromId: detected.id,
        fromType: detected.type,
        relatedServers: crossRef.servers,
        usageHint,
        serverIdFormats: crossRef.serverHints,
      });
    }
  }

  // Generate summary
  const summaryParts: string[] = [];
  for (const hint of crossReferenceHints) {
    const typeLabel = hint.fromType.replace(/_/g, ' ');
    summaryParts.push(
      `${typeLabel} ${hint.fromId} can be used with: ${hint.relatedServers.join(', ')}`
    );
  }

  return {
    crossReferenceHints,
    summary: summaryParts.join('. '),
  };
}

/**
 * Enrichment metadata added to tool results
 */
interface IdEnrichmentMetadata {
  detectedIds: DetectedId[];
  crossReferences: CrossReferenceHint[];
  summary: string;
}

/**
 * Enrich a tool result with cross-reference metadata
 */
export function enrichToolResult<T>(result: T, toolName: string): T & { _idEnrichment?: IdEnrichmentMetadata } {
  // Only enrich object results
  if (typeof result !== 'object' || result === null) {
    return result as T & { _idEnrichment?: IdEnrichmentMetadata };
  }

  // Detect IDs in the result
  const detectedIds = detectBiologicalIds(result);

  if (detectedIds.length === 0) {
    return result as T & { _idEnrichment?: IdEnrichmentMetadata };
  }

  // Get cross-references
  const enrichment = enrichWithCrossReferences(detectedIds);

  // Add enrichment metadata to result
  return {
    ...result,
    _idEnrichment: {
      detectedIds,
      crossReferences: enrichment.crossReferenceHints,
      summary: enrichment.summary,
    },
  };
}

/**
 * Initialize enrichment with a filtered set of active servers
 *
 * Call this when the set of connected MCP servers changes to ensure
 * cross-references only point to actually available servers.
 *
 * @param activeServerNames - Names of currently connected MCP servers
 */
export function initializeWithActiveServers(activeServerNames: string[]): void {
  const allCapabilities = loadServerCapabilities();

  // Filter to only active servers
  const activeCapabilities: Record<string, ServerCapabilities> = {};
  for (const serverName of activeServerNames) {
    if (allCapabilities[serverName]) {
      activeCapabilities[serverName] = allCapabilities[serverName];
    }
  }

  // Build and cache the filtered map
  cachedCrossRefMap = buildCrossReferenceMap(activeCapabilities);
}

/**
 * Re-export config loader types for consumers
 */
export type { DynamicCrossReferenceMap, ServerCapabilities };
