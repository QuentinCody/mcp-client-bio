"use client";
import React, { useEffect, useId, useMemo, useState } from "react";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import { Hash, Search, Sparkles, Server, FileText, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function SlashPromptMenu({
  query,
  items,
  onSelect,
  onClose,
  className,
  activeIndex,
  setActiveIndex,
}: {
  query: string;
  items: SlashPromptDef[];
  onSelect: (it: SlashPromptDef) => void;
  onClose: () => void;
  className?: string;
  activeIndex?: number;
  setActiveIndex?: (i: number) => void;
}) {
  const listId = useId();
  const [index, setIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState(query);
  
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(item => 
      item.title.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.namespace.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q)
    ).sort((a, b) => {
      // Prioritize exact name matches
      const aNameMatch = a.name.toLowerCase() === q;
      const bNameMatch = b.name.toLowerCase() === q;
      if (aNameMatch && !bNameMatch) return -1;
      if (bNameMatch && !aNameMatch) return 1;
      
      // Then title matches
      const aTitleMatch = a.title.toLowerCase().includes(q);
      const bTitleMatch = b.title.toLowerCase().includes(q);
      if (aTitleMatch && !bTitleMatch) return -1;
      if (bTitleMatch && !aTitleMatch) return 1;
      
      return 0;
    });
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

  return (
    <div
      role="combobox"
      aria-expanded="true"
      aria-controls={listId}
      aria-haspopup="listbox"
      className={cn(
        "z-50 w-full sm:w-[32rem] max-h-[28rem] overflow-hidden rounded-2xl shadow-2xl bg-white/95 backdrop-blur-xl border border-gray-200/60 text-sm animate-in slide-in-from-top-2 duration-200",
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
          if (filtered[index]) {
            onSelect(filtered[index]);
            // Announce selection to screen readers
            const announcement = `Selected prompt: ${filtered[index].title}`;
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
      {/* Header with search and count */}
      <div className="px-4 py-3 border-b border-gray-100/80 bg-gradient-to-r from-gray-50/80 to-white/80">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Hash className="w-3 h-3" />
          <span className="font-medium">Slash Commands</span>
          {query && (
            <>
              <span>·</span>
              <div className="flex items-center gap-1">
                <Search className="w-3 h-3" />
                <span>Searching for &quot;{query}&quot;</span>
              </div>
            </>
          )}
          <span className="ml-auto">
            {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
      
      {/* Results list */}
      <div className="overflow-auto max-h-80">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <div className="text-sm font-medium">No prompts found</div>
            <div className="text-xs mt-1">Try a different search term</div>
          </div>
        ) : (
          <ul id={listId} role="listbox" aria-label="Slash commands">
            {filtered.map((p, i) => (
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
                        {p.title}
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
                      /{p.name}
                    </div>
                    
                    {p.description && (
                      <div 
                        id={`${listId}-desc-${i}`}
                        className="text-xs text-gray-500 line-clamp-2 leading-relaxed"
                      >
                        {p.description}
                      </div>
                    )}
                  </div>
                  
                  <div className={cn(
                    "flex-shrink-0 opacity-0 transition-opacity duration-150",
                    i === index && "opacity-100"
                  )}>
                    <ChevronRight className="w-4 h-4 text-blue-400" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
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
    </div>
  );
}
