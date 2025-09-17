"use client";
import React, { useEffect, useId, useMemo, useState } from "react";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import type { SlashCommandMeta } from "@/lib/slash/types";
import { Hash, Search, Sparkles, Server, FileText, ChevronRight, Command as CommandIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnhancedPromptPreview } from "@/components/prompts/enhanced-prompt-preview";
import { PromptHelpButton, PromptHelpPanel } from "@/components/prompts/prompt-help-tooltip";
import { PromptLoadingStates } from "@/components/prompts/prompt-loading-states";
import { useMCP } from "@/lib/context/mcp-context";
import { Badge } from "@/components/ui/badge";

type MenuItem = SlashPromptDef & { commandMeta?: SlashCommandMeta };

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
  const [searchQuery, setSearchQuery] = useState(query);
  const [helpOpen, setHelpOpen] = useState(false);
  const { mcpServers } = useMCP();

  const filtered = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();
    if (!s) return items;
    return items.filter((item) =>
      item.title.toLowerCase().includes(s) ||
      item.name.toLowerCase().includes(s) ||
      item.description?.toLowerCase().includes(s) ||
      item.namespace.toLowerCase().includes(s) ||
      item.trigger.toLowerCase().includes(s)
    );
  }, [items, searchQuery]);
  
  useEffect(() => {
    setSearchQuery(query);
  }, [query]);
  
  useEffect(() => {
    if (index >= filtered.length) setIndex(0);
  }, [filtered.length, index]);
  
  useEffect(() => {
    if (typeof activeIndex === 'number') setIndex(Math.max(0, Math.min(activeIndex, filtered.length - 1)));
  }, [activeIndex, filtered.length]);
  
  const getPromptIcon = (prompt: MenuItem) => {
    if (prompt.mode === 'command') return <CommandIcon className="w-4 h-4 text-gray-500" />;
    if (prompt.origin === 'server-import') return <Server className="w-4 h-4 text-blue-500" />;
    if (prompt.mode === 'template') return <FileText className="w-4 h-4 text-green-500" />;
    return <Sparkles className="w-4 h-4 text-purple-500" />;
  };
  
  const commandItems = filtered.filter((item) => item.mode === 'command');
  const templateItems = filtered.filter((item) => item.mode !== 'command' && item.origin === 'client');
  const serverItems = filtered.filter((item) => item.origin === 'server-import');

  const serverGroups = useMemo(() => {
    const grouped = new Map<string, MenuItem[]>();
    for (const prompt of serverItems) {
      const key = prompt.sourceServerId || prompt.namespace;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(prompt);
    }
    for (const [, prompts] of grouped) {
      prompts.sort((a, b) => a.title.localeCompare(b.title));
    }
    return Array.from(grouped.entries());
  }, [serverItems]);

  const highlight = (text: string, q: string) => {
    const s = q.trim();
    if (!s) return text;
    const i = text.toLowerCase().indexOf(s.toLowerCase());
    if (i === -1) return text;
    return (
      <>
        {text.slice(0, i)}
        <mark className="bg-yellow-200/80 rounded px-0.5">{text.slice(i, i + s.length)}</mark>
        {text.slice(i + s.length)}
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
        "z-50 w-full sm:w-[48rem] max-h-[32rem] overflow-hidden rounded-2xl shadow-2xl bg-white/95 backdrop-blur-xl border border-gray-200/60 text-sm animate-in slide-in-from-top-2 duration-200",
        className
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = Math.min(index + 1, filtered.length - 1);
          setIndex(next);
          setActiveIndex?.(next);
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const next = Math.max(index - 1, 0);
          setIndex(next);
          setActiveIndex?.(next);
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const flat: MenuItem[] = [
            ...commandItems,
            ...templateItems,
            ...serverGroups.flatMap(([, prompts]) => prompts),
          ];
          if (flat[index]) {
            onSelect(flat[index]);
            // Announce selection to screen readers
            const announcement = `Selected prompt: ${flat[index].title}`;
            const announcer = document.createElement('div');
            announcer.setAttribute('aria-live', 'polite');
            announcer.setAttribute('aria-atomic', 'true');
            announcer.className = 'sr-only';
            announcer.textContent = announcement;
            document.body.appendChild(announcer);
            setTimeout(() => document.body.removeChild(announcer), 1000);
          }
        }
      }}
    >
      {/* Header with search and controls */}
      <div className="px-4 py-3 border-b border-gray-100/80 bg-gradient-to-r from-gray-50/80 to-white/80">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Hash className="w-3 h-3" />
          <span className="font-semibold">Slash Commands & MCP Prompts</span>
          {query && (
            <>
              <span>·</span>
              <div className="flex items-center gap-1">
                <Search className="w-3 h-3" />
                <span>“{query}”</span>
              </div>
            </>
          )}
          <span className="ml-auto text-gray-500">
            {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
          </span>
          <PromptHelpButton onClick={() => setHelpOpen(true)} className="ml-2" />
        </div>
      </div>

      {/* Body: list + preview */}
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="overflow-auto max-h-80">
          {loading ? (
            <div className="px-4 py-8 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading slash commands…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8">
              <PromptLoadingStates isLoading={false} isEmpty />
            </div>
          ) : (
            <div id={listId} role="listbox" aria-label="Slash commands" className="divide-y divide-gray-100/80">
              {commandItems.length > 0 && (
                <GroupSection
                  label="Local Commands"
                  description="Actions handled by the Bio MCP client"
                  items={commandItems}
                  startIndex={0}
                  currentIndex={index}
                  onHover={setIndex}
                  onActiveIndexChange={setActiveIndex}
                  onSelect={onSelect}
                  highlight={highlight}
                  getPromptIcon={getPromptIcon}
                  searchQuery={searchQuery}
                />
              )}
              {templateItems.length > 0 && (
                <GroupSection
                  label="Client Templates"
                  description="Reusable prompt templates"
                  items={templateItems}
                  startIndex={commandItems.length}
                  currentIndex={index}
                  onHover={setIndex}
                  onActiveIndexChange={setActiveIndex}
                  onSelect={onSelect}
                  highlight={highlight}
                  getPromptIcon={getPromptIcon}
                  searchQuery={searchQuery}
                />
              )}
              {serverGroups.length > 0 ? (
                serverGroups.map(([serverId, prompts], groupIdx) => (
                  <GroupSection
                    key={serverId}
                    label={(() => {
                      const server = mcpServers.find((s) => s.id === serverId);
                      return prompts[0]?.sourceServerName || server?.name || server?.url || serverId;
                    })()}
                    description="Prompts provided by connected MCP server"
                    badge={(() => {
                      const server = mcpServers.find((s) => s.id === serverId);
                      if (!server) return 'MCP';
                      const base = `MCP • ${server.type.toUpperCase()}`;
                      return server.capabilities?.completions ? `${base} • completions` : base;
                    })()}
                    items={prompts}
                    startIndex={commandItems.length + templateItems.length + serverGroups.slice(0, groupIdx).reduce((acc, [, arr]) => acc + arr.length, 0)}
                    currentIndex={index}
                    onHover={setIndex}
                    onActiveIndexChange={setActiveIndex}
                    onSelect={onSelect}
                    highlight={highlight}
                    getPromptIcon={getPromptIcon}
                    searchQuery={searchQuery}
                  />
                ))
              ) : (
                <div className="px-4 py-5 text-xs text-gray-500 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Connect a Model Context Protocol server with prompts to see more commands.
                </div>
              )}
            </div>
          )}
        </div>
        {/* Preview */}
        <div className="hidden sm:block border-l border-gray-100/80 max-h-80 overflow-auto p-3 bg-white/60">
          {loading ? (
            <div className="px-4 py-6"><PromptLoadingStates isLoading /></div>
          ) : (() => {
            const list = [
              ...commandItems,
              ...templateItems,
              ...serverGroups.flatMap(([, prompts]) => prompts),
            ];
            const current = list[index];
            if (!current) return null;
            if (current.mode === 'command') {
              return (
                <div className="px-4 py-4 text-sm text-gray-600 space-y-2">
                  <div className="font-semibold text-gray-900">/{current.trigger}</div>
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
                  } catch { return {}; }
                })()}
              />
            );
          })()}
        </div>
      </div>
      {/* Footer with keyboard hints */}
      <div className="px-4 py-2 border-t border-gray-100/80 bg-gray-50/40">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs">↑↓</kbd>
                <span>navigate</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs">↵</kbd>
              <span>select</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs">esc</kbd>
              <span>close</span>
            </div>
          </div>
          <div className="text-gray-300">Slash Commands</div>
        </div>
      </div>

      {/* Help panel */}
      <PromptHelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function GroupSection({
  label,
  description,
  badge,
  items,
  startIndex,
  currentIndex,
  onHover,
  onActiveIndexChange,
  onSelect,
  highlight,
  getPromptIcon,
  searchQuery,
}: {
  label: string;
  description?: string;
  badge?: string;
  items: MenuItem[];
  startIndex: number;
  currentIndex: number;
  onHover: (idx: number) => void;
  onActiveIndexChange?: (idx: number) => void;
  onSelect: (item: MenuItem) => void;
  highlight: (text: string, query: string) => React.ReactNode;
  getPromptIcon: (item: MenuItem) => React.ReactNode;
  searchQuery: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="py-3">
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide">
          <span>{label}</span>
          {badge && <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{badge}</Badge>}
        </div>
        {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
      </div>
      <ul role="presentation">
        {items.map((item, offset) => {
          const absoluteIndex = startIndex + offset;
          return (
            <li
              key={item.id}
              role="option"
              aria-selected={absoluteIndex === currentIndex}
              className={cn(
                "px-4 py-2.5 cursor-pointer transition-all",
                absoluteIndex === currentIndex
                  ? "bg-blue-50/70 border-l-2 border-l-blue-400"
                  : "hover:bg-gray-50"
              )}
              onMouseEnter={() => {
                onHover(absoluteIndex);
                onActiveIndexChange?.(absoluteIndex);
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item);
              }}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-blue-500 flex-shrink-0">
                  {getPromptIcon(item)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900">
                      {highlight(item.title, searchQuery)}
                    </span>
                    <span className="text-[11px] text-gray-400 font-mono">
                      /{item.mode === 'command' ? item.name : item.trigger}
                    </span>
                    {item.args && item.args.length > 0 && (
                      <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full font-medium">
                        {item.args.length} {item.args.length === 1 ? 'arg' : 'args'}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {highlight(item.description, searchQuery)}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
