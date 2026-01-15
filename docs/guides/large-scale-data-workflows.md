# Large-Scale Data Workflows with Code Mode

This guide explains how to leverage Code Mode's code execution and data staging capabilities to work with datasets that would otherwise exceed context window limits.

## Core Principles

### 1. **Think Database-First for Large Datasets**
When dealing with >100 records or complex filtering/aggregation:
- ✅ Stage data in SQLite and query it
- ❌ Don't try to load everything into memory and filter with JavaScript

### 2. **Use SQL for Heavy Lifting**
SQLite in staged data is your most powerful tool:
- Filtering, aggregation, joins, sorting - all happen server-side
- Only bring back the final result set you need
- Can handle millions of rows efficiently

### 3. **Iterate When You Must, Aggregate When You Can**
- Pagination is for presenting results
- Aggregation is for analyzing data
- Use SQL aggregation instead of iterating through pages

## Data Staging Workflow

### When to Stage Data

**Stage data when:**
- Working with >100 records
- Need complex filtering or aggregation
- Combining data from multiple sources
- Performing multi-step analysis
- Need to reference the same dataset multiple times

**Direct retrieval when:**
- Need <20 records
- Simple single-step queries
- Quick lookups by ID

### How Staging Works

Most biomedical MCP servers support staging:

1. **Search/fetch operation** returns staging metadata:
   ```javascript
   const result = await helpers.entrez.invoke('entrez_data', {
     operation: 'fetch_and_stage',
     database: 'pubmed',
     ids: '41337800,41337574,41337123' // Can be 1000+ IDs
   });
   // Returns: { data_access_id: 'pubmed_abc123', table: 'article', row_count: 1000 }
   ```

2. **Query staged data** with SQL:
   ```javascript
   const abstracts = await helpers.entrez.invoke('entrez_data', {
     operation: 'query',
     data_access_id: result.data_access_id,
     sql: 'SELECT pmid, title, abstract FROM article WHERE abstract IS NOT NULL'
   });
   // Returns: { results: [...], row_count: 856 }
   ```

3. **Data persists** for the session (typically 1-2 hours)

## Session-Scoped Database with `helpers.db`

Code Mode provides a **session-scoped SQLite database** via `helpers.db` for working with data that doesn't fit in context. This database is separate from MCP server staging and gives you full control over schema and queries.

### When to Use `helpers.db`

- **Custom data transformations** not supported by MCP server staging
- **Combining data from multiple MCP servers** into a single queryable schema
- **Multi-step analysis** requiring intermediate tables
- **Session state** that persists across multiple code executions
- **Custom aggregations** or computations not expressible in simple SQL

### `helpers.db` API Reference

```javascript
// Execute SQL statement (INSERT, UPDATE, DELETE, CREATE TABLE, etc.)
await helpers.db.exec(sql, params = [])
// Returns: { success: true, rowsRead, rowsWritten }

// Query data (SELECT statements)
const rows = await helpers.db.query(sql, params = [])
// Returns: Array of row objects

// Batch insert records into a table
await helpers.db.batchInsert(table, records)
// records: Array of objects with matching keys to table columns
// Automatically chunks large inserts for efficiency

// Create a table with schema
await helpers.db.createTable(name, schema)
// schema: SQL column definitions (e.g., "id INTEGER PRIMARY KEY, name TEXT")

// Save session state (persists across executions)
await helpers.db.saveState(key, value)
// value: Any JSON-serializable object

// Get session state
const value = await helpers.db.getState(key)
// Returns: Stored value or null

// Get database metrics (size, tables, operations)
const metrics = await helpers.db.getMetrics()
// Returns: { sessionId, databaseSize, lastActivity, tables, executionLogs }
```

### Example: Combining Data from Multiple Sources

```javascript
// Step 1: Fetch data from multiple MCP servers
const pubmedSearch = await helpers.entrez.invoke('entrez_query', {
  operation: 'search',
  database: 'pubmed',
  term: 'KRAS mutations',
  retmax: 500
});

const trials = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_search_studies', {
  query_intr: 'KRAS',
  recrs: 'open',
  pageSize: 200,
  jq_filter: '.'
});

// Step 2: Create tables in session database
await helpers.db.createTable('papers', `
  pmid TEXT PRIMARY KEY,
  title TEXT,
  abstract TEXT,
  pub_date TEXT
