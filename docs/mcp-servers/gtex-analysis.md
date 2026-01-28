# GTEx MCP Server Analysis

## Source Repository
https://github.com/Augmented-Nature/GTEx-MCP-Server

## Overview
- **Tools:** 25
- **Language:** TypeScript
- **API:** GTEx Portal API
- **Current Issues:** No caching (same pattern as others)
- **Caching Value:** VERY HIGH - expression data is static per GTEx release

## Tool Categories

### Expression (7 tools)
| Tool | Description |
|------|-------------|
| `get_gene_expression` | Expression across tissues for a gene |
| `get_median_gene_expression` | Median TPM values per tissue |
| `get_tissue_specific_genes` | Genes highly expressed in specific tissue |
| `get_top_expressed_genes` | Top N genes per tissue |
| `compare_expression` | Compare gene expression across tissues |
| `get_expression_by_sex` | Sex-stratified expression |
| `get_expression_by_age` | Age-stratified expression |

### eQTL/sQTL Analysis (6 tools)
| Tool | Description |
|------|-------------|
| `get_eqtl_genes` | Genes with significant eQTLs |
| `get_single_tissue_eqtls` | eQTLs for one tissue |
| `get_multi_tissue_eqtls` | Cross-tissue eQTL analysis |
| `get_sqtl_genes` | Splice QTL genes |
| `get_variant_eqtls` | eQTLs for a specific variant |
| `get_gene_eqtls` | All eQTLs for a gene |

### Reference Data (12 tools)
| Tool | Description |
|------|-------------|
| `search_genes` | Gene search by name/symbol |
| `get_tissue_info` | Tissue metadata |
| `get_variants` | Variant info |
| `list_tissues` | Available tissues |
| `get_sample_counts` | Sample counts per tissue |
| ... | + 7 more reference tools |

## API Endpoints

Base URL: `https://gtexportal.org/api/v2`

Key endpoints:
- `/expression/geneExpression` - Gene expression data
- `/eqtl/singleTissueEqtl` - Single tissue eQTLs
- `/eqtl/multiTissueEqtl` - Multi-tissue eQTLs
- `/reference/gene` - Gene reference data
- `/reference/tissue` - Tissue metadata

## Recommendation: BUILD FRESH

### Rationale
1. **Very high caching value** - GTEx releases are static (v8 is latest)
2. Expression data doesn't change between releases
3. eQTL results are computationally expensive to regenerate
4. No caching in existing implementation

### High-Value Caching Targets
- **Median expression** - Static per release, frequently queried
- **Tissue-specific genes** - Precomputable
- **eQTL results** - Large, static datasets
- **Reference data** - Tissues, genes, variants

## Cloudflare Implementation Plan

### Durable Object Structure
```
GTExCache DO - sharded by data type
├── ExpressionCache (by gene)
├── eQTLCache (by gene + tissue)
├── ReferenceCache (tissues, genes)
└── QueryCache (precomputed summaries)
```

### SQLite Schema
```sql
-- Median gene expression (preloaded)
CREATE TABLE median_expression (
  gene_id TEXT,
  tissue_id TEXT,
  median_tpm REAL,
  n_samples INTEGER,
  PRIMARY KEY (gene_id, tissue_id)
);

-- eQTL results
CREATE TABLE eqtls (
  variant_id TEXT,
  gene_id TEXT,
  tissue_id TEXT,
  pvalue REAL,
  effect_size REAL,
  PRIMARY KEY (variant_id, gene_id, tissue_id)
);

-- Tissue reference
CREATE TABLE tissues (
  tissue_id TEXT PRIMARY KEY,
  tissue_name TEXT,
  tissue_site TEXT,
  sample_count INTEGER
);

CREATE INDEX idx_expr_tissue ON median_expression(tissue_id);
CREATE INDEX idx_eqtl_gene ON eqtls(gene_id);
CREATE INDEX idx_eqtl_pvalue ON eqtls(pvalue);
```

### Data Loading Strategy
- **Preload median expression** for all genes (small dataset)
- **Cache eQTLs on demand** (large dataset)
- **Batch precompute** tissue-specific genes

### Rate Limiting
- Per-IP: 100 req/min
- Global: 500 req/min (GTEx API is slower)
- Large queries: 5 req/min

## Estimated Effort
~5 days for full implementation with caching

## Use Cases
- **Target validation** - Is my target expressed in relevant tissue?
- **Drug safety** - Expression in off-target tissues
- **eQTL colocalization** - GWAS signal interpretation
- **Tissue specificity** - Biomarker discovery

## Dependencies
- Ensembl gene IDs for cross-referencing
- dbSNP variant IDs
- Useful with OpenTargets for target assessment

---
*Analysis by Worker-Delta, 2026-01-28*
