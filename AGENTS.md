# Repository Guidelines

## Project Structure & Module Organization
- App Router: `app/` (pages, layouts, API routes).
- UI components: `components/` and `components/ui/`.
- Domain/utilities: `lib/` (e.g., `lib/mcp-client.ts`, `lib/db/`).
- Config: root `eslint.config.mjs`, `next.config.ts`, `tsconfig.json`.
- Database: Drizzle schema in `lib/db/schema.ts`; migrations in `drizzle/`.
- Public assets: `public/`. Environment: `.env.local` (dev), `.env` (general), see `.env.example`.

## Build, Test, and Development Commands
- Install: `pnpm install`
- Dev server: `pnpm dev` (Next.js, port 3000)
- Prod build: `pnpm build`
- Start prod: `pnpm start`
- Lint: `pnpm lint`
- Database (Drizzle): `pnpm db:generate` (migrations), `pnpm db:migrate` (apply), `pnpm db:push` (sync), `pnpm db:studio` (UI)
- Diagnostics: `pnpm openai:health`

## Coding Style & Naming Conventions
- Language: TypeScript + React (App Router). Strict types enabled.
- Indentation: 2 spaces; keep lines concise; prefer early returns.
- Filenames: kebab-case for files/dirs (e.g., `chat-sidebar.tsx`); components use PascalCase identifiers inside.
- Hooks: `hooks/` with `use-*.ts` naming.
- Imports: prefer path aliases (e.g., `@/components/...`, `@/lib/...`).
- Styling: Tailwind CSS utilities; colocate minimal styles in components; avoid deep custom CSS.
- Linting: Next + TypeScript rules in `eslint.config.mjs`. Run `pnpm lint` before committing.

## Testing Guidelines
- No formal test runner is configured. Validate changes via `pnpm dev` and `pnpm build` (type checks) and exercise affected UI paths.
- If adding tests, prefer lightweight, isolated additions and keep config self-contained within the PR.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:` (see git history).
- Commits should be small and scoped; include rationale in the body when helpful.
- PRs must include: summary, motivation/linked issue, instructions to validate, and screenshots/GIFs for UI changes.
- Ensure `pnpm build` and `pnpm lint` pass. Include migration notes if DB schema changes.

## Security & Configuration Tips
- Never commit secrets. Set `DATABASE_URL`, model API keys (e.g., `OPENAI_API_KEY`, `XAI_API_KEY`) in `.env.local`.
- Drizzle config reads from `.env.local`; verify before running DB commands.
