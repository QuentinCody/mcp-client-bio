# MCP Prompts UX Spec

This repository ships a browser-first MCP prompt experience that mirrors the VS Code and Copilot chat flows. The following notes capture the implementation contract we follow when wiring new clients or extending UI behavior.

## A.1 Goals
- Expose MCP server prompts as slash commands (`/mcp.<server>.<prompt>`) alongside built-in commands and local prompt files.
- After the user picks a prompt, walk through required and optional arguments with live completions when the server supports them.
- Always show the exact composed text and any attached MCP resources before sending. Enter should submit just like the normal chat box.
- Keep the HTTP transport reusable in desktop builds (stdio/SSE) but optimized for browsers.

## A.2 Capability Handshake
- Only surface prompts for servers that declare `capabilities.prompts`.
- Call `prompts/list` with pagination and cache results in the prompt registry.
- Subscribe to `notifications/prompts/list_changed` and refresh the cache + UI when it fires.
- Use `completion/complete` for per-argument suggestions when the server advertises completion support.

## A.3 Unified Slash Surface
- Merge built-in slash commands, user prompt files, and MCP prompts in a single picker.
- Format MCP entries as `/mcp.<server>.<prompt>` and show `title`/`description` metadata.
- Support fuzzy search across name, title, and description, grouped by provider category (Built-in | Prompts | MCP).

## A.4 Post-Selection Journeys
- **Journey A – no-arg prompt:** Fetch `prompts/get({ name })`, preview the resulting messages/resources, allow edits, Enter to send.
- **Journey B – prompt with args:** Render a form dialog with labels, required chips, and help text. Invoke `completion/complete({ ref:{type:"ref/prompt",name}, argument, context:{arguments} })` while the user types, validate required fields, then call `prompts/get({ name, arguments })` and show the preview before send.
- **Journey C – wizard variant:** Same as B, but one argument per step with Back/Next controls. Still uses the completion API.
- **Journey D – adjacent flows:** Handle tool call confirmations, mid-run elicitation prompts, and “undo last request” actions once the prompt has been sent.

## A.5 Preview & Transparency
- Render the verbatim text returned by `prompts/get().messages` prior to submission.
- Display attached MCP resources as removable chips.
- Maintain Enter-to-send parity with the standard chat experience.

## A.6 Errors & Resilience
- Surface JSON-RPC validation issues (e.g. `-32602`) inline with the offending argument.
- Show toasts for network or transport failures but keep form state so retries are trivial.
- When offline, present cached prompts in a disabled state rather than dropping them.

## A.7 Browser Considerations
- Default to the HTTP transport, handling CORS and auth headers, and cache prompt metadata (e.g. via IndexedDB) to minimize round-trips.
- Keep dialogs non-blocking, keyboard accessible, and label suggestion lists for screen readers.

## A.8 Minimal Type Contracts
```ts
interface PromptSummary { name: string; title?: string; description?: string; arguments?: Arg[] }
interface Arg { name: string; description?: string; required?: boolean }
interface GetPromptResult { messages: PromptMessage[]; description?: string }
interface CompleteResult { completion: { values: string[]; hasMore?: boolean; total?: number } }
```
