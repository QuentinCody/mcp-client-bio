"use client";

import { useCallback, useEffect, useState } from "react";
import type { McpTransport, PromptSummary } from "@/lib/mcp/transport/http";

export function useMcpPrompts(transport: McpTransport, serverId: string) {
  const [prompts, setPrompts] = useState<PromptSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setLoading(true);
      setError(null);
      try {
        const acc: PromptSummary[] = [];
        let cursor: string | undefined;
        const seenCursors = new Set<string>(); // Prevent loop if the server keeps returning the same cursor.
        do {
          const result = await transport.listPrompts(serverId, cursor);
          acc.push(...(result.prompts ?? []));
          const rawNext = typeof result.nextCursor === "string" ? result.nextCursor : undefined;
          const nextCursor = rawNext && rawNext.trim().length > 0 ? rawNext : undefined;
          if (nextCursor) {
            if (seenCursors.has(nextCursor)) {
              console.warn(`[MCP] prompts/list returned duplicate cursor (${nextCursor}) for ${serverId}; terminating pagination to avoid a loop.`);
              cursor = undefined;
            } else {
              seenCursors.add(nextCursor);
              cursor = nextCursor;
            }
          } else {
            cursor = undefined;
          }
        } while (cursor);
        if (!cancelled) {
          setPrompts(acc);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load prompts";
          setError(message);
          setPrompts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (serverId) {
      void hydrate();
    } else {
      setPrompts([]);
    }
    return () => {
      cancelled = true;
    };
  }, [serverId, transport]);

  const search = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return prompts;
      return prompts.filter((prompt) => {
        return [prompt.name, prompt.title, prompt.description]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(q));
      });
    },
    [prompts]
  );

  return { prompts, loading, error, search };
}
