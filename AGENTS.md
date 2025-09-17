# Repository Guidelines

## Project Structure & Module Organization
The Next.js App Router lives in `app/`, with API handlers in `app/api/` and feature routes in `app/chat` and `app/diagnostics`. Shared UI components sit in `components/`, reusable hooks in `hooks/`, and protocol logic under `lib/mcp` alongside database schemas in `lib/db`. Configure AI providers via `ai/providers.ts`, while MCP defaults live in `config/mcp-servers.json`. Store Drizzle migrations in `drizzle/`, automation scripts in `scripts/`, Playwright specs in `tests/`, and static assets in `public/`.

## Build, Test, and Development Commands
Run `pnpm install` once to sync dependencies. Use `pnpm dev` for the local server on `http://localhost:3000`. Ship-ready bundles come from `pnpm build`, launched with `pnpm start`. Keep lint rules honest with `pnpm lint --fix`. Database workflows rely on `pnpm db:generate`, `pnpm db:migrate`, and `pnpm db:push`, while `pnpm db:studio` opens the Drizzle Studio UI. Verify OpenAI connectivity with `pnpm openai:health`.

## Coding Style & Naming Conventions
Write features in TypeScript with two-space indentation and retain semicolons. Imports use double quotes; group Tailwind utility classes coherently. Client-side React components begin with `"use client"` and use PascalCase filenames (e.g., `ChatSidebar.tsx`). Hooks follow `useCamelCase`, route folders stay lowercase, and API route handlers mirror App Router conventions.

## Testing Guidelines
Lint coverage comes first; fix warnings before committing. Add targeted Playwright specs in `tests/*.spec.ts` for new flows and run them with `pnpm exec playwright test`. Document manual verification steps when tests are impractical and update MCP presets when transport behavior changes.

## Commit & Pull Request Guidelines
Adopt Conventional Commits (`feat:`, `fix:`, `chore:`) in present tense. Pull requests should explain user impact, call out environment or database changes, link related issues, and include relevant screenshots or terminal output. Confirm `pnpm lint` (and any added tests) before requesting review.

## Security & Configuration Tips
Never commit secrets—store them in `.env.local` or deployment-specific stores. Keep `config/mcp-servers.json` limited to non-sensitive defaults. Review timeout settings in `lib/mcp-client.ts` when adjusting MCP transports, and rerun `pnpm openai:health` after configuration changes.
