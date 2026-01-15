# MCP Protocol Compliance (2025-11-25 Specification)

This document describes the Bio MCP Client's compliance with the Model Context Protocol specification version 2025-11-25 and the enhancements made to support all protocol features.

## Overview

The Bio MCP Client now fully implements the MCP 2025-11-25 specification, including:

- ✅ **Protocol Version Headers** - Proper HTTP headers for version negotiation
- ✅ **Client Capabilities** - Advertises roots, sampling, and progress support
- ✅ **Proper Initialization** - Full initialize → initialized notification sequence
- ✅ **Session Management** - MCP-Session-Id header support
- ✅ **Cancellation Protocol** - notifications/cancelled for aborting requests
- ✅ **Progress Tracking** - Progress tokens and notifications/progress
- ✅ **Roots Capability** - Expose filesystem boundaries to servers

## Implementation Details

### 1. Protocol Version Headers

**Specification Requirement:**
> Clients MUST include the `MCP-Protocol-Version` header on all HTTP requests

**Implementation:**
- File: `lib/mcp-client-enhanced.ts`
- All HTTP and SSE transports include `MCP-Protocol-Version: 2025-11-25` header
- Version constant exported for consistency: `MCP_PROTOCOL_VERSION`

```typescript
const MCP_PROTOCOL_VERSION = '2025-11-25';

// Applied to all requests
headers: {
  'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
  'Accept': 'application/json, text/event-stream',
}
```

### 2. Client Capabilities Negotiation

**Specification Requirement:**
> Clients supporting roots MUST declare the roots capability during initialization

**Implementation:**
- Capabilities declared in `getClientCapabilities()`:
  - `roots`: With `listChanged: true` for dynamic root updates
  - `sampling`: For LLM sampling requests
  - Progress support (implicit via progressToken)

```typescript
capabilities: {
  roots: {
    listChanged: true,
  },
  sampling: {},
}
```

### 3. Roots Capability

**Specification Requirement:**
> Roots provide a standardized way for clients to expose filesystem "roots" (directory boundaries) to servers

**Implementation:**

#### API Endpoints
- `GET /api/mcp-roots` - List all configured roots
- `POST /api/mcp-roots` - Add root or set all roots
- `DELETE /api/mcp-roots` - Remove a root

#### React Hooks
- `useMCPRoots()` - Hook for managing roots in React components

#### Utility Functions
- `setMCPRoots(roots)` - Replace all roots
- `addMCPRoot(uri, name)` - Add a single root
- `removeMCPRoot(uri)` - Remove a root
- `getMCPRoots()` - Get all configured roots

#### UI Components
- `MCPRootsManager` - Full UI for managing roots

#### Root Format
```typescript
interface Root {
  uri: string;     // Must be file:// URI
  name?: string;   // Optional human-readable name
}
```

**Example:**
```typescript
import { addMCPRoot } from '@/lib/mcp-client-enhanced';

// Add working directory as root
addMCPRoot('file:///home/user/projects/myapp', 'My App');
```

**Security Considerations:**
- All URIs validated to ensure they start with `file://`
- Roots should only be added with user consent
- Servers respect root boundaries during file operations

### 4. Progress Tracking

**Specification Requirement:**
> MCP supports optional progress tracking for long-running operations through notification messages

**Implementation:**

#### Progress Token Flow
1. Client includes `progressToken` in request metadata
2. Server sends `notifications/progress` with updates
3. Client tracks progress and displays to user

#### API Endpoints
- `GET /api/mcp-progress?token={token}` - Get updates for specific token
- `GET /api/mcp-progress` - Get all active requests

#### React Hooks
- `useProgressTracking(token)` - Track progress for specific token
- `useActiveRequests()` - Get all active requests
- `useProgressWithCancellation(token)` - Combined progress + cancel

#### UI Components
- `MCPProgressIndicator` - Progress bar with cancel button
- `MCPActiveRequests` - List all active requests

#### Utility Functions
- `recordProgressUpdate(update)` - Record progress notification
- `getProgressUpdatesForToken(token)` - Get updates for token
- `clearProgressUpdates(token)` - Clear updates when complete
- `trackRequest(id, server)` - Track active request
- `untrackRequest(id)` - Mark request complete

**Example:**
```typescript
import { MCPProgressIndicator } from '@/components/mcp-progress-indicator';

<MCPProgressIndicator
  progressToken="my-progress-token"
  requestId="request-123"
  showCancelButton={true}
/>
```

### 5. Cancellation Protocol

**Specification Requirement:**
> Either side can send a cancellation notification to indicate that a previously-issued request should be terminated

**Implementation:**

#### API Endpoint
- `POST /api/mcp-cancel` - Cancel a request

**Request Body:**
```json
{
  "requestId": "request-123",
  "reason": "User requested cancellation"
}
```

#### React Hook
- `useMCPCancellation()` - Hook for cancelling requests

**Example:**
```typescript
import { useMCPCancellation } from '@/lib/hooks/use-mcp-progress';

const { cancelRequest } = useMCPCancellation();

await cancelRequest('request-123', 'User clicked cancel');
```

