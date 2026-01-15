# Code Mode Regression Tests

This document tracks historical bugs and provides deterministic tests to prevent regressions. Each test includes the mistake, the fix, and a verification procedure.

---

## Test 1: Durable Object Binding Serialization

**Date**: 2025-12-22
**Severity**: Critical (breaks all MCP server calls)

### The Mistake

Attempted to pass a Durable Object namespace binding through the `env` object in the dynamic worker loader configuration:

```javascript
// ❌ WRONG - This breaks the worker
const loaderConfig = {
  env: {
    CODEMODE_DB: env.CODEMODE_DB,  // Can't serialize bindings!
  }
};
```

### Why It Failed

Durable Object namespaces are special binding objects that cannot be serialized like regular JavaScript values. When the worker loader tries to serialize the config to pass to the isolate, the DO binding fails serialization, causing the entire worker to crash and return HTML error pages instead of JSON.

### The Fix

Pass bindings separately via the `bindings` field:

```javascript
// ✅ CORRECT
const loaderConfig = {
  env: {
    PROXY_URL: env.PROXY_URL,
    PROXY_TOKEN: env.PROXY_TOKEN,
  }
};

if (env.CODEMODE_DB) {
  loaderConfig.bindings = {
    CODEMODE_DB: env.CODEMODE_DB,
  };
}
```

### Deterministic Test

**File**: `workers/codemode/src/index.ts`
**Location**: Lines 344-360

**Test Procedure**:
1. Search for `env.CODEMODE_DB` in `workers/codemode/src/index.ts`
2. Verify it appears ONLY in:
   - The `Env` type definition (line 11)
   - The `loaderConfig.bindings` assignment (line 358)
   - The `__invokeDB` function in the runner template (line 174)
3. Verify it does NOT appear in:
   - The `loaderConfig.env` object

**Automated Check**:
```bash
# This should return 0 (no matches)
grep -n "env:.*CODEMODE_DB" workers/codemode/src/index.ts | grep -v "type Env" | wc -l

# This should return 1 (the bindings assignment)
grep -n "bindings:.*{" workers/codemode/src/index.ts | wc -l
```

### How to Fix If Broken

If you see `CODEMODE_DB` inside the `env` object:

1. Remove it from `env`
2. Add a conditional bindings assignment:
   ```javascript
   if (env.CODEMODE_DB) {
     loaderConfig.bindings = {
       CODEMODE_DB: env.CODEMODE_DB,
     };
   }
   ```

---

## Test 2: Helper API Generation - Null Safety

**Date**: 2025-12-22
**Severity**: Medium (prevents DB features from working)

### The Mistake

Generated helper code that doesn't check if global functions exist before calling them:

```javascript
// ❌ WRONG - Crashes if __invokeDB doesn't exist
helpers.db = {
  async query(sql, params) {
    return await __invokeDB('query', { sql, params });
  }
};
```

### Why It Failed

If the `__invokeDB` function isn't available (e.g., in older worker versions or if bindings fail), the code crashes with "undefined is not a function" instead of providing a helpful error message.

### The Fix

Always check for function existence before calling:

```javascript
// ✅ CORRECT - Provides helpful error
helpers.db = {
  async query(sql, params) {
    if (typeof __invokeDB !== 'function') {
      throw new Error('Database not available in this environment');
    }
    return await __invokeDB('query', { sql, params });
  }
};
```

### Deterministic Test

**File**: `lib/code-mode/dynamic-helpers.ts`
**Location**: Lines 129-183

**Test Procedure**:
1. Search for `__invokeDB` calls in `lib/code-mode/dynamic-helpers.ts`
2. Verify each call is preceded by a type check:
   ```javascript
   if (typeof __invokeDB !== 'function') {
     throw new Error('Database not available...');
   }
   ```

**Automated Check**:
```bash
# Count __invokeDB calls
INVOKE_COUNT=$(grep -c "__invokeDB" lib/code-mode/dynamic-helpers.ts)

# Count safety checks
CHECK_COUNT=$(grep -c 'typeof __invokeDB !== "function"' lib/code-mode/dynamic-helpers.ts)

# They should be equal
if [ "$INVOKE_COUNT" -eq "$CHECK_COUNT" ]; then
  echo "✅ All __invokeDB calls have safety checks"
else
  echo "❌ Missing safety checks: $INVOKE_COUNT calls, $CHECK_COUNT checks"
fi
```

### How to Fix If Broken

Add this check before every `__invokeDB` call:
```javascript
if (typeof __invokeDB !== 'function') {
  throw new Error('Database not available in this environment');
}
```

---

## Test 3: SSE vs HTTP Transport Handling