`);

await helpers.db.createTable('clinical_trials', `
  nct_id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT,
  phase TEXT,
  enrollment INTEGER
`);

// Step 3: Stage PubMed data and copy to local DB
const pubmedStaged = await helpers.entrez.invoke('entrez_data', {
  operation: 'fetch_and_stage',
  database: 'pubmed',
  ids: pubmedSearch.idlist.join(',')
});

const papers = await helpers.entrez.invoke('entrez_data', {
  operation: 'query',
  data_access_id: pubmedStaged.data_access_id,
  sql: 'SELECT pmid, title, abstract, pub_date FROM article'
});

// Batch insert into local DB
await helpers.db.batchInsert('papers', papers.results);

// Step 4: Insert trial data
await helpers.db.batchInsert('clinical_trials', trials.studies.map(s => ({
  nct_id: s.protocolSection.identificationModule.nctId,
  title: s.protocolSection.identificationModule.briefTitle,
  status: s.protocolSection.statusModule.overallStatus,
  phase: s.protocolSection.designModule?.phases?.join(', '),
  enrollment: s.protocolSection.designModule?.enrollmentInfo?.count
})));

// Step 5: Query across both datasets
const combined = await helpers.db.query(`
  SELECT
    'paper' as source,
    pmid as id,
    title,
    pub_date as date,
    NULL as phase
  FROM papers
  UNION ALL
  SELECT
    'trial' as source,
    nct_id as id,
    title,
    NULL as date,
    phase
  FROM clinical_trials
  ORDER BY date DESC
`);

// Step 6: Advanced analysis with window functions
const analysis = await helpers.db.query(`
  SELECT
    strftime('%Y', pub_date) as year,
    COUNT(*) as paper_count,
    SUM(COUNT(*)) OVER (ORDER BY strftime('%Y', pub_date)) as cumulative
  FROM papers
  WHERE pub_date IS NOT NULL
  GROUP BY year
  ORDER BY year
`);

// Save results for next execution
await helpers.db.saveState('last_analysis', {
  papers: papers.results.length,
  trials: trials.studies.length,
  combined: combined.length,
  timestamp: Date.now()
});

return { combined, analysis };
```

### SQL Guardrails

The session database enforces safety limits:

- **Allowed statements**: SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, CREATE INDEX, DROP TABLE, DROP INDEX, ALTER TABLE
- **Blocked statements**: ATTACH, DETACH, PRAGMA, BEGIN, COMMIT, ROLLBACK (transactions are automatic)
- **Row limits**: Maximum 10,000 rows per query result
- **Timeout**: 30 seconds per query
- **Auto-cleanup**: Session database deleted after 24 hours of inactivity

### SQL Helper Functions

Code Mode includes `helpers.sql` for common query patterns:

```javascript
// Count records by field
const byJournal = await helpers.db.query(
  helpers.sql.countBy('papers', 'journal', { limit: 20, minCount: 5 })
);

// Get top N by score
const topPapers = await helpers.db.query(
  helpers.sql.topN('papers', 'citation_count', 50, ['pmid', 'title'])
);

// Temporal analysis
const byMonth = await helpers.db.query(
  helpers.sql.temporal('papers', 'pub_date', 'month', { minDate: '2023-01-01' })
);

// Text search
const found = await helpers.db.query(
  helpers.sql.textSearch('papers', 'abstract', 'CRISPR', { limit: 100 })
);

// Statistical summary
const stats = await helpers.db.query(
  helpers.sql.statistics('papers', 'citation_count')
);
```

See `lib/code-mode/sql-helpers.ts` for the full list of helper functions.

## Common Patterns

### Pattern 1: Search → Stage → Analyze

Find all papers about a topic, then analyze them:

