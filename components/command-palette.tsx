"use client";

import React, { useEffect, useId, useRef, useState, useMemo, useCallback } from "react";
import { Command, Zap, Server, Sparkles, X, Clock, Search, ArrowRight } from "lucide-react";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import type { SlashCommandMeta } from "@/lib/slash/types";
import { cn } from "@/lib/utils";

type MenuItem = SlashPromptDef & {
  commandMeta?: SlashCommandMeta;
  score?: number;
};

type CommandCategory = "recent" | "commands" | "mcp" | "builtin";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  items: MenuItem[];
  recentItems?: MenuItem[];
  onSelect: (item: MenuItem) => void;
  className?: string;
}

/**
 * Command Palette - "Command Center"
 * Full-screen overlay with rich command preview and categories.
 * Inspired by Raycast/Spotlight for bio research workflows.
 */
export function CommandPalette({
  isOpen,
  onClose,
  query,
  onQueryChange,
  items,
  recentItems = [],
  onSelect,
  className,
}: CommandPaletteProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [activeIndex, setActiveIndex] = useState(0);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Reset active index when items change
  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  // Scroll active item into view
  useEffect(() => {
    const activeEl = itemRefs.current.get(activeIndex);
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, Math.max(0, allItems.length - 1)));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (allItems[activeIndex]) {
            onSelect(allItems[activeIndex]);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, activeIndex, onClose, onSelect]);

  // Categorize items
  const categorizedItems = useMemo(() => {
    const commands: MenuItem[] = [];
    const mcp: MenuItem[] = [];
    const builtin: MenuItem[] = [];

    items.forEach((item) => {
      if (item.mode === "command") {
        commands.push(item);
      } else if (item.origin === "server-import") {
        mcp.push(item);
      } else {
        builtin.push(item);
      }
    });

    return { commands, mcp, builtin };
  }, [items]);

  // Build flat list with category headers for navigation
  const { allItems, sections } = useMemo(() => {
    const sections: Array<{ label: string; category: CommandCategory; items: MenuItem[] }> = [];
    const allItems: MenuItem[] = [];

    // Recent items first (if no query and has recent)
    if (!query && recentItems.length > 0) {
      sections.push({ label: "Recent", category: "recent", items: recentItems });
      allItems.push(...recentItems);
    }

    // Commands
    if (categorizedItems.commands.length > 0) {
      sections.push({ label: "Commands", category: "commands", items: categorizedItems.commands });
      allItems.push(...categorizedItems.commands);
    }

    // MCP Prompts
    if (categorizedItems.mcp.length > 0) {
      sections.push({ label: "MCP Prompts", category: "mcp", items: categorizedItems.mcp });
      allItems.push(...categorizedItems.mcp);
    }

    // Built-in Prompts
    if (categorizedItems.builtin.length > 0) {
      sections.push({ label: "Built-in", category: "builtin", items: categorizedItems.builtin });
      allItems.push(...categorizedItems.builtin);
    }

    return { allItems, sections };
  }, [categorizedItems, recentItems, query]);

  // Get selected item for preview
  const selectedItem = allItems[activeIndex];

  const getItemType = (item: MenuItem): "command" | "mcp" | "builtin" => {
    if (item.mode === "command") return "command";
    if (item.origin === "server-import") return "mcp";
    return "builtin";
  };

  const getTypeIcon = (type: "command" | "mcp" | "builtin") => {
    switch (type) {
      case "command":
        return <Command className="h-4 w-4" />;
      case "mcp":
        return <Server className="h-4 w-4" />;
      case "builtin":
        return <Zap className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: "command" | "mcp" | "builtin") => {
    switch (type) {
      case "command":
        return "bg-violet-500/10 text-violet-500 border-violet-500/20";
      case "mcp":
        return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
      case "builtin":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    }
  };

  // Highlight matching characters in text
  const highlightMatches = useCallback((text: string, searchQuery: string) => {
    if (!searchQuery) return text;

    const lowerText = text.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let queryIndex = 0;

    for (let i = 0; i < text.length && queryIndex < lowerQuery.length; i++) {
      if (lowerText[i] === lowerQuery[queryIndex]) {
        // Add non-matching text before this match
        if (i > lastIndex) {
          result.push(text.slice(lastIndex, i));
        }
        // Add highlighted character
        result.push(
          <span key={i} className="text-primary font-semibold">
            {text[i]}
          </span>
        );
        lastIndex = i + 1;
        queryIndex++;
      }
    }

    // Add remaining text
    if (lastIndex < text.length) {
      result.push(text.slice(lastIndex));
    }

    return result.length > 0 ? result : text;
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" />

      {/* Palette Container */}
      <div
        className={cn(
          "relative w-full max-w-3xl mx-4 rounded-2xl border border-border/50 bg-popover/95 backdrop-blur-xl shadow-2xl",
          "animate-in fade-in slide-in-from-top-4 duration-200",
          className
        )}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 border-b border-border/30 px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search commands and prompts..."
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded-md border border-border/50 bg-muted/50 px-2 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="sm:hidden p-1 rounded-md hover:bg-muted/50"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]">
          {/* Command List */}
          <div
            role="listbox"
            id={listId}
            aria-label="Commands"
            ref={listRef}
            className="max-h-[50vh] overflow-y-auto border-r border-border/30 py-2"
          >
            {allItems.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                  <Sparkles className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {query ? (
                    <>No results for &ldquo;<span className="text-primary">{query}</span>&rdquo;</>
                  ) : (
                    "Type to search commands..."
                  )}
                </p>
              </div>
            ) : (
              sections.map((section, sectionIndex) => {
                // Calculate starting index for this section
                const startIndex = sections
                  .slice(0, sectionIndex)
                  .reduce((acc, s) => acc + s.items.length, 0);

                return (
                  <div key={section.category}>
                    {/* Section Header */}
                    <div className="px-4 py-2 flex items-center gap-2">
                      {section.category === "recent" && <Clock className="h-3 w-3 text-muted-foreground" />}
                      <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {section.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">
                        ({section.items.length})
                      </span>
                    </div>

                    {/* Section Items */}
                    {section.items.map((item, itemIndex) => {
                      const globalIndex = startIndex + itemIndex;
                      const isActive = globalIndex === activeIndex;
                      const itemType = getItemType(item);
                      const trigger = item.mode === "command" ? item.name : item.trigger;

                      return (
                        <div
                          key={item.id}
                          ref={(el) => {
                            if (el) itemRefs.current.set(globalIndex, el);
                            else itemRefs.current.delete(globalIndex);
                          }}
                          role="option"
                          aria-selected={isActive}
                          className={cn(
                            "mx-2 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150",
                            isActive ? "bg-primary/8" : "hover:bg-muted/50"
                          )}
                          onMouseEnter={() => setActiveIndex(globalIndex)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onSelect(item);
                          }}
                        >
                          {/* Icon */}
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all",
                              getTypeColor(itemType),
                              isActive && "scale-105"
                            )}
                          >
                            {getTypeIcon(itemType)}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <code
                              className={cn(
                                "font-mono text-sm font-medium transition-colors",
                                isActive ? "text-primary" : "text-foreground"
                              )}
                            >
                              /{highlightMatches(trigger || "", query)}
                            </code>
                            {item.description && (
                              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                                {item.description}
                              </p>
                            )}
                          </div>

                          {/* Select indicator */}
                          {isActive && (
                            <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {/* Preview Panel - Hidden on mobile */}
          <div className="hidden md:block p-4 bg-muted/20 max-h-[50vh] overflow-y-auto">
            {selectedItem ? (
              <div className="space-y-4">
                {/* Header */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl border",
                        getTypeColor(getItemType(selectedItem))
                      )}
                    >
                      {getTypeIcon(getItemType(selectedItem))}
                    </div>
                    <div>
                      <code className="font-mono text-base font-semibold text-foreground">
                        /{selectedItem.mode === "command" ? selectedItem.name : selectedItem.trigger}
                      </code>
                      {selectedItem.origin === "server-import" && (
                        <p className="text-xs text-cyan-500">
                          {selectedItem.sourceServerName || selectedItem.sourceServerSlug}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedItem.description && (
                  <div>
                    <h4 className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                      Description
                    </h4>
                    <p className="text-sm text-foreground/90 leading-relaxed">
                      {selectedItem.description}
                    </p>
                  </div>
                )}

                {/* Arguments */}
                {selectedItem.args && selectedItem.args.length > 0 && (
                  <div>
                    <h4 className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                      Arguments
                    </h4>
                    <div className="space-y-2">
                      {selectedItem.args.map((arg) => (
                        <div
                          key={arg.name}
                          className="rounded-lg bg-background/50 border border-border/30 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-xs font-medium text-foreground">
                              {arg.name}
                            </code>
                            {arg.required && (
                              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
                                required
                              </span>
                            )}
                          </div>
                          {arg.description && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {arg.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Type Badge */}
                <div className="pt-2 border-t border-border/30">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                      getTypeColor(getItemType(selectedItem))
                    )}
                  >
                    {getTypeIcon(getItemType(selectedItem))}
                    {getItemType(selectedItem) === "command" && "Local Command"}
                    {getItemType(selectedItem) === "mcp" && "MCP Prompt"}
                    {getItemType(selectedItem) === "builtin" && "Built-in Prompt"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a command to preview
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/30 px-4 py-2.5 bg-muted/20">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <div className="flex items-center gap-4 font-mono uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/50 bg-background/50 px-1">
                  ↑↓
                </kbd>
                <span>navigate</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/50 bg-background/50 px-1">
                  ↵
                </kbd>
                <span>select</span>
              </span>
              <span className="hidden sm:flex items-center gap-1.5">
                <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/50 bg-background/50 px-1">
                  esc
                </kbd>
                <span>close</span>
              </span>
            </div>
            <span className="font-mono tabular-nums">
              {allItems.length} result{allItems.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
