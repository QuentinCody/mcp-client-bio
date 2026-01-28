# AlphaFold MCP Server Implementation Plan

## Overview

Build a new AlphaFold MCP Server using Cloudflare Workers + Durable Objects + SQLite for caching. This server will provide access to the AlphaFold Protein Structure Database with intelligent caching for improved performance.

## Source Reference

- **Existing Implementation:** [Augmented-Nature/AlphaFold-MCP-Server](https://github.com/Augmented-Nature/AlphaFold-MCP-Server)
- **API:** https://alphafold.ebi.ac.uk/api
- **Analysis Date:** 2026-01-28

## Current Implementation Assessment

| Aspect | Status | Notes |
|--------|--------|-------|
| Tool Coverage | Excellent | 23 tools covering all use cases |
| Input Validation | Good | Type guards validate inputs |
| Error Handling | Basic | Try-catch but no retry logic |
| **Caching** | None | All requests hit API directly |
| Batch Processing | Sequential | Not parallelized |
| Rate Limiting | None | No protection |
| MCP SDK | v0.5.0 | Outdated |

**Recommendation:** BUILD FRESH with our Cloudflare DO+SQLite pattern.

---

## Tool Schema Definitions

### Phase 1: Core Tools

```typescript
// Get structure prediction for a UniProt ID
get_structure(uniprotId: string, format?: 'pdb' | 'cif' | 'bcif')
  // Returns: Structure data with pLDDT scores

// Batch check which IDs have predictions
check_availability(uniprotIds: string[])
  // Returns: Map of ID -> availability status

// Search by protein/gene name
search_structures(query: string, organism?: number, limit?: number)
  // Returns: List of matching structures
```

### Phase 2: Analysis Tools

```typescript
// Per-residue confidence scores
get_confidence_scores(uniprotId: string)
  // Returns: Array of pLDDT values

// Identify high/low confidence regions
analyze_confidence_regions(uniprotId: string, threshold?: number)
  // Returns: Domain boundaries with confidence classification

// Parallel multi-protein retrieval
batch_structure_info(uniprotIds: string[], maxBatch?: number)
  // Returns: Array of structure info (max 50)
```

### Phase 3: Export Tools

```typescript
// Generate PyMOL visualization script
export_for_pymol(uniprotId: string)
  // Returns: PyMOL script with confidence coloring

// Sequence coverage statistics
get_coverage_info(uniprotId: string)
  // Returns: Coverage percentages and stats
```

---

## Durable Object Structure

### Sharding Strategy

Shard by UniProt ID prefix (first 2 characters):
- ~676 potential shards (26×26)
- Keeps related proteins together
- Distributes load evenly

### DO Implementation

```typescript
export class AlphaFoldCache extends DurableObject {
  sql: SqlStorage;

  async fetch(request: Request) {
    const { action, uniprotId, data } = await request.json();

    switch (action) {
      case 'get':
        return this.getCached(uniprotId);
      case 'set':
        return this.setCached(uniprotId, data);
      case 'search':
        return this.searchCached(data.query);
      case 'batch':
        return this.getBatchCached(data.ids);
    }
  }

  private async getCached(uniprotId: string) {
    const row = this.sql.exec(
      'SELECT * FROM predictions WHERE uniprot_id = ? AND expires_at > ?',
      [uniprotId, Date.now()]
    ).one();
    return row ? new Response(JSON.stringify(row)) : null;
  }
}
```

---

## SQLite Schema

```sql
-- Structure predictions cache
CREATE TABLE predictions (
  uniprot_id TEXT PRIMARY KEY,
  sequence_length INTEGER,
  model_version TEXT,
  pdb_url TEXT,
  cif_url TEXT,
  mean_plddt REAL,
  coverage_percent REAL,
  organism_id INTEGER,
  gene_name TEXT,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Per-residue confidence scores (separate table for size)
CREATE TABLE confidence_scores (
  uniprot_id TEXT,
  residue_index INTEGER,
  plddt_score REAL,
  PRIMARY KEY (uniprot_id, residue_index)
);

-- Search index for fast lookups
CREATE TABLE search_index (
  uniprot_id TEXT PRIMARY KEY,
  search_text TEXT,  -- gene name + description concatenated
  organism_id INTEGER
);
CREATE INDEX idx_search_text ON search_index(search_text);
CREATE INDEX idx_search_organism ON search_index(organism_id);

-- Organism statistics cache
CREATE TABLE organism_stats (
  organism_id INTEGER PRIMARY KEY,
  total_proteins INTEGER,
  covered_proteins INTEGER,
  avg_plddt REAL,
  updated_at INTEGER
);
```

### Cache TTL Strategy

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Structure predictions | 30 days | AlphaFold releases are infrequent |
| Confidence scores | 30 days | Same as predictions |
| Search results | 7 days | May add new proteins |
| Organism stats | 1 day | Aggregate, update more often |

---

## Rate Limiting Strategy

```typescript
const RATE_LIMITS = {
  // Per-IP limits
  perIP: {
    tokens: 100,
    refillRate: 10,  // per second
    windowMs: 60000
  },

  // Global limits (protect upstream API)
  global: {
    tokens: 1000,
    refillRate: 100,
    windowMs: 60000
  },

  // Operation-specific limits
  batchOps: {
    tokens: 10,
    refillRate: 1,
    windowMs: 60000
  },
  downloads: {
    tokens: 20,
    refillRate: 2,
    windowMs: 60000
  }
};

// Token bucket implementation in DO
async checkRateLimit(ip: string, opType: string): Promise<boolean> {
  const key = `rate:${ip}:${opType}`;
  const bucket = await this.getRateBucket(key);

  if (bucket.tokens <= 0) {
    return false; // Rate limited
  }

  await this.decrementBucket(key);
  return true;
}
```

---

## Batch Parallelization

```typescript
async batchStructureInfo(uniprotIds: string[]): Promise<StructureInfo[]> {
  // Validate batch size
  if (uniprotIds.length > 50) {
    throw new Error('Maximum batch size is 50 IDs');
  }

  // Check cache first
  const cached = await this.getCachedBatch(uniprotIds);
  const cachedIds = new Set(cached.map(c => c.uniprot_id));
  const uncachedIds = uniprotIds.filter(id => !cachedIds.has(id));

  if (uncachedIds.length === 0) {
    return cached; // All cached
  }

  // Parallel fetch with concurrency limit
  const CONCURRENCY = 10;
  const chunks = chunkArray(uncachedIds, CONCURRENCY);
  const fetched: StructureInfo[] = [];

  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(id => this.fetchFromAlphaFoldAPI(id))
    );
    fetched.push(...results.filter(r => r !== null));

    // Cache results immediately
    await this.cacheBatch(results);
  }

  return [...cached, ...fetched];
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
```

---

## Project Structure

```
workers/alphafold-mcp-server/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/
│   │   ├── structure.ts      # get_structure, check_availability
│   │   ├── search.ts         # search_structures
│   │   ├── confidence.ts     # pLDDT analysis tools
│   │   └── batch.ts          # batch operations
│   ├── cache/
│   │   ├── durable-object.ts # AlphaFoldCache DO
│   │   └── schema.sql        # SQLite schema
│   └── utils/
│       ├── rate-limit.ts     # Rate limiting logic
│       ├── api-client.ts     # AlphaFold API client
│       └── validation.ts     # Input validators
├── wrangler.toml
├── package.json
└── tsconfig.json
```

---

## Implementation Phases

| Phase | Scope | Estimated Effort |
|-------|-------|------------------|
| 1 | Core tools (get_structure, check_availability, search) + DO cache | 2 days |
| 2 | Confidence analysis tools + search indexing | 1 day |
| 3 | Batch operations + rate limiting | 1 day |
| 4 | Export tools + comprehensive testing | 1 day |

**Total Estimated Effort:** ~5 days

---

## API Endpoints Reference

Base URL: `https://alphafold.ebi.ac.uk/api`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/prediction/{uniprotId}` | GET | Get prediction for UniProt ID |
| `/prediction?organism={taxId}` | GET | List predictions by organism |
| `/search?q={query}` | GET | Search proteins |

Structure file URLs (from prediction response):
- `pdbUrl` - PDB format
- `cifUrl` - mmCIF format
- `bcifUrl` - Binary CIF format

---

## Notes

- AlphaFold DB is updated quarterly with new predictions
- As of 2024, contains 200M+ structure predictions
- pLDDT (predicted Local Distance Difference Test) scores indicate confidence:
  - >90: Very high confidence
  - 70-90: High confidence
  - 50-70: Low confidence
  - <50: Very low confidence (often disordered regions)
