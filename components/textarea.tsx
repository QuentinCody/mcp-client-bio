import { modelDetails, type modelID } from "@/ai/providers";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2, Hash, Sparkles, Zap, ServerIcon, CircleStop, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelPicker } from "./model-picker";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ensurePromptsLoaded, isPromptsLoaded, promptRegistry } from "@/lib/mcp/prompts/singleton";
import { SlashPromptMenu } from "@/components/prompts/slash-prompt-menu";
import { toToken } from "@/lib/mcp/prompts/token";
import { renderTemplate } from "@/lib/mcp/prompts/template";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import { slashRegistry } from "@/lib/slash";
import type { SlashCommandMeta, SlashCommandSuggestion } from "@/lib/slash/types";
import type { MCPServer, PromptMessage } from "@/lib/context/mcp-context";
import type { PromptSummary } from "@/lib/mcp/transport/http";
import { useMCP } from "@/lib/context/mcp-context";
import { PromptArgDialog } from "@/components/mcp/PromptArgDialog";
import { ResourceChip } from "@/components/mcp/ResourceChip";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type MenuItem = SlashPromptDef & {
  commandMeta?: SlashCommandMeta;
  score?: number;
  group?: "command" | "prompt";
};

type SlashSegmentHint = { value: string; complete: boolean };

interface InputProps {
  input: string;
  handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
  status: string;
  stop: () => void;
  selectedModel: modelID;
  setSelectedModel: (model: modelID) => void;
  showModelPicker?: boolean;
  modelPickerVariant?: "floating" | "inline";
  onRunCommand: (command: SlashCommandMeta, args?: Record<string, string> | string[]) => void;
  onPromptResolved: (payload: {
    def: SlashPromptDef;
    serverId?: string;
    args: Record<string, string>;
    result: { messages: PromptMessage[]; description?: string };
  }) => void;
  promptPreview?: {
    def: SlashPromptDef;
    args: Record<string, string>;
    resources: { uri: string; name?: string }[];
    sending?: boolean;
  } | null;
  onPromptPreviewCancel: () => void;
  onPromptPreviewResourceRemove: (uri: string) => void;
}

