# MCP Dual-Mode Response System
## Design for Both Human and Programmatic Usage

**Status**: Design Proposal
**Created**: 2025-01-03
**Goal**: Enable MCP servers to work seamlessly for both chat UI (humans) and code execution (programmatic)

---

## 🎯 Executive Summary

Current MCP servers return markdown-formatted responses optimized for human reading, making them incompatible with programmatic code execution. This document proposes a dual-mode response system that serves both use cases without breaking existing functionality.

### Quick Win Solutions (Implement First)
1. **Response format negotiation via headers** - `X-Response-Format: json|markdown`
2. **Structured error responses** - Separate data from errors
3. **Enhanced helper API** - Smart parsing in client layer
4. **Direct data access for staging** - Bypass markdown for code mode

### Long-term Solutions
1. **Dual-response structure** - Return both human + structured data
2. **Schema improvements** - Rich metadata about responses
3. **MCP protocol enhancement** - Standardized response formats

---

## 📊 Current Architecture Problems

### Problem 1: Markdown-Only Responses
```typescript
// What MCP servers currently return
{
  "content": [{
    "type": "text",
    "text": "✅ **🔍 Protein Search Results Data Staged**\n\n📊 **Data Summary:**\n- **Data Access ID:** search_json_1764792555209_7hb77x"
  }],
  "isError": false
}

// What code execution needs
{
  "dataAccessId": "search_json_1764792555209_7hb77x",
  "operation": "search_json",
  "payloadSize": 2040000,
  "entities": 25,
  "table": "protein",
  "status": "staged"
}
```

### Problem 2: String Parsing Required
Code must parse markdown text to extract structured data, which is:
- **Fragile**: Breaks when markdown formatting changes
- **Error-prone**: Emojis, special characters corrupt extracted values
- **Unscalable**: Each server has different formatting conventions

### Problem 3: No Schema for Response Structure
Tools define input schemas but not output schemas:
```typescript
// Tools declare parameters
inputSchema: {
  query: { type: 'string', description: 'Search query' }
}

// ❌ But NOT response structure
outputSchema: ??? // Doesn't exist
```

---

## 🏗️ Solution Architecture

### Layer 1: MCP Server Enhancements (Backend)

#### 1.1 Response Format Negotiation

**Add support for response format headers:**

```typescript
// In MCP server tool handler
async function handleToolCall(toolName: string, args: any, headers: Headers) {
  const responseFormat = headers.get('X-Response-Format') || 'markdown';
  const executionContext = headers.get('X-Execution-Context') || 'chat';

  const result = await executeTool(toolName, args);

  if (executionContext === 'code' || responseFormat === 'json') {
    // Return structured JSON for programmatic use
    return {
      data: result,
      metadata: {
        dataAccessId: result.dataAccessId,
        table: result.table,
        operation: toolName,
        timestamp: Date.now()
      }
    };
  } else {
    // Return markdown for chat UI
    return {
      content: [{
        type: 'text',
        text: formatMarkdown(result)
      }]
    };
  }
}
```

#### 1.2 Dual-Response Structure

**Return BOTH human and machine-readable data:**

```typescript
interface DualModeResponse {
  // Structured data for code execution
  data: {
    dataAccessId?: string;
    table?: string;
    rows?: any[];
    [key: string]: any;
  };

  // Human-readable display
  display: {
    type: 'text' | 'markdown' | 'html';
    content: string;
  };

  // Rich metadata
  metadata: {
    operation: string;
    timestamp: number;
    status: 'success' | 'error' | 'staged';
    schema?: object; // Output schema if available
  };
}
```

**Example implementation:**

```typescript
// UniProt search tool response
{
  // ✅ Structured data for code
  data: {
    dataAccessId: "search_json_1764792555209_7hb77x",
    operation: "search_json",
    payloadSize: 2040000,
    entities: 25,
    table: "protein",
    queryAccess: {
      endpoint: "/query",
      example: "SELECT * FROM protein LIMIT 10"
    }
  },

  // ✅ Human-readable display
  display: {
    type: 'markdown',
    content: `✅ **🔍 Protein Search Results Data Staged**

