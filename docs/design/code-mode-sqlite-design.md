# Code Mode Large-Data Design

## Goal
Enable Code Mode to handle datasets far beyond LLM context limits by treating SQLite as external working memory. The agent should default to staging, querying, and summarizing data in SQL, with safe execution and clear limits.

## High-Level Architecture
- **Scratch DB (session-scoped):** SQLite-backed Durable Object (DO) per session, used as transient working memory.
- **Persistent DB (optional):** D1 database per user/workspace for long-lived datasets.
- **Execution Sandbox:** Use Dynamic Worker Loader isolates when available; otherwise fallback to current code-mode worker execution.
- **Unified Helper API:** Expose `helpers.db` for SQL operations and state checkpoints; prefer SQL over in-memory JS.

## Key Cloudflare Capabilities (current)
- **Dynamic Worker Loader (closed beta):** Spawn isolates for untrusted code with optional network blocking and custom bindings.
- **SQLite-backed Durable Objects:** Strongly consistent storage with SQL API, JSON/FTS, and PITR per object.
- **D1:** Managed SQLite for long-lived, per-tenant datasets; supports Time Travel and Worker API access.

## Design Principles
- **Database-first reasoning:** Use SQL for filtering, aggregation, sorting, deduplication, and joins.
- **Batch processing:** Ingest in chunks; never load >1k rows into memory unless explicitly asked.
- **Compact outputs:** Return aggregates + small samples; summarize large results.
- **Safety and limits:** Enforce query timeouts, row caps, and allowed SQL statements.

## API Surface
### Code Mode Helper (injected)
```ts
helpers.db = {
  exec(sql: string, params?: any[]): Promise<{ success: true }>,
  query(sql: string, params?: any[]): Promise<{ results: any[] }>,
  batchInsert(table: string, records: Record<string, any>[]): Promise<{ success: true }>,
  createTable(name: string, schema: string): Promise<{ success: true }>,
  saveState(key: string, value: unknown): Promise<void>,
  getState<T>(key: string): Promise<T | null>
};
```

### SQL Guardrails
- Allow: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`, `CREATE INDEX`.
- Block by default: `ATTACH`, `PRAGMA`, `DROP`, `ALTER`, or multi-statement queries unless explicitly enabled.
- Enforce max row returns and query timeouts.

## Components
### 1) Durable Object: Scratch DB
- **Class:** `CodeModeDatabase`
- **Storage:** SQLite-backed DO (`ctx.storage.sql`).
- **Schema:**
  - `session_state(key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)`
  - `execution_logs(id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER, message TEXT)`
- **Request contract:**
  - `POST { operation: 'exec'|'query', sql, params }`
- **Lifecycle:**
  - Create per session (`sessionId`-scoped DO name).
  - Set TTL/alarms to delete after inactivity (e.g., 24h).

### 2) Proxy Routing
- **Entry:** `/api/codemode/proxy`
- **Behavior:**
  - Route `server === 'db'` to DO via `env.CODEMODE_DB` binding.
  - Preserve existing MCP tool routing.
  - Enforce guardrails and row caps on responses.

### 3) Helpers Injection
- **Location:** Code Mode helper generation (`lib/code-mode/dynamic-helpers.ts` or equivalent).
- **Changes:**
  - Add `helpers.db` wrapper that calls proxy with `{ server: 'db', tool: 'exec'|'query' }`.
  - Implement `batchInsert` with explicit column lists and chunking (500–1000 rows).

### 4) Execution Sandbox
- **Preferred:** Dynamic Worker Loader isolates with network blocked by default (`globalOutbound: null`).
- **Fallback:** Existing code execution path with equivalent limits.
- **Bindings:** Provide DB binding, MCP proxy binding, and controlled env values only.

## User/Agent Prompt Guidance
- Add to Code Mode system prompt:
  - Use DB for any dataset >100 records or multi-step analysis.
  - Aggregate in SQL, not JS loops.
  - Never load >1k records into memory.
  - Always summarize results; return samples only when needed.

## UI/UX Enhancements (optional)
- **Progress streaming:** Show structured progress logs (not raw row payloads).
- **Templates:** Provide “large dataset analysis” snippets that use DB staging.

## Implementation Steps (No Code Yet)
1. **Spec guardrails:** Define SQL whitelist/blacklist and max limits (rows, time, payload size).
2. **DO design:** Create `CodeModeDatabase` class with initialization, exec/query, and TTL cleanup.
3. **Proxy routing:** Add DB routing to `/api/codemode/proxy` with validation and limits.
4. **Helpers update:** Inject `helpers.db` with `exec`, `query`, `batchInsert`, `createTable`, `saveState`, `getState`.
5. **Prompt update:** Add database-first rules and large-data rubric to Code Mode system prompt.
6. **Telemetry:** Track dataset sizes, query times, row counts, and time-to-first-result.
7. **Docs:** Add examples to `docs/large-scale-data-workflows.md` showing staging and SQL aggregation.

## Testing & Validation
- **Unit:** DB helper input validation and batching behavior.
- **Integration:** Stage large data, query aggregates, confirm row caps and summaries.
- **Manual:** Validate progress logs and performance on large datasets.

## Risks & Mitigations
- **Dynamic Worker Loader beta:** Keep fallback execution path; detect availability.
- **Storage cost/retention:** Enforce TTL and explicit persistence choices.
- **Output bloat:** Default to summaries and sampled rows; enforce caps.

## Open Questions
- Should scratch DB be per chat session or per user?
- How long should scratch data persist (TTL)?
- When should data automatically upgrade to D1 (if ever)?
