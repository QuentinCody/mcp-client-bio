# MCP Tooling Strategy

This section outlines how to take advantage of Claude’s advanced tool features when connecting to the heterogeneous MCP servers listed in `config/mcp-servers.json`.

## Tool Search Tool for discovery
- Keep only the three to five highest-traffic tools loaded by default, and mark every other server or tool with `defer_loading: true` in your MCP registration payloads. This keeps the initial prompt lean while allowing Claude to discover everything through the Tool Search Tool when needed.
- Mirror that setup in your MCP config by adding an optional `default_config` block to each server entry, e.g.:

```
  {
    "name": "ClinicalTrials",
    "default_config": { "defer_loading": true },
    "description": "...",
    "type": "streamable-http",
    ...
  }
```

- When you need a high-frequency tool, override it with its own config using `"defer_loading": false` so Claude always has immediate access.
- Document the system prompt and tool list under `app/chat` so the agent knows the domains covered and when to jump to tool discovery.

## Programmatic Tool Calling for orchestration
- Opt-in tools that can be called from code by setting `allowed_callers: ["code_execution_20250825"]` in the tool definition before forwarding them to Claude. This is especially useful for workflows in `lib/mcp` that fetch data from multiple servers (ClinicalTrials → OpenTargets → Entrez, for example).
- Return each tool’s structured metadata in the API contract (`app/api/*`) so Claude can write correct parsing logic. Provide sample outputs or docstrings describing array shapes, nested objects and units.
- Keep tooling scripts in `scripts/` or `lib/mcp` to reuse orchestration code snippets across flows.

## Tool Use Examples for accuracy
- Add `input_examples` to tool definitions for domains with optional nested inputs (e.g., `search_variants`, `get_clinical_study`) so Claude knows which fields pair together.
- Keep 1–5 realistic examples per tool: minimal payloads, fully populated payloads, and edge cases (missing optional nodes or differing enums) to help Claude pick the right tool variant.
- Use the same naming conventions found in `config/mcp-servers.json` (e.g., `OpenTargets`, `CIViC`) so the examples align with real API expectations.

## Bringing it together
- Combine Tool Search, programmatic calling, and examples as your agent scales: use search to find the right server, programmatic calling to orchestrate multiple MCP responses, and examples to ensure correct paramization.
- Document these conventions in `AGENTS.md` and align your PR descriptions with any MCP-related changes (configs, tool defs, docs).