📊 **Data Summary:**
- **Operation:** search_json
- **Payload Size:** 2040KB
- **Data Access ID:** search_json_1764792555209_7hb77x`
  },

  // ✅ Metadata
  metadata: {
    operation: "uniprot_search",
    timestamp: 1764792555209,
    status: "staged"
  }
}
```

#### 1.3 Schema Definitions for Responses

**Add output schemas to tool definitions:**

```typescript
// Tool definition with output schema
{
  name: "uniprot_search",
  description: "Search UniProt database",

  // Input schema (already exists)
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      format: { type: 'string', enum: ['json', 'xml'] }
    },
    required: ['query']
  },

  // ✅ NEW: Output schema
  outputSchema: {
    type: 'object',
    properties: {
      data: {
        type: 'object',
        properties: {
          dataAccessId: { type: 'string' },
          table: { type: 'string' },
          operation: { type: 'string' },
          entities: { type: 'number' }
        }
      },
      display: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['text', 'markdown'] },
          content: { type: 'string' }
        }
      }
    }
  }
}
```

---

### Layer 2: MCP Client Enhancements (Frontend)

#### 2.1 Smart Helper API with Response Parsing

**Enhance `helpers.invoke()` to handle both response formats:**

```typescript
// In /lib/code-mode/dynamic-helpers.ts

export interface HelperAPI {
  listTools(): Promise<string[]>;
  searchTools(query: string): Promise<Array<{ name: string; description: string }>>;

  // ✅ Enhanced invoke with smart parsing
  invoke(toolName: string, args: any, options?: {
    returnFormat?: 'raw' | 'parsed' | 'auto';
    parseStrategy?: 'aggressive' | 'conservative';
  }): Promise<any>;
}

// Implementation
async invoke(toolName: string, args: any, options = {}) {
  const { returnFormat = 'auto', parseStrategy = 'aggressive' } = options;

  // Add headers to request structured response
  const headers = new Headers({
    'X-Response-Format': 'json',
    'X-Execution-Context': 'code'
  });

  const response = await __invokeMCPTool(serverKey, toolName, args, headers);

  // If server returns dual-mode response, extract data
  if (response.data && response.metadata) {
    return response.data;
  }

  // If server returns legacy markdown, attempt parsing
  if (response.content?.[0]?.text) {
    const text = response.content[0].text;

    if (returnFormat === 'raw') {
      return response;
    }

    // Smart parsing
    return parseMarkdownResponse(text, {
      strategy: parseStrategy,
      toolName,
      expectedFields: getExpectedFields(toolName)
    });
  }

  return response;
}
```

#### 2.2 Markdown Response Parser

**Robust parser for legacy servers:**

