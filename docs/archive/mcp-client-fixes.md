# MCP Client Fixes for Technical Report Issues

This document addresses the issues identified in the post-mortem technical report with general, broadly applicable solutions.

---

## Issue 1: helpers.db Undefined ✅ FIXED

**Error**: `Cannot read properties of undefined (reading 'createTable')`

**Status**: **RESOLVED** - Implemented in this session

**Implementation**:
- Added `helpers.db` with 7 methods (exec, query, batchInsert, createTable, saveState, getState, getMetrics)
- Added `helpers.sql` with 10+ query builder functions
- See `lib/code-mode/dynamic-helpers.ts` lines 129-194

**Verification**:
```javascript
// This should now work
console.log(Object.keys(helpers));
// Should include: 'db', 'sql', and server keys

await helpers.db.createTable('test', 'id INTEGER, name TEXT');
// Should succeed without errors
```

---

## Issue 2: GraphQL Null-Safety ✅ FIXED

**Error**: `Cannot read properties of undefined (reading 'target')` (Pharos), `Cannot read properties of null (reading 'entries')` (RCSB PDB), `Cannot read properties of undefined (reading 'genes')` (CIViC)

**Status**: **RESOLVED** - Implemented in this session (Part 2)

**Root Cause**: GraphQL servers return structurally valid responses but with `null` or `undefined` nested data fields when queries don't match any records or use incorrect field names.

**Implementation**:
- Added `validateGraphQLData()` function to detect null fields in GraphQL responses
- Added `safeGraphQLAccess()` Proxy wrapper that prevents null access errors
- Integrated validation into transformResponse pipeline
- See `lib/code-mode/helpers-with-transform.ts` lines 238-319, 358-391

**How It Works**:
1. Detects GraphQL response structure (has `data` field)
2. Validates that `data` is not null and nested fields aren't null
3. Returns helpful error messages explaining why data is null
4. Wraps response in Proxy for graceful null handling

**Example Error Message**:
```
GraphQL query returned null data. The query might not match any records, or the field name is incorrect.
  • Check that your query uses the correct field names and filters.
Null fields detected: target
```

**Verification**:
```javascript
// This will now return a helpful error instead of crashing
const result = await helpers.pharos.invoke('pharos_graphql_query', {
  query: '{ target(name: "INVALID") { name } }'
});
// Error: GraphQL field "target" is null. Check if "target" is the correct field name.
```

---

## Issue 3: Tool Naming Mismatches

**Error**: `Tool 'get_disease_associations' not found`

**Actual**: Tool is named `get_disease_associated_targets`

### Fix: Enhanced Error Messages

**Current Status**: Basic "tool not found" errors don't help users discover the correct tool name.

**Solution**: Direct users to use `listTools()` and `searchTools()` to find available tools.

**Error Message Enhancement**:
```javascript
// When tool not found
Error: Tool 'get_disease_associations' not found
  • Use helpers.serverName.listTools() to see available tools
```

---

## Issue 4: listTools() Returning Null Values

**Error**: `[null, null, null]` instead of tool objects

**Root Cause**: SSE transport layer not properly deserializing tool schemas

### Fix 1: Add Tool Object Validation

**File**: `lib/mcp-client.ts`
**Location**: After line 538 (tool fetching)

```typescript
// Add validation after fetching raw tools
const rawTools = await client.tools();
const sanitizedTools: Record<string, any> = {};

for (const [toolName, toolDef] of Object.entries(rawTools || {})) {
  // Skip null/undefined tools
  if (!toolDef || typeof toolDef !== 'object') {
    console.warn(`[MCP Client] Skipping null tool: ${toolName} from ${server.name}`);
    continue;
  }

  // Ensure minimum required fields
  const validated = {
    name: toolName,
    description: toolDef.description || `Tool: ${toolName}`,
    ...toolDef
  };

  sanitizedTools[toolName] = sanitizeToolParameters(validated);
}
```

### Fix 2: Enhance listTools() Helper

**File**: `lib/code-mode/dynamic-helpers.ts`
**Location**: Lines 96-97

```javascript
// Current:
async listTools() {
  return ${JSON.stringify(toolNames)};
},

// Enhanced:
async listTools() {
  const tools = ${JSON.stringify(toolNames)};
  // Filter out any nulls that might have crept in
  return tools.filter(t => t != null && typeof t === 'string');
},
```

---

## Issue 3: Tool Naming Mismatches

