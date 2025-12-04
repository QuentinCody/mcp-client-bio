# Repository Guidelines

## Project Structure & Module Organization
- `app/` holds the Next.js App Router, with API handlers under `app/api/`, chat/diagnostics routes under `app/chat` and `app/diagnostics`, and page layouts defined nearby.
- Shared UI lives in `components/`, reusable hooks in `hooks/`, and protocol/database code in `lib/mcp` and `lib/db`.
- Configuration for AI providers and MCP presets sits in `ai/providers.ts` and `config/mcp-servers.json`, while migrations and automation scripts live in `drizzle/` and `scripts/`.
- Playwright specs reside in `tests/*.spec.ts`, and static assets should be placed in `public/`.

## Build, Test, and Development Commands
- `pnpm install` – syncs dependencies once before running other commands.
- `pnpm dev` – starts the local Next.js server on `http://localhost:3000`.
- `pnpm build` / `pnpm start` – produces and serves the production-ready bundle.
- `pnpm lint --fix` – enforces formatting and lint rules; run before committing.
- `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:push` – manage Drizzle schema migrations; `pnpm db:studio` opens the UI.
- `pnpm openai:health` – verifies OpenAI connectivity after transport or credential changes.

## Coding Style & Naming Conventions
- Use TypeScript with two-space indentation and semicolons.
- Prefer double-quoted imports and keep Tailwind utility classes grouped logically.
- Client React components begin with `"use client"` and PascalCase filenames like `ChatSidebar.tsx`.
- Hooks follow `useCamelCase`, route folders remain lowercase, and API handlers mirror App Router conventions.
- Keep lint rules honest via `pnpm lint`, resolve warnings before landing changes.

## Testing Guidelines
- Playwright handles end-to-end specs in `tests/*.spec.ts`; use `pnpm exec playwright test` to execute suites.
- Tests should target new flows; name specs to reflect behavior (e.g., `chat-flow.spec.ts`).
- Document manual verification steps when automated coverage is impractical.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (e.g., `feat:`, `fix:`, `chore:`) in present tense; the Git history reflects this pattern.
- PR descriptions must clarify user impact, highlight environment/database changes, and link related issues.
- Include screenshots or terminal output when demonstrating UI or behavioral changes.

## Security & Configuration Tips
- Never commit secrets—store them in `.env.local` or deployment-specific stores.
- Keep `config/mcp-servers.json` limited to non-sensitive defaults.
- Review `lib/mcp-client.ts` when adjusting transports, and rerun `pnpm openai:health` after configuration updates.
- Document advanced MCP workflows in `docs/mcp-tooling.md`, covering tool search, programmatic calling, and usage examples for the servers listed in `config/mcp-servers.json`.