```typescript
// In /lib/code-mode/markdown-parser.ts

interface ParsedResponse {
  dataAccessId?: string;
  table?: string;
  operation?: string;
  data?: any;
  error?: string;
  rawText?: string;
}

export function parseMarkdownResponse(
  text: string,
  options: {
    strategy: 'aggressive' | 'conservative';
    toolName: string;
    expectedFields?: string[];
  }
): ParsedResponse {
  const result: ParsedResponse = { rawText: text };

  // Extract data access ID (multiple patterns)
  const dataAccessIdPatterns = [
    /Data Access ID:\s*\*\*([a-zA-Z0-9_]+)\*\*/,
    /data_access_id[:\s]*["']?([a-zA-Z0-9_]+)["']?/i,
    /(?:ID|id):\s*([a-z]+_[a-z]+_\d+_[a-z0-9]+)/,
  ];

  for (const pattern of dataAccessIdPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      // Clean extracted value (remove emojis, trim whitespace)
      result.dataAccessId = cleanExtractedValue(match[1]);
      break;
    }
  }

  // Extract table name
  const tableMatch = text.match(/FROM\s+([a-z_]+)/i);
  if (tableMatch?.[1]) {
    result.table = tableMatch[1];
  }

  // Extract operation
  const operationMatch = text.match(/Operation:\s*\*\*([^*]+)\*\*/);
  if (operationMatch?.[1]) {
    result.operation = operationMatch[1].trim();
  }

  // Check for errors
  if (text.includes('Error:') || text.includes('failed')) {
    const errorMatch = text.match(/(?:Error|failed):\s*([^\n]+)/i);
    if (errorMatch?.[1]) {
      result.error = errorMatch[1].trim();
    }
  }

  // Extract JSON blocks if present
  const jsonMatches = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatches?.[1]) {
    try {
      result.data = JSON.parse(jsonMatches[1]);
    } catch {
      // Invalid JSON, ignore
    }
  }

  return result;
}

function cleanExtractedValue(value: string): string {
  return value
    .replace(/[^\w\-_]/g, '') // Remove non-alphanumeric except dash/underscore
    .trim();
}

// Tool-specific field expectations (populated from schemas)
function getExpectedFields(toolName: string): string[] {
  const fieldMap: Record<string, string[]> = {
    'uniprot_search': ['dataAccessId', 'table', 'operation', 'entities'],
    'uniprot_entry': ['dataAccessId', 'accession'],
    'data_manager': ['rows', 'columns', 'rowCount'],
  };

  return fieldMap[toolName] || [];
}
```

#### 2.3 Enhanced Helpers with Staging Shortcuts

**Direct data access for staged responses:**

```typescript
export interface HelperAPI {
  // ... existing methods ...

  // ✅ NEW: Direct query for staged data
  queryStagedData(dataAccessId: string, sql: string): Promise<any[]>;

  // ✅ NEW: Get data directly (handles staging automatically)
  getData(toolName: string, args: any): Promise<any>;
}

// Implementation
async getData(toolName: string, args: any) {
  const response = await this.invoke(toolName, args);

  // If data is staged, automatically query it
  if (response.dataAccessId && response.table) {
    return this.queryStagedData(
      response.dataAccessId,
      `SELECT * FROM ${response.table} LIMIT 100`
    );
  }

  // Otherwise return data directly
  return response.data || response;
}

async queryStagedData(dataAccessId: string, sql: string) {
  const response = await this.invoke('data_manager', {
    operation: 'query',
    data_access_id: dataAccessId,
    sql
  });

  // Extract rows from response
  if (response.rows) return response.rows;
  if (response.data?.rows) return response.data.rows;

  // Fallback: parse from markdown
  return parseMarkdownResponse(response.rawText || '').data || [];
}
```

---

### Layer 3: Code Execution Environment

#### 3.1 Automatic Response Handling in Worker

**Update Cloudflare Worker to handle both formats:**

```typescript
// In codemode worker

async function __invokeMCPTool(serverKey: string, toolName: string, args: any, headers?: Headers) {
  // Add execution context headers
  const requestHeaders = new Headers(headers);
  requestHeaders.set('X-Execution-Context', 'code');
  requestHeaders.set('X-Response-Format', 'json');

  const response = await mcpClient.invoke(toolName, args, requestHeaders);

  // Handle dual-mode responses
  if (response.data && response.metadata) {
    // New format: return structured data
    if (response.metadata.status === 'staged' && response.data.dataAccessId) {
      // Enhance with query helper
      return {
        ...response.data,
        query: async (sql: string) => {
          return await __invokeMCPTool(serverKey, 'data_manager', {
            operation: 'query',
            data_access_id: response.data.dataAccessId,
            sql
          });
        }
      };
    }
    return response.data;
  }

  // Legacy format: attempt parsing
  if (response.content?.[0]?.text) {
    const parsed = parseMarkdownResponse(response.content[0].text, {
      strategy: 'aggressive',
      toolName
    });

    // If parsing found structured data, return it
    if (Object.keys(parsed).length > 1) { // More than just rawText
      return parsed;
    }
  }

  // Return as-is if can't parse
  return response;
}
```

