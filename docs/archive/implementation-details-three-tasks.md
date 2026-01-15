# Implementation Details: Three High-Priority Tasks

Detailed analysis of the three missing features from the codemode-wip branch.

---

## 🟡 Task 1: `helpers.db` API (Missing, ~80 lines, Medium effort)

### What It Is
A session-scoped SQLite database API that gives Code Mode direct access to persistent storage within a session. This allows models to create custom tables, combine data from multiple MCP servers, and perform complex SQL operations that exceed context window limits.

### Current Status
- **Main branch**: ❌ Missing entirely
- **Codemode-wip**: ✅ Fully implemented
- **Dependencies**: Requires `workers/codemode/src/database.ts` (Durable Object) and `__invokeDB()` global function

### API Surface

```javascript
helpers.db = {
  // Execute non-SELECT SQL (INSERT, UPDATE, DELETE, CREATE TABLE)
  async exec(sql, params = [])
  // Returns: { success: true, rowsRead, rowsWritten }

  // Query data (SELECT statements)
  async query(sql, params = [])
  // Returns: Array of row objects

  // Batch insert records into a table (auto-chunked for efficiency)
  async batchInsert(table, records)
  // records: Array of objects with matching keys to table columns

  // Create a table with SQL schema
  async createTable(name, schema)
  // schema: "id INTEGER PRIMARY KEY, name TEXT, score REAL"

  // Save session state (persists across code executions)
  async saveState(key, value)
  // value: Any JSON-serializable object

  // Get session state
  async getState(key)
  // Returns: Stored value or null

  // Get database metrics
  async getMetrics()
  // Returns: { sessionId, databaseSize, lastActivity, tables, executionLogs }
}
```

### Implementation Location
**File**: `lib/code-mode/helpers-with-transform.ts`
**Lines**: Add ~94 lines after line 765 (in codemode-wip)

```javascript
// Database helper for SQLite operations
const __memDb = { tables: new Map() };
helpers.db = {
  async exec(sql, params = []) {
    if (typeof __invokeDB === "function") {
      const result = await __invokeDB("exec", { sql, params });
      return result;
    }
    // Fallback: in-memory implementation
    return { success: true, mode: "memory" };
  },
  // ... other methods
};
```

### Key Features

1. **Dual Mode**:
   - **Production**: Uses Durable Object SQLite (`__invokeDB()`)
   - **Fallback**: In-memory storage when DO unavailable

2. **Auto-Chunking**: `batchInsert()` automatically chunks large inserts (500-1000 rows per batch)

3. **Session Persistence**: Data persists for 24 hours of inactivity

4. **SQL Guardrails**:
   - Allows: SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, CREATE INDEX, DROP TABLE, ALTER TABLE
   - Blocks: ATTACH, DETACH, PRAGMA, BEGIN, COMMIT, ROLLBACK (security)
   - Row limit: 10,000 max per query
   - Timeout: 30 seconds

### Use Cases

**Example 1: Combining Multiple MCP Servers**
```javascript
// Fetch from PubMed
const papers = await helpers.entrez.invoke('entrez_data', { ... });

// Fetch from ClinicalTrials.gov
const trials = await helpers.clinicaltrials.invoke('search_studies', { ... });

// Create combined table
await helpers.db.createTable('combined', `
  id TEXT PRIMARY KEY,
  source TEXT,
  title TEXT,
  date TEXT
`);

// Insert data from both sources
await helpers.db.batchInsert('combined', [
  ...papers.map(p => ({ id: p.pmid, source: 'pubmed', title: p.title, date: p.pub_date })),
  ...trials.map(t => ({ id: t.nct_id, source: 'trial', title: t.title, date: t.start_date }))
]);

// Query across both datasets
const recent = await helpers.db.query(`
  SELECT * FROM combined
  WHERE date >= '2024-01-01'
  ORDER BY date DESC
  LIMIT 50
`);
```

**Example 2: Session State Management**
```javascript
// Save progress for multi-step analysis
await helpers.db.saveState('analysis_progress', {
  step: 3,
  processed: 1500,
  lastId: 'NCT12345678'
});

// Later execution can resume
const state = await helpers.db.getState('analysis_progress');
console.log(`Resuming from step ${state.step}`);
```

### Documentation Reference
- `MCP_CLIENT_FIXES.md` lines 5-26
- `SESSION_SUMMARY.md` Part 1
- `docs/large-scale-data-workflows.md` lines 66-266
- `SQLITE_DB_IMPLEMENTATION.md` (entire document)

### Integration Points
1. **Worker**: Must implement `__invokeDB()` global function
2. **Database DO**: Must export `CodeModeDatabase` class
3. **Helper Docs**: Add documentation to system prompt

---

## 🟡 Task 2: Schema Inspection (Partial, ~120 lines, Medium effort)

