# Code Mode DB Diagnostic Test

Copy and paste this prompt into your chat with Code Mode enabled:

---

**Test the Code Mode database setup with comprehensive diagnostics. Run these tests in sequence:**

```javascript
const diagnostics = {
  tests: [],
  errors: [],
  warnings: [],
  success: true
};

function addTest(name, status, details) {
  diagnostics.tests.push({ name, status, details });
  if (status === 'FAIL') diagnostics.success = false;
  console.log(`[${status}] ${name}`);
  if (details) console.log(`  └─ ${JSON.stringify(details)}`);
}

function addError(error, context) {
  const errorInfo = {
    context,
    message: error.message || String(error),
    stack: error.stack?.split('\n').slice(0, 3).join('\n')
  };
  diagnostics.errors.push(errorInfo);
  console.log(`[ERROR] ${context}: ${errorInfo.message}`);
  return errorInfo;
}

// TEST 1: Worker Connectivity
try {
  addTest('Worker Connectivity', 'RUNNING', 'Checking if Code Mode worker is accessible');
  // If we got here, worker is accessible
  addTest('Worker Connectivity', 'PASS', 'Worker executed code successfully');
} catch (error) {
  addError(error, 'Worker Connectivity');
  addTest('Worker Connectivity', 'FAIL', {
    issue: 'Cannot execute code in worker',
    likely_cause: 'CODEMODE_WORKER_URL not set or worker not deployed',
    check: 'Verify .env.local has CODEMODE_WORKER_URL=https://codemode-sandbox.quentincody.workers.dev'
  });
}

// TEST 2: Helpers Object Available
try {
  addTest('Helpers Object', 'RUNNING', 'Checking if helpers object exists');
  if (typeof helpers === 'undefined') {
    throw new Error('helpers object is undefined');
  }
  const helperKeys = Object.keys(helpers);
  addTest('Helpers Object', 'PASS', {
    available_helpers: helperKeys,
    count: helperKeys.length
  });

  if (helperKeys.length === 0) {
    diagnostics.warnings.push('No MCP servers configured in helpers object');
  }
} catch (error) {
  addError(error, 'Helpers Object');
  addTest('Helpers Object', 'FAIL', {
    issue: 'helpers object not available',
    likely_cause: 'helpersImplementation not injected by Next.js',
    check: 'Verify Code Mode is enabled and MCP servers are configured'
  });
}

// TEST 3: MCP Server Access (ClinicalTrials)
try {
  addTest('MCP Server Access', 'RUNNING', 'Testing ClinicalTrials.gov MCP server');

  if (!helpers.clinicaltrials) {
    throw new Error('helpers.clinicaltrials not found. Available helpers: ' + Object.keys(helpers).join(', '));
  }

  const testSearch = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_search_studies', {
    query_cond: 'headache',
    pageSize: 5,
    jq_filter: '.studies | length'
  });

  addTest('MCP Server Access', 'PASS', {
    server: 'clinicaltrials',
    result_count: testSearch || 0,
    status: 'MCP proxy working correctly'
  });
} catch (error) {
  addError(error, 'MCP Server Access');
  addTest('MCP Server Access', 'FAIL', {
    issue: 'Cannot call MCP server',
    likely_cause: error.message.includes('PROXY_URL')
      ? 'Worker cannot reach Next.js proxy'
      : error.message.includes('not found')
      ? 'ClinicalTrials MCP server not configured'
      : 'Unknown MCP error',
    error_message: error.message,
    check: error.message.includes('PROXY_URL')
      ? 'Verify wrangler.toml PROXY_URL points to correct Next.js deployment'
      : 'Verify config/mcp-servers.json has clinicaltrialsgov-mcp-server configured'
  });
}

// TEST 4: Database Binding Available
try {
  addTest('Database Binding', 'RUNNING', 'Checking if helpers.db exists');

  if (!helpers.db) {
    throw new Error('helpers.db not found. Available helpers: ' + Object.keys(helpers).join(', '));
  }

  const dbMethods = ['createTable', 'exec', 'query', 'batchInsert', 'saveState', 'getState', 'getMetrics'];
  const availableMethods = dbMethods.filter(method => typeof helpers.db[method] === 'function');

  if (availableMethods.length !== dbMethods.length) {
    throw new Error(`Missing DB methods. Expected: ${dbMethods.join(', ')}. Found: ${availableMethods.join(', ')}`);
  }

  addTest('Database Binding', 'PASS', {
    methods: availableMethods,
    status: 'All DB methods available'
  });
} catch (error) {
  addError(error, 'Database Binding');
  addTest('Database Binding', 'FAIL', {
    issue: 'helpers.db not available or incomplete',
    likely_cause: error.message.includes('not found')
      ? 'CODEMODE_DB binding not passed to worker'
      : 'DB helper API not generated',
    check: 'Verify worker was deployed with wrangler.toml containing [[durable_objects.bindings]]',
    fix: 'Run: cd workers/codemode && wrangler deploy'
  });
}

// TEST 5: Database CREATE TABLE
try {
  addTest('DB Create Table', 'RUNNING', 'Creating test table');

  const tableName = 'diagnostic_test_' + Date.now();
  const createResult = await helpers.db.createTable(tableName, 'id INTEGER PRIMARY KEY, name TEXT, value REAL');

  if (!createResult.success) {
    throw new Error(createResult.error || 'CREATE TABLE returned success: false');
  }

  addTest('DB Create Table', 'PASS', {
    table: tableName,
    rows_written: createResult.rowsWritten || 0
  });
} catch (error) {
  addError(error, 'DB Create Table');
  addTest('DB Create Table', 'FAIL', {
    issue: 'Cannot create table',
    likely_cause: error.message.includes('CODEMODE_DB binding missing')
      ? 'Durable Object not accessible'
      : error.message.includes('not allowed')
      ? 'SQL validation rejected the statement'
      : 'Database operation failed',
    error_message: error.message,
    check: error.message.includes('binding missing')
      ? 'Worker not properly passing env.CODEMODE_DB to loader'
      : 'Check SQL syntax and guardrails'
  });
}

// TEST 6: Database INSERT
try {
  addTest('DB Insert', 'RUNNING', 'Inserting test data');

  const tableName = 'diagnostic_test_' + Date.now();
  await helpers.db.createTable(tableName, 'id INTEGER PRIMARY KEY, name TEXT, value REAL');

  const insertResult = await helpers.db.exec(
    `INSERT INTO ${tableName} (id, name, value) VALUES (?, ?, ?)`,
    [1, 'Test Record', 42.5]
  );

  if (!insertResult.success) {
    throw new Error(insertResult.error || 'INSERT returned success: false');
  }

  addTest('DB Insert', 'PASS', {
    rows_written: insertResult.rowsWritten || 0
  });
} catch (error) {
  addError(error, 'DB Insert');
  addTest('DB Insert', 'FAIL', {
    issue: 'Cannot insert data',
    error_message: error.message,
    check: 'Verify table was created successfully in previous test'
  });
}

// TEST 7: Database QUERY
try {
  addTest('DB Query', 'RUNNING', 'Querying test data');

  const tableName = 'diagnostic_test_' + Date.now();
  await helpers.db.createTable(tableName, 'id INTEGER PRIMARY KEY, name TEXT, value REAL');
  await helpers.db.exec(`INSERT INTO ${tableName} VALUES (1, 'Alice', 95.5)`);
  await helpers.db.exec(`INSERT INTO ${tableName} VALUES (2, 'Bob', 87.3)`);

  const rows = await helpers.db.query(`SELECT * FROM ${tableName} ORDER BY value DESC`);

  if (!rows || rows.length !== 2) {
    throw new Error(`Expected 2 rows, got ${rows?.length || 0}`);
  }

  if (rows[0].name !== 'Alice' || rows[0].value !== 95.5) {
    throw new Error(`Data mismatch. Expected Alice/95.5, got ${rows[0].name}/${rows[0].value}`);
  }

  addTest('DB Query', 'PASS', {
    rows_returned: rows.length,
    first_row: rows[0],
    status: 'SELECT query working correctly'
  });
} catch (error) {
  addError(error, 'DB Query');
  addTest('DB Query', 'FAIL', {
    issue: 'Cannot query data',
    error_message: error.message,
    check: 'Verify INSERT worked in previous test'
  });
}

// TEST 8: Database BATCH INSERT
try {
  addTest('DB Batch Insert', 'RUNNING', 'Testing batch insert with 10 records');

  const tableName = 'diagnostic_test_' + Date.now();
  await helpers.db.createTable(tableName, 'id INTEGER PRIMARY KEY, name TEXT, score INTEGER');

  const records = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    name: `Record ${i + 1}`,
    score: Math.floor(Math.random() * 100)
  }));

  const batchResult = await helpers.db.batchInsert(tableName, records);

  if (!batchResult.success) {
    throw new Error(batchResult.error || 'Batch insert returned success: false');
  }

  const count = await helpers.db.query(`SELECT COUNT(*) as count FROM ${tableName}`);

  if (count[0].count !== 10) {
    throw new Error(`Expected 10 records, found ${count[0].count}`);
  }

  addTest('DB Batch Insert', 'PASS', {
    records_inserted: 10,
    rows_written: batchResult.rowsWritten || 0,
    verified_count: count[0].count
  });
} catch (error) {
  addError(error, 'DB Batch Insert');
  addTest('DB Batch Insert', 'FAIL', {
    issue: 'Batch insert failed',
    error_message: error.message
  });
}

// TEST 9: Integration Test - MCP + Database
try {
  addTest('MCP + DB Integration', 'RUNNING', 'Fetching real data and storing in DB');

  // Fetch clinical trials
  const trials = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_search_studies', {
    query_cond: 'diabetes',
    pageSize: 10,
    jq_filter: '.studies[] | {nct_id: .protocolSection.identificationModule.nctId, title: .protocolSection.identificationModule.briefTitle, status: .protocolSection.statusModule.overallStatus}'
  });

  if (!trials || trials.length === 0) {
    throw new Error('No trials returned from MCP server');
  }

  // Store in DB
  const tableName = 'integration_test_' + Date.now();
  await helpers.db.createTable(tableName, 'nct_id TEXT PRIMARY KEY, title TEXT, status TEXT');
  await helpers.db.batchInsert(tableName, trials);

  // Query back
  const stored = await helpers.db.query(`SELECT COUNT(*) as count FROM ${tableName}`);

  if (stored[0].count !== trials.length) {
    throw new Error(`Mismatch: fetched ${trials.length} trials but stored ${stored[0].count}`);
  }

  // Aggregate
  const byStatus = await helpers.db.query(`
    SELECT status, COUNT(*) as count
    FROM ${tableName}
    GROUP BY status
    ORDER BY count DESC
  `);

  addTest('MCP + DB Integration', 'PASS', {
    trials_fetched: trials.length,
    trials_stored: stored[0].count,
    status_breakdown: byStatus,
    status: 'Full integration working!'
  });
} catch (error) {
  addError(error, 'MCP + DB Integration');
  addTest('MCP + DB Integration', 'FAIL', {
    issue: 'Integration test failed',
    error_message: error.message,
    check: 'Verify both MCP server and DB tests passed individually'
  });
}

// TEST 10: Session State
try {
  addTest('Session State', 'RUNNING', 'Testing state persistence');

  const testData = {
    timestamp: Date.now(),
    test: 'diagnostic',
    status: 'running'
  };

  await helpers.db.saveState('test_key', testData);
  const retrieved = await helpers.db.getState('test_key');

  if (JSON.stringify(retrieved) !== JSON.stringify(testData)) {
    throw new Error(`State mismatch. Saved: ${JSON.stringify(testData)}, Retrieved: ${JSON.stringify(retrieved)}`);
  }

  addTest('Session State', 'PASS', {
    saved: testData,
    retrieved: retrieved,
    status: 'State persistence working'
  });
} catch (error) {
  addError(error, 'Session State');
  addTest('Session State', 'FAIL', {
    issue: 'Cannot persist session state',
    error_message: error.message
  });
}

// TEST 11: Database Metrics
try {
  addTest('DB Metrics', 'RUNNING', 'Fetching database metrics');

  const metrics = await helpers.db.getMetrics();

  if (!metrics.result) {
    throw new Error('Metrics returned no result');
  }

  addTest('DB Metrics', 'PASS', {
    session_id: metrics.result.sessionId,
    database_size: metrics.result.databaseSize + ' bytes',
    tables: Object.keys(metrics.result.tables).length,
    table_list: Object.keys(metrics.result.tables)
  });
} catch (error) {
  addError(error, 'DB Metrics');
  addTest('DB Metrics', 'FAIL', {
    issue: 'Cannot fetch metrics',
    error_message: error.message
  });
}

// FINAL SUMMARY
console.log('\n' + '='.repeat(60));
console.log('DIAGNOSTIC SUMMARY');
console.log('='.repeat(60));

const passed = diagnostics.tests.filter(t => t.status === 'PASS').length;
const failed = diagnostics.tests.filter(t => t.status === 'FAIL').length;
const total = passed + failed;

diagnostics.summary = {
  total_tests: total,
  passed: passed,
  failed: failed,
  success_rate: total > 0 ? Math.round((passed / total) * 100) + '%' : '0%',
  overall_status: diagnostics.success ? 'ALL SYSTEMS GO ✅' : 'ISSUES DETECTED ⚠️'
};

console.log(`Tests Run: ${total}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success Rate: ${diagnostics.summary.success_rate}`);
console.log(`Status: ${diagnostics.summary.overall_status}`);

if (diagnostics.errors.length > 0) {
  console.log('\n' + '='.repeat(60));
  console.log('ERRORS ENCOUNTERED');
  console.log('='.repeat(60));
  diagnostics.errors.forEach((err, i) => {
    console.log(`\n${i + 1}. ${err.context}`);
    console.log(`   Message: ${err.message}`);
  });
}

if (diagnostics.warnings.length > 0) {
  console.log('\n' + '='.repeat(60));
  console.log('WARNINGS');
  console.log('='.repeat(60));
  diagnostics.warnings.forEach((warn, i) => {
    console.log(`${i + 1}. ${warn}`);
  });
}

return diagnostics;
```

---

## Expected Results

**If everything works:**
- All 11 tests should PASS
- Success rate: 100%
- Status: "ALL SYSTEMS GO ✅"

**If something's wrong:**
- Failed tests will show detailed error info
- Each failure includes likely cause and fix instructions
- Check the ERRORS section for specific issues
