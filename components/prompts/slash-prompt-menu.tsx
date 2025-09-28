"use client";
import React, { useEffect, useId, useMemo, useState } from "react";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import type { SlashCommandMeta } from "@/lib/slash/types";
import {
  Hash,
  Search,
  Sparkles,
  Server,
  FileText,
  ChevronRight,
  Command as CommandIcon,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EnhancedPromptPreview } from "@/components/prompts/enhanced-prompt-preview";
import { PromptHelpButton, PromptHelpPanel } from "@/components/prompts/prompt-help-tooltip";
import { PromptLoadingStates } from "@/components/prompts/prompt-loading-states";
import { useMCP } from "@/lib/context/mcp-context";
import { Badge } from "@/components/ui/badge";

type MenuItem = SlashPromptDef & {
  commandMeta?: SlashCommandMeta;
  score?: number;
};

interface SectionEntry {
  item: MenuItem;
  index: number;
}

interface SectionDefinition {
  key: string;
  label: string;
  description?: string;
  badge?: string;
  entries: SectionEntry[];
}

export function SlashPromptMenu({
  query,
  items,
  onSelect,
  onClose,
  className,
  activeIndex,
  setActiveIndex,
  loading,
}: {
  query: string;
  items: MenuItem[];
  onSelect: (it: MenuItem) => void;
  onClose: () => void;
  className?: string;
  activeIndex?: number;
  setActiveIndex?: (i: number) => void;
  loading?: boolean;
}) {
  const listId = useId();
  const [index, setIndex] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const { mcpServers } = useMCP();

  const sections = useMemo<SectionDefinition[]>(() => {
    const orderedSections: SectionDefinition[] = [];

    const ensureSection = (key: string, factory: () => SectionDefinition) => {
      let section = orderedSections.find((entry) => entry.key === key);
      if (!section) {
        section = factory();
        orderedSections.push(section);
      }
      return section;
    };

    items.forEach((item, idx) => {
      if (item.mode === "command") {
        const section = ensureSection("local", () => ({
          key: "local",
          label: "Local Commands",
          description: "Actions handled by the Bio MCP client",
          badge: "Local",
          entries: [],
        }));
        section.entries.push({ item, index: idx });
        return;
      }

      if (item.origin === "client-prompt" || item.mode === "client") {
        const section = ensureSection("client-prompts", () => ({
          key: "client-prompts",
          label: "Client Prompts",
          description: "Prebuilt orchestrations sent directly from the Bio client",
          badge: "Client",
          entries: [],
        }));
        section.entries.push({ item, index: idx });
        return;
      }

      if (item.origin !== "server-import") {
        const section = ensureSection("templates", () => ({
          key: "templates",
          label: "Client Templates",
          description: "Reusable prompt templates",
          badge: "Template",
          entries: [],
        }));
        section.entries.push({ item, index: idx });
        return;
      }

      const serverKey = item.sourceServerId || item.sourceServerSlug || item.namespace;
      const serverMeta = mcpServers.find((server) => server.id === item.sourceServerId)
        || mcpServers.find((server) => server.name === item.sourceServerName);

      const section = ensureSection(`server:${serverKey}`, () => ({
        key: `server:${serverKey}`,
        label:
          item.sourceServerName || serverMeta?.name || serverMeta?.url || serverKey || "MCP Server",
        description: "Prompts provided by connected MCP server",
        badge: (() => {
          if (!serverMeta) return "MCP";
          const base = `MCP • ${serverMeta.type.toUpperCase()}`;
          return serverMeta.capabilities?.completions ? `${base} • completions` : base;
        })(),
        entries: [],
      }));
      section.entries.push({ item, index: idx });
    });

    return orderedSections;
  }, [items, mcpServers]);

  const counts = useMemo(() => {
    let local = 0;
    let clientPrompts = 0;
    let templates = 0;
    let server = 0;
    for (const section of sections) {
      if (section.key === "local") local += section.entries.length;
      else if (section.key === "client-prompts") clientPrompts += section.entries.length;
      else if (section.key === "templates") templates += section.entries.length;
      else if (section.key.startsWith("server:")) server += section.entries.length;
    }
    return { local, clientPrompts, templates, server };
  }, [sections]);

  useEffect(() => {
    if (typeof activeIndex === "number") {
      setIndex(Math.max(0, Math.min(activeIndex, Math.max(items.length - 1, 0))));
    }
  }, [activeIndex, items.length]);

  useEffect(() => {
    if (items.length === 0) {
      setIndex(0);
      setActiveIndex?.(0);
      return;
    }
    if (index >= items.length) {
      const next = Math.max(0, items.length - 1);
      setIndex(next);
      setActiveIndex?.(next);
    }
  }, [index, items.length, setActiveIndex]);

  const getPromptIcon = (prompt: MenuItem) => {
    if (prompt.mode === "command") return <CommandIcon className="w-4 h-4 text-gray-500" />;
    if (prompt.origin === "server-import") return <Server className="w-4 h-4 text-blue-500" />;
    if (prompt.mode === "template") return <FileText className="w-4 h-4 text-green-500" />;
    return <Sparkles className="w-4 h-4 text-purple-500" />;
  };

  const highlight = (text: string, q: string) => {
    const term = q.trim();
    if (!term) return text;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(term.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded px-0.5 bg-yellow-200/80">{text.slice(idx, idx + term.length)}</mark>
        {text.slice(idx + term.length)}
      </>
    );
  };

  return (
    <div
      role="combobox"
      aria-expanded="true"
      aria-controls={listId}
      aria-haspopup="listbox"
      className={cn(
        "z-50 w-full max-w-full sm:w-[48rem] max-h-[70vh] overflow-hidden rounded-2xl border border-gray-200/60 bg-white/97 text-sm shadow-2xl backdrop-blur-xl",
        className
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          const next = Math.min(index + 1, Math.max(items.length - 1, 0));
          setIndex(next);
          setActiveIndex?.(next);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          const next = Math.max(index - 1, 0);
          setIndex(next);
          setActiveIndex?.(next);
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          const current = items[index];
          if (current) {
            onSelect(current);
            const announcement = `Selected prompt: ${current.title}`;
            const announcer = document.createElement("div");
            announcer.setAttribute("aria-live", "polite");
            announcer.setAttribute("aria-atomic", "true");
            announcer.className = "sr-only";
            announcer.textContent = announcement;
            document.body.appendChild(announcer);
            setTimeout(() => document.body.removeChild(announcer), 1000);
          }
        }
      }}
    >
      <div className="border-b border-gray-100/80 bg-gradient-to-r from-gray-50/80 to-white/80 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Hash className="h-3 w-3" />
          <span className="font-semibold">Slash Commands & MCP Prompts</span>
          {query && (
            <>
              <span>·</span>
              <div className="flex items-center gap-1">
                <Search className="h-3 w-3" />
                <span>“{query}”</span>
              </div>
            </>
          )}
          <span className="ml-auto text-gray-500">
            {items.length} {items.length === 1 ? "result" : "results"}
          </span>
          <PromptHelpButton onClick={() => setHelpOpen(true)} className="ml-2" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
          <Badge variant="outline" className="border-gray-200 text-gray-600">
            Local · {counts.local}
          </Badge>
          <Badge variant="outline" className="border-blue-200 text-blue-600">
            Client Prompts · {counts.clientPrompts}
          </Badge>
          <Badge variant="outline" className="border-gray-200 text-gray-600">
            Templates · {counts.templates}
          </Badge>
          <Badge variant="secondary" className="bg-blue-50 text-blue-700">
            MCP · {counts.server}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="max-h-80 overflow-auto">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading slash commands…
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-8">
              <PromptLoadingStates isLoading={false} isEmpty />
            </div>
          ) : (
            <div id={listId} role="listbox" aria-label="Slash commands" className="divide-y divide-gray-100/80">
              {sections.map((section) => (
                <GroupSection
                  key={section.key}
                  label={section.label}
                  description={section.description}
                  badge={section.badge}
                  entries={section.entries}
                  currentIndex={index}
                  onHover={(idx) => {
                    setIndex(idx);
                    setActiveIndex?.(idx);
                  }}
                  onSelect={onSelect}
                  highlight={highlight}
                  getPromptIcon={getPromptIcon}
                  query={query}
                />
              ))}
            </div>
          )}
        </div>

        <div className="hidden max-h-80 overflow-auto border-l border-gray-100/80 bg-white/60 p-3 sm:block">
          {loading ? (
            <div className="px-4 py-6">
              <PromptLoadingStates isLoading />
            </div>
          ) : (() => {
            const current = items[index];
            if (!current) return null;
            if (current.mode === "command") {
              return (
                <div className="space-y-2 px-4 py-4 text-sm text-gray-600">
                  <div className="font-semibold text-gray-900">/{current.trigger || current.name}</div>
                  {current.description && <p>{current.description}</p>}
                  <div className="text-xs text-gray-500">Press Enter to run this local command.</div>
                </div>
              );
            }
            return (
              <EnhancedPromptPreview
                prompt={current}
                values={(() => {
                  try {
                    const raw = localStorage.getItem(`prompt:${current.id}:args`);
                    return raw ? JSON.parse(raw) : {};
                  } catch {
                    return {};
                  }
                })()}
              />
            );
          })()}
        </div>
      </div>

      <div className="border-t border-gray-100/80 bg-gray-50/40 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs">↑↓</kbd>
              <span>navigate</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs">↵</kbd>
              <span>select</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs">esc</kbd>
              <span>close</span>
            </div>
          </div>
          <div className="text-gray-300">Slash Commands</div>
        </div>
      </div>

      <PromptHelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function GroupSection({
  label,
  description,
  badge,
  entries,
  currentIndex,
  onHover,
  onSelect,
  highlight,
  getPromptIcon,
  query,
}: {
  label: string;
  description?: string;
  badge?: string;
  entries: SectionEntry[];
  currentIndex: number;
  onHover: (idx: number) => void;
  onSelect: (item: MenuItem) => void;
  highlight: (text: string, query: string) => React.ReactNode;
  getPromptIcon: (item: MenuItem) => React.ReactNode;
  query: string;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="py-3">
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
          <span>{label}</span>
          {badge && (
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
              {badge}
            </Badge>
          )}
        </div>
        {description && <p className="mt-1 text-xs text-gray-400">{description}</p>}
      </div>
      <ul role="presentation">
        {entries.map(({ item, index: absoluteIndex }) => (
          <li
            key={item.id}
            role="option"
            aria-selected={absoluteIndex === currentIndex}
            className={cn(
              "cursor-pointer px-4 py-2.5 transition-all",
              absoluteIndex === currentIndex
                ? "border-l-2 border-l-blue-400 bg-blue-50/70"
                : "hover:bg-gray-50"
            )}
            onMouseEnter={() => onHover(absoluteIndex)}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(item);
            }}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0 text-blue-500">{getPromptIcon(item)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {highlight(item.title, query)}
                  </span>
                  <span className="font-mono text-[11px] text-gray-400">
                    /{item.mode === "command" ? item.name : item.trigger}
                  </span>
                  {item.args && item.args.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      {item.args.length} {item.args.length === 1 ? "arg" : "args"}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                    {highlight(item.description, query)}
                  </p>
                )}
                {item.args && item.args.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.args.slice(0, 4).map((arg) => (
                      <span
                        key={`${item.id}-arg-${arg.name}`}
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                          arg.required
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : "border-gray-200 bg-gray-50 text-gray-500"
                        )}
                      >
                        {arg.required ? "*" : ""}
                        {arg.name}
                      </span>
                    ))}
                    {item.args.length > 4 && (
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        +{item.args.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
