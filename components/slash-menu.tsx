"use client";

import React, { useEffect, useId, useRef } from "react";
import { Command, Zap, Server, Sparkles } from "lucide-react";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import type { SlashCommandMeta } from "@/lib/slash/types";
import { cn } from "@/lib/utils";

type MenuItem = SlashPromptDef & {
  commandMeta?: SlashCommandMeta;
  score?: number;
};

interface SlashMenuProps {
  query: string;
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
  onClose: () => void;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  className?: string;
}

/**
 * Slash command menu - Luminous Terminal aesthetic.
 * Precision meets bioluminescence.
 */
export function SlashMenu({
  query,
  items,
  onSelect,
  onClose,
  activeIndex,
  setActiveIndex,
  className,
}: SlashMenuProps) {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    const activeEl = itemRefs.current.get(activeIndex);
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex]);

  const getItemType = (item: MenuItem): "command" | "mcp" | "builtin" => {
    if (item.mode === "command") return "command";
    if (item.origin === "server-import") return "mcp";
    return "builtin";
  };

  const getOriginLabel = (item: MenuItem): string | null => {
    if (item.mode === "command") return null;
    if (item.origin === "server-import") {
      return item.sourceServerName || item.sourceServerSlug || "MCP";
    }
    return null;
  };

  const getRequiredArgsCount = (item: MenuItem): number => {
    if (!item.args) return 0;
    return item.args.filter((arg) => arg.required).length;
  };

  // Empty state
  if (items.length === 0) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/50 bg-popover/95 backdrop-blur-xl shadow-2xl",
          "noise-texture animate-menu-enter",
          className
        )}
      >
        <div className="px-6 py-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            {query ? (
              <>No commands match &ldquo;<span className="text-primary">{query}</span>&rdquo;</>
            ) : (
              "Type to search commands..."
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/50 bg-popover/95 backdrop-blur-xl shadow-2xl",
        "slash-menu-bg noise-texture animate-menu-enter",
        className
      )}
    >
      {/* Header - minimal, elegant */}
      <div className="relative border-b border-border/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-3.5 w-3.5 text-primary icon-glow" />
            </div>
            <span className="font-mono text-xs font-medium tracking-wide text-foreground/80 uppercase">
              Commands
            </span>
          </div>
          {query && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Search
              </span>
              <code className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                {query}
              </code>
            </div>
          )}
        </div>
      </div>

      {/* List - generous spacing, clear hierarchy */}
      <div
        role="listbox"
        id={listId}
        aria-label="Commands"
        ref={listRef}
        className="max-h-[320px] overflow-y-auto py-2 scrollbar-thin"
      >
        {items.map((item, index) => {
          const isActive = index === activeIndex;
          const itemType = getItemType(item);
          const originLabel = getOriginLabel(item);
          const requiredArgs = getRequiredArgsCount(item);
          const trigger = item.mode === "command" ? item.name : item.trigger;

          // Stagger animation delay
          const animDelay = Math.min(index * 30, 150);

          return (
            <div
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(index, el);
                else itemRefs.current.delete(index);
              }}
              role="option"
              aria-selected={isActive}
              style={{ animationDelay: `${animDelay}ms` }}
              className={cn(
                "animate-item-reveal mx-2 flex cursor-pointer items-center gap-4 rounded-xl px-4 py-3 transition-all duration-150",
                isActive
                  ? "bg-primary/8 animate-glow-pulse"
                  : "hover:bg-muted/50"
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
              }}
            >
              {/* Icon container - type-specific styling */}
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                  itemType === "command" && "bg-violet-500/10 text-violet-500",
                  itemType === "mcp" && "bg-cyan-500/10 text-cyan-500",
                  itemType === "builtin" && "bg-emerald-500/10 text-emerald-500",
                  isActive && "icon-glow scale-105"
                )}
              >
                {itemType === "command" && <Command className="h-4.5 w-4.5" />}
                {itemType === "mcp" && <Server className="h-4.5 w-4.5" />}
                {itemType === "builtin" && <Zap className="h-4.5 w-4.5" />}
              </div>

              {/* Content - monospace trigger, refined description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  <code
                    className={cn(
                      "font-mono text-sm font-semibold tracking-tight transition-colors",
                      isActive ? "text-primary" : "text-foreground"
                    )}
                  >
                    /{trigger}
                  </code>
                  {/* Origin badge - subtle but informative */}
                  {originLabel && (
                    <span className={cn(
                      "rounded-full px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider",
                      "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                    )}>
                      {originLabel}
                    </span>
                  )}
                  {/* Args indicator */}
                  {requiredArgs > 0 && (
                    <span className={cn(
                      "rounded-full px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider",
                      "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    )}>
                      {requiredArgs} arg{requiredArgs > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="mt-1 text-xs text-muted-foreground truncate leading-relaxed">
                    {item.description}
                  </p>
                )}
              </div>

              {/* Active indicator - keyboard hint */}
              {isActive && (
                <div className="shrink-0">
                  <kbd className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 font-mono text-xs font-medium text-primary kbd-glow">
                    ↵
                  </kbd>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer - keyboard hints as subtle guidance */}
      <div className="border-t border-border/30 px-4 py-2.5 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/50 bg-background/50 px-1 font-mono text-[10px]">
                ↑↓
              </kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/50 bg-background/50 px-1 font-mono text-[10px]">
                ↵
              </kbd>
              <span>select</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/50 bg-background/50 px-1 font-mono text-[10px]">
                esc
              </kbd>
              <span>close</span>
            </span>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {items.length} result{items.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
