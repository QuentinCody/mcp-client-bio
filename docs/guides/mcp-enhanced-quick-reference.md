# MCP Enhanced Features - Quick Reference

Quick reference guide for the new MCP protocol features.

## 🚀 Getting Started

### Install and Run Demo

```bash
# Install dependencies
pnpm install

# Run demo script
npx tsx scripts/demo-enhanced-mcp.ts

# Run tests
pnpm test tests/mcp-enhanced.test.ts
```

## 📁 Roots Management

### Add a Root

```typescript
import { addMCPRoot } from '@/lib/mcp-client-enhanced';

addMCPRoot('file:///home/user/workspace', 'My Workspace');
```

### React Component

```tsx
import { MCPRootsManager } from '@/components/mcp-roots-manager';

<MCPRootsManager />
```

### API Usage

```bash
# List roots
curl http://localhost:3000/api/mcp-roots

# Add root
curl -X POST http://localhost:3000/api/mcp-roots \
  -H "Content-Type: application/json" \
  -d '{"action":"add","uri":"file:///workspace","name":"Workspace"}'

# Remove root
curl -X DELETE "http://localhost:3000/api/mcp-roots?uri=file:///workspace"
```

## 📊 Progress Tracking

### Track Progress

```tsx
import { MCPProgressIndicator } from '@/components/mcp-progress-indicator';

<MCPProgressIndicator
  progressToken="search-123"
  requestId="req-456"
  showCancelButton={true}
/>
```

### Use Hook

```typescript
import { useProgressTracking } from '@/lib/hooks/use-mcp-progress';

const { latestUpdate, updates } = useProgressTracking('my-token');
```

## ❌ Request Cancellation

### Cancel a Request

```typescript
import { useMCPCancellation } from '@/lib/hooks/use-mcp-progress';

const { cancelRequest } = useMCPCancellation();
await cancelRequest('request-id', 'User cancelled');
```

### API Usage

```bash
curl -X POST http://localhost:3000/api/mcp-cancel \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req-123","reason":"Too slow"}'
```

## 🔍 Active Requests

### View Active Requests

```tsx
import { MCPActiveRequests } from '@/components/mcp-active-requests';

<MCPActiveRequests />
```

### Use Hook

```typescript
import { useActiveRequests } from '@/lib/hooks/use-mcp-progress';

const { activeRequests } = useActiveRequests();
```

## 🔧 Full Integration Example

```typescript
import {
  initializeEnhancedMCPClients,
  setMCPRoots,
} from '@/lib/mcp-client-enhanced';

// 1. Configure roots
setMCPRoots([
  { uri: 'file:///workspace', name: 'Workspace' },
]);

// 2. Initialize clients
const manager = await initializeEnhancedMCPClients([
  {
    name: 'PubMed',
    url: 'https://pubmed-server.example.com',
    type: 'http',
  },
]);

// 3. Use tools
const tools = manager.tools;

// 4. Monitor and control
manager.cancelRequest('slow-request');
const progress = manager.getProgressUpdates();

// 5. Cleanup
await manager.cleanup();
```

## 📚 Documentation

- **User Guide:** [docs/mcp-enhanced-features-guide.md](./docs/mcp-enhanced-features-guide.md)
- **Technical Spec:** [docs/mcp-protocol-compliance.md](./docs/mcp-protocol-compliance.md)
- **Summary:** [MCP_IMPROVEMENTS_SUMMARY.md](./MCP_IMPROVEMENTS_SUMMARY.md)

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run enhanced features tests only
pnpm test tests/mcp-enhanced.test.ts

# Run demo
npx tsx scripts/demo-enhanced-mcp.ts
```

## 📦 New Files Overview

| File | Purpose |
|------|---------|
| `lib/mcp-client-enhanced.ts` | Enhanced MCP client core |
| `lib/hooks/use-mcp-roots.ts` | Roots management hook |
| `lib/hooks/use-mcp-progress.ts` | Progress tracking hooks |
| `app/api/mcp-roots/route.ts` | Roots API endpoint |
| `app/api/mcp-progress/route.ts` | Progress API endpoint |
| `app/api/mcp-cancel/route.ts` | Cancellation API endpoint |
| `components/mcp-roots-manager.tsx` | Roots UI component |
| `components/mcp-progress-indicator.tsx` | Progress UI component |
| `components/mcp-active-requests.tsx` | Active requests UI |
| `tests/mcp-enhanced.test.ts` | Test suite |

## ✅ Compliance Checklist

- [x] MCP Protocol Version 2025-11-25
- [x] Protocol version headers
- [x] Client capabilities negotiation
- [x] Roots capability
- [x] Progress tracking
- [x] Request cancellation
- [x] Session management support
- [x] React integration
- [x] API endpoints
- [x] Documentation
- [x] Tests

## 🔗 Quick Links

- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [Vercel AI SDK MCP Docs](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- [Project README](./README.md)
- [CLAUDE.md](./CLAUDE.md)

---

**Protocol Version:** 2025-11-25
**Implementation Status:** ✅ Complete
**Last Updated:** 2025-12-21
