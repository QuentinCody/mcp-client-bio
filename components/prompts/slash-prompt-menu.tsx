"use client";
import React, { useEffect, useId, useMemo, useState } from "react";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import { Hash, Search, Sparkles, Server, FileText, ChevronRight, Star, StarOff, Filter, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnhancedPromptPreview } from "@/components/prompts/enhanced-prompt-preview";
import { PromptHelpButton, PromptHelpPanel } from "@/components/prompts/prompt-help-tooltip";
import { PromptLoadingStates } from "@/components/prompts/prompt-loading-states";
import { useMCP } from "@/lib/context/mcp-context";

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
  items: SlashPromptDef[];
  onSelect: (it: SlashPromptDef) => void;
  onClose: () => void;
  className?: string;
  activeIndex?: number;
  setActiveIndex?: (i: number) => void;
  loading?: boolean;
}) {
  const listId = useId();
  const [index, setIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState(query);
  const [modeFilter, setModeFilter] = useState<"all" | "template" | "server">("all");
  const [namespaceFilter, setNamespaceFilter] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const { mcpServers } = useMCP();
  
  const availableNamespaces = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.namespace, (counts.get(it.namespace) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const filtered = useMemo(() => {
    const base = items.filter((it) => {
      if (modeFilter === "template" && it.mode !== "template") return false;
      if (modeFilter === "server" && it.origin !== "server-import") return false;
      if (namespaceFilter && it.namespace !== namespaceFilter) return false;
      return true;
    });
    const s = searchQuery.trim().toLowerCase();
    if (!s) return base;
    return base
      .filter((item) =>
        item.title.toLowerCase().includes(s) ||
        item.name.toLowerCase().includes(s) ||
        item.namespace.toLowerCase().includes(s) ||
        item.description?.toLowerCase().includes(s)
      )
      .sort((a, b) => {
        const aNameMatch = a.name.toLowerCase() === s;
        const bNameMatch = b.name.toLowerCase() === s;
        if (aNameMatch && !bNameMatch) return -1;
        if (bNameMatch && !aNameMatch) return 1;
        const aTitleMatch = a.title.toLowerCase().includes(s);
        const bTitleMatch = b.title.toLowerCase().includes(s);
        if (aTitleMatch && !bTitleMatch) return -1;
        if (bTitleMatch && !aTitleMatch) return 1;
        return 0;
      });
  }, [items, searchQuery, modeFilter, namespaceFilter]);
  
  useEffect(() => {
    setSearchQuery(query);
  }, [query]);
  
  useEffect(() => {
    if (index >= filtered.length) setIndex(0);
  }, [filtered.length, index]);
  
  useEffect(() => {
    if (typeof activeIndex === 'number') setIndex(Math.max(0, Math.min(activeIndex, filtered.length - 1)));
  }, [activeIndex, filtered.length]);
  
  const getPromptIcon = (prompt: SlashPromptDef) => {
    if (prompt.origin === 'server-import') return <Server className="w-4 h-4 text-blue-500" />;
    if (prompt.mode === 'template') return <FileText className="w-4 h-4 text-green-500" />;
    return <Sparkles className="w-4 h-4 text-purple-500" />;
  };
  
  const getNamespaceColor = (namespace: string) => {
    const colors = {
      'civic': 'text-blue-600 bg-blue-50',
      'ncbi': 'text-green-600 bg-green-50',
      'opentargets': 'text-purple-600 bg-purple-50',
      'uniprot': 'text-orange-600 bg-orange-50',
      'client': 'text-gray-600 bg-gray-50',
    };
    return colors[namespace as keyof typeof colors] || 'text-gray-600 bg-gray-50';
  };

  // Favorites
  useEffect(() => {
    try {
      const raw = localStorage.getItem("prompt:favorites");
      if (raw) setFavorites(JSON.parse(raw));
    } catch {}
  }, []);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id); else set.add(id);
      const next = Array.from(set);
      try { localStorage.setItem("prompt:favorites", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);

  // Grouping: recent and favorites
  const recentIds: string[] = useMemo(() => {
    try {
      const raw = localStorage.getItem("prompt:recent");
      const rec: Array<{ id: string; ts: number }> = raw ? JSON.parse(raw) : [];
      return rec.sort((a, b) => b.ts - a.ts).map((r) => r.id);
    } catch {
      return [];
    }
  }, []);

  const recentSet = useMemo(() => new Set(recentIds), [recentIds]);

  const favItems = filtered.filter((it) => favoritesSet.has(it.id));
  const nonFavForRecent = filtered.filter((it) => !favoritesSet.has(it.id));
  const recentItems = nonFavForRecent
    .filter((it) => recentSet.has(it.id))
    .sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));
  const otherItems = nonFavForRecent.filter((it) => !recentSet.has(it.id));

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
          const flat: SlashPromptDef[] = [...favItems, ...recentItems, ...otherItems];
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
          <span className="font-semibold">Slash Commands</span>
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

        {/* Filters */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex items-center gap-1">
            {([
              { key: "all", label: "All" },
              { key: "template", label: "Templates" },
              { key: "server", label: "Server" },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setModeFilter(f.key)}
                className={cn(
                  "px-2 py-1 rounded-md text-xs border transition-colors",
                  modeFilter === f.key
                    ? "bg-blue-100 border-blue-200 text-blue-700"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
              >
                <div className="inline-flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  <span>{f.label}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            {availableNamespaces.map(([ns, count]) => (
              <button
                key={ns}
                onClick={() => setNamespaceFilter((cur) => (cur === ns ? null : ns))}
                className={cn(
                  "px-2 py-1 rounded-full text-[10px] border transition-colors",
                  namespaceFilter === ns
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                )}
                title={`${ns} (${count})`}
              >
                <span className="font-mono">{ns}</span>
                <span className="ml-1 opacity-70">{count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body: list + preview */}
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="overflow-auto max-h-80">
          {loading ? (
            <PromptLoadingStates isLoading className="py-10" />
          ) : (filtered.length === 0 ? (
            <div className="px-4 py-8">
              <PromptLoadingStates isLoading={false} isEmpty />
            </div>
          ) : (
            <ul id={listId} role="listbox" aria-label="Slash commands">
              {[...favItems, ...recentItems, ...otherItems].map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === index}
                aria-describedby={p.description ? `${listId}-desc-${i}` : undefined}
                className={cn(
                  "group relative px-4 py-3 cursor-pointer transition-all duration-150 border-l-2",
                  i === index 
                    ? "bg-gradient-to-r from-blue-50/80 to-indigo-50/60 border-l-blue-400 shadow-sm"
                    : "border-l-transparent hover:bg-gray-50/60 hover:border-l-gray-200"
                )}
                onMouseEnter={() => { setIndex(i); setActiveIndex?.(i); }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(p);
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">
                    {getPromptIcon(p)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "font-semibold text-gray-900 transition-colors duration-150",
                        i === index && "text-blue-700"
                      )}>
                        {highlight(p.title, searchQuery)}
                      </span>
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors duration-150",
                        getNamespaceColor(p.namespace)
                      )}>
                        {p.namespace}
                      </span>
                      {p.args && p.args.length > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-amber-700 bg-amber-100 font-medium">
                          {p.args.length} {p.args.length === 1 ? 'arg' : 'args'}
                        </span>
                      )}
                    </div>
                    
                    <div className="text-xs text-gray-600 mb-1 font-medium font-mono">
                      /{highlight(p.name, searchQuery)}
                    </div>
                    
                    {p.description && (
                      <div 
                        id={`${listId}-desc-${i}`}
                        className="text-xs text-gray-500 line-clamp-2 leading-relaxed"
                      >
                        {highlight(p.description, searchQuery) as any}
                      </div>
                    )}
                  </div>
                  
                  <div className={cn(
                    "flex-shrink-0 opacity-0 transition-opacity duration-150",
                    i === index && "opacity-100"
                  )}>
                    <div className="flex items-center gap-2">
                      <button
                        className="p-1 rounded-md hover:bg-black/5"
                        onMouseDown={(e) => { e.preventDefault(); toggleFavorite(p.id); }}
                        aria-label={favoritesSet.has(p.id) ? "Remove favorite" : "Add favorite"}
                        title={favoritesSet.has(p.id) ? "Unpin" : "Pin"}
                      >
                        {favoritesSet.has(p.id) ? <Star className="w-4 h-4 text-amber-500" /> : <StarOff className="w-4 h-4 text-gray-300" />}
                      </button>
                      <ChevronRight className="w-4 h-4 text-blue-400" />
                    </div>
                  </div>
                </div>
              </li>
              ))}
            </ul>
          ))}
        </div>
        {/* Preview */}
        <div className="hidden sm:block border-l border-gray-100/80 max-h-80 overflow-auto p-3 bg-white/60">
          {loading ? (
            <div className="px-4 py-6"><PromptLoadingStates isLoading /></div>
          ) : ([...favItems, ...recentItems, ...otherItems][index] ? (
            <EnhancedPromptPreview 
              prompt={[...favItems, ...recentItems, ...otherItems][index]}
              values={(() => {
                try {
                  const p = [...favItems, ...recentItems, ...otherItems][index];
                  const raw = localStorage.getItem(`prompt:${p.id}:args`);
                  return raw ? JSON.parse(raw) : {};
                } catch { return {}; }
              })()}
            />
          ) : null)}
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
          <div className="text-gray-300">MCP Prompts</div>
        </div>
      </div>

      {/* Help panel */}
      <PromptHelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