export const Textarea = ({
  input,
  handleInputChange,
  isLoading,
  status,
  stop,
  selectedModel,
  setSelectedModel,
  showModelPicker = true,
  modelPickerVariant = "inline",
  onRunCommand,
  onPromptResolved,
  promptPreview,
  onPromptPreviewCancel,
  onPromptPreviewResourceRemove,
}: InputProps) => {
  const isStreaming = status === "streaming" || status === "submitted";
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showingSlashHint, setShowingSlashHint] = useState(false);
  const [isTypingSlash, setIsTypingSlash] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    mcpServers,
    selectedMcpServers,
    ensureAllPromptsLoaded,
    fetchPromptMessages,
    completePromptArgument,
  } = useMCP();
  const [activeIndex, setActiveIndex] = useState(0);
  const [promptsLoaded, setPromptsLoaded] = useState(false);
  const [registryRevision, setRegistryRevision] = useState(0);
  const [argDialog, setArgDialog] = useState<{
    open: boolean;
    mode?: "server" | "client";
    server?: MCPServer;
    prompt?: PromptSummary;
    def?: MenuItem;
  }>({ open: false });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await ensurePromptsLoaded();
      } finally {
        if (mounted) setPromptsLoaded(isPromptsLoaded());
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const unsubscribe = slashRegistry.listen(() => setRegistryRevision((rev) => rev + 1));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    void ensureAllPromptsLoaded();
  }, [menuOpen, ensureAllPromptsLoaded]);

  useEffect(() => {
    if (!menuOpen) return;
    setActiveIndex(0);
  }, [query, menuOpen]);

  const modelInfo = useMemo(() => modelDetails[selectedModel], [selectedModel]);

  const activeServerCount = useMemo(() => {
    if (!Array.isArray(mcpServers) || mcpServers.length === 0) {
      return 0;
    }
    return selectedMcpServers.filter((id) =>
      mcpServers.some((server) => server.id === id)
    ).length;
  }, [mcpServers, selectedMcpServers]);

  const commandSuggestions = useMemo<SlashCommandSuggestion[]>(() => {
    void registryRevision;
    return slashRegistry
      .list(query)
      .filter((suggestion) => suggestion.kind === "local");
  }, [query, registryRevision]);

  const commandItems = useMemo<MenuItem[]>(() => {
    return commandSuggestions.map((suggestion) => ({
      id: `command/${suggestion.id}`,
      trigger: suggestion.name,
      namespace: suggestion.sourceId ? `command-${suggestion.sourceId}` : "commands",
      name: suggestion.name,
      title: suggestion.title || suggestion.name,
      description: suggestion.description,
      origin: "client",
      mode: "command",
      args: suggestion.arguments?.map((arg) => ({
        name: arg.name,
        description: arg.description,
        required: arg.required,
      })),
      commandMetaId: suggestion.id,
      commandMeta: suggestion,
      score: suggestion.score,
    }));
  }, [commandSuggestions]);

  const promptItems = useMemo<MenuItem[]>(() => {
    void mcpServers;
    void registryRevision;
    void promptsLoaded;
    const results = promptRegistry.searchDetailed(query, { limit: 80 });
    return results.map(({ prompt, score }) => ({
      ...prompt,
      score,
    }));
  }, [query, mcpServers, registryRevision, promptsLoaded]);

  const items = useMemo<MenuItem[]>(() => {
    const merged = [...commandItems, ...promptItems];
    merged.sort((a, b) => {
      const aScore = typeof a.score === "number" ? a.score : 0;
      const bScore = typeof b.score === "number" ? b.score : 0;
      if (bScore !== aScore) return bScore - aScore;
      return (a.trigger || a.name).localeCompare(b.trigger || b.name);
    });
    return merged;
  }, [commandItems, promptItems]);

  useEffect(() => {
    if (activeIndex < items.length) return;
    if (items.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex(items.length - 1);
  }, [items.length, activeIndex]);

  const highlightedItem = useMemo(() => {
    if (!items.length) return null;
    const safeIndex = Math.max(0, Math.min(activeIndex, items.length - 1));
    return items[safeIndex];
  }, [items, activeIndex]);

  const slashSegments = useMemo<SlashSegmentHint[]>(() => {
    if (!menuOpen || !query) return [];
    const rawSegments = query.split(".");
    return rawSegments.map((segment, idx) => ({
      value: segment,
      complete: idx < rawSegments.length - 1,
    }));
  }, [menuOpen, query]);

  const composerStatus = isStreaming
    ? status === "submitted"
      ? "Thinking..."
      : "Streaming"
    : "Ready";

  const characterCount = input.length;

  function toPromptSummary(def: MenuItem): PromptSummary {
    return {
      name: def.name,
      title: def.title,
      description: def.description,
      arguments: (def.args ?? []).map((arg) => ({
        name: arg.name,
        description: arg.description,
        required: arg.required,
      })),
    };
  }

  function resolveClientPrompt(def: MenuItem, args: Record<string, string>) {
    const templateMessages = def.template?.messages ?? [];

    if (templateMessages.length === 0) {
      const selStart = textareaRef.current?.selectionStart ?? input.length;
      const before = input.slice(0, selStart);
      const after = input.slice(selStart);
      const slashMatch = /(^|\s)\/([^\s]*)$/.exec(before);
      const replaced = before.replace(/(^|\s)\/([^\s]*)$/, `$1${toToken(def)}`) + after;
      handleInputChange({ target: { value: replaced } } as any);
      setMenuOpen(false);
      setIsTypingSlash(false);

      // Position cursor after the inserted token
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (node && slashMatch) {
          const matchStart = selStart - slashMatch[0].length;
          const prefixLength = slashMatch[1].length; // whitespace before slash
          const tokenLength = toToken(def).length;
          const newCursorPos = matchStart + prefixLength + tokenLength;
          node.setSelectionRange(newCursorPos, newCursorPos);
          node.focus();
        }
      });
      promptRegistry.markUsed(def.id);
      try {
        const raw = localStorage.getItem("prompt:recent");
        const recent: Array<{ id: string; ts: number }> = raw ? JSON.parse(raw) : [];
        const existing = new Map(recent.map((r) => [r.id, r.ts] as const));
        existing.set(def.id, Date.now());
        const next = Array.from(existing.entries())
          .map(([id, ts]) => ({ id, ts }))
          .sort((a, b) => b.ts - a.ts)
          .slice(0, 8);
        localStorage.setItem("prompt:recent", JSON.stringify(next));
      } catch {}
      return;
    }

    setMenuOpen(false);
    setIsTypingSlash(false);
    promptRegistry.markUsed(def.id);
    try {
      const raw = localStorage.getItem("prompt:recent");
      const recent: Array<{ id: string; ts: number }> = raw ? JSON.parse(raw) : [];
      const existing = new Map(recent.map((r) => [r.id, r.ts] as const));
      existing.set(def.id, Date.now());
      const next = Array.from(existing.entries())
        .map(([id, ts]) => ({ id, ts }))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 8);
      localStorage.setItem("prompt:recent", JSON.stringify(next));
    } catch {}

    try {
      localStorage.setItem(`prompt:${def.id}:args`, JSON.stringify(args));
    } catch {}

    const messages: PromptMessage[] = templateMessages.map((message) => ({
      role: message.role,
      content: [
        {
          type: "text",
          text: renderTemplate(message.text, args),
        },
      ],
    }));

    onPromptResolved({
      def,
      args,
      result: {
        messages,
        description: def.description,
      },
    });
  }

  async function resolveServerPrompt(
    server: MCPServer,
    def: MenuItem,
    args: Record<string, string>
  ) {
    setMenuOpen(false);
    setIsTypingSlash(false);
    promptRegistry.markUsed(def.id);
    try {
      const result = await fetchPromptMessages(server.id, def.name, args);
      if (!result) {
        throw new Error("Prompt resolution failed");
      }
      try {
        localStorage.setItem(`prompt:${def.id}:args`, JSON.stringify(args));
      } catch {}
      onPromptResolved({
        def,
        serverId: server.id,
        args,
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Prompt resolution failed";
      toast.error(message);
    }
  }

  const handlePreviewSend = () => {
    const form = textareaRef.current?.form;
    form?.requestSubmit();
  };

  useEffect(() => {
    const onGlobalShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart ?? input.length;
        const end = el.selectionEnd ?? input.length;
        let nextValue = input;
        if (!input.slice(0, start).endsWith('/')) {
          nextValue = `${input.slice(0, start)}/${input.slice(end)}`;
          const fakeEvent = { target: { value: nextValue } } as any;
          handleInputChange(fakeEvent);
          requestAnimationFrame(() => {
            const node = textareaRef.current;
            if (node) {
              const caret = start + 1;
              node.setSelectionRange(caret, caret);
            }
          });
        }
        textareaRef.current?.focus();
        setMenuOpen(true);
        setQuery('');
        setActiveIndex(0);
      }
    };
    window.addEventListener('keydown', onGlobalShortcut);
    return () => window.removeEventListener('keydown', onGlobalShortcut);
  }, [handleInputChange, input]);

  async function onKeyDownEnhanced(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.defaultPrevented) {
      if (menuOpen) setMenuOpen(false);
      setIsTypingSlash(false);
      return;
    }
    const before = input.slice(0, (e.currentTarget.selectionStart ?? 0));
    const slashCtx = /(^|\s)\/([^\s/]*)$/.exec(before);
    
    // Handle slash character typing
    if (e.key === '/' && !slashCtx) {
      setIsTypingSlash(true);
      setShowingSlashHint(true);
      setTimeout(() => setShowingSlashHint(false), 3000);
    }
    
    if (slashCtx) {
      setMenuOpen(true);
      setQuery(slashCtx[2] ?? "");
      setIsTypingSlash(false);
      if (e.key === "Escape") {
        setMenuOpen(false);
        setIsTypingSlash(false);
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        // Select first item when menu is open
        if (items.length > 0) {
          e.preventDefault();
          const chosen = items[Math.max(0, Math.min(activeIndex, items.length - 1))] || items[0];
          insertPrompt(chosen);
          return;
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, Math.max(0, items.length - 1)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        return;
      }
    } else if (menuOpen) {
      setMenuOpen(false);
      setIsTypingSlash(false);
    }

    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();

      // If there's a prompt preview, send it (this calls form.requestSubmit() same as normal)
      if (promptPreview && !promptPreview.sending) {
        handlePreviewSend();
        return;
      }

      // For regular input without prompt preview, send if it has content
      if (input.trim()) {
        e.currentTarget.form?.requestSubmit();
      }
    }
  }

  // No inline expansion here; resolution handled in Chat and previewed below

  function insertPrompt(def: MenuItem) {
    if (def.mode === 'command' && def.commandMeta) {
      setMenuOpen(false);
      setIsTypingSlash(false);
      const fakeEvent = { target: { value: "" } } as any;
      handleInputChange(fakeEvent);

      // Focus textarea after command execution
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
      try {
        const raw = localStorage.getItem("prompt:recent");
        const recent: Array<{ id: string; ts: number }> = raw ? JSON.parse(raw) : [];
        const existing = new Map(recent.map((r) => [r.id, r.ts] as const));
        existing.set(def.id, Date.now());
        const next = Array.from(existing.entries())
          .map(([id, ts]) => ({ id, ts }))
          .sort((a, b) => b.ts - a.ts)
          .slice(0, 8);
        localStorage.setItem("prompt:recent", JSON.stringify(next));
      } catch {}
      onRunCommand(def.commandMeta, Array.isArray(def.commandMeta.arguments) && def.commandMeta.arguments.length === 0 ? [] : undefined);
      return;
    }

    if (def.origin === 'client-prompt') {
      const hasArgs = (def.args?.length ?? 0) > 0;
      if (hasArgs) {
        setMenuOpen(false);
        setIsTypingSlash(false);
        setArgDialog({
          open: true,
          mode: 'client',
          prompt: toPromptSummary(def),
          def,
        });
        return;
      }

      resolveClientPrompt(def, {});
      return;
    }

    if (def.origin === 'server-import') {
      const server = mcpServers.find((entry) => entry.id === def.sourceServerId) ??
        mcpServers.find((entry) => entry.name === def.sourceServerId) ??
        undefined;
      if (!server) {
        toast.error('MCP server unavailable for this prompt');
        return;
      }
      const summary = toPromptSummary(def);
      const hasArgs = (summary.arguments ?? []).length > 0;
      setMenuOpen(false);
      setIsTypingSlash(false);
      try {
        const raw = localStorage.getItem("prompt:recent");
        const recent: Array<{ id: string; ts: number }> = raw ? JSON.parse(raw) : [];
        const existing = new Map(recent.map((r) => [r.id, r.ts] as const));
        existing.set(def.id, Date.now());
        const next = Array.from(existing.entries())
          .map(([id, ts]) => ({ id, ts }))
          .sort((a, b) => b.ts - a.ts)
          .slice(0, 8);
        localStorage.setItem("prompt:recent", JSON.stringify(next));
      } catch {}

      if (hasArgs) {
        setArgDialog({ open: true, mode: 'server', server, prompt: summary, def });
        return;
      }

      void resolveServerPrompt(server, def, {});
      return;
    }

    // Replace the current "/partial" with canonical token
    const selStart = textareaRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, selStart);
    const after = input.slice(selStart);
    const slashMatch = /(^|\s)\/([^\s]*)$/.exec(before);
    const replaced = before.replace(/(^|\s)\/([^\s]*)$/, `$1${toToken(def)}`) + after;
    const fakeEvent = { target: { value: replaced } } as any;
    handleInputChange(fakeEvent);
    setMenuOpen(false);

    // Position cursor after the inserted token
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (node && slashMatch) {
        const matchStart = selStart - slashMatch[0].length;
        const prefixLength = slashMatch[1].length; // whitespace before slash
        const tokenLength = toToken(def).length;
        const newCursorPos = matchStart + prefixLength + tokenLength;
        node.setSelectionRange(newCursorPos, newCursorPos);
        node.focus();
      }
    });
    promptRegistry.markUsed(def.id);
    try {
      const raw = localStorage.getItem("prompt:recent");
      const recent: Array<{ id: string; ts: number }> = raw ? JSON.parse(raw) : [];
      const existing = new Map(recent.map((r) => [r.id, r.ts] as const));
      existing.set(def.id, Date.now());
      const next = Array.from(existing.entries())
        .map(([id, ts]) => ({ id, ts }))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 8);
      localStorage.setItem("prompt:recent", JSON.stringify(next));
    } catch {}
  }

  const showInlineModelPicker = showModelPicker && modelPickerVariant === "inline";
  const showFloatingModelPicker = showModelPicker && modelPickerVariant === "floating";

  return (
    <div className="w-full space-y-2 sm:space-y-3">
      {/* Desktop status indicators */}
      <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground/80">
        {showInlineModelPicker && (
          <ModelPicker
            setSelectedModel={setSelectedModel}
            selectedModel={selectedModel}
            variant="inline"
            className="w-full text-left sm:w-auto"
          />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1 text-muted-foreground/80">
            <ServerIcon className="h-3 w-3" />
            {activeServerCount} active
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground/80">
            <Hash className="h-3 w-3" />
            Slash ready
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
              isStreaming
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 bg-background/80 text-muted-foreground"
            )}
          >
            {isStreaming ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            {composerStatus}
          </span>
        </div>
      </div>

      <div className="relative overflow-visible rounded-2xl border-2 border-border/30 bg-background shadow-sm focus-within:border-primary/50 focus-within:shadow-lg focus-within:ring-4 focus-within:ring-primary/10 transition-all duration-200">
        {menuOpen && (
          <div className="pointer-events-auto absolute bottom-full left-0 right-0 mb-3 z-50">
            <SlashPromptMenu
              className="w-full"
              query={query}
              items={items}
              onSelect={insertPrompt}
              onClose={() => {
                setMenuOpen(false);
                setIsTypingSlash(false);
              }}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              loading={!promptsLoaded}
            />
          </div>
        )}

        {showingSlashHint && !menuOpen && (
          <div className="pointer-events-none absolute top-3 left-4 z-20 animate-in slide-in-from-left-2 duration-200">
            <div className="flex items-center gap-2 rounded-lg bg-blue-500/90 px-3 py-1.5 text-[11px] font-medium text-white shadow-md backdrop-blur-sm">
              <Hash className="h-3 w-3" />
              <span>Type to search prompts</span>
              <Sparkles className="h-3 w-3 animate-pulse" />
            </div>
          </div>
        )}

        {menuOpen && slashSegments.length > 0 && (
          <div className="pointer-events-none absolute left-3 top-2 z-10 flex flex-wrap items-center gap-1 text-[10px] font-medium text-blue-700/80">
            {slashSegments.map((segment, idx) => (
              <span
                key={`segment-${idx}-${segment.value}`}
                className={cn(
                  "rounded-md border px-2 py-0.5 font-mono uppercase tracking-wide",
                  segment.complete
                    ? "border-blue-200 bg-blue-50"
                    : "border-blue-100 bg-blue-100/70 text-blue-600"
                )}
              >
                {segment.value || (idx === slashSegments.length - 1 ? "..." : "--")}
              </span>
            ))}
          </div>
        )}

        <ShadcnTextarea
          className={cn(
            "max-h-[40vh] ![min-height:3.25rem] sm:![min-height:3.5rem] w-full resize-none border-none bg-transparent px-4 sm:px-3 pb-14 sm:pb-9 pt-3.5 sm:pt-3 text-[16px] sm:text-sm leading-relaxed placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:outline-none",
            menuOpen && "ring-1 ring-primary/30"
          )}
          value={input}
          autoFocus
          placeholder={menuOpen ? "Continue typing to filter prompts..." : "Message Bio MCP Chat..."}
          onChange={handleInputChange}
          onKeyDown={onKeyDownEnhanced}
          ref={textareaRef}
          aria-autocomplete="list"
          data-command-target="chat-input"
        />

        {menuOpen && highlightedItem && (
          <div className="pointer-events-none absolute bottom-12 left-3 z-10 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
            <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-primary shadow-sm">
              <span className="rounded border border-primary/30 bg-white/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                Tab
              </span>
              <span className="text-primary/80">complete</span>
              <code className="font-mono text-xs text-primary">
                /
                {highlightedItem.mode === "command" ? highlightedItem.name : highlightedItem.trigger}
              </code>
            </div>
            {Array.isArray(highlightedItem.args) && highlightedItem.args.length > 0 ? (
              <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 shadow-sm">
                <span>{highlightedItem.args.filter((arg) => arg.required).length} required</span>
                <span>·</span>
                <span>{highlightedItem.args.length} total</span>
              </div>
            ) : null}
          </div>
        )}

        {showFloatingModelPicker && (
          <ModelPicker
            setSelectedModel={setSelectedModel}
            selectedModel={selectedModel}
            variant="floating"
          />
        )}

        <div className="pointer-events-none absolute inset-x-3 bottom-11 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        <div className="absolute bottom-2.5 sm:bottom-3 right-2.5 sm:right-3 flex items-center gap-2">
          {menuOpen && (
            <div className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-[10px] sm:text-xs font-medium text-blue-700 shadow-sm dark:bg-blue-900/30 dark:text-blue-300">
              <Hash className="h-3 w-3" />
              <span>{items.length}</span>
            </div>
          )}

          <button
            type={isStreaming ? "button" : "submit"}
            onClick={isStreaming ? stop : undefined}
            disabled={(!isStreaming && !input.trim()) || (isStreaming && status === "submitted")}
            className={cn(
              "flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full text-sm font-medium transition-all shadow-lg active:scale-95",
              isStreaming
                ? "bg-red-500 text-white hover:bg-red-600 active:bg-red-700 shadow-red-500/30"
                : !input.trim()
                  ? "bg-muted/50 text-muted-foreground/50 shadow-sm cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 shadow-primary/30"
            )}
            aria-label={isStreaming ? "Stop response" : "Send message"}
          >
            {isStreaming ? <CircleStop className="h-5 w-5 sm:h-4 sm:w-4" /> : <ArrowUp className="h-5 w-5 sm:h-4 sm:w-4" />}
          </button>
        </div>
      </div>

      <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground/80">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-semibold">Enter</span>
            Send
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-semibold">Shift</span>
            <CornerDownLeft className="h-3 w-3 text-muted-foreground/70" />
            <span className="rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-semibold">Enter</span>
            New line
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-semibold">/</span>
            Prompts
          </span>
        </div>
        <span>{characterCount} characters</span>
      </div>

      {promptPreview && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-inner">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Sparkles className="h-4 w-4" />
                {promptPreview.def.origin === 'client-prompt' ? 'Client prompt staged' : 'Prompt staged'}
              </div>
              {promptPreview.def.origin === 'client-prompt' ? (
                <p className="mt-1 text-[11px] text-primary/80">
                  This client prompt expands to a full instruction set before sending. Adjust the text if needed, then submit to the AI agent.
                </p>
              ) : promptPreview.sending ? (
                <p className="mt-1 text-[11px] text-primary/80">Sending to the assistant…</p>
              ) : (
                <p className="mt-1 text-[11px] text-primary/80">Review linked resources before sending.</p>
              )}
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary">
                <Hash className="h-3 w-3" />
                /{promptPreview.def.trigger}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-primary hover:text-primary/80"
              type="button"
              onClick={onPromptPreviewCancel}
            >
              Clear
            </Button>
          </div>
          {promptPreview.resources?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {promptPreview.resources.map((resource) => (
                <ResourceChip
                  key={resource.uri}
                  uri={resource.uri}
                  name={resource.name}
                  onRemove={() => onPromptPreviewResourceRemove(resource.uri)}
                />
              ))}
            </div>
          ) : null}
          {!promptPreview.sending && (
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80">
                <span className="inline-flex items-center gap-1">
                  <span className="rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-semibold">Enter</span>
                  Send
                </span>
              </div>
              <Button size="sm" className="gap-2" type="button" onClick={handlePreviewSend} disabled={isLoading}>
                <ArrowUp className="h-3.5 w-3.5" />
                Send prompt
              </Button>
            </div>
          )}
        </div>
      )}
      <PromptArgDialog
        open={argDialog.open}
        onOpenChange={(open) => setArgDialog((state) => ({ ...state, open }))}
        serverId={
          argDialog.mode === 'client'
            ? 'client'
            : argDialog.def?.sourceServerSlug ?? argDialog.server?.id ?? 'server'
        }
        prompt={argDialog.prompt ?? { name: "", arguments: [] }}
        promptDef={argDialog.def}
        onResolve={async (values) => {
          if (!argDialog.def) return;
          if (argDialog.mode === 'server') {
            if (!argDialog.server) return;
            await resolveServerPrompt(argDialog.server, argDialog.def, values);
          } else if (argDialog.mode === 'client') {
            resolveClientPrompt(argDialog.def, values);
          }
          setArgDialog({ open: false });

          // Focus the textarea after dialog closes and prompt is inserted
          requestAnimationFrame(() => {
            const textarea = textareaRef.current;
            if (textarea) {
              textarea.focus();
              // Position cursor at the end of the text
              const length = textarea.value.length;
              textarea.setSelectionRange(length, length);
            }
          });
        }}
        onCompleteArgument={
          argDialog.mode === 'server'
            ? async (argumentName, value, context) => {
                if (!argDialog.server || !argDialog.def) return [];
                const result = await completePromptArgument({
                  serverId: argDialog.server.id,
                  promptName: argDialog.def.name,
                  argumentName,
                  value,
                  contextArgs: context,
                });
                return result?.values ?? [];
              }
            : undefined
        }
      />
    </div>
  );
};
