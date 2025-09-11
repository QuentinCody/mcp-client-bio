"use client";
import { findTokens } from "@/lib/mcp/prompts/token";
import { promptRegistry } from "@/lib/mcp/prompts/singleton";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import { renderPrompt } from "@/lib/mcp/prompts/renderer";

export type ResolvedPromptMessage = { role: "system" | "user" | "assistant"; text: string };

export type ResolvedPromptEntry = {
  id: string;
  namespace: string;
  name: string;
  title?: string;
  origin: SlashPromptDef["origin"];
  sourceServerId?: string;
  version?: string;
  args: Record<string, string>;
  messages: ResolvedPromptMessage[];
};

export type ResolvedPromptContext = {
  entries: ResolvedPromptEntry[];
  flattened: ResolvedPromptMessage[];
};

/**
 * Resolves all prompt tokens in the input text to concrete MCP messages.
 * This uses client-side templates where available and server `prompts/get` for server-import prompts.
 * Arguments are pulled from the provided argState first, then from localStorage fallback.
 */
export async function resolvePromptsForInput(
  input: string,
  argState?: { def: SlashPromptDef; vals: Record<string, string> } | null,
  opts?: { mcpServers?: Array<{ id: string; url: string; type: string; headers?: Array<{ key: string; value: string }> }>; }
): Promise<ResolvedPromptContext | null> {
  const tokens = findTokens(input);
  if (!tokens.length) return null;
  const entries: ResolvedPromptEntry[] = [];

  for (const t of tokens) {
    try { console.log('[PROMPT RESOLVE] token', t.namespace+'/'+t.name); } catch {}
    const def = promptRegistry.getByNamespaceName(t.namespace, t.name);
    if (!def) continue;
    const vars = argState?.def.id === def.id
      ? (argState?.vals || {})
      : JSON.parse(localStorage.getItem(`prompt:${def.id}:args`) || "{}");

    let messages: ResolvedPromptMessage[] = [];
    if (def.mode === "template" && def.template) {
      try { console.log('[PROMPT RESOLVE] using template for', def.id); } catch {}
      messages = renderPrompt(def, vars).map(m => ({ role: m.role, text: m.content }));
    } else if (def.mode === "server") {
      try {
        const server = opts?.mcpServers?.find(s => s.id === def.sourceServerId);
        if (server) {
          try { console.log('[PROMPT RESOLVE] fetching server prompt', def.name, 'from', server.url); } catch {}
          const res = await fetch('/api/mcp-prompts/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: server.url,
              type: server.type === 'http' ? 'http' : 'sse',
              headers: server.headers,
              name: def.name,
              args: vars,
            })
          });
          if (res.ok) {
            const data = await res.json();
            const msgs: Array<{ role: string; text: string }> = data.messages || [];
            try { console.log('[PROMPT RESOLVE] server returned messages=', msgs.length); } catch {}
            messages = msgs.map(m => ({
              role: (m.role as any) || 'user',
              text: m.text || ''
            }));
          }
        }
      } catch {
        // swallow network/server errors; entry will be empty
      }
    }
    entries.push({
      id: def.id,
      namespace: def.namespace,
      name: def.name,
      title: def.title,
      origin: def.origin,
      sourceServerId: def.sourceServerId,
      version: def.version,
      args: vars,
      messages,
    });
  }

  const flattened = entries.flatMap(e => e.messages);
  return { entries, flattened };
}
