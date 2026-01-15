# Final Response Formatting Issue (JSON vs Plain Text)

## Problem Summary
The assistant is still ending its **final responses** with JSON/structured outputs even when explicitly asked to respond in plain text or markdown. This is undesirable because the final answer should be human-readable, while structured outputs are only appropriate inside the Code Mode sandbox or when the user explicitly asks for JSON.

## Constraints / Clarifications
- **No client-level data staging is enabled.** The MCP client should not force staging or rely on staging being available.
- Some MCP servers may **independently stage** results and return a `data_access_id`. The client should be able to handle that when it happens, but should not require staging or assume it is always available.
- Tool calls must remain functional; any fixes should **not** interfere with tool execution.

## Symptoms Observed
- The model repeatedly returns JSON-only final messages even after user instructions like “write in plain text” or “no JSON.”
- Example failures show the assistant returning JSON blocks or raw structured objects after sandbox execution.
- In several runs, the assistant treated its sandbox return object as the final answer and echoed it directly.

## What We Have Tried So Far

### Prompt and Tool Description Changes
1. **Added explicit guidance in Code Mode system prompt** to allow plain text / markdown final responses and discourage JSON unless requested.
   - `app/api/chat/route.ts`: “Your final response (outside the sandbox) should be plain text or markdown unless the user explicitly asks for JSON.”

2. **Updated Code Mode tool description** to clarify that structured results are for sandbox use only.
   - `app/api/chat/route.ts`: “Sandbox code should return structured objects; do not return the final user response from the sandbox.”

3. **Inserted final-response rules** into both short and full Code Mode prompts.
   - `app/api/chat/route.ts`:
     - “Write a plain text or markdown summary for the user.”
     - “Do NOT output JSON or raw tool results unless explicitly requested.”

4. **Adjusted helper docs** to reinforce final response rules.
   - `lib/code-mode/helper-docs.ts`: added “Final Response Format (outside the sandbox)” section.

### Temporary Post-Processing Layer (Added then Removed)
5. **Added a JSON normalization layer** to convert JSON-only final responses into bullet summaries.
   - `lib/formatting/assistant-output.ts`
   - Applied in:
     - `components/chat.tsx`
     - `app/api/chat/route.ts`

6. **Removed the post-processing layer** because it produced “weird bullet points” and you explicitly requested no post-processing.
   - Deleted `lib/formatting/assistant-output.ts`
   - Removed client and server normalization hooks.

### Tool-Related Adjustments (Not directly about final output, but relevant)
7. **Expanded helper methods and fallbacks** to reduce tool call errors and name mismatches.
   - `lib/code-mode/helpers-with-transform.ts`: added direct tool methods + proxy fallback to route unknown method names to `invoke()`.

8. **Guardrails and meta helpers** for tool invocations to make tool execution more reliable without changing final output.
   - `invokeWithMeta`, `getDataWithMeta`, validation, retry and structured error summaries.

9. **Clarified staging behavior** in helpers:
   - `getData()` attempts to handle server-staged data if a server returns `data_access_id`.
   - No client-level staging is enabled or forced.

## Current State
- The prompt guidance has been tightened in multiple places, but the model still sometimes returns JSON-only outputs as its final response.
- Post-processing was removed at your request, so the assistant now relies entirely on prompt compliance.

## Why This Still Happens
- The model often treats the **sandbox return value** as the final response.
- The Code Mode workflow emphasizes structured data inside the sandbox, which biases the model toward structured final outputs despite prompt instructions.
- There is no deterministic enforcement layer anymore (by design), so prompt non-compliance still happens.

## Open Questions / Next Steps (Non-Post-Processing)
To stop JSON outputs without adding post-processing, we likely need to modify the **model instruction flow** rather than formatting outputs after the fact. Options that do not alter final outputs directly include:

1. **Separate the “sandbox return” from the “assistant response” more explicitly** in the prompt structure.
   - Example: Add a rule like “The sandbox return is for internal use only; never paste it into the final answer.”

2. **Demote structured output examples** in the helper docs (limit JSON-focused snippets unless explicitly required).

3. **Add a deterministic “final response template” in prompt** (plain text with headings), while still allowing the model to choose wording.

4. **Reduce emphasis on structured outputs in usage examples** (especially examples that end with `return { ... }`).

## Data Staging Clarification
- We are **not enabling client-level data staging**.
- The client should only **handle staging if a server provides it** (i.e., `data_access_id` in response).
- If staging is disabled on all servers, the client should operate purely on inline data and text responses.

---

If you want, I can now audit and remove any remaining “return structured object” bias in the prompt and examples, while keeping tool calls intact.