### What It Is
Runtime utilities that help models discover table schemas dynamically, find correct column names, and avoid common SQL errors when working with staged data from MCP servers.

### Current Status
- **Main branch**: ⚠️ Partially implemented (base SQL helpers exist)
- **Codemode-wip**: ✅ Full implementation with schema inspection
- **File**: `lib/code-mode/sql-helpers.ts`
- **Missing**: 124 lines of code (schema inspection + column mappings)

### API Surface

```javascript
// Available as globalThis.dbSchema in Code Mode
dbSchema = {
  // Get all columns for a table
  async getColumns(table)
  // Returns: [{ name, type, notNull, defaultValue, primaryKey }, ...]

  // Check if a column exists (case-insensitive)
  async hasColumn(table, column)
  // Returns: boolean

  // List all tables in database
  async getTables()
  // Returns: ['table1', 'table2', ...]

  // Get full table description with sample data
  async describeTable(table)
  // Returns: { table, columns, sampleRows, rowCount }

  // Find column by semantic name (fuzzy matching)
  async findColumn(table, semanticName)
  // Returns: actual column name or null
}
```

### Server-Specific Column Mappings

```javascript
export const SERVER_COLUMN_MAPPINGS = {
  entrez: {
    publication_date: 'year',    // Entrez uses 'year' not 'pub_date'!
    pub_date: 'year',
    date: 'year',
    citation_count: 'citation_count', // May not exist
  },
  rcsb: {
    publication_date: 'deposition_date',
    structure_id: 'pdb_id',
  },
  clinicaltrials: {
    trial_id: 'nct_id',
    id: 'nct_id',
  },
  // ... more servers
}

// Helper function
export function getSafeColumnName(server, semanticName): string
```

### Implementation Location
**File**: `lib/code-mode/sql-helpers.ts`
**Location**: After line 297 (end of `buildWhereClause`)

**Add**:
1. `generateSchemaInspection()` function (~70 lines)
2. `SERVER_COLUMN_MAPPINGS` object (~40 lines)
3. `getSafeColumnName()` function (~5 lines)

### How It Works

**Problem**: Different MCP servers use different column names for the same semantic concept.

**Example Issue**:
```javascript
// User wants publication date, tries common name:
const papers = await helpers.db.query(`
  SELECT * FROM article WHERE pub_date >= '2024-01-01'
`);
// ERROR: no such column: pub_date
// Entrez actually uses 'year' not 'pub_date'
```

**Solution 1: Dynamic Schema Inspection**
```javascript
// Check what columns are actually available
const columns = await dbSchema.getColumns('article');
console.log(columns);
// [{ name: 'year', type: 'INTEGER', ... }, { name: 'title', type: 'TEXT', ... }]

// Use fuzzy matching to find the right column
const dateColumn = await dbSchema.findColumn('article', 'publication_date');
console.log(dateColumn); // 'year'
```

**Solution 2: Server Mappings**
```javascript
import { getSafeColumnName } from '@/lib/code-mode/sql-helpers';

// Automatically translates semantic names to actual column names
const column = getSafeColumnName('entrez', 'publication_date');
console.log(column); // 'year'
```

### Real-World Example

**Before (fails)**:
```javascript
// Model tries to query Entrez data using standard column name
const recent = await helpers.db.query(`
  SELECT pmid, title, abstract, pub_date
  FROM article
  WHERE pub_date >= '2023-01-01'
  ORDER BY pub_date DESC
`);
// ERROR: no such column: pub_date
```

**After (succeeds)**:
```javascript
// Model inspects schema first
const columns = await dbSchema.getColumns('article');
console.log('Available columns:', columns.map(c => c.name));
// ['pmid', 'title', 'abstract', 'year', 'journal', 'authors']

// Or uses semantic mapping
const dateCol = await dbSchema.findColumn('article', 'pub_date');
// Returns: 'year'

const recent = await helpers.db.query(`
  SELECT pmid, title, abstract, ${dateCol} as pub_date
  FROM article
  WHERE ${dateCol} >= '2023-01-01'
  ORDER BY ${dateCol} DESC
`);
// SUCCESS!
```

### Server-Specific Issues This Fixes

1. **Entrez (PubMed)**: Uses `year` instead of `pub_date` or `publication_date`
2. **RCSB PDB**: Uses `deposition_date` instead of `date`
3. **ClinicalTrials.gov**: Uses `nct_id` instead of `trial_id` or `id`
4. **CIViC**: Uses `gene_name` instead of `gene`

### Documentation Reference
- `MCP_CLIENT_FIXES.md` lines 288-416
- `SESSION_SUMMARY.md` Part 1 (Schema Inspection section)