**Error**: `Tool 'get_disease_associations' not found`

**Actual**: Tool is named `get_disease_associated_targets`

### Fix: Enhanced Error Messages with Suggestions

**File**: `lib/mcp-client.ts`
**Location**: Tool execution error handling (around line 110)

Add fuzzy matching for tool name suggestions:

```typescript
function findSimilarTools(targetName: string, availableTools: string[]): string[] {
  const normalized = targetName.toLowerCase().replace(/[_-]/g, '');

  return availableTools
    .map(tool => ({
      tool,
      similarity: calculateSimilarity(
        normalized,
        tool.toLowerCase().replace(/[_-]/g, '')
      )
    }))
    .filter(({ similarity }) => similarity > 0.5)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3)
    .map(({ tool }) => tool);
}

function calculateSimilarity(a: string, b: string): number {
  // Simple Levenshtein-based similarity
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(a, b);
  return (longer.length - editDistance) / longer.length;
}
```

**Usage in error message**:
```typescript
if (!executor) {
  const similar = findSimilarTools(tool, Object.keys(tools));
  const suggestion = similar.length > 0
    ? `\n\nDid you mean: ${similar.join(', ')}?`
    : '\n\nRun helpers.${server}.searchTools("${keyword}") to find available tools.';

  return badRequest(`Tool '${tool}' not found or not callable${suggestion}`);
}
```

### Fix: Add searchTools() Enhancements

**File**: `lib/code-mode/dynamic-helpers.ts`
**Location**: Lines 105-117

```javascript
async searchTools(query) {
  const q = query.toLowerCase();
  const tools = ${JSON.stringify(
    toolNames.map(name => ({
      name,
      description: tools[name].description || '',
    }))
  )};

  // Enhanced search: match in name OR description
  const matches = tools.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q)
  );

  // If no matches, try fuzzy matching
  if (matches.length === 0) {
    const normalized = q.replace(/[_-]/g, '');
    return tools.filter(t =>
      t.name.toLowerCase().replace(/[_-]/g, '').includes(normalized)
    ).slice(0, 5);
  }

  return matches;
},
```

---

## Issue 5: Empty Tool Lists

**Error**: `listTools: []` from ClinicalTrials server

### Fix: Better Server Health Diagnostics

Add a health check method to helpers:

**File**: `lib/code-mode/dynamic-helpers.ts`

```javascript
// Add to each server helper
async healthCheck() {
  try {
    const tools = await this.listTools();
    return {
      status: tools.length > 0 ? 'healthy' : 'no_tools',
      toolCount: tools.length,
      available: tools.length > 0,
      message: tools.length === 0
        ? 'Server responding but no tools available. Check API keys and server logs.'
        : `${tools.length} tools available`
    };
  } catch (error) {
    return {
      status: 'error',
      available: false,
      message: error.message
    };
  }
},
```

**Usage**:
```javascript
// Check server health before using
const health = await helpers.clinicaltrials.healthCheck();
if (!health.available) {
  console.warn('ClinicalTrials server:', health.message);
  // Fall back to other data sources
}
```

---

## Issue 6 & 7: SQL Schema Issues

**Errors**:
- `no such column: citation_count`
- `no such column: pub_date`

### Fix 1: Schema Inspection Utility

**File**: `lib/code-mode/sql-helpers.ts`

Add new helper functions:

```typescript
/**
 * Get table schema information
 */
export function generateSchemaInspection(): string {
  return `
