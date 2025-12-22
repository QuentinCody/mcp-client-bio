/**
 * Demo script for Enhanced MCP Client Features
 * Demonstrates protocol compliance and new capabilities
 */

import {
  initializeEnhancedMCPClients,
  setMCPRoots,
  addMCPRoot,
  getMCPRoots,
  recordProgressUpdate,
  getProgressUpdatesForToken,
  trackRequest,
  untrackRequest,
  getActiveRequests,
  MCP_PROTOCOL_VERSION,
} from '../lib/mcp-client-enhanced';
import type { MCPServerConfig } from '../lib/mcp-client-enhanced';

async function demo() {
  console.log('🚀 Enhanced MCP Client Demo\n');
  console.log(`Protocol Version: ${MCP_PROTOCOL_VERSION}\n`);

  // 1. Configure Roots
  console.log('📁 Step 1: Configuring filesystem roots...');
  addMCPRoot('file:///tmp/demo-workspace', 'Demo Workspace');
  addMCPRoot('file:///tmp/demo-data', 'Demo Data');

  const roots = getMCPRoots();
  console.log(`   ✅ Configured ${roots.length} roots:`);
  roots.forEach(root => {
    console.log(`      - ${root.name}: ${root.uri}`);
  });
  console.log();

  // 2. Initialize Enhanced MCP Client
  console.log('🔌 Step 2: Initializing enhanced MCP clients...');
  console.log('   Note: This demo uses sample server configs');
  console.log('   In production, use real MCP server URLs');
  console.log();

  // Sample server configuration (replace with actual servers)
  const servers: MCPServerConfig[] = [
    // Uncomment to test with real servers:
    // {
    //   name: 'PubMed Server',
    //   url: 'https://pubmed-mcp.example.com',
    //   type: 'http' as const,
    // }
  ];

  if (servers.length > 0) {
    try {
      const manager = await initializeEnhancedMCPClients(servers);
      console.log(`   ✅ Connected to ${manager.clients.length} servers`);
      console.log(`   ✅ Available tools: ${Object.keys(manager.tools).length}`);
      console.log();

      // Cleanup
      await manager.cleanup();
    } catch (error) {
      console.log('   ⚠️  No servers configured for demo');
      console.log();
    }
  } else {
    console.log('   ℹ️  No servers configured (demo mode)');
    console.log();
  }

  // 3. Progress Tracking Demo
  console.log('📊 Step 3: Demonstrating progress tracking...');
  const progressToken = 'demo-progress-123';

  // Simulate progress updates
  console.log(`   Token: ${progressToken}`);
  for (let i = 0; i <= 100; i += 25) {
    recordProgressUpdate({
      progressToken,
      progress: i,
      total: 100,
      message: i === 100 ? 'Complete!' : `Processing... ${i}%`,
      timestamp: Date.now(),
    });

    const updates = getProgressUpdatesForToken(progressToken);
    const latest = updates[updates.length - 1];
    console.log(`   📈 ${latest.progress}/${latest.total} - ${latest.message}`);

    // Small delay for demo
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  console.log('   ✅ Progress tracking complete');
  console.log();

  // 4. Request Tracking Demo
  console.log('🔍 Step 4: Demonstrating request tracking...');
  const requestId = 'demo-request-456';

  trackRequest(requestId, 'demo-server');
  console.log(`   ✅ Tracking request: ${requestId}`);

  const activeRequests = getActiveRequests();
  console.log(`   📊 Active requests: ${activeRequests.size}`);

  activeRequests.forEach((data, id) => {
    console.log(`      - ${id} (${data.server})`);
  });

  untrackRequest(requestId);
  console.log(`   ✅ Untracked request: ${requestId}`);
  console.log();

  // 5. Capability Summary
  console.log('✨ Enhanced MCP Client Capabilities:');
  console.log('   ✅ Protocol version headers (MCP-Protocol-Version)');
  console.log('   ✅ Client capabilities negotiation');
  console.log('   ✅ Filesystem roots management');
  console.log('   ✅ Progress tracking with tokens');
  console.log('   ✅ Request cancellation support');
  console.log('   ✅ Session management (MCP-Session-Id)');
  console.log();

  // 6. Integration Points
  console.log('🔗 Integration Points:');
  console.log('   API Endpoints:');
  console.log('   - GET  /api/mcp-roots');
  console.log('   - POST /api/mcp-roots');
  console.log('   - DELETE /api/mcp-roots');
  console.log('   - GET  /api/mcp-progress');
  console.log('   - POST /api/mcp-cancel');
  console.log();
  console.log('   React Hooks:');
  console.log('   - useMCPRoots()');
  console.log('   - useProgressTracking(token)');
  console.log('   - useMCPCancellation()');
  console.log('   - useActiveRequests()');
  console.log();
  console.log('   UI Components:');
  console.log('   - <MCPRootsManager />');
  console.log('   - <MCPProgressIndicator />');
  console.log('   - <MCPActiveRequests />');
  console.log();

  console.log('✅ Demo complete!\n');
  console.log('📖 See docs/mcp-enhanced-features-guide.md for usage examples');
  console.log('📖 See docs/mcp-protocol-compliance.md for technical details');
  console.log('📖 See MCP_IMPROVEMENTS_SUMMARY.md for complete overview');
}

// Run demo
demo().catch(error => {
  console.error('❌ Demo failed:', error);
  process.exit(1);
});