### Integration Points
1. **Runtime Injection**: `generateSchemaInspection()` must be injected into worker globals
2. **Helper Docs**: Add `dbSchema` API to system prompt
3. **Tool Usage**: Models should be encouraged to inspect schemas before querying

---

## 🟠 Task 3: GraphQL Null-Safety (Missing, ~100 lines, Low effort)

### What It Is
Validation and error handling layer that detects when GraphQL queries return `null` data fields and provides helpful error messages instead of cryptic "Cannot read properties of null" errors.

### Current Status
- **Main branch**: ❌ Missing entirely
- **Codemode-wip**: ✅ Fully implemented
- **File**: `lib/code-mode/helpers-with-transform.ts`
- **Missing**: ~89 lines of validation code

### The Problem

**Servers Affected**: Pharos, RCSB PDB, CIViC, OpenTargets (all use GraphQL)

**Error Pattern**:
```javascript
const result = await helpers.pharos.invoke('pharos_graphql_query', {
  query: '{ target(name: "INVALID") { name, description } }'
});

// GraphQL returns: { data: { target: null } }
// Code tries to access: result.data.target.name
// ERROR: Cannot read properties of null (reading 'name')
```

**Why This Happens**:
GraphQL queries are structurally valid but return `null` when:
1. Field name is misspelled (`targett` instead of `target`)
2. Query filters don't match any records
3. Entity doesn't have that property

### The Solution

**Two-Part Fix**:

1. **`validateGraphQLData()`** - Detects null fields and explains why
2. **`safeGraphQLAccess()`** - Proxy wrapper that prevents null access errors

### Implementation Location
**File**: `lib/code-mode/helpers-with-transform.ts`
**Location**: Lines 238-319 (in codemode-wip)

### How It Works

**Step 1: Validation**
```javascript
function validateGraphQLData(data, path = "data") {
  const issues = [];

  // Check if this looks like a GraphQL response
  if (typeof data === "object" && data !== null && "data" in data) {
    const graphqlData = data.data;

    // Case 1: data is null
    if (graphqlData === null) {
      issues.push({
        severity: "error",
        code: "GRAPHQL_NULL_DATA",
        message: "GraphQL query returned null data. The query might not match any records, or the field name is incorrect.",
        hint: "Check that your query uses the correct field names and filters."
      });
      return { valid: false, issues, nullFields: ["data"] };
    }

    // Case 2: data exists but contains null fields
    if (typeof graphqlData === "object") {
      const nullFields = [];

      for (const [key, value] of Object.entries(graphqlData)) {
        if (value === null) {
          nullFields.push(key);
          issues.push({
            severity: "warning",
            code: "GRAPHQL_NULL_FIELD",
            message: `GraphQL field "${key}" is null. This field might not exist for the queried entity.`,
            hint: `Check if "${key}" is the correct field name or if the entity has this property.`
          });
        }
        // Recursively check nested objects
      }

      if (nullFields.length > 0) {
        return { valid: false, issues, nullFields };
      }
    }
  }

  return { valid: true, issues: [], nullFields: [] };
}
```

**Step 2: Safe Access Proxy**
```javascript
function safeGraphQLAccess(data, serverKey, toolName) {
  if (typeof data !== "object" || data === null) return data;

  return new Proxy(data, {
    get(target, prop) {
      const value = target[prop];

      // If accessing a property that's null, provide helpful error
      if (value === null && prop !== "constructor" && prop !== "__proto__") {
        console.error(`[GraphQL] Attempted to access null field "${String(prop)}" in ${serverKey}.${toolName} response`);
        console.error(`[GraphQL] Hint: The GraphQL query succeeded but "${String(prop)}" is null. This usually means:`);
        console.error(`[GraphQL]   1. The field name is misspelled`);
        console.error(`[GraphQL]   2. The queried entity doesn't have this property`);
        console.error(`[GraphQL]   3. The filter didn't match any records`);

        // Return null instead of throwing
        return null;
      }

      // Recursively wrap nested objects
      if (typeof value === "object" && value !== null) {
        return safeGraphQLAccess(value, serverKey, toolName);
      }

      return value;
    }
  });
}
```

**Step 3: Integration into transformResponse**
```javascript
function transformResponse(response, toolName, serverKey) {
  // ... existing code ...

  // GraphQL null-safety check
  const graphqlValidation = validateGraphQLData(structured);
  if (!graphqlValidation.valid) {
    const errorMessage = graphqlValidation.issues
      .filter(i => i.severity === "error")
      .map(i => i.message)
      .join("; ");

    console.error(`[GraphQL] ${serverKey}.${toolName}: ${errorMessage}`);
    console.error(`[GraphQL] Null fields: ${graphqlValidation.nullFields.join(", ")}`);

    // Return error with helpful guidance
    return {
      ok: false,
      error: {
        code: "GRAPHQL_NULL_DATA",
        message: errorMessage,
        nullFields: graphqlValidation.nullFields,
        details: structured
      },
      _graphqlValidation: graphqlValidation
    };
  }

  // Wrap data in safe proxy
  const safeData = "data" in structured
    ? safeGraphQLAccess(structured, serverKey, toolName)
    : structured;

  return { ok: true, data: safeData, _graphqlValidation: graphqlValidation };
}
```

### Before vs After

**Before (Crashes)**:
```javascript
const result = await helpers.pharos.invoke('pharos_graphql_query', {
  query: '{ target(name: "TP53") { name, targetFamily } }'
});