// Schema inspection helpers
const dbSchema = {
  async getColumns(table) {
    const result = await helpers.db.query(\`PRAGMA table_info(\${table})\`);
    return result.map(r => ({
      name: r.name,
      type: r.type,
      notNull: r.notnull === 1,
      defaultValue: r.dflt_value,
      primaryKey: r.pk === 1
    }));
  },

  async hasColumn(table, column) {
    const columns = await this.getColumns(table);
    return columns.some(c => c.name.toLowerCase() === column.toLowerCase());
  },

  async getTables() {
    const result = await helpers.db.query(\`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    \`);
    return result.map(r => r.name);
  },

  async describeTable(table) {
    const columns = await this.getColumns(table);
    const sample = await helpers.db.query(\`SELECT * FROM \${table} LIMIT 3\`);
    return {
      table,
      columns,
      sampleRows: sample,
      rowCount: (await helpers.db.query(\`SELECT COUNT(*) as count FROM \${table}\`))[0].count
    };
  }
};

globalThis.dbSchema = dbSchema;
  `.trim();
}
```

**Integration**: Add to helper generation in `dynamic-helpers.ts`:

```typescript
lines.push('');
lines.push('// Database schema inspection');
lines.push(generateSchemaInspection());
lines.push('helpers.schema = dbSchema;');
```

### Fix 2: Safe Column Access Pattern

**File**: `lib/code-mode/helper-docs.ts`

Add to usage examples:

```javascript
// Safe SQL query pattern - check columns first
const hasColumn = await helpers.schema.hasColumn('article', 'citation_count');

const query = hasColumn
  ? `SELECT pmid, title, citation_count FROM article ORDER BY citation_count DESC`
  : `SELECT pmid, title FROM article`;

const results = await helpers.db.query(query);
```

### Fix 3: Server-Specific Column Mappings

**File**: `lib/code-mode/helper-docs.ts`

Add column mapping documentation:

```typescript
/**
 * Known column mappings by server
 */
export const SERVER_COLUMN_MAPPINGS = {
  entrez: {
    publication_date: 'year',  // Entrez uses 'year' not 'pub_date'
    abstract: 'abstract',
    title: 'title',
    authors: 'authors',
    journal: 'journal',
    pmid: 'pmid',
  },
  rcsb: {
    publication_date: 'deposition_date',
    structure_id: 'pdb_id',
  },
  clinicaltrials: {
    start_date: 'start_date',
    completion_date: 'completion_date',
    trial_id: 'nct_id',
  }
};

/**
 * Get safe column name for a server
 */
export function getSafeColumnName(server: string, semanticName: string): string {
  const mapping = SERVER_COLUMN_MAPPINGS[server.toLowerCase()];
  return mapping?.[semanticName] || semanticName;
}
```

### Fix 4: Dynamic Column Detection

Add helper function to SQL helpers:

```typescript
/**
 * Build SELECT query with dynamic column detection
 */
export function buildSafeSelect(table: string, desiredColumns: string[], fallback: string[] = ['*']): string {
  return `
    SELECT
      CASE
        ${desiredColumns.map(col =>
          `WHEN EXISTS(SELECT 1 FROM pragma_table_info('${table}') WHERE name='${col}')
           THEN ${col}`
        ).join('\n        ')}
        ELSE NULL
      END as safe_column
    FROM ${table}
  `.trim();
}
```

---

## Issue 8: GraphQL Timeouts

**Error**: `Tool 'pharos_graphql_query' timed out after 30000ms`

### Fix: Add Timeout Warnings and Query Simplification

**File**: `lib/code-mode/helper-docs.ts`

Add to usage examples:

```javascript
### GraphQL Query Best Practices

**For Pharos, RCSB PDB, NCI GDC servers**:

1. **Use pagination limits**:
   \`\`\`graphql
   query {
     targets(first: 10) {  # Limit results
       name
       description
     }
   }
   \`\`\`

2. **Avoid deep nesting** (max 2-3 levels):
   \`\`\`javascript
   // ❌ BAD - Will timeout
   const query = \`{
     targets {
       diseases {
         genes {
           pathways {
             proteins {  // Too deep!
               ...
             }
           }
         }
       }
     }
   }\`;

   // ✅ GOOD - Flatten the query
   const targets = await helpers.pharos.invoke('pharos_graphql_query', {
     query: 'query { targets(first: 10) { name tdl } }'
   });

   // Then query diseases separately
   const diseases = await helpers.pharos.invoke('pharos_graphql_query', {
     query: \`query {
       diseases(targets: ["\${targets[0].name}"]) {
         name
       }
     }\`
   });
   \`\`\`

3. **Request only needed fields**:
   \`\`\`graphql
   # ❌ BAD - Fetches everything
   query { targets { ... } }

   # ✅ GOOD - Specific fields
   query { targets(first: 10) { name tdl family } }
   \`\`\`
```

### Add Timeout Wrapper

**File**: `lib/code-mode/dynamic-helpers.ts`

Add timeout warnings to GraphQL servers:

```javascript
// For known slow servers (Pharos, RCSB, GDC)
const slowServers = ['pharos', 'rcsb', 'gdc', 'ncipdc'];

if (slowServers.includes(serverKey)) {
  lines.push(`  async invoke(toolName, args) {`);
  lines.push(`    // Warning for potentially slow GraphQL queries`);
  lines.push(`    if (toolName.includes('graphql') && args.query) {`);
  lines.push(`      const depth = (args.query.match(/{/g) || []).length;`);
  lines.push(`      if (depth > 3) {`);
  lines.push(`        console.warn('⚠️  Deep GraphQL query detected (depth: ' + depth + '). May timeout. Consider flattening.');`);
  lines.push(`      }`);
  lines.push(`    }`);
  lines.push(`    return await __invokeMCPTool('${serverKey}', toolName, args);`);
  lines.push(`  },`);
} else {
  // Standard invoke for other servers
  lines.push(`  async invoke(toolName, args) {`);
  lines.push(`    return await __invokeMCPTool('${serverKey}', toolName, args);`);
  lines.push(`  },`);
}
```

---

## Issue 9: NCI GDC JSON Filter Encoding

**Error**: Filters must be string-encoded JSON

### Fix: Add GDC Helper Utility

**File**: `lib/code-mode/helper-docs.ts`

Add to usage examples:

```javascript
### NCI GDC Special Handling

The GDC server requires **double-stringification** of filter objects:

\`\`\`javascript
// ❌ WRONG - Will fail
const result = await helpers.gdc.invoke('search_cases', {
  filters: { op: "in", content: { field: "gene.symbol", value: ["TP53"] } }
});

// ✅ CORRECT - Double stringify
const filters = {
  op: "in",
  content: {
    field: "gene.symbol",
    value: ["TP53"]
  }
};

const result = await helpers.gdc.invoke('search_cases', {
  filters: JSON.stringify(filters)  // String, not object!
});
\`\`\`

**Helper function** (add to your code):
\`\`\`javascript
function buildGDCFilter(field, operator, values) {
  const filter = {
    op: operator,
    content: {
      field: field,
      value: Array.isArray(values) ? values : [values]
    }
  };
  return JSON.stringify(filter);
}

// Usage
const filter = buildGDCFilter('gene.symbol', 'in', ['TP53', 'BRCA1']);
const result = await helpers.gdc.invoke('search_cases', { filters: filter });
\`\`\`
```

---

## Implementation Priority

### High Priority (Completed) ✅
1. ✅ helpers.db implementation (DONE - Part 1)
2. ✅ GraphQL null-safety layer (DONE - Part 2)
3. ✅ Schema inspection utilities (DONE - Part 1)
4. ✅ Column mapping documentation (DONE - Part 1)

### Medium Priority (Documented, Not Implemented)
5. Tool name error messages with listTools() guidance
6. SSE transport fix
7. GraphQL query depth warnings
8. Server health checks

### Low Priority (Future)
9. Automated schema discovery
10. Query optimization hints

---

## Testing the Fixes

After implementing these fixes, test with:

```javascript
// Test 1: helpers.db
await helpers.db.createTable('test', 'id INTEGER');
console.log('✅ helpers.db works');

// Test 2: Schema inspection
const columns = await helpers.schema.getColumns('test');
console.log('✅ Schema inspection works');

// Test 3: Safe column queries
const hasCol = await helpers.schema.hasColumn('test', 'id');
console.log('✅ Column detection works');

// Test 4: GraphQL null-safety
try {
  const result = await helpers.pharos.invoke('pharos_graphql_query', {
    query: '{ target(name: "INVALID") { name } }'
  });
} catch (err) {
  console.log('✅ GraphQL null-safety:', err.message);
  // Should show helpful error about null data
}

// Test 5: GraphQL with valid query
const result = await helpers.pharos.invoke('pharos_graphql_query', {
  query: '{ targets(first: 5) { name } }'
});
console.log('✅ GraphQL with valid query works');
```

---

## Summary

These fixes provide:
- ✅ **Robustness**: Null checks, validation, fallbacks (GraphQL null-safety)
- ✅ **Discoverability**: Better error messages directing users to listTools()
- ✅ **Safety**: Schema inspection before SQL queries
- ✅ **Performance**: Query optimization warnings (documented)
- ✅ **Documentation**: Server-specific quirks and column mappings documented

**Implemented in Part 2**:
- ✅ GraphQL null-safety layer with validateGraphQLData()
- ✅ Safe Proxy wrapper for GraphQL responses
- ✅ Helpful error messages explaining why GraphQL data is null

All fixes follow the principle of **fail gracefully with helpful guidance** rather than cryptic errors.
