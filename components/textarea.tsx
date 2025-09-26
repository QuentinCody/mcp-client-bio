import { modelDetails, type modelID } from "@/ai/providers";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2, Hash, Sparkles, Zap, ServerIcon, CircleStop, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelPicker } from "./model-picker";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ensurePromptsLoaded, isPromptsLoaded, promptRegistry } from "@/lib/mcp/prompts/singleton";
import { SlashPromptMenu } from "@/components/prompts/slash-prompt-menu";
import { toToken } from "@/lib/mcp/prompts/token";
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

type MenuItem = SlashPromptDef & { commandMeta?: SlashCommandMeta };

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
    }));
  }, [commandSuggestions]);

  const promptItems = useMemo<MenuItem[]>(() => {
    void mcpServers;
    return promptRegistry.search(query).map((def) => ({ ...def } as MenuItem));
  }, [query, mcpServers]);

  const items = useMemo<MenuItem[]>(() => {
    return [...commandItems, ...promptItems];
  }, [commandItems, promptItems]);

  const composerStatus = isStreaming
    ? status === "submitted"
      ? "Preparing"
      : "Streaming"
    : "Ready";

  const characterCount = input.length;

  const quickSnippets = useMemo(
    () => [
      {
        id: "summary",
        label: "Summarize context",
        value:
          "Summarize the key points and open questions from our conversation so far.",
      },
      {
        id: "next-steps",
        label: "Suggest next steps",
        value:
          "Suggest the next three actions I should take based on this discussion, including why each matters.",
      },
      {
        id: "critique",
        label: "Spot risks",
        value:
          "Review the current approach and outline potential risks, missing data, or validation steps we should address before proceeding.",
      },
    ],
    []
  );

  const handleSnippetInsert = useCallback(
    (value: string) => {
      if (promptPreview) {
        onPromptPreviewCancel();
      }
      handleInputChange({ target: { value } } as any);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    },
    [handleInputChange, onPromptPreviewCancel, promptPreview]
  );

  const showQuickSnippets =
    !menuOpen && !promptPreview && input.trim().length === 0;

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

  async function resolveServerPrompt(
    server: MCPServer,
    def: MenuItem,
    args: Record<string, string>
  ) {
    setMenuOpen(false);
    setIsTypingSlash(false);
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

    if (e.key === "Enter" && !e.shiftKey && !isLoading && input.trim()) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  // No inline expansion here; resolution handled in Chat and previewed below

  function insertPrompt(def: MenuItem) {
    if (def.mode === 'command' && def.commandMeta) {
      setMenuOpen(false);
      setIsTypingSlash(false);
      const fakeEvent = { target: { value: "" } } as any;
      handleInputChange(fakeEvent);
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
        setArgDialog({ open: true, server, prompt: summary, def });
        return;
      }

      void resolveServerPrompt(server, def, {});
      return;
    }

    // Replace the current "/partial" with canonical token
    const selStart = textareaRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, selStart);
    const after = input.slice(selStart);
    const replaced = before.replace(/(^|\s)\/([^\s]*)$/, `$1${toToken(def)}`) + after;
    const fakeEvent = { target: { value: replaced } } as any;
    handleInputChange(fakeEvent);
    setMenuOpen(false);
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
    <div className="w-full space-y-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground/80">
          {showInlineModelPicker ? (
            <ModelPicker
              setSelectedModel={setSelectedModel}
              selectedModel={selectedModel}
              variant="inline"
              className="w-full text-left sm:w-auto"
            />
          ) : (
            <span className="font-semibold text-foreground">
              {modelInfo ? `${modelInfo.name} • ${modelInfo.provider}` : selectedModel}
            </span>
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

        {showQuickSnippets && quickSnippets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {quickSnippets.map((snippet) => (
              <button
                key={snippet.id}
                type="button"
                onClick={() => handleSnippetInsert(snippet.value)}
                className="group inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              >
                <Sparkles className="h-3 w-3 text-primary/70 transition-colors group-hover:text-primary" />
                {snippet.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative overflow-hidden rounded-lg border border-border/40 bg-background/80 shadow-inner focus-within:border-primary/40 focus-within:shadow-md">
        {showingSlashHint && !menuOpen && (
          <div className="pointer-events-none absolute top-3 left-4 z-20 animate-in slide-in-from-left-2 duration-200">
            <div className="flex items-center gap-2 rounded-lg bg-blue-500/90 px-3 py-1.5 text-[11px] font-medium text-white shadow-md backdrop-blur-sm">
              <Hash className="h-3 w-3" />
              <span>Type to search prompts</span>
              <Sparkles className="h-3 w-3 animate-pulse" />
            </div>
          </div>
        )}

        <ShadcnTextarea
          className={cn(
            "max-h-[40vh] ![min-height:3.5rem] w-full resize-none border-none bg-transparent px-3 pb-9 pt-3 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:outline-none",
            menuOpen && "ring-1 ring-primary/30"
          )}
          value={input}
          autoFocus
          placeholder={menuOpen ? "Continue typing to filter prompts..." : "Send a message or type / for prompts..."}
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

        <div className="pointer-events-none absolute inset-x-3 bottom-11 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          {menuOpen && (
            <div className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 shadow-sm">
              <Hash className="h-3 w-3" />
              <span>{items.length}</span>
            </div>
          )}

          <button
            type={isStreaming ? "button" : "submit"}
            onClick={isStreaming ? stop : undefined}
            disabled={(!isStreaming && !input.trim()) || (isStreaming && status === "submitted")}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-medium transition-colors shadow-md",
              isStreaming
                ? "border-red-400 bg-red-500 text-white hover:bg-red-600"
                : !input.trim()
                  ? "border-border/60 bg-muted text-muted-foreground"
                  : "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            aria-label={isStreaming ? "Stop response" : "Send message"}
          >
            {isStreaming ? <CircleStop className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground/80">
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
                Prompt staged
              </div>
              {promptPreview.sending ? (
                <p className="mt-1 text-[11px] text-primary/80">Sending to the assistant…</p>
              ) : (
                <p className="mt-1 text-[11px] text-primary/80">Review linked resources before sending.</p>
              )}
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
            <div className="mt-3 flex justify-end">
              <Button size="sm" className="gap-2" type="button" onClick={handlePreviewSend} disabled={isLoading}>
                <ArrowUp className="h-3.5 w-3.5" />
                Send prompt
              </Button>
            </div>
          )}
        </div>
      )}

      {menuOpen && (
        <div className="animate-in slide-in-from-top-2 duration-200">
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

      <PromptArgDialog
        open={argDialog.open}
        onOpenChange={(open) => setArgDialog((state) => ({ ...state, open }))}
        serverId={argDialog.def?.sourceServerSlug ?? argDialog.server?.id ?? "server"}
        prompt={argDialog.prompt ?? { name: "", arguments: [] }}
        onResolve={async (values) => {
          if (!argDialog.server || !argDialog.def) return;
          await resolveServerPrompt(argDialog.server, argDialog.def, values);
          setArgDialog({ open: false });
        }}
        onCompleteArgument={async (argumentName, value, context) => {
          if (!argDialog.server || !argDialog.def) return [];
          const result = await completePromptArgument({
            serverId: argDialog.server.id,
            promptName: argDialog.def.name,
            argumentName,
            value,
            contextArgs: context,
          });
          return result?.values ?? [];
        }}
      />
    </div>
  );
};