```javascript
// Step 1: Search for relevant papers
const search = await helpers.entrez.invoke('entrez_query', {
  operation: 'search',
  database: 'pubmed',
  term: 'CRISPR AND cancer AND 2023:2024[pdat]',
  retmax: 1000  // Get up to 1000 results
});

console.log(`Found ${search.count} papers, staging ${search.idlist.length}`);

// Step 2: Stage full data for analysis
const staged = await helpers.entrez.invoke('entrez_data', {
  operation: 'fetch_and_stage',
  database: 'pubmed',
  ids: search.idlist.join(',')
});

console.log(`Staged ${staged.row_count} articles in ${staged.table}`);

// Step 3: Analyze with SQL aggregations
const byJournal = await helpers.entrez.invoke('entrez_data', {
  operation: 'query',
  data_access_id: staged.data_access_id,
  sql: `
    SELECT
      journal,
      COUNT(*) as paper_count,
      GROUP_CONCAT(pmid) as pmids
    FROM article
    WHERE journal IS NOT NULL
    GROUP BY journal
    ORDER BY paper_count DESC
    LIMIT 20
  `
});

// Step 4: Get abstracts from top journals for further analysis
const topJournals = byJournal.results.slice(0, 5).map(r => r.journal);

const topPapers = await helpers.entrez.invoke('entrez_data', {
  operation: 'query',
  data_access_id: staged.data_access_id,
  sql: `
    SELECT pmid, title, abstract, journal, pub_date
    FROM article
    WHERE journal IN (${topJournals.map(j => `'${j.replace(/'/g, "''")}'`).join(',')})
    AND abstract IS NOT NULL
    ORDER BY pub_date DESC
  `
});

return {
  total_found: search.count,
  staged_count: staged.row_count,
  journal_breakdown: byJournal.results,
  top_papers: topPapers.results,
  summary: `Found ${search.count} CRISPR cancer papers from 2023-2024. Top journal: ${byJournal.results[0].journal} with ${byJournal.results[0].paper_count} papers.`
};
```

### Pattern 2: Multi-Source Data Integration

Combine data from multiple databases:

```javascript
// Get gene info from Entrez
const geneSearch = await helpers.entrez.invoke('entrez_query', {
  operation: 'search',
  database: 'gene',
  term: 'TP53[Gene Name] AND Homo sapiens[Organism]'
});

const geneData = await helpers.entrez.invoke('entrez_data', {
  operation: 'fetch_and_stage',
  database: 'gene',
  ids: geneSearch.idlist.join(',')
});

// Get clinical trials for the same gene
const trials = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_search_studies', {
  query_intr: 'TP53',
  recrs: 'open',
  pageSize: 500,
  jq_filter: '.'
});

// Stage trials data if large
if (trials.studies && trials.studies.length > 100) {
  const trialsStaged = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_search_studies', {
    query_intr: 'TP53',
    recrs: 'open',
    pageSize: 1000,
    jq_filter: '.',
    // Some servers auto-stage large results
  });

  // Query both datasets
  const geneInfo = await helpers.entrez.invoke('entrez_data', {
    operation: 'query',
    data_access_id: geneData.data_access_id,
    sql: 'SELECT * FROM gene LIMIT 1'
  });

  return {
    gene: geneInfo.results[0],
    trial_count: trials.totalCount,
    recent_trials: trials.studies.slice(0, 10),
    analysis: `TP53 has ${trials.totalCount} active clinical trials`
  };
}
```

### Pattern 3: Iterative Refinement

When you need to progressively narrow down results:

