"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PromptSummary } from "@/lib/mcp/transport/http";

export type SlashPickerEntry =
  | { kind: "builtin"; id: string; title: string; description?: string }
  | { kind: "user"; id: string; title: string; description?: string }
  | { kind: "mcp"; id: string; serverId: string; prompt: PromptSummary };

export function SlashPicker({
  builtins,
  userPrompts,
  mcpServers,
  onSelect,
  className,
}: {
  builtins: { id: string; title: string; description?: string }[];
  userPrompts: { id: string; title: string; description?: string }[];
  mcpServers: { id: string; title?: string; prompts: PromptSummary[] }[];
  onSelect: (entry: SlashPickerEntry) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const lowercaseQuery = query.trim().toLowerCase();
  const filteredServers = useMemo(() => {
    return mcpServers.map((server) => ({
      ...server,
      prompts: server.prompts.filter((prompt) => {
        const haystacks = [prompt.name, prompt.title, prompt.description].filter(Boolean);
        return haystacks.some((value) => value!.toLowerCase().includes(lowercaseQuery));
      }),
    }));
  }, [lowercaseQuery, mcpServers]);

  const filteredBuiltins = useMemo(() => {
    if (!lowercaseQuery) return builtins;
    return builtins.filter((entry) => {
      return [entry.id, entry.title, entry.description]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(lowercaseQuery));
    });
  }, [builtins, lowercaseQuery]);

  const filteredUserPrompts = useMemo(() => {
    if (!lowercaseQuery) return userPrompts;
    return userPrompts.filter((entry) => {
      return [entry.id, entry.title, entry.description]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(lowercaseQuery));
    });
  }, [lowercaseQuery, userPrompts]);

  return (
    <div className={cn("w-full rounded-lg border bg-card text-card-foreground shadow-sm", className)}>
      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands and prompts…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="max-h-80 space-y-3 overflow-auto text-sm">
          <Section title="Built-in">
            {filteredBuiltins.map((entry) => (
              <Row
                key={entry.id}
                label={`/${entry.id}`}
                description={entry.description ?? entry.title}
                onClick={() => onSelect({ kind: "builtin", id: entry.id, title: entry.title, description: entry.description })}
              />
            ))}
          </Section>
          <Section title="Prompts">
            {filteredUserPrompts.map((entry) => (
              <Row
                key={entry.id}
                label={`/${entry.id}`}
                description={entry.description ?? entry.title}
                onClick={() => onSelect({ kind: "user", id: entry.id, title: entry.title, description: entry.description })}
              />
            ))}
          </Section>
          <Section title="MCP">
            {filteredServers.map((server) => (
              <div key={server.id} className="space-y-1">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {server.title ?? server.id}
                </div>
                {server.prompts.map((prompt) => (
                  <Row
                    key={`${server.id}:${prompt.name}`}
                    label={`/mcp.${server.id}.${prompt.name}`}
                    description={prompt.description ?? prompt.title}
                    onClick={() => onSelect({ kind: "mcp", id: `${server.id}:${prompt.name}`, serverId: server.id, prompt })}
                  />
                ))}
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  description,
  onClick,
}: {
  label: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-muted"
    >
      <div className="font-medium">{label}</div>
      {description ? (
        <div className="text-xs text-muted-foreground line-clamp-2">{description}</div>
      ) : null}
    </button>
  );
}
