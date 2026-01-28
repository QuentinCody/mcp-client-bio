import { type modelID } from "@/ai/providers";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { ArrowUp, Hash, ServerIcon, CircleStop, Sparkles, Clock, Zap, Command } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelPicker } from "./model-picker";
import { TokenSummary } from "./token-summary";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ensurePromptsLoaded, isPromptsLoaded, promptRegistry } from "@/lib/mcp/prompts/singleton";
import { SlashMenu } from "@/components/slash-menu";
import { CommandPalette } from "@/components/command-palette";
import { ArgInput } from "@/components/arg-input";
import { toToken } from "@/lib/mcp/prompts/token";
import { renderTemplate } from "@/lib/mcp/prompts/template";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import { slashRegistry } from "@/lib/slash";
import type { SlashCommandMeta, SlashCommandSuggestion } from "@/lib/slash/types";
import type { MCPServer, PromptMessage } from "@/lib/context/mcp-context";
import { useMCP } from "@/lib/context/mcp-context";
import { ResourceChip } from "@/components/mcp/ResourceChip";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type MenuItem = SlashPromptDef & {
  commandMeta?: SlashCommandMeta;
  score?: number;
  group?: "command" | "prompt";
};

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
  chatId?: string;
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
  chatId,
}: InputProps) => {
  const isStreaming = status === "streaming" || status === "submitted";
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
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
  const [argMode, setArgMode] = useState<{
    item: MenuItem;
    server?: MCPServer;
  } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");

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

  // Palette-specific items using paletteQuery
  const palettePromptItems = useMemo<MenuItem[]>(() => {
    void mcpServers;
    void registryRevision;
    void promptsLoaded;
    const results = promptRegistry.searchDetailed(paletteQuery, { limit: 80 });
    return results.map(({ prompt, score }) => ({
      ...prompt,
      score,
    }));
  }, [paletteQuery, mcpServers, registryRevision, promptsLoaded]);

  const paletteCommandItems = useMemo<MenuItem[]>(() => {
    void registryRevision;
    return slashRegistry
      .list(paletteQuery)
      .filter((suggestion) => suggestion.kind === "local")
      .map((suggestion) => ({
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
  }, [paletteQuery, registryRevision]);

  const paletteItems = useMemo<MenuItem[]>(() => {
    const merged = [...paletteCommandItems, ...palettePromptItems];
    merged.sort((a, b) => {
      const aScore = typeof a.score === "number" ? a.score : 0;
      const bScore = typeof b.score === "number" ? b.score : 0;
      if (bScore !== aScore) return bScore - aScore;
      return (a.trigger || a.name).localeCompare(b.trigger || b.name);
    });
    return merged;
  }, [paletteCommandItems, palettePromptItems]);

  // Handle palette selection
  const handlePaletteSelect = useCallback((def: MenuItem) => {
    setPaletteOpen(false);
    insertPrompt(def);
  }, []);

  useEffect(() => {
    if (activeIndex < items.length) return;
    if (items.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex(items.length - 1);
  }, [items.length, activeIndex]);

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

      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (node && slashMatch) {
          const matchStart = selStart - slashMatch[0].length;
          const prefixLength = slashMatch[1].length;
          const tokenLength = toToken(def).length;
          const newCursorPos = matchStart + prefixLength + tokenLength;
          node.setSelectionRange(newCursorPos, newCursorPos);
          node.focus();
        }
      });
      promptRegistry.markUsed(def.id);
      return;
    }

    setMenuOpen(false);
    promptRegistry.markUsed(def.id);

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
    promptRegistry.markUsed(def.id);
    try {
      const result = await fetchPromptMessages(server.id, def.name, args);
      if (!result) {
        throw new Error("Prompt resolution failed");
      }
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
        // Open the full-screen Command Palette
        setPaletteQuery('');
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onGlobalShortcut);
    return () => window.removeEventListener('keydown', onGlobalShortcut);
  }, []);

  async function onKeyDownEnhanced(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.defaultPrevented) {
      if (menuOpen) setMenuOpen(false);
      return;
    }
    const before = input.slice(0, (e.currentTarget.selectionStart ?? 0));
    const slashCtx = /(^|\s)\/([^\s/]*)$/.exec(before);

    if (slashCtx) {
      setMenuOpen(true);
      setQuery(slashCtx[2] ?? "");
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
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
    }

    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();

      if (promptPreview && !promptPreview.sending) {
        handlePreviewSend();
        return;
      }

      if (input.trim()) {
        e.currentTarget.form?.requestSubmit();
      }
    }
  }

  function insertPrompt(def: MenuItem) {
    if (def.mode === 'command' && def.commandMeta) {
      setMenuOpen(false);
      handleInputChange({ target: { value: "" } } as any);
      requestAnimationFrame(() => textareaRef.current?.focus());
      onRunCommand(def.commandMeta, []);
      return;
    }

    const hasArgs = (def.args?.length ?? 0) > 0;

    if (def.origin === 'client-prompt') {
      if (hasArgs) {
        setMenuOpen(false);
        setArgMode({ item: def });
        return;
      }
      resolveClientPrompt(def, {});
      return;
    }

    if (def.origin === 'server-import') {
      const server = mcpServers.find((s) => s.id === def.sourceServerId) ??
        mcpServers.find((s) => s.name === def.sourceServerId);
      if (!server) {
        toast.error('MCP server unavailable');
        return;
      }
      setMenuOpen(false);
      if (hasArgs) {
        setArgMode({ item: def, server });
        return;
      }
      void resolveServerPrompt(server, def, {});
      return;
    }

    const selStart = textareaRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, selStart);
    const after = input.slice(selStart);
    const slashMatch = /(^|\s)\/([^\s]*)$/.exec(before);
    const replaced = before.replace(/(^|\s)\/([^\s]*)$/, `$1${toToken(def)}`) + after;
    const fakeEvent = { target: { value: replaced } } as any;
    handleInputChange(fakeEvent);
    setMenuOpen(false);

    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (node && slashMatch) {
        const matchStart = selStart - slashMatch[0].length;
        const prefixLength = slashMatch[1].length;
        const tokenLength = toToken(def).length;
        const newCursorPos = matchStart + prefixLength + tokenLength;
        node.setSelectionRange(newCursorPos, newCursorPos);
        node.focus();
      }
    });
    promptRegistry.markUsed(def.id);
  }

  const showInlineModelPicker = showModelPicker && modelPickerVariant === "inline";
  const showFloatingModelPicker = showModelPicker && modelPickerVariant === "floating";

  // Recently used prompts for smart suggestions
  const recentPrompts = useMemo(() => {
    const usageSnapshot = promptRegistry.getUsageSnapshot();
    const entries = Array.from(usageSnapshot.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const recent: { id: string; name: string; title: string }[] = [];
    for (const [id] of entries) {
      const prompt = promptRegistry.getById(id);
      if (prompt) {
        recent.push({
          id: prompt.id,
          name: prompt.name,
          title: prompt.title || prompt.name,
        });
      }
    }
    return recent;
  }, [promptsLoaded, registryRevision]);

  // Quick suggestion chips based on connected servers
  const quickSuggestions = useMemo(() => {
    const suggestions: { label: string; icon: typeof Sparkles; query: string }[] = [];

    // Add contextual suggestions based on connected servers
    const serverNames = mcpServers
      .filter(s => selectedMcpServers.includes(s.id) && s.status === 'connected')
      .map(s => s.name?.toLowerCase() || '');

    if (serverNames.some(n => n.includes('target') || n.includes('opentargets'))) {
      suggestions.push({ label: 'Drug targets', icon: Zap, query: 'Find drug targets for ' });
    }
    if (serverNames.some(n => n.includes('uniprot'))) {
      suggestions.push({ label: 'Protein search', icon: Sparkles, query: 'Search UniProt for ' });
    }
    if (serverNames.some(n => n.includes('clinical') || n.includes('trials'))) {
      suggestions.push({ label: 'Clinical trials', icon: Sparkles, query: 'Find clinical trials for ' });
    }

    return suggestions.slice(0, 3);
  }, [mcpServers, selectedMcpServers]);

  const handleQuickSuggestion = (query: string) => {
    handleInputChange({ target: { value: query } } as any);
    textareaRef.current?.focus();
    // Set cursor at end
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (node) {
        node.setSelectionRange(query.length, query.length);
      }
    });
  };

  const handleRecentPrompt = (promptId: string) => {
    const prompt = promptItems.find(p => p.id === promptId);
    if (prompt) {
      insertPrompt(prompt);
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Smart Suggestions Bar - "Command Bridge" feature */}
      {!menuOpen && !argMode && !input.trim() && (recentPrompts.length > 0 || quickSuggestions.length > 0) && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {recentPrompts.length > 0 && (
            <>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 shrink-0">
                <Clock className="h-3 w-3" />
                Recent
              </span>
              {recentPrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => handleRecentPrompt(prompt.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent hover:border-border/50 transition-all shrink-0"
                >
                  <Hash className="h-3 w-3" />
                  {prompt.title}
                </button>
              ))}
            </>
          )}
          {quickSuggestions.length > 0 && (
            <>
              {recentPrompts.length > 0 && (
                <div className="w-px h-4 bg-border/50 shrink-0" />
              )}
              {quickSuggestions.map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleQuickSuggestion(suggestion.query)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/5 hover:bg-primary/10 text-primary/70 hover:text-primary border border-primary/10 hover:border-primary/20 transition-all shrink-0"
                >
                  <suggestion.icon className="h-3 w-3" />
                  {suggestion.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Status bar - desktop */}
      <div className="hidden sm:flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {showInlineModelPicker && (
            <ModelPicker
              setSelectedModel={setSelectedModel}
              selectedModel={selectedModel}
              variant="inline"
              className="w-auto"
            />
          )}
          <TokenSummary chatId={chatId} />
        </div>
        <div className="flex items-center gap-3">
          {activeServerCount > 0 && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <ServerIcon className="h-3 w-3" />
              <span className="font-medium">{activeServerCount}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setPaletteQuery('');
              setPaletteOpen(true);
            }}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Command className="h-3 w-3" />
            <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">K</kbd>
          </button>
        </div>
      </div>

      {/* Main input - "Command Bridge" elevated design */}
      <div className={cn(
        "relative rounded-2xl border bg-background transition-all duration-300",
        "shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]",
        "hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)]",
        "focus-within:shadow-[0_0_0_1px_hsl(var(--primary)/0.2),0_4px_16px_rgba(0,0,0,0.08),0_0_32px_hsl(var(--primary)/0.1)]",
        "border-border/60 focus-within:border-primary/50"
      )}>
        {/* Slash command menu */}
        {menuOpen && items.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-2 z-50">
            <SlashMenu
              query={query}
              items={items}
              onSelect={insertPrompt}
              onClose={() => setMenuOpen(false)}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
            />
          </div>
        )}

        {/* Inline argument input */}
        {argMode && (
          <div className="absolute bottom-full left-0 right-0 mb-2 z-50">
            <ArgInput
              args={argMode.item.args ?? []}
              promptName={argMode.item.name}
              onSubmit={(values) => {
                if (argMode.item.origin === 'client-prompt') {
                  resolveClientPrompt(argMode.item, values);
                } else if (argMode.server) {
                  void resolveServerPrompt(argMode.server, argMode.item, values);
                }
                setArgMode(null);
                textareaRef.current?.focus();
              }}
              onCancel={() => {
                setArgMode(null);
                textareaRef.current?.focus();
              }}
              onCompleteArgument={
                argMode.server
                  ? async (name, value, ctx) => {
                      const result = await completePromptArgument({
                        serverId: argMode.server!.id,
                        promptName: argMode.item.name,
                        argumentName: name,
                        value,
                        contextArgs: ctx,
                      });
                      return result?.values ?? [];
                    }
                  : undefined
              }
            />
          </div>
        )}

        {/* Textarea */}
        <ShadcnTextarea
          className={cn(
            "max-h-[40vh] min-h-[56px] w-full resize-none border-none bg-transparent px-4 py-4 text-[15px] leading-relaxed placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:outline-none",
            "transition-[min-height] duration-200 ease-out"
          )}
          value={input}
          autoFocus
          placeholder={menuOpen || argMode ? "Search commands..." : "Ask anything about biological data..."}
          onChange={handleInputChange}
          onKeyDown={onKeyDownEnhanced}
          ref={textareaRef}
          aria-autocomplete="list"
          data-command-target="chat-input"
        />

        {showFloatingModelPicker && (
          <ModelPicker
            setSelectedModel={setSelectedModel}
            selectedModel={selectedModel}
            variant="floating"
          />
        )}

        {/* Bottom bar with actions */}
        <div className="flex items-center justify-between px-3 pb-3">
          {/* Left side - hints and status */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
            {menuOpen && items.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-primary/5 text-primary/70 border border-primary/10">
                {items.length} results
              </span>
            )}
            {!menuOpen && input.length > 0 && (
              <span className="tabular-nums">
                {input.length} chars
              </span>
            )}
            {!menuOpen && !input.trim() && (
              <span className="hidden sm:inline">
                Type <kbd className="px-1 py-0.5 mx-0.5 rounded bg-muted text-[10px] font-mono">/</kbd> for commands
              </span>
            )}
          </div>

          {/* Right side - send button */}
          <button
            type={isStreaming ? "button" : "submit"}
            onClick={isStreaming ? stop : undefined}
            disabled={(!isStreaming && !input.trim()) || (isStreaming && status === "submitted")}
            className={cn(
              "flex items-center justify-center rounded-xl transition-all duration-200",
              "h-9 min-w-[36px] px-3",
              isStreaming
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm shadow-destructive/20"
                : !input.trim()
                  ? "bg-muted/50 text-muted-foreground/50 cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]"
            )}
            aria-label={isStreaming ? "Stop" : "Send"}
          >
            {isStreaming ? (
              <CircleStop className="h-4 w-4" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>


      {/* Prompt preview */}
      {promptPreview && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Hash className="h-4 w-4" />
                Prompt ready to send
              </div>
              {promptPreview.sending ? (
                <p className="mt-1 text-xs text-primary/70">Sending...</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Review before sending</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
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
            <div className="mt-3 flex items-center justify-end">
              <Button size="sm" className="gap-2" type="button" onClick={handlePreviewSend} disabled={isLoading}>
                <ArrowUp className="h-3.5 w-3.5" />
                Send
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Command Palette (⌘K) */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        query={paletteQuery}
        onQueryChange={setPaletteQuery}
        items={paletteItems}
        onSelect={handlePaletteSelect}
      />

    </div>
  );
};