```javascript
// Start with broad search
let currentDataId = null;
let currentTable = null;

// Stage 1: Get all cancer-related proteins
const stage1 = await helpers.uniprot.invoke('uniprot_search', {
  query: 'cancer AND reviewed:true AND organism:"Homo sapiens"'
});
currentDataId = stage1.dataAccessId;
currentTable = stage1.table;

console.log(`Stage 1: ${stage1.row_count} proteins`);

// Stage 2: Filter to kinases with SQL
const kinases = await helpers.uniprot.invoke('data_manager', {
  operation: 'query',
  data_access_id: currentDataId,
  sql: `
    SELECT accession, name, gene_name
    FROM ${currentTable}
    WHERE protein_type LIKE '%kinase%'
  `
});

console.log(`Stage 2: ${kinases.results.length} kinases`);

// Stage 3: For each kinase, get drug interactions from another database
const kinaseAccessions = kinases.results.slice(0, 50).map(k => k.accession);

// Query DGIdb for drug interactions
const drugInteractions = [];
for (const accession of kinaseAccessions) {
  const drugs = await helpers.dgidb.invoke('search_interactions', {
    gene: accession,
    interaction_types: 'inhibitor'
  });

  if (drugs.length > 0) {
    drugInteractions.push({
      protein: accession,
      drugs: drugs
    });
  }
}

return {
  total_cancer_proteins: stage1.row_count,
  kinase_count: kinases.results.length,
  druggable_kinases: drugInteractions.length,
  top_targets: drugInteractions.slice(0, 10)
};
```

### Pattern 4: Pagination + Aggregation

Handle paginated results efficiently:

```javascript
// Don't do this (inefficient):
// ❌ Fetch all pages into memory
const allResults = [];
for (let page = 0; page < 100; page++) {
  const batch = await helpers.server.invoke('search', { page, pageSize: 100 });
  allResults.push(...batch.results);
}
// Now you have 10,000 records in memory!

// Do this instead (efficient):
// ✅ Use staging and SQL
const allData = await helpers.server.invoke('search_and_stage', {
  query: 'your query',
  maxResults: 10000  // Server handles pagination internally
});

// Then aggregate with SQL
const summary = await helpers.server.invoke('query_staged', {
  data_access_id: allData.data_access_id,
  sql: `
    SELECT
      category,
      COUNT(*) as count,
      AVG(score) as avg_score,
      MAX(score) as max_score
    FROM results
    GROUP BY category
    ORDER BY count DESC
  `
});

// Only bring back aggregated summary (much smaller!)
return summary.results;
```

### Pattern 5: Cross-Database Joins

When you need to correlate data across databases:

```javascript
// Use multiple staging IDs and correlate in code

// Stage 1: Get all genes from pathway
const pathwayGenes = await helpers.entrez.invoke('entrez_query', {
  operation: 'search',
  database: 'gene',
  term: 'apoptosis[Pathway] AND Homo sapiens[Organism]',
  retmax: 500
});

const geneStaged = await helpers.entrez.invoke('entrez_data', {
  operation: 'fetch_and_stage',
  database: 'gene',
  ids: pathwayGenes.idlist.join(',')
});

// Stage 2: Get protein data for those genes
const geneSymbols = await helpers.entrez.invoke('entrez_data', {
  operation: 'query',
  data_access_id: geneStaged.data_access_id,
  sql: 'SELECT DISTINCT gene_symbol FROM gene'
});

// Stage 3: Get variants from CIViC
const allVariants = [];
for (const gene of geneSymbols.results) {
  const variants = await helpers.civic.invoke('search_variants', {
    gene: gene.gene_symbol
  });
  allVariants.push(...variants);
}

// Aggregate findings
return {
  pathway: 'apoptosis',
  gene_count: geneSymbols.results.length,
  variant_count: allVariants.length,
  genes_with_variants: allVariants.map(v => v.gene).filter((v, i, a) => a.indexOf(v) === i).length
};
```

## Advanced SQL Techniques

### Window Functions

Rank and analyze without multiple queries:

```javascript
const ranked = await helpers.server.invoke('query_staged', {
  data_access_id: stagedData.data_access_id,
  sql: `
    SELECT
      name,
      score,
      ROW_NUMBER() OVER (ORDER BY score DESC) as rank,
      PERCENT_RANK() OVER (ORDER BY score DESC) as percentile
    FROM results
    WHERE score > 0
    ORDER BY rank
    LIMIT 100
  `
});
```

### Common Table Expressions (CTEs)

Complex multi-step queries:

