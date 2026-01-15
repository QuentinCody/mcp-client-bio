# Code Mode MCP Server Recommendations

This document outlines best practices for MCP servers to work optimally with Code Mode.

## Current Issues with Entrez MCP Server

### 1. **Human-Readable Text Instead of Structured JSON**

**Current Behavior:**
```javascript
// entrez_query with operation: 'search' returns:
{
  "text": "📊 **Search Results**: 282970 total, 5 returned\n🆔 **IDs**: 41337800, 41337574...",
  "_rawText": true
}
```

**Problem:** LLMs must parse emoji-formatted text with regex:
```javascript
const idMatch = searchText.match(/🆔 \*\*IDs\*\*: ([0-9, ]+)/);
const ids = idMatch[1].split(', '); // Fragile parsing
```

**Recommended:**
```javascript
// Return structured data:
{
  "count": 282970,
  "retmax": 5,
  "idlist": [41337800, 41337574, 41337434, 41337398, 41337217],
  "queryTranslation": "brain cancer[All Fields]",
  "_meta": {
    "warning": "Large result set; consider narrowing query",
    "suggestions": ["Use [Title] or [MeSH] for more precise results"]
  }
}
```

### 2. **Informational Messages Detected as Errors**

**Current Behavior:**
- Messages with ⚠️ emoji are detected as errors
- Success responses contain warning emojis for UX purposes
- No clear distinction between errors and informational warnings

**Client-Side Fix Applied:**
```javascript
// Now checks for success indicators (📊, 📄, 🆔) before checking for warnings
const hasSuccessIndicator = /^[📊📄🆔📋💡]/m.test(text);
if (hasSuccessIndicator) return false; // Not an error
```

**Server-Side Recommendation:**
- Use MCP error responses for actual errors
- Keep informational content in successful responses
- Avoid warning emojis (⚠️, ❌) in success responses, use `_meta.warnings` instead

### 3. **Tool Naming Confusion**

**Current Structure:**
```
entrez_query (tool)
  ├─ operation: 'search' (parameter)
  ├─ operation: 'summary' (parameter)
  └─ operation: 'fetch' (parameter)
```

**Issue:** LLMs try to call `helpers.entrez.invoke('search', ...)` instead of `helpers.entrez.invoke('entrez_query', { operation: 'search', ... })`

**Recommended for Code Mode:**

**Option A:** Separate tools (simpler for LLMs)
```typescript
// Expose each operation as its own tool
tools = {
  entrez_search: { ... },
  entrez_summary: { ... },
  entrez_fetch: { ... },
}
```

**Option B:** Better documentation in tool description
```json
{
  "name": "entrez_query",
  "description": "Query NCBI Entrez databases. IMPORTANT: Always include 'operation' parameter.\n\nExamples:\n- Search: { operation: 'search', database: 'pubmed', term: 'cancer' }\n- Summary: { operation: 'summary', database: 'pubmed', ids: '123,456' }\n- Fetch: { operation: 'fetch', database: 'pubmed', ids: '123' }",
  "inputSchema": { ... }
}
```

### 4. **Parameter Naming Inconsistency**

**Current Mixed Naming:**
- `entrez_query` uses `db` (short)
- `entrez_data` uses `database` (long)
- `entrez_query` uses `term` (for search)
- `entrez_data` uses `ids` (plural)
- `entrez_query` expects `ids` (from docs) but uses different field names

**Recommended:** Use consistent, descriptive names across all tools
```javascript
// Standardize on:
{
  database: 'pubmed',  // Always 'database', not 'db'
  ids: '123,456',      // Always 'ids' for ID lists
  query: 'cancer',     // Always 'query' for search terms
  operation: 'search'  // Always 'operation' for operation type
}
```

## General Code Mode Best Practices

### ✅ DO: Return Structured JSON

```javascript
{
  "results": [...],
  "metadata": {
    "total": 282970,
    "returned": 5,
    "page": 1
  },
  "_hints": {
    "nextSteps": ["Use fetch with these IDs to get full data"],
    "optimizations": ["Add [Title] filter to narrow results"]
  }
}
```

### ✅ DO: Use Consistent Data Types