#### 3.2 Enhanced Error Handling

**Structured errors separate from data:**

```typescript
interface ToolResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    executionTime: number;
    cached: boolean;
  };
}

// Example error response
{
  success: false,
  error: {
    code: 'INVALID_PARAMETERS',
    message: 'Missing required parameter: accession',
    details: {
      received: { id: 'P04637' },
      expected: { accession: 'string' }
    }
  },
  metadata: {
    executionTime: 45,
    cached: false
  }
}
```

---

## 🔄 Migration Strategy

### Phase 1: Client-Side Improvements (No Server Changes)
**Timeline**: 1-2 weeks
**Risk**: Low

1. ✅ Implement markdown parser in `lib/code-mode/markdown-parser.ts`
2. ✅ Enhance `HelperAPI.invoke()` with smart parsing
3. ✅ Add `getData()` and `queryStagedData()` shortcuts
4. ✅ Update system prompt with better examples

**Benefits**:
- Immediate improvement for code execution
- No breaking changes
- Works with existing MCP servers

### Phase 2: Opt-In Dual-Mode Responses
**Timeline**: 2-4 weeks
**Risk**: Low-Medium

1. ✅ Add header-based format negotiation to MCP client
2. ✅ Update 1-2 servers to support dual-mode (UniProt, OpenTargets)
3. ✅ Test compatibility with both chat and code mode
4. ✅ Gradually roll out to other servers

**Benefits**:
- Backward compatible (headers are optional)
- Can A/B test effectiveness
- Incremental deployment

### Phase 3: Protocol Standardization
**Timeline**: 1-3 months
**Risk**: Medium-High

1. ✅ Define MCP response schema standard
2. ✅ Add `outputSchema` to tool definitions
3. ✅ Update all servers to dual-mode by default
4. ✅ Deprecate legacy markdown-only responses

**Benefits**:
- Industry-standard solution
- Fully optimized for both use cases
- Foundation for future features

---

## 📝 Implementation Examples

### Example 1: Backward-Compatible Server Update

```typescript
// Before: Markdown-only response
function handleUniProtSearch(args: any) {
  const results = performSearch(args.query);

  return {
    content: [{
      type: 'text',
      text: `✅ Found ${results.length} proteins\n\nResults: ...`
    }]
  };
}

// After: Dual-mode response
function handleUniProtSearch(args: any, headers: Headers) {
  const results = performSearch(args.query);
  const responseFormat = headers.get('X-Response-Format') || 'markdown';

  // Always prepare structured data
  const structuredData = {
    proteins: results.map(r => ({
      accession: r.accession,
      name: r.name,
      organism: r.organism
    })),
    total: results.length,
    query: args.query
  };

  if (responseFormat === 'json') {
    // Return structured for code execution
    return {
      data: structuredData,
      metadata: {
        operation: 'search',
        timestamp: Date.now(),
        status: 'success'
      }
    };
  }

  // Return dual-mode (best of both)
  return {
    data: structuredData, // ✅ For code
    display: {            // ✅ For humans
      type: 'markdown',
      content: formatMarkdown(structuredData)
    },
    metadata: {
      operation: 'search',
      timestamp: Date.now(),
      status: 'success'
    }
  };
}
```

### Example 2: Enhanced Helper Usage in Code

