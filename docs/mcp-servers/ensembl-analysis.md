# Ensembl MCP Server Analysis

## Source Repository
https://github.com/Augmented-Nature/Ensembl-MCP-Server

## Overview
- **Tools:** 19
- **Language:** TypeScript
- **API:** rest.ensembl.org
- **Current Issues:** No caching, sequential batching

## Tool Categories

### Gene/Transcript (3 tools)
- `lookup_gene` - Get gene info by ID
- `get_transcripts` - List transcripts for a gene
- `search_genes` - Search genes by name/symbol

### Sequence (3 tools)
- `get_sequence` - Genomic/cDNA sequence
- `get_cds_sequence` - Coding sequence only
- `translate_sequence` - Protein translation

### Comparative Genomics (2 tools)
- `get_homologs` - Orthologs/paralogs across species
- `get_gene_tree` - Phylogenetic tree

### Variants (2 tools)
- `get_variants` - Known variants for a gene
- `get_variant_consequences` - Variant effect predictions

### Regulatory (2 tools)
- `get_regulatory_features` - Enhancers, promoters, etc.
- `get_motif_features` - TF binding motifs

### Reference (7 tools)
- Assembly info, species lookup, coordinate mapping, etc.

## API Endpoints Used

Base URL: `https://rest.ensembl.org`

| Endpoint | Description |
|----------|-------------|
| `/lookup/id/{id}` | Gene/transcript lookup |
| `/sequence/id/{id}` | Sequence retrieval |
| `/homology/id/{id}` | Homolog data |
| `/vep/{species}/id/{id}` | Variant consequences |
| `/regulatory/species/{species}/id/{id}` | Regulatory features |

## Recommendation: BUILD FRESH

### Rationale
1. No caching in existing implementation
2. Sequential batching (can be parallelized)
3. Outdated MCP SDK (0.5.0)
4. Missing rate limiting

### High-Value Caching Targets
- **Gene lookups** - Ensembl stable IDs rarely change
- **Assembly/species info** - Static per release
- **Homolog data** - Updated monthly at most

## Cloudflare Implementation Plan

### Durable Object Structure
```
EnsemblCache DO - sharded by species + chromosome
├── genes table (indexed by stable ID)
├── transcripts table (linked to genes)
├── sequences table (cached on demand)
└── homologs table (cross-species links)
```

### SQLite Schema
```sql
CREATE TABLE genes (
  ensembl_id TEXT PRIMARY KEY,
  species TEXT,
  chromosome TEXT,
  start_pos INTEGER,
  end_pos INTEGER,
  strand INTEGER,
  gene_name TEXT,
  description TEXT,
  biotype TEXT,
  fetched_at INTEGER,
  expires_at INTEGER
);

CREATE TABLE sequences (
  ensembl_id TEXT,
  seq_type TEXT,  -- genomic, cds, protein
  sequence TEXT,
  PRIMARY KEY (ensembl_id, seq_type)
);

CREATE INDEX idx_gene_name ON genes(gene_name);
CREATE INDEX idx_species_chr ON genes(species, chromosome);
```

### Rate Limiting
- Per-IP: 100 req/min
- Global: 1000 req/min
- Batch ops: 10 req/min

## Estimated Effort
~5 days for full implementation with caching

## Dependencies
- Integrates with UniProt for protein data
- Cross-references with NCBI Gene IDs
- Used by OpenTargets for target validation

---
*Analysis by Worker-Delta, 2026-01-28*