```javascript
// IDs as array of numbers or strings (parseable):
{ "idlist": [41337800, 41337574, ...] }  // Good
{ "idlist": "41337800,41337574,..." }    // Acceptable (if documented)

// NOT:
{ "text": "🆔 **IDs**: 41337800, 41337574..." }  // Bad - requires parsing
```

### ✅ DO: Separate Data from Presentation

```javascript
{
  "data": {
    "articles": [...],      // Machine-readable data
  },
  "_display": {             // Optional: Human-readable formatting
    "summary": "Found 5 articles about brain cancer",
    "formatted": "📊 **Search Results**..."
  }
}
```

### ❌ DON'T: Use Emojis for Data Structure

```javascript
// Bad - LLM must parse text:
"🆔 **IDs**: 123, 456\n📊 **Count**: 2"

// Good - LLM can access directly:
{ "ids": [123, 456], "count": 2 }
```

### ❌ DON'T: Mix Success and Error Indicators

```javascript
// Confusing - has both success (📊) and warning (⚠️) emojis:
{
  "text": "📊 Results found\n⚠️ Large dataset",
  "_rawText": true
}

// Clear - separate concerns:
{
  "results": [...],
  "warnings": ["Large dataset - consider filtering"]
}
```

## Recommended Entrez Server Changes

### Priority 1: Return Structured Data

Update `entrez_query` search operation to return:
```typescript
{
  count: number,
  retmax: number,
  retstart: number,
  idlist: string[] | number[],
  queryTranslation?: string,
  webEnv?: string,  // For pagination
  warnings?: string[],  // Instead of ⚠️ in text
  suggestions?: string[]
}
```

### Priority 2: Consistent Parameter Names

Standardize across all operations:
- `database` (not `db`)
- `ids` (for comma-separated or array)
- `query` or `term` (pick one, use everywhere)
- `operation` (for multi-operation tools)

### Priority 3: Better Error Messages

Return MCP errors for validation issues:
```json
{
  "error": {
    "code": -32602,
    "message": "Invalid arguments",
    "data": {
      "validationErrors": [
        {
          "field": "operation",
          "issue": "Required parameter missing",
          "expected": "One of: search, summary, fetch, link, post"
        }
      ]
    }
  }
}
```

## Testing Code Mode Compatibility

```javascript
// Test that responses are directly usable:
const result = await helpers.entrez.invoke('entrez_query', {
  operation: 'search',
  database: 'pubmed',
  query: 'cancer'
});

// Should work without parsing:
const ids = result.idlist;  // ✅ Direct access
const count = result.count; // ✅ Direct access

// Should NOT require:
const ids = result.text.match(/IDs: ([\d, ]+)/)[1].split(', ');  // ❌ Text parsing
```

## Migration Path

1. **Phase 1 (No Breaking Changes):** Add structured fields alongside text
   ```javascript
   {
     "text": "📊 **Search Results**...",  // Keep for backward compat
     "_rawText": true,
     "data": { "idlist": [...], "count": 282970 }  // Add structured data
   }
   ```

2. **Phase 2:** Detect Code Mode context and return structured data only
   ```javascript
   if (isCodeModeRequest) {
     return { idlist: [...], count: 282970 };  // Structured
   } else {
     return { text: "📊 **Search Results**..." };  // Formatted
   }
   ```

3. **Phase 3:** Default to structured, add `format` parameter for human-readable
   ```javascript
   {
     operation: 'search',
     database: 'pubmed',
     query: 'cancer',
     format: 'human'  // Optional: get emoji-formatted text
   }
   ```

## Summary

**Client-Side (MCP Client - This Codebase):**
- ✅ Fixed: Improved error detection to not treat info messages as errors
- ✅ Working: Multi-line error handling
- ⚠️ Limited: Can't fix structural data issues without server changes

**Server-Side (entrez-mcp-server - Recommended Changes):**
- 🔴 Critical: Return structured JSON instead of emoji-formatted text
- 🟡 Important: Consistent parameter naming across tools
- 🟡 Important: Separate tools per operation OR better documentation
- 🟢 Nice-to-have: Better error messages with validation details

The client-side fixes will reduce false error detection, but **optimal Code Mode experience requires server-side changes** to return structured, parseable data.
