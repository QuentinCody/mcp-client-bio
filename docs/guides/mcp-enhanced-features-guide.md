# MCP Enhanced Features Guide

Quick guide to using the new MCP protocol features in Bio MCP Client.

## New Features

1. **Roots Management** - Control which directories MCP servers can access
2. **Progress Tracking** - See real-time progress for long-running operations
3. **Request Cancellation** - Cancel slow or stuck MCP requests
4. **Protocol Compliance** - Full support for MCP 2025-11-25 specification

## Quick Start

### Managing Filesystem Roots

Roots define which directories MCP servers can access for security.

```typescript
import { addMCPRoot, getMCPRoots } from '@/lib/mcp-client-enhanced';

// Add a root directory
await addMCPRoot('file:///home/user/projects/myapp', 'My App');

// Get all roots
const roots = getMCPRoots();
// [{ uri: 'file:///home/user/projects/myapp', name: 'My App' }]
```

**In React Components:**

```tsx
import { MCPRootsManager } from '@/components/mcp-roots-manager';

export function Settings() {
  return <MCPRootsManager />;
}
```

### Tracking Progress

Display progress for long-running MCP operations.

```tsx
import { MCPProgressIndicator } from '@/components/mcp-progress-indicator';

export function MyComponent() {
  return (
    <MCPProgressIndicator
      progressToken="search-pubmed-123"
      requestId="req-456"
      showCancelButton={true}
    />
  );
}
```

**Using the Hook:**

```typescript
import { useProgressTracking } from '@/lib/hooks/use-mcp-progress';

function MyComponent() {
  const { latestUpdate, updates } = useProgressTracking('my-token');

  return (
    <div>
      Progress: {latestUpdate?.progress} / {latestUpdate?.total}
      <p>{latestUpdate?.message}</p>
    </div>
  );
}
```

### Cancelling Requests

Cancel slow or stuck MCP requests.

```tsx
import { useMCPCancellation } from '@/lib/hooks/use-mcp-progress';

function MyComponent() {
  const { cancelRequest, isCancelling } = useMCPCancellation();

  const handleCancel = () => {
    cancelRequest('request-id', 'User cancelled');
  };

  return (
    <button onClick={handleCancel} disabled={isCancelling}>
      Cancel
    </button>
  );
}
```

### Viewing Active Requests

See all active MCP requests with one component.

```tsx
import { MCPActiveRequests } from '@/components/mcp-active-requests';

export function Dashboard() {
  return <MCPActiveRequests />;
}
```

## API Reference

### Roots Management

**Functions:**
- `setMCPRoots(roots: Root[])` - Replace all roots
- `addMCPRoot(uri: string, name?: string)` - Add a root
- `removeMCPRoot(uri: string)` - Remove a root
- `getMCPRoots()` - Get all roots

**Hook:**
- `useMCPRoots()` - React hook for roots management

**Component:**
- `<MCPRootsManager />` - Full UI for managing roots

**API Endpoints:**
- `GET /api/mcp-roots` - List roots
- `POST /api/mcp-roots` - Add/set roots
- `DELETE /api/mcp-roots?uri=...` - Remove root

### Progress Tracking

**Functions:**
- `recordProgressUpdate(update)` - Record progress
- `getProgressUpdatesForToken(token)` - Get updates
- `clearProgressUpdates(token)` - Clear updates
- `trackRequest(id, server)` - Track request
- `untrackRequest(id)` - Untrack request

**Hooks:**
- `useProgressTracking(token)` - Track specific token
- `useActiveRequests()` - Get all active requests
- `useProgressWithCancellation(token)` - Combined hook

**Components:**
- `<MCPProgressIndicator />` - Progress bar
- `<MCPActiveRequests />` - Active requests list

**API Endpoints:**
- `GET /api/mcp-progress?token=...` - Get progress for token
- `GET /api/mcp-progress` - Get all active requests

### Request Cancellation

**Functions:**
- `manager.cancelRequest(id, reason)` - Cancel request

**Hook:**
- `useMCPCancellation()` - React hook for cancellation

**API Endpoint:**
- `POST /api/mcp-cancel` - Cancel request

## Examples

### Complete Setup

```typescript
import {
  initializeEnhancedMCPClients,
  setMCPRoots,
} from '@/lib/mcp-client-enhanced';

// 1. Configure roots
setMCPRoots([
  { uri: 'file:///home/user/workspace', name: 'Workspace' },
  { uri: 'file:///home/user/data', name: 'Data' },
]);

// 2. Initialize clients
const manager = await initializeEnhancedMCPClients([
  {
    name: 'PubMed',
    url: 'https://pubmed-server.example.com',
    type: 'http',
  },
]);

// 3. Use tools with progress tracking
const tools = manager.tools;

// 4. Monitor progress
const progress = manager.getProgressUpdates();

// 5. Cancel if needed
manager.cancelRequest('slow-request', 'Taking too long');

// 6. Cleanup
await manager.cleanup();
```

### Dashboard Component

```tsx
'use client';

import { MCPRootsManager } from '@/components/mcp-roots-manager';
import { MCPActiveRequests } from '@/components/mcp-active-requests';

export function MCPDashboard() {
  return (
    <div className="space-y-6">
      <h1>MCP Configuration</h1>

      {/* Manage filesystem roots */}
      <MCPRootsManager />

      {/* View active requests */}
      <MCPActiveRequests />
    </div>
  );
}
```

## Best Practices

### Security

1. **Only expose necessary roots**
   ```typescript
   // ✅ Good - specific directory
   addMCPRoot('file:///home/user/projects/myapp', 'My App');

   // ❌ Bad - entire home directory
   addMCPRoot('file:///home/user', 'Home');
   ```

2. **Validate all URIs**
   - The client automatically validates that URIs start with `file://`
   - Only add roots that the user has explicitly approved

### Progress Tracking

1. **Clear progress when complete**
   ```typescript
   if (isComplete) {
     clearProgressUpdates(token);
   }
   ```

2. **Use unique tokens**
   ```typescript
   const token = `search-${Date.now()}-${Math.random()}`;
   ```

### Cancellation

1. **Provide user feedback**
   ```tsx
   {isCancelling && <p>Cancelling...</p>}
   ```

2. **Handle race conditions**
   - Cancellation may arrive after completion
   - Always handle gracefully

## Troubleshooting

### Roots not working

- Ensure URI starts with `file://`
- Check that directory exists and is accessible
- Verify server supports roots capability

### Progress not updating

- Ensure progressToken is passed to server
- Check that server supports progress notifications
- Verify polling interval in `useProgressTracking`

### Cancellation not working

- Ensure requestId is correct
- Check that server respects cancellation
- Some operations may not be cancellable

## Related Documentation

- [MCP Protocol Compliance](./mcp-protocol-compliance.md) - Full technical details
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25) - Official spec
- [CLAUDE.md](../CLAUDE.md) - Project architecture