```javascript
const analysis = await helpers.entrez.invoke('entrez_data', {
  operation: 'query',
  data_access_id: stagedData.data_access_id,
  sql: `
    WITH recent_papers AS (
      SELECT * FROM article
      WHERE pub_date >= '2023-01-01'
    ),
    highly_cited AS (
      SELECT * FROM recent_papers
      WHERE citation_count > 50
    )
    SELECT
      journal,
      COUNT(*) as paper_count,
      AVG(citation_count) as avg_citations,
      GROUP_CONCAT(pmid) as top_pmids
    FROM highly_cited
    GROUP BY journal
    HAVING paper_count >= 5
    ORDER BY avg_citations DESC
  `
});
```

### JSON Extraction

Many MCP servers store structured data as JSON in SQLite:

```javascript
const parsed = await helpers.server.invoke('query_staged', {
  data_access_id: stagedData.data_access_id,
  sql: `
    SELECT
      id,
      json_extract(metadata, '$.author') as author,
      json_extract(metadata, '$.year') as year,
      json_extract(metadata, '$.citations') as citations
    FROM publications
    WHERE json_extract(metadata, '$.year') >= 2020
    ORDER BY CAST(json_extract(metadata, '$.citations') AS INTEGER) DESC
    LIMIT 50
  `
});
```

## Memory Management Best Practices

### 1. Stream Processing Pattern

Process large datasets in chunks:

```javascript
// Don't load all data at once
// Instead, process in batches

const BATCH_SIZE = 100;
let offset = 0;
const results = [];

while (true) {
  const batch = await helpers.server.invoke('query_staged', {
    data_access_id: stagedData.data_access_id,
    sql: `SELECT * FROM records LIMIT ${BATCH_SIZE} OFFSET ${offset}`
  });

  if (batch.results.length === 0) break;

  // Process batch (filter, transform, aggregate)
  const processed = batch.results
    .filter(r => r.score > 0.5)
    .map(r => ({ id: r.id, score: r.score }));

  results.push(...processed);
  offset += BATCH_SIZE;

  // Limit total results to prevent memory issues
  if (results.length >= 1000) break;
}

return {
  processed_count: results.length,
  top_results: results.slice(0, 20)
};
```

### 2. Summary-First Pattern

Get summaries before fetching details:

```javascript
// First, get summary statistics
const summary = await helpers.server.invoke('query_staged', {
  data_access_id: stagedData.data_access_id,
  sql: `
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT category) as categories,
      AVG(score) as avg_score,
      MAX(score) as max_score
    FROM records
  `
});

console.log(`Dataset: ${summary.results[0].total} records across ${summary.results[0].categories} categories`);

// Then, fetch only top results by category
const topByCategory = await helpers.server.invoke('query_staged', {
  data_access_id: stagedData.data_access_id,
  sql: `
    SELECT category, id, score
    FROM (
      SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY score DESC) as rn
      FROM records
    )
    WHERE rn <= 10
    ORDER BY category, score DESC
  `
});

// Much smaller result set!
return {
  summary: summary.results[0],
  top_by_category: topByCategory.results
};
```

### 3. Temporal Batching

Process time-series data efficiently:

```javascript
// Group by time periods
const monthlyStats = await helpers.server.invoke('query_staged', {
  data_access_id: stagedData.data_access_id,
  sql: `
    SELECT
      strftime('%Y-%m', date) as month,
      COUNT(*) as count,
      AVG(value) as avg_value,
      MIN(value) as min_value,
      MAX(value) as max_value
    FROM events
    WHERE date >= date('now', '-1 year')
    GROUP BY month
    ORDER BY month
  `
});

// Returns only 12 rows instead of potentially thousands!
return monthlyStats.results;
```

## Error Handling for Large Operations

### Timeout Management

