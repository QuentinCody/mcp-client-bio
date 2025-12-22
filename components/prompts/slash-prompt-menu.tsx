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
  Zap,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EnhancedPromptPreview } from "@/components/prompts/enhanced-prompt-preview";
import { PromptHelpButton, PromptHelpPanel } from "@/components/prompts/prompt-help-tooltip";
import { PromptLoadingStates } from "@/components/prompts/prompt-loading-states";
import { useMCP } from "@/lib/context/mcp-context";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "motion/react";

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
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      role="combobox"
      aria-expanded="true"
      aria-controls={listId}
      aria-haspopup="listbox"
      className={cn(
        "z-50 w-full max-w-full sm:w-[52rem] max-h-[75vh] overflow-hidden rounded-2xl border-2 border-gray-200/80 dark:border-gray-700/60",
        "bg-white/98 dark:bg-[#1a1a1a]/98 text-sm shadow-[0_24px_64px_rgba(0,0,0,0.2)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.6)]",
        "backdrop-blur-2xl ring-1 ring-black/5 dark:ring-white/10",
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
      <div className="border-b-2 border-gray-100/80 dark:border-gray-700/40 bg-gradient-to-r from-gray-50/95 via-white/95 to-gray-50/95 dark:from-gray-900/95 dark:via-gray-800/95 dark:to-gray-900/95 px-5 py-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 text-xs">
          <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 px-2.5 py-1 shadow-lg shadow-blue-500/20">
            <Zap className="h-3.5 w-3.5 text-white drop-shadow-md" />
            <span className="font-bold text-white">Commands</span>
          </div>
          {query && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1.5 rounded-full bg-amber-100/80 dark:bg-amber-900/30 px-2.5 py-1 ring-1 ring-amber-200 dark:ring-amber-700/50"
            >
              <Search className="h-3 w-3 text-amber-700 dark:text-amber-400" />
              <span className="font-semibold text-amber-800 dark:text-amber-300">"{query}"</span>
            </motion.div>
          )}
          <div className="ml-auto flex items-center gap-3">
            <motion.span
              key={items.length}
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="rounded-full bg-gradient-to-r from-green-500/10 to-emerald-500/10 px-3 py-1 text-xs font-bold text-green-700 dark:text-green-400 ring-1 ring-green-500/20"
            >
              {items.length} {items.length === 1 ? "result" : "results"}
            </motion.span>
            <PromptHelpButton onClick={() => setHelpOpen(true)} className="ml-1" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <AnimatePresence mode="popLayout">
            {counts.local > 0 && (
              <motion.div
                key="badge-local"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Badge variant="outline" className="border-gray-300 dark:border-gray-600 bg-white/50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 font-semibold shadow-sm">
                  <CommandIcon className="mr-1 h-3 w-3" />
                  Local · {counts.local}
                </Badge>
              </motion.div>
            )}
            {counts.clientPrompts > 0 && (
              <motion.div
                key="badge-client-prompts"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.2, delay: 0.05 }}
              >
                <Badge variant="outline" className="border-purple-300 dark:border-purple-600 bg-purple-50/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 font-semibold shadow-sm">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Client · {counts.clientPrompts}
                </Badge>
              </motion.div>
            )}
            {counts.templates > 0 && (
              <motion.div
                key="badge-templates"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.2, delay: 0.1 }}
              >
                <Badge variant="outline" className="border-green-300 dark:border-green-600 bg-green-50/50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-semibold shadow-sm">
                  <FileText className="mr-1 h-3 w-3" />
                  Templates · {counts.templates}
                </Badge>
              </motion.div>
            )}
            {counts.server > 0 && (
              <motion.div
                key="badge-server"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.2, delay: 0.15 }}
              >
                <Badge className="bg-gradient-to-r from-blue-500 to-blue-600 border-0 text-white font-semibold shadow-md shadow-blue-500/20">
                  <Server className="mr-1 h-3 w-3" />
                  MCP · {counts.server}
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="max-h-96 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 px-6 py-12 text-sm text-gray-500 dark:text-gray-400"
            >
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <span className="font-medium">Loading commands...</span>
            </motion.div>
          ) : items.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-6 py-12"
            >
              <PromptLoadingStates isLoading={false} isEmpty />
            </motion.div>
          ) : (
            <div id={listId} role="listbox" aria-label="Slash commands" className="divide-y divide-gray-100/60 dark:divide-gray-700/40">
              <AnimatePresence mode="popLayout">
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
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="hidden max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent border-l-2 border-gray-100/80 dark:border-gray-700/40 bg-gradient-to-br from-gray-50/60 via-white/60 to-gray-50/60 dark:from-gray-900/60 dark:via-gray-800/60 dark:to-gray-900/60 p-4 sm:block backdrop-blur-sm">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-4 py-6"
              >
                <PromptLoadingStates isLoading />
              </motion.div>
            ) : (() => {
              const current = items[index];
              if (!current) return null;
              if (current.mode === "command") {
                return (
                  <motion.div
                    key={`command-${current.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3 px-4 py-4 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <CommandIcon className="h-5 w-5 text-blue-500" />
                      <code className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-1 font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
                        /{current.trigger || current.name}
                      </code>
                    </div>
                    {current.description && (
                      <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{current.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <Zap className="h-3.5 w-3.5 text-green-500" />
                      <span>Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded font-mono text-[10px]">Enter</kbd> to execute</span>
                    </div>
                  </motion.div>
                );
              }
              return (
                <motion.div
                  key={`prompt-${current.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
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
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>
      </div>

      <div className="border-t-2 border-gray-100/80 dark:border-gray-700/40 bg-gradient-to-r from-gray-50/95 via-white/95 to-gray-50/95 dark:from-gray-900/95 dark:via-gray-800/95 dark:to-gray-900/95 px-5 py-2.5 backdrop-blur-xl">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <kbd className="rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 shadow-sm">↑↓</kbd>
              <span className="font-medium text-gray-600 dark:text-gray-400">navigate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 shadow-sm">↵</kbd>
              <span className="font-medium text-gray-600 dark:text-gray-400">select</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 shadow-sm">esc</kbd>
              <span className="font-medium text-gray-600 dark:text-gray-400">close</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
            <Clock className="h-3 w-3" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Command Palette</span>
          </div>
        </div>
      </div>

      <PromptHelpPanel isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </motion.div>
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="py-3"
    >
      <div className="px-5 pb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
          {badge && (
            <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider shadow-sm">
              {badge}
            </Badge>
          )}
        </div>
        {description && <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{description}</p>}
      </div>
      <ul role="presentation">
        {entries.map(({ item, index: absoluteIndex }) => {
          const isActive = absoluteIndex === currentIndex;
          return (
            <motion.li
              key={item.id}
              role="option"
              aria-selected={isActive}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15, delay: absoluteIndex * 0.02 }}
              className={cn(
                "group relative cursor-pointer px-5 py-3 transition-all duration-200",
                isActive
                  ? "border-l-4 border-l-blue-500 dark:border-l-blue-400 bg-gradient-to-r from-blue-50/90 to-blue-50/40 dark:from-blue-900/30 dark:to-blue-900/10 shadow-sm"
                  : "border-l-4 border-l-transparent hover:border-l-gray-300 dark:hover:border-l-gray-600 hover:bg-gray-50/80 dark:hover:bg-gray-800/50"
              )}
              onMouseEnter={() => onHover(absoluteIndex)}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item);
              }}
            >
              <div className="flex items-start gap-3.5">
                <motion.div
                  animate={isActive ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-0.5 flex-shrink-0"
                >
                  {getPromptIcon(item)}
                </motion.div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "text-sm font-semibold transition-colors",
                      isActive ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-gray-100"
                    )}>
                      {highlight(item.title, query)}
                    </span>
                    <code className={cn(
                      "rounded-md px-2 py-0.5 font-mono text-[11px] font-bold transition-colors",
                      isActive
                        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                    )}>
                      /{item.mode === "command" ? item.name : item.trigger}
                    </code>
                    {item.args && item.args.length > 0 && (
                      <span className="rounded-full bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-900/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-700/50">
                        {item.args.length} {item.args.length === 1 ? "arg" : "args"}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className={cn(
                      "line-clamp-2 text-xs leading-relaxed transition-colors",
                      isActive ? "text-gray-700 dark:text-gray-300" : "text-gray-500 dark:text-gray-400"
                    )}>
                      {highlight(item.description, query)}
                    </p>
                  )}
                  {item.args && item.args.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.args.slice(0, 4).map((arg) => (
                        <span
                          key={`${item.id}-arg-${arg.name}`}
                          className={cn(
                            "rounded-full border-2 px-2 py-0.5 text-[10px] font-bold transition-all",
                            arg.required
                              ? "border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 shadow-sm"
                              : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                          )}
                        >
                          {arg.required && <span className="mr-0.5">*</span>}
                          {arg.name}
                        </span>
                      ))}
                      {item.args.length > 4 && (
                        <span className="rounded-full border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:text-gray-400">
                          +{item.args.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <motion.div
                  animate={isActive ? { x: 2, opacity: 1 } : { x: 0, opacity: 0.3 }}
                  transition={{ duration: 0.2 }}
                  className="flex-shrink-0"
                >
                  <ChevronRight className={cn(
                    "h-5 w-5 transition-colors",
                    isActive ? "text-blue-500 dark:text-blue-400" : "text-gray-300 dark:text-gray-600"
                  )} />
                </motion.div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </motion.div>
  );
}