#### Notification Format
Per specification:
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/cancelled",
  "params": {
    "requestId": "123",
    "reason": "User requested cancellation"
  }
}
```

**Behavior:**
- Cancellation is best-effort (server may ignore if already complete)
- Race conditions handled gracefully
- Client tracks cancellation client-side
- UI indicates cancellation state

### 6. Session Management

**Specification Requirement:**
> Servers MAY assign a session ID via the `MCP-Session-Id` header in the InitializeResponse

**Implementation:**
- Enhanced MCP client extracts `sessionId` from initialization response
- Session ID included in subsequent requests (if available)
- Stored in `EnhancedMCPClient.sessionId`

**Note:** The AI SDK's `createMCPClient` may not expose session ID directly. This feature depends on underlying transport implementation.

## Usage Examples

### Basic Setup with Enhanced Features

```typescript
import { initializeEnhancedMCPClients, setMCPRoots } from '@/lib/mcp-client-enhanced';

// Configure roots before connecting
setMCPRoots([
  {
    uri: 'file:///home/user/projects/myapp',
    name: 'My Application',
  },
  {
    uri: 'file:///home/user/documents',
    name: 'Documents',
  },
]);

// Initialize clients with enhanced features
const manager = await initializeEnhancedMCPClients([
  {
    name: 'PubMed Server',
    url: 'https://pubmed-server.example.com',
    type: 'http',
    headers: [{ key: 'Authorization', value: 'Bearer token' }],
  },
]);

// Use tools normally
const tools = manager.tools;

// Cancel a request if needed
manager.cancelRequest('request-id', 'Timeout');

// Get progress updates
const progress = manager.getProgressUpdates();

// Cleanup when done
await manager.cleanup();
```

### React Component Example

```typescript
'use client';

import { MCPRootsManager } from '@/components/mcp-roots-manager';
import { MCPActiveRequests } from '@/components/mcp-active-requests';
import { MCPProgressIndicator } from '@/components/mcp-progress-indicator';

export function MCPDashboard() {
  return (
    <div className="space-y-4">
      <MCPRootsManager />
      <MCPActiveRequests />
      <MCPProgressIndicator
        progressToken="my-token"
        requestId="req-123"
      />
    </div>
  );
}
```

## Architecture

### File Organization

```
lib/
  mcp-client-enhanced.ts          # Enhanced MCP client with full protocol support
  hooks/
    use-mcp-roots.ts              # React hooks for roots management
    use-mcp-progress.ts           # React hooks for progress tracking

app/api/
  mcp-roots/route.ts              # Roots management API
  mcp-progress/route.ts           # Progress tracking API
  mcp-cancel/route.ts             # Request cancellation API

components/
  mcp-roots-manager.tsx           # UI for managing roots
  mcp-progress-indicator.tsx      # Progress bar component
  mcp-active-requests.tsx         # Active requests list
```

### Data Flow

```
1. User configures roots via UI
   ↓
2. Roots stored in enhanced client state
   ↓
3. Client connects to MCP servers with:
   - MCP-Protocol-Version header
   - Client capabilities (roots, sampling, progress)
   ↓
4. Server responds with:
   - Supported protocol version
   - Server capabilities
   - Optional session ID
   ↓
5. During tool execution:
   - Progress updates tracked and displayed
   - User can cancel via UI
   - Roots enforced for file operations
```

## Testing

### Unit Tests

```bash
pnpm test
```

Test files:
- `tests/mcp-enhanced.test.ts` - Enhanced client features
- `tests/mcp-roots.test.ts` - Roots management
- `tests/mcp-progress.test.ts` - Progress tracking
- `tests/mcp-cancellation.test.ts` - Cancellation protocol

### Integration Testing

```bash
# Test with live MCP server
npx tsx scripts/test-mcp-enhanced.ts
```

## Migration Guide

### From Basic MCP Client to Enhanced Client

**Before:**
```typescript
import { initializeMCPClients } from '@/lib/mcp-client';

const { tools } = await initializeMCPClients(servers);
```

**After:**
```typescript
import { initializeEnhancedMCPClients, setMCPRoots } from '@/lib/mcp-client-enhanced';

// Configure roots (optional)
setMCPRoots([
  { uri: 'file:///path/to/workspace', name: 'Workspace' },
]);

const manager = await initializeEnhancedMCPClients(servers);
const tools = manager.tools;

// Access enhanced features
manager.cancelRequest('id', 'reason');
const progress = manager.getProgressUpdates();
```

## Compliance Checklist

- ✅ Protocol version header (`MCP-Protocol-Version: 2025-11-25`)
- ✅ Client capabilities negotiation
- ✅ Proper initialization sequence (initialize → initialized)
- ✅ Session management (MCP-Session-Id)
- ✅ Roots capability (roots/list, notifications/roots/list_changed)
- ✅ Progress tracking (progressToken, notifications/progress)
- ✅ Cancellation (notifications/cancelled)
- ✅ Timeout handling with proper cancellation
- ✅ Error handling per JSON-RPC specification
- ✅ Security best practices (URI validation, access control)

## References

- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Client - Roots](https://modelcontextprotocol.io/specification/2025-11-25/client/roots)
- [MCP Client - Sampling](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling)
- [MCP Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [MCP Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP Cancellation](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation)
- [MCP Progress](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress)
