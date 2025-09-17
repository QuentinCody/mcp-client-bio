"use client";
import { findTokens } from "@/lib/mcp/prompts/token";
import { promptRegistry } from "@/lib/mcp/prompts/singleton";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import { renderPrompt } from "@/lib/mcp/prompts/renderer";
type MCPPromptContent = { type: string; [key: string]: any };
type MCPPromptMessage = {
  role: string;
  content?: MCPPromptContent[];
};

export type ResolvedPromptMessage = {
  role: MCPPromptMessage["role"];
  content: MCPPromptMessage["content"];
  text: string;
};

export type ResolvedPromptEntry = {
  id: string;
  trigger: string;
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
  opts?: {
    mcpServers?: Array<{ id: string; url: string; type: string; headers?: Array<{ key: string; value: string }> }>;
    promptFetcher?: (
      serverId: string,
      promptName: string,
      args: Record<string, string>
    ) => Promise<MCPPromptMessage[] | null>;
  }
): Promise<ResolvedPromptContext | null> {
  const tokens = findTokens(input);
  if (!tokens.length) return null;
  const entries: ResolvedPromptEntry[] = [];

  for (const t of tokens) {
    try { console.log('[PROMPT RESOLVE] token', t.trigger); } catch {}
    const def = promptRegistry.getByTrigger(t.trigger);
    if (!def) continue;
    const vars = argState?.def.id === def.id
      ? (argState?.vals || {})
      : JSON.parse(localStorage.getItem(`prompt:${def.id}:args`) || "{}");

    let messages: ResolvedPromptMessage[] = [];
    if (def.mode === "template" && def.template) {
      try { console.log('[PROMPT RESOLVE] using template for', def.id); } catch {}
      messages = renderPrompt(def, vars).map((m) => ({
        role: m.role,
        content: [{ type: 'text', text: m.content } as MCPPromptContent],
        text: m.content,
      }));
    } else if (def.mode === "server") {
      try {
        const server = opts?.mcpServers?.find(s => s.id === def.sourceServerId);
        let promptMessages: MCPPromptMessage[] | null = null;
        if (def.sourceServerId && opts?.promptFetcher) {
          promptMessages = await opts.promptFetcher(def.sourceServerId, def.name, vars);
        }

        if (!promptMessages && server) {
          try { console.log('[PROMPT RESOLVE] fallback fetch for server prompt', def.name, 'from', server.url); } catch {}
          const res = await fetch('/api/mcp-prompts/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: server.url,
              type: server.type,
              headers: server.headers,
              name: def.name,
              args: vars,
            })
          });
          if (res.ok) {
            const data = await res.json();
            promptMessages = Array.isArray(data?.messages) ? data.messages : [];
          }
        }

        if (promptMessages) {
          try { console.log('[PROMPT RESOLVE] server returned messages=', promptMessages.length); } catch {}
          messages = normalizePromptMessages(promptMessages);
        }
      } catch {
        // swallow network/server errors; entry will be empty
      }
    }
    entries.push({
      id: def.id,
      trigger: def.trigger,
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

export function normalizePromptMessages(messages: MCPPromptMessage[]): ResolvedPromptMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => {
    const contentArray = normalizeContentArray((message as any)?.content);
    const text = contentArray
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        switch (item.type) {
          case 'text':
            return item.text ?? '';
          case 'resource':
            return item.resource?.uri ? `[resource ${item.resource.uri}]` : '[resource]';
          case 'image':
            return item.data ? '[image inline]' : item.url ? `[image ${item.url}]` : '[image]';
          case 'audio':
            return item.data ? '[audio inline]' : item.url ? `[audio ${item.url}]` : '[audio]';
          case 'file':
            return item.path ? `[file ${item.path}]` : '[file]';
          case 'tool_result':
            return item.result ? `[tool ${item.result.name ?? 'result'}]` : '[tool]';
          default:
            return `[${item.type ?? 'content'}]`;
        }
      })
      .filter(Boolean)
      .join('\n');

    return {
      role: message.role,
      content: contentArray,
      text,
    } as ResolvedPromptMessage;
  });
}

function normalizeContentArray(content: any): MCPPromptContent[] {
  if (Array.isArray(content)) return content as MCPPromptContent[];
  if (!content && content !== 0) return [];
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  if (typeof content === 'object' && content.type) {
    return [content as MCPPromptContent];
  }
  return [];
}

export function createResolvedPromptEntry(
  def: SlashPromptDef,
  args: Record<string, string>,
  messages: MCPPromptMessage[]
): ResolvedPromptEntry {
  return {
    id: def.id,
    trigger: def.trigger,
    namespace: def.namespace,
    name: def.name,
    title: def.title,
    origin: def.origin,
    sourceServerId: def.sourceServerId,
    version: def.version,
    args,
    messages: normalizePromptMessages(messages),
  };
}

export function createResolvedPromptContext(
  entry: ResolvedPromptEntry
): ResolvedPromptContext {
  const flattened = entry.messages.slice();
  return {
    entries: [entry],
    flattened,
  };
}