```typescript
// Before: Manual parsing nightmare
const response = await helpers.uniprot.invoke('uniprot_search', {
  query: 'TP53'
});

// Extract data access ID from markdown 😰
const text = response.content[0].text;
const match = text.match(/Data Access ID:\*\*([a-z0-9_]+)\*\*/);
const dataAccessId = match?.[1]; // May fail!

// Query staged data
const queryResult = await helpers.uniprot.invoke('data_manager', {
  operation: 'query',
  data_access_id: dataAccessId,
  sql: 'SELECT * FROM protein LIMIT 10'
});

// Parse rows from markdown 😰😰
// ... more fragile parsing ...


// After: Clean programmatic access 🎉
const proteins = await helpers.uniprot.getData('uniprot_search', {
  query: 'TP53'
});

// proteins is already an array of objects!
console.log(`Found ${proteins.length} proteins`);
console.log(`First result: ${proteins[0].accession}`);


// Or with more control:
const response = await helpers.uniprot.invoke('uniprot_search', {
  query: 'TP53'
}, {
  returnFormat: 'parsed' // Smart parsing
});

if (response.dataAccessId) {
  // Staged data: query it
  const rows = await response.query('SELECT * FROM protein WHERE organism = "Homo sapiens"');
  return rows;
} else {
  // Direct data
  return response.data;
}
```

### Example 3: Error Handling

```typescript
// Before: Error in markdown text
{
  content: [{
    type: 'text',
    text: 'Data Manager Error: Query failed: no such table: protein'
  }]
}

// After: Structured error
{
  success: false,
  error: {
    code: 'TABLE_NOT_FOUND',
    message: 'Table "protein" does not exist',
    details: {
      dataAccessId: 'search_json_1764792555209_7hb77x',
      availableTables: ['entries', 'features'],
      suggestion: 'Use "entries" table instead'
    }
  },
  display: {
    type: 'markdown',
    content: '❌ **Query Error**\n\nTable "protein" not found. Try: `SELECT * FROM entries`'
  }
}

// In code:
const result = await helpers.uniprot.invoke('data_manager', { ... });

if (!result.success) {
  console.error(`Error: ${result.error.message}`);
  console.log(`Suggestion: ${result.error.details.suggestion}`);
  throw new Error(result.error.code);
}
```

---

## 🎯 Success Metrics

### For Chat UI (Humans)
- ✅ No change in user experience
- ✅ Markdown formatting preserved
- ✅ Tool results render beautifully

### For Code Execution
- ✅ 0% regex parsing failures (vs current ~80%)
- ✅ <100ms overhead for response processing
- ✅ 100% successful multi-step workflows
- ✅ Error rate < 1%

### For Developers
- ✅ Backward compatible
- ✅ Easy to implement
- ✅ Well-documented
- ✅ Type-safe

---

## 🚀 Next Steps

### Immediate (This Week)
1. [ ] Implement `markdown-parser.ts` with robust extraction
2. [ ] Enhance `HelperAPI.invoke()` with parsing option
3. [ ] Add `getData()` shortcut method
4. [ ] Test with existing UniProt/OpenTargets servers

### Short-term (Next 2 Weeks)
1. [ ] Add header-based format negotiation to MCP client
2. [ ] Update one MCP server to dual-mode (UniProt)
3. [ ] Create comprehensive test suite
4. [ ] Document new helper API capabilities

### Long-term (Next Month)
1. [ ] Define output schema standard
2. [ ] Update all MCP servers to dual-mode
3. [ ] Add schema validation
4. [ ] Publish MCP dual-mode specification

---

## 📚 Related Files

- `/lib/code-mode/dynamic-helpers.ts` - Helper API implementation
- `/lib/mcp-client.ts` - MCP client with tool invocation
- `/app/api/chat/route.ts` - Code mode tool integration
- `/lib/code-mode/helper-docs.ts` - Documentation generation

---

## 🤝 Questions & Feedback

This is a living document. Please provide feedback on:
- Is the dual-mode approach the right solution?
- Are the migration phases realistic?
- What other use cases should we consider?
- How can we make this easier for MCP server developers?

---

**Last Updated**: 2025-01-03
**Next Review**: 2025-01-10
