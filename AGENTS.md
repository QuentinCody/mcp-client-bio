# Repository Guidelines

## Project Structure & Module Organization
- `app/` is the Next.js App Router; API routes live in `app/api/` (e.g., `app/api/chat/route.ts`).
- `components/`, `hooks/`, and `lib/` hold shared UI, React hooks, and core MCP/client logic.
- `ai/` contains provider configuration; `config/` stores MCP server defaults (see `config/mcp-servers.json`).
- `drizzle/` and `drizzle.config.ts` define database schema and migrations.
- `worker/` and `workers/` contain Code Mode/worker services.
- `public/` is for static assets; `tests/` houses Vitest suites (e.g., `tests/mcp-client.test.ts`).

## Build, Test, and Development Commands
Run from the repo root:
```bash
pnpm install        # install dependencies (Node >= 18.18)
pnpm dev            # start Next.js dev server on http://localhost:3000
pnpm build          # production build
pnpm start          # run the production server
pnpm lint           # Next.js ESLint rules
pnpm test           # Vitest (unit/integration)
```
Database and diagnostics:
```bash
pnpm db:generate    # generate Drizzle migrations
pnpm db:migrate     # apply migrations
pnpm db:push        # push schema changes
pnpm db:studio      # open Drizzle Studio UI
pnpm openai:health  # check provider connectivity
```

## Coding Style & Naming Conventions
- TypeScript-first; 2-space indentation and semicolons.
- Prefer double-quoted imports and consistent, grouped Tailwind utility classes.
- Client components must start with `"use client"` and use PascalCase filenames (e.g., `ChatSidebar.tsx`).
- Hooks are `useCamelCase` (e.g., `useMCPRoots`); route folders stay lowercase.
- Run `pnpm lint` before opening a PR.

## Testing Guidelines
- Tests run via Vitest and live in `tests/*.test.ts`.
- Use `pnpm test` or target a file: `pnpm test tests/mcp-live.test.ts`.
- Live MCP tests require reachable servers/config; note any network prerequisites in PRs.

## Commit & Pull Request Guidelines
- Git history uses Conventional Commits in present tense (e.g., `feat: add retry logic`, `fix: adjust timeouts`).
- PRs should describe user impact, list env/db changes, link related issues, and include screenshots for UI updates.
- Note test coverage or why tests were not added.

## Security & Configuration Tips
- Keep secrets in `.env.local` (never commit them).
- Update MCP defaults in `config/mcp-servers.json` and restart the dev server after changes.
