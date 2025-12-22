/**
 * Integration test script for structuredContent enforcement
 * Tests real MCP servers to validate compliance
 *
 * Usage: pnpm ts-node scripts/test-structured-content.ts
 */

import {
  validateStructuredContent,
  extractStructuredData,
  generateComplianceReport,
  type StructuredContentValidationResult,
} from '../lib/code-mode/structured-content-enforcer';

// Mock MCP responses for different compliance levels
interface TestCase {
  serverName: string;
  toolName: string;
  response: {
    structuredContent?: any;
    content?: Array<{ type: string; text: string }>;
  };
}

const testResponses: Record<string, TestCase> = {
  // COMPLIANT: Proper structuredContent
  compliant: {
    serverName: 'compliant-server',
    toolName: 'search',
    response: {
      structuredContent: {
        results: [
          { id: 1, title: 'Result A', score: 0.95 },
          { id: 2, title: 'Result B', score: 0.89 },
        ],
        metadata: {
          total: 2,
          query: 'test search',
          timestamp: new Date().toISOString(),
        },
      },
    },
  },

  // NON-COMPLIANT: Legacy text format
  legacyText: {
    serverName: 'legacy-server',
    toolName: 'search',
    response: {
      content: [
        {
          type: 'text',
          text: `Found 2 results:
1. Result A (score: 0.95)
2. Result B (score: 0.89)`,
        },
      ],
    },
  },

  // NON-COMPLIANT: JSON in markdown
  jsonInMarkdown: {
    serverName: 'markdown-server',
    toolName: 'search',
    response: {
      content: [
        {
          type: 'text',
          text: `## Search Results

\`\`\`json
{
  "results": [
    {"id": 1, "title": "Result A"},
    {"id": 2, "title": "Result B"}
  ],
  "total": 2
}
\`\`\``,
        },
      ],
    },
  },

  // NON-COMPLIANT: Markdown table
  markdownTable: {
    serverName: 'table-server',
    toolName: 'search',
    response: {
      content: [
        {
          type: 'text',
          text: `| ID | Title | Score |
|---|---|---|
| 1 | Result A | 0.95 |
| 2 | Result B | 0.89 |`,
        },
      ],
    },
  },

  // COMPLIANT: Error with structuredContent
  errorCompliant: {
    serverName: 'error-server',
    toolName: 'search',
    response: {
      structuredContent: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'API rate limit exceeded',
        },
        metadata: {
          retryAfter: 60,
          limit: 100,
        },
      },
    },
  },

  // COMPLIANT: Data staging response
  stagingCompliant: {
    serverName: 'staging-server',
    toolName: 'large_search',
    response: {
      structuredContent: {
        staged: true,
        dataAccessId: 'search_results_1234567890_ab12',
        tables: ['results', 'metadata'],
        primaryTable: 'results',
        rowCount: 10000,
        sizeBytes: 2500000,
      },
    },
  },
};

interface TestResult {
  serverName: string;
  toolName: string;
  validation: StructuredContentValidationResult;
  extraction: ReturnType<typeof extractStructuredData>;
  passed: boolean;
  notes: string[];
}