```javascript
// Large operations may timeout - handle gracefully

try {
  const largeQuery = await helpers.server.invoke('query_staged', {
    data_access_id: stagedData.data_access_id,
    sql: 'SELECT * FROM huge_table',
    timeout: 60000  // 60 second timeout if supported
  });

  return largeQuery.results;
} catch (error) {
  if (error.message.includes('timeout')) {
    console.log('Query too large, using pagination...');

    // Fall back to paginated approach
    const count = await helpers.server.invoke('query_staged', {
      data_access_id: stagedData.data_access_id,
      sql: 'SELECT COUNT(*) as count FROM huge_table'
    });

    console.log(`Table has ${count.results[0].count} rows - using aggregation instead`);

    const summary = await helpers.server.invoke('query_staged', {
      data_access_id: stagedData.data_access_id,
      sql: 'SELECT category, COUNT(*) as count FROM huge_table GROUP BY category'
    });

    return summary.results;
  }
  throw error;
}
```

### Data Access ID Expiry

```javascript
// Staged data expires after a session timeout
// Always check and re-stage if needed

let dataAccessId = null;
let lastStaged = null;

async function ensureDataStaged(query) {
  const now = Date.now();

  // Re-stage if more than 30 minutes old
  if (!dataAccessId || !lastStaged || (now - lastStaged) > 30 * 60 * 1000) {
    console.log('Staging data...');

    const staged = await helpers.server.invoke('search_and_stage', {
      query: query
    });

    dataAccessId = staged.data_access_id;
    lastStaged = now;

    console.log(`Staged ${staged.row_count} records`);
  }

  return dataAccessId;
}

// Usage
const dataId = await ensureDataStaged('TP53');
const results = await helpers.server.invoke('query_staged', {
  data_access_id: dataId,
  sql: 'SELECT * FROM data LIMIT 100'
});
```

## Performance Optimization Checklist

- [ ] Use SQL aggregation instead of JavaScript loops
- [ ] Limit result sets with `LIMIT` clauses
- [ ] Index lookups when querying multiple times (if server supports)
- [ ] Use `COUNT(*)` before fetching full data
- [ ] Batch related queries together
- [ ] Avoid `SELECT *` - only fetch columns you need
- [ ] Use CTEs for complex multi-step queries
- [ ] Stage data once, query multiple times
- [ ] Process in batches for very large datasets
- [ ] Monitor memory usage in console logs

## When NOT to Use Staging

Staging has overhead. Avoid for:

- Single-record lookups by ID
- Simple queries with <20 expected results
- Real-time queries where freshness matters
- Quick exploratory searches
- When you need just metadata (titles, counts, etc.)

## Server-Specific Staging Features

### Entrez (PubMed, Gene, Protein, etc.)

```javascript
// Supports staging via entrez_data
const staged = await helpers.entrez.invoke('entrez_data', {
  operation: 'fetch_and_stage',
  database: 'pubmed',
  ids: '123,456,789',
  rettype: 'xml'  // Format affects what fields are available
});

// Schema varies by database
// Common fields: pmid/uid, title, abstract, pub_date, journal, authors
```

### ClinicalTrials.gov

```javascript
// Large searches auto-stage
const staged = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_search_studies', {
  query_cond: 'cancer',
  pageSize: 1000,
  jq_filter: '.'  // Required parameter
});

// Query with SQL if staged
if (staged.data_access_id) {
  const byPhase = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_query_data', {
    data_access_id: staged.data_access_id,
    sql: 'SELECT phase, COUNT(*) as count FROM studies GROUP BY phase'
  });
}
```

### UniProt

```javascript
// Search auto-stages large results
const proteins = await helpers.uniprot.invoke('uniprot_search', {
  query: 'cancer AND reviewed:true'
});

// If staged, can query protein features, domains, etc.
if (proteins.dataAccessId) {
  const kinases = await helpers.uniprot.invoke('data_manager', {
    operation: 'query',
    data_access_id: proteins.dataAccessId,
    sql: `SELECT * FROM protein WHERE protein_type LIKE '%kinase%'`
  });
}
```

## Conclusion

Code Mode with data staging enables you to:

1. **Handle millions of records** that would overflow context windows
2. **Perform complex analysis** using SQL instead of token-heavy iterations
3. **Combine multiple data sources** efficiently
4. **Iterate on analysis** without re-fetching data
5. **Deliver concise results** by aggregating server-side

**Remember**: Think like a database developer, not just a JavaScript programmer. SQL is your most powerful tool for large-scale data work.