console.log(result.data.target.name);
// ERROR: Cannot read properties of null (reading 'name')
// User has no idea what went wrong
```

**After (Helpful Error)**:
```javascript
const result = await helpers.pharos.invoke('pharos_graphql_query', {
  query: '{ target(name: "TP53") { name, targetFamily } }'
});

// Console output:
// [GraphQL] pharos.pharos_graphql_query: GraphQL field "target" is null.
// [GraphQL] Hint: The GraphQL query succeeded but "target" is null. This usually means:
// [GraphQL]   1. The field name is misspelled
// [GraphQL]   2. The queried entity doesn't have this property
// [GraphQL]   3. The filter didn't match any records
// [GraphQL] Null fields: target

// result.ok === false
// result.error.message === "GraphQL field 'target' is null. Check if 'target' is the correct field name..."
// result.error.nullFields === ['target']
```

### Real-World Examples

**Pharos Error (Fixed)**:
```
Before: Cannot read properties of undefined (reading 'target')
After: GraphQL field "target" is null. The query might not match any records, or the field name is incorrect.
```

**RCSB PDB Error (Fixed)**:
```
Before: Cannot read properties of null (reading 'entries')
After: GraphQL field "entries" is null. Check if "entries" is the correct field name or if the entity has this property.
```

**CIViC Error (Fixed)**:
```
Before: Cannot read properties of undefined (reading 'genes')
After: GraphQL field "genes" is null. This field might not exist for the queried entity.
```

### Benefits

1. **Prevents Crashes**: Returns structured errors instead of throwing
2. **Actionable Feedback**: Tells user exactly what's wrong and how to fix it
3. **Graceful Degradation**: Code can handle null responses without crashing
4. **Debug Info**: Attaches validation metadata for debugging

### Documentation Reference
- `MCP_CLIENT_FIXES.md` lines 30-65
- `SESSION_SUMMARY.md` Part 3

### Integration Points
1. **Transform Pipeline**: Integrates into existing `transformResponse()` function
2. **Error Reporting**: Adds `_graphqlValidation` metadata to all responses
3. **Console Logging**: Outputs helpful debug messages to worker console

---

## Summary: Effort Estimates

| Task | Lines | Complexity | Time Estimate | Dependencies |
|------|-------|------------|---------------|--------------|
| helpers.db API | ~94 | Medium | 2-3 hours | Requires database.ts DO |
| Schema Inspection | ~124 | Medium | 2-3 hours | None (standalone) |
| GraphQL Null-Safety | ~89 | Low | 1-2 hours | None (standalone) |
| **Total** | **~307** | **Medium** | **5-8 hours** | Database DO required |

### Recommended Implementation Order

1. **GraphQL Null-Safety** (easiest, no dependencies, immediate benefit)
2. **Schema Inspection** (standalone, helps with SQL debugging)
3. **helpers.db API** (requires database.ts, most complex)

### Testing Strategy

**GraphQL Null-Safety**:
- Test with Pharos server using invalid queries
- Verify error messages are helpful
- Check that valid queries still work

**Schema Inspection**:
- Test `dbSchema.getColumns()` with Entrez staged data
- Verify column mappings for each server
- Test fuzzy column matching

**helpers.db API**:
- Test table creation and querying
- Verify batch insert chunking
- Test session state persistence
- Verify memory fallback when DO unavailable

---

## Files to Modify

### 1. lib/code-mode/helpers-with-transform.ts
- Add GraphQL validation functions (lines 238-319)
- Add GraphQL integration in transformResponse (lines 358-391)
- Add helpers.db implementation (lines 768-857)

### 2. lib/code-mode/sql-helpers.ts
- Add generateSchemaInspection() (line 298+)
- Add SERVER_COLUMN_MAPPINGS (line 370+)
- Add getSafeColumnName() (line 411+)

### 3. workers/codemode/src/index.ts
- Export CodeModeDatabase class
- Implement __invokeDB() global function
- Configure CODEMODE_DB binding

### 4. workers/codemode/src/database.ts
- Create NEW FILE with Durable Object implementation
- Implement SQL execution with guardrails
- Implement session state management

---

**End of Implementation Details**