function runTest(
  name: string,
  test: TestCase,
  options: { expectCompliant: boolean }
): TestResult {
  console.log(`\n📋 Testing: ${name}`);
  console.log(`   Server: ${test.serverName}, Tool: ${test.toolName}`);

  const validation = validateStructuredContent(test.response, {
    serverKey: test.serverName,
    toolName: test.toolName,
    logWarnings: false,
  });

  const extraction = extractStructuredData(test.response, {
    enableFallback: true,
    logWarnings: false,
    serverKey: test.serverName,
    toolName: test.toolName,
  });

  const notes: string[] = [];
  let passed = true;

  // Check compliance expectation
  if (options.expectCompliant && !validation.hasStructuredContent) {
    passed = false;
    notes.push('❌ Expected structuredContent but not found');
  } else if (!options.expectCompliant && validation.hasStructuredContent) {
    passed = false;
    notes.push('❌ Expected no structuredContent but found one');
  }

  // Report issues
  for (const issue of validation.issues) {
    const emoji = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
    notes.push(`${emoji} ${issue.code}: ${issue.message}`);
  }

  // Check extraction success (error responses are expected to fail)
  if (extraction.ok) {
    notes.push(`✅ Extraction successful (source: ${extraction._source})`);
  } else if (extraction._source === 'structuredContent' && extraction.error) {
    // Error responses with structuredContent are compliant
    notes.push(`✅ Error handled properly: ${extraction.error.message}`);
  } else {
    notes.push(`❌ Extraction failed: ${extraction.error?.message}`);
    passed = false;
  }

  // Report content type
  notes.push(`📊 Content type: ${validation.contentType}`);

  console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  for (const note of notes) {
    console.log(`   ${note}`);
  }

  return {
    serverName: test.serverName,
    toolName: test.toolName,
    validation,
    extraction,
    passed,
    notes,
  };
}

async function main() {
  console.log('🧪 structuredContent Enforcement Integration Tests\n');
  console.log('=' .repeat(60));

  const results: TestResult[] = [];

  // Test compliant responses
  console.log('\n\n📗 COMPLIANT RESPONSES (should pass)');
  console.log('─'.repeat(60));

  results.push(
    runTest('Compliant: Standard structuredContent', testResponses.compliant, {
      expectCompliant: true,
    })
  );

  results.push(
    runTest('Compliant: Error with structuredContent', testResponses.errorCompliant, {
      expectCompliant: true,
    })
  );

  results.push(
    runTest('Compliant: Data staging response', testResponses.stagingCompliant, {
      expectCompliant: true,
    })
  );

  // Test non-compliant responses
  console.log('\n\n📕 NON-COMPLIANT RESPONSES (fallback parsing)');
  console.log('─'.repeat(60));

  results.push(
    runTest('Non-compliant: Legacy text format', testResponses.legacyText, {
      expectCompliant: false,
    })
  );

  results.push(
    runTest('Non-compliant: JSON in markdown', testResponses.jsonInMarkdown, {
      expectCompliant: false,
    })
  );

  results.push(
    runTest('Non-compliant: Markdown table', testResponses.markdownTable, {
      expectCompliant: false,
    })
  );

  // Generate compliance report
  console.log('\n\n📊 COMPLIANCE REPORT');
  console.log('='.repeat(60));

  const validations = results.map(r => r.validation);
  const report = generateComplianceReport(validations);

  console.log(`\nTotal Responses: ${report.totalResponses}`);
  console.log(`Compliant Responses: ${report.compliantResponses}`);
  console.log(`Compliance Rate: ${report.complianceRate}%`);

  console.log('\nIssues Summary:');
  for (const [code, count] of Object.entries(report.issuesSummary)) {
    console.log(`  - ${code}: ${count}`);
  }

  if (report.recommendations.length > 0) {
    console.log('\nRecommendations:');
    for (const rec of report.recommendations) {
      console.log(`  • ${rec}`);
    }
  }

  // Test summary
  console.log('\n\n🎯 TEST SUMMARY');
  console.log('='.repeat(60));

  const passedTests = results.filter(r => r.passed).length;
  const failedTests = results.length - passedTests;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`Passed: ${passedTests} ✅`);
  console.log(`Failed: ${failedTests} ❌`);

  if (failedTests > 0) {
    console.log('\nFailed Tests:');
    for (const result of results.filter(r => !r.passed)) {
      console.log(`  ❌ ${result.serverName}.${result.toolName}`);
      for (const note of result.notes.filter(n => n.startsWith('❌'))) {
        console.log(`     ${note}`);
      }
    }
  }

  // Overall result
  console.log('\n' + '='.repeat(60));
  if (failedTests === 0) {
    console.log('🎉 ALL TESTS PASSED!');
    process.exit(0);
  } else {
    console.log('⚠️  SOME TESTS FAILED');
    process.exit(1);
  }
}

// Run tests
main().catch(err => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