**Date**: 2025-12-22
**Severity**: High (SSE servers return HTML errors)

### The Mistake

Treating SSE and HTTP transports the same way in the MCP client initialization:

```javascript
// ❌ WRONG - Creates plain object for SSE
const transport = server.type === 'sse'
  ? { type: 'sse', url: server.url, headers: headersObj }
  : new StreamableHTTPClientTransport(new URL(server.url), { ... });
```

### Why It Failed

The AI SDK's `createMCPClient` expects actual Transport class instances, not plain objects. For SSE, a plain object doesn't establish proper event stream connections, causing servers to return HTML error pages.

### The Fix

**Status**: Known issue, fix pending
**Workaround**: Use HTTP (`streamable-http`) transport type instead of SSE for affected servers

The proper fix requires:
1. Import SSE transport from MCP SDK (if available)
2. Or implement custom SSE client transport
3. Update `lib/mcp-client.ts` lines 527-534

### Deterministic Test

**File**: `config/mcp-servers.json`
**Check**: Verify SSE servers work in Code Mode

**Test Procedure**:
1. List all SSE servers in config:
   ```bash
   jq -r '.servers[] | select(.type == "sse") | .name' config/mcp-servers.json
   ```
2. For each SSE server, test a tool call in Code Mode
3. Verify response is JSON, not HTML (doesn't start with `<!DOCTYPE html>`)

**Manual Test Code**:
```javascript
// Test UniProt (SSE server)
const tools = await helpers.uniprot.listTools();
console.log(typeof tools, Array.isArray(tools));
// Should be: "object" true
// Not: undefined or string starting with "<!DOCTYPE"

// If this returns HTML, SSE transport is broken
const result = await helpers.uniprot.invoke(tools[0], {});
console.log(result);
```

### How to Fix If Broken

**Temporary Fix**: Convert SSE servers to HTTP in `config/mcp-servers.json`:
```json
{
  "name": "UniProt",
  "type": "http",  // Changed from "sse"
  "url": "https://uniprot-mcp-server.quentincody.workers.dev/mcp"
}
```

**Permanent Fix**: Implement proper SSE transport (requires MCP SDK update)

---

## Test 4: SQL Column Name Consistency

**Date**: 2025-12-22
**Severity**: Medium (causes SQL query failures)

### The Issue

Different MCP servers use different column names for the same semantic data (e.g., `pub_date` vs `year` vs `publication_date`).

### Current State

**Known Column Mappings**:
- **Entrez**: Uses `year` for publication year (NOT `pub_date`)
- **RCSB PDB**: Uses `deposition_date`
- **ClinicalTrials**: Uses `start_date`, `completion_date`

### The Fix

Update helper documentation to specify actual column names per server:

**File**: `lib/code-mode/helper-docs.ts`
**Location**: Lines 420-450

Add server-specific SQL examples showing correct column names.

### Deterministic Test

**Test Procedure**:
1. For each MCP server that supports staging, fetch schema
2. Compare documented column names vs actual schema
3. Update documentation if mismatched

**Automated Check**:
```javascript
// In Code Mode - test Entrez schema
const search = await helpers.entrez.invoke('entrez_query', {
  operation: 'search',
  database: 'pubmed',
  term: 'test',
  retmax: 1
});

const staged = await helpers.entrez.invoke('entrez_data', {
  operation: 'fetch_and_stage',
  database: 'pubmed',
  ids: search.idlist[0]
});

// Get actual schema
const schema = await helpers.entrez.invoke('entrez_data', {
  operation: 'schema',
  data_access_id: staged.data_access_id
});

// Verify 'year' column exists (not 'pub_date')
const hasYearColumn = schema.tables.article.columns.some(c => c.name === 'year');
console.assert(hasYearColumn, "Entrez should have 'year' column, not 'pub_date'");
```

### How to Fix If Broken

Update documentation to reflect actual column names. Add a "Column Name Reference" section to helper docs.

---

## Test 5: Empty Tool Lists from Servers

**Date**: 2025-12-22
**Severity**: High (server appears broken)

### The Issue

`listTools()` returns `[]` (empty array) even though server is responding to pings.

**Common Causes**:
1. Missing API key (server hides tools without auth)
2. Server initialization failure
3. Transport/serialization issue

### Diagnostic Steps

**Test Procedure**:
1. Check if server URL is accessible:
   ```bash
   curl -I https://server-url/mcp
   ```
2. Test listTools via proxy:
   ```bash
   curl -X GET "http://localhost:3000/api/codemode/proxy?server=serverkey" \
     -H "x-codemode-token: YOUR_TOKEN"
   ```
3. Check server logs for errors

**Code Mode Test**:
```javascript
const servers = Object.keys(helpers);
const results = {};

for (const server of servers) {
  try {
    const tools = await helpers[server].listTools();
    results[server] = {
      count: tools.length,
      hasNulls: tools.some(t => t === null),
      sample: tools.slice(0, 3)
    };
  } catch (err) {
    results[server] = { error: err.message };
  }
}

console.log(JSON.stringify(results, null, 2));
```

### Expected Results

Each server should return:
- **count** > 0
- **hasNulls** = false
- **sample** = array of tool names (strings)

### How to Fix If Broken

1. **If count = 0**: Check server deployment and API keys
2. **If hasNulls = true**: Server is returning malformed tool objects (see Test 6)
3. **If error**: Check network connectivity and proxy configuration

---

## Test 6: Null Tool Objects (listTools Bug)

**Date**: 2025-12-22
**Severity**: Medium (tools exist but aren't discoverable)

### The Issue

`listTools()` returns `[null, null, null]` - correct count but null objects.

### Root Causes

1. **Server side**: Tool definitions missing required fields (name, description, inputSchema)
2. **Client side**: Transport layer stripping properties during deserialization
3. **Serialization**: SSE/Stdio transport encoding issues

### Diagnostic Test

```javascript
// Test specific server
const tools = await helpers.serverName.listTools();

// Check for nulls
const nullCount = tools.filter(t => t === null).length;
if (nullCount > 0) {
  console.error(`❌ ${server}: ${nullCount}/${tools.length} tools are null`);

  // Try direct MCP call to check if it's a helper issue
  const rawTools = await helpers.serverName.invoke('list_tools', {});
  console.log('Raw response:', rawTools);
}
```

### Expected Fix Locations

1. **Server**: Ensure all tools have `{ name, description, inputSchema }`
2. **Client** (`lib/mcp-client.ts`): Verify transport deserialization
3. **Helper** (`lib/code-mode/dynamic-helpers.ts`): Check tool mapping logic

---

## Running All Regression Tests

```bash
# Create a test script
cat > test-regressions.sh << 'EOF'
#!/bin/bash
set -e

echo "🧪 Running Code Mode Regression Tests"
echo "===================================="

# Test 1: DO Binding Check
echo "Test 1: Durable Object binding placement..."
if grep -q "env:.*CODEMODE_DB" workers/codemode/src/index.ts 2>/dev/null; then
  echo "❌ FAIL: CODEMODE_DB in env object"
  exit 1
fi
echo "✅ PASS"

# Test 2: Safety Checks
echo "Test 2: __invokeDB safety checks..."
INVOKE_COUNT=$(grep -c "__invokeDB" lib/code-mode/dynamic-helpers.ts 2>/dev/null || echo 0)
CHECK_COUNT=$(grep -c 'typeof __invokeDB !== "function"' lib/code-mode/dynamic-helpers.ts 2>/dev/null || echo 0)
if [ "$INVOKE_COUNT" -ne "$CHECK_COUNT" ]; then
  echo "❌ FAIL: Missing safety checks ($INVOKE_COUNT calls, $CHECK_COUNT checks)"
  exit 1
fi
echo "✅ PASS"

# Test 3: SSE Server Types
echo "Test 3: SSE server configuration..."
SSE_COUNT=$(jq -r '.servers[] | select(.type == "sse") | .name' config/mcp-servers.json 2>/dev/null | wc -l)
echo "ℹ️  Found $SSE_COUNT SSE servers (manual testing required)"

echo ""
echo "✅ All automated regression tests passed!"
EOF

chmod +x test-regressions.sh
./test-regressions.sh
```

---

## Adding New Regression Tests

When you encounter a new bug:

1. **Document it**: Add a new test section with date, severity, and description
2. **Explain the mistake**: Show the broken code
3. **Provide the fix**: Show the correct code
4. **Create a test**: Write a deterministic verification procedure
5. **Add to test script**: Add automated check to `test-regressions.sh`

### Template

```markdown
## Test N: [Brief Description]

**Date**: YYYY-MM-DD
**Severity**: Critical|High|Medium|Low

### The Mistake
[What was done wrong]

### Why It Failed
[Technical explanation]

### The Fix
[Correct implementation]

### Deterministic Test
[How to verify it's fixed]

### How to Fix If Broken
[Step-by-step repair instructions]
```

---

## Notes

- Run regression tests before deploying to production
- Add new tests immediately when bugs are discovered
- Keep tests deterministic (no manual judgment required)
- Include both automated and manual test procedures
- Update tests when architecture changes
