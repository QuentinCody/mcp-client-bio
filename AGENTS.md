# Repository Guidelines

## MCP Agent Mail: coordination for multi-agent workflows

What it is:
- A mail-like layer that lets coding agents coordinate asynchronously via MCP tools and resources.
- Provides identities, inbox/outbox, searchable threads, and advisory file reservations, with human-auditable artifacts in Git.

Why it's useful:
- Prevents agents from stepping on each other with explicit file reservations (leases) for files/globs.
- Keeps communication out of your token budget by storing messages in a per-project archive.
- Offers quick reads (`resource://inbox/...`, `resource://thread/...`) and macros that bundle common flows.

How to use effectively:

1) Same repository
   - Register an identity: call `ensure_project`, then `register_agent` using this repo's absolute path as `project_key`.
   - Reserve files before you edit: `file_reservation_paths(project_key, agent_name, ["src/**"], ttl_seconds=3600, exclusive=true)` to signal intent and avoid conflict.
   - Communicate with threads: use `send_message(..., thread_id="FEAT-123")`; check inbox with `fetch_inbox` and acknowledge with `acknowledge_message`.
   - Read fast: `resource://inbox/{Agent}?project=<abs-path>&limit=20` or `resource://thread/{id}?project=<abs-path>&include_bodies=true`.
   - Tip: set `AGENT_NAME` in your environment so the pre-commit guard can block commits that conflict with others' active exclusive file reservations.

2) Across different repos in one project (e.g., Next.js frontend + FastAPI backend)
   - Option A (single project bus): register both sides under the same `project_key` (shared key/path). Keep reservation patterns specific (e.g., `frontend/**` vs `backend/**`).
   - Option B (separate projects): each repo has its own `project_key`; use `macro_contact_handshake` or `request_contact`/`respond_contact` to link agents, then message directly. Keep a shared `thread_id` (e.g., ticket key) across repos for clean summaries/audits.

Macros vs granular tools:
- Prefer macros when you want speed or are on a smaller model: `macro_start_session`, `macro_prepare_thread`, `macro_file_reservation_cycle`, `macro_contact_handshake`.
- Use granular tools when you need control: `register_agent`, `file_reservation_paths`, `send_message`, `fetch_inbox`, `acknowledge_message`.

Common pitfalls:
- "from_agent not registered": always `register_agent` in the correct `project_key` first.
- "FILE_RESERVATION_CONFLICT": adjust patterns, wait for expiry, or use a non-exclusive reservation when appropriate.
- Auth errors: if JWT+JWKS is enabled, include a bearer token with a `kid` that matches server JWKS; static bearer is used only when JWT is disabled.

## Multi-Agent Tmux Workflow

For running multiple AI agents (Codex, Claude Code, etc.) simultaneously on this project:

**Scripts available:**
- `scripts/broadcast-agents.sh` - Broadcast messages to all agent tmux panes
- `scripts/agent-kickoff.md` - Kickoff message template for new agent sessions

**Quick start:**
```bash
# 1. Create a tmux session with 4 panes for agents
./scripts/broadcast-agents.sh --create 4

# 2. Attach and start different agents in each pane
tmux attach -t agents
# In each pane: run codex, claude, or other AI agents

# 3. Broadcast the kickoff message to all agents
./scripts/broadcast-agents.sh --file scripts/agent-kickoff.md --enter

# 4. Or enable synchronized typing for manual control
./scripts/broadcast-agents.sh --sync
```

**Workflow (Jeffrey Emanuel style):**
1. Start 4-6 agent instances in the same project folder
2. Each agent registers with Agent Mail using adjective+noun names
3. Broadcast the same kickoff message: read AGENTS.md, register, introduce yourself
4. Agents coordinate via Agent Mail for hours, checking inbox and reserving files
5. Queue additional messages as needed - Codex buffers input while processing

**Environment:**
- Set `AGENT_SESSION=myproject` to use a custom tmux session name
- Set `AGENT_NAME=YourAgent` for pre-commit hook conflict detection

## Project Structure & Module Organization
- `app/` holds the Next.js App Router, with API handlers under `app/api/` and route folders like `app/chat` and `app/diagnostics`.
- Shared UI lives in `components/`, reusable hooks in `hooks/`, and protocol/database code in `lib/mcp` and `lib/db`.
- AI provider configuration is in `ai/providers.ts`, with MCP defaults in `config/mcp-servers.json`.
- Migrations and automation scripts are in `drizzle/` and `scripts/`, while static assets are in `public/`.
- Playwright specs live in `tests/*.spec.ts`.

## Build, Test, and Development Commands
- `pnpm install` syncs dependencies before running other commands.
- `pnpm dev` starts the Next.js dev server at `http://localhost:3000`.
- `pnpm build` and `pnpm start` produce and serve the production bundle.
- `pnpm lint --fix` enforces linting and formatting rules.
- `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:push` manage Drizzle schema changes.
- `pnpm db:studio` opens the Drizzle UI; `pnpm openai:health` checks provider connectivity.

## Coding Style & Naming Conventions
- Use TypeScript with two-space indentation and semicolons.
- Prefer double-quoted imports; keep Tailwind utility classes grouped logically.
- Client components start with "use client" and use PascalCase filenames (e.g., `ChatSidebar.tsx`).
- Hooks follow `useCamelCase`; route folders stay lowercase; API handlers follow App Router conventions.

## Testing Guidelines
- Playwright drives end-to-end coverage in `tests/*.spec.ts`.
- Run suites with `pnpm exec playwright test`.
- Name specs to match behavior, such as `chat-flow.spec.ts`.
- Document manual verification steps when automated coverage is impractical.

## Commit & Pull Request Guidelines
- Use Conventional Commits in present tense (e.g., `feat: add chat export`).
- PRs should describe user impact, note environment or database changes, and link related issues.
- Include screenshots or terminal output when UI or behavior changes.

## Security & Configuration Tips
- Store secrets in `.env.local` or deployment-specific stores.
- Keep `config/mcp-servers.json` limited to non-sensitive defaults.
- Review `lib/mcp-client.ts` when adjusting transports, and rerun `pnpm openai:health` after updates.
- Document advanced MCP workflows in `docs/mcp-tooling.md`.
