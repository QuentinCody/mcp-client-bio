import { modelDetails, type modelID } from "@/ai/providers";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2, Hash, ServerIcon, CircleStop } from "lucide-react";
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
      const fakeEvent = { target: { value: "" } } as any;
      handleInputChange(fakeEvent);

      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
      onRunCommand(def.commandMeta, Array.isArray(def.commandMeta.arguments) && def.commandMeta.arguments.length === 0 ? [] : undefined);
      return;
    }

    if (def.origin === 'client-prompt') {
      const hasArgs = (def.args?.length ?? 0) > 0;
      if (hasArgs) {
        setMenuOpen(false);
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

      if (hasArgs) {
        setArgDialog({ open: true, mode: 'server', server, prompt: summary, def });
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

  return (
    <div className="w-full space-y-3">
      {/* Model picker and status - desktop */}
      <div className="hidden sm:flex items-center justify-between text-xs text-muted-foreground">
        {showInlineModelPicker && (
          <ModelPicker
            setSelectedModel={setSelectedModel}
            selectedModel={selectedModel}
            variant="inline"
            className="w-auto"
          />
        )}
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <ServerIcon className="h-3.5 w-3.5" />
            {activeServerCount} servers
          </span>
          <span className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5" />
            Type / for commands
          </span>
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {status === "submitted" ? "Thinking" : "Streaming"}
            </span>
          )}
        </div>
      </div>

      {/* Main input */}
      <div className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
        {/* Slash command menu */}
        {menuOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 z-50">
            <SlashPromptMenu
              className="w-full"
              query={query}
              items={items}
              onSelect={insertPrompt}
              onClose={() => setMenuOpen(false)}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              loading={!promptsLoaded}
            />
          </div>
        )}

        {/* Textarea */}
        <ShadcnTextarea
          className={cn(
            "max-h-[40vh] min-h-[56px] w-full resize-none border-none bg-transparent px-4 pb-14 pt-4 text-[15px] leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:outline-none"
          )}
          value={input}
          autoFocus
          placeholder={menuOpen ? "Search commands..." : "Message..."}
          onChange={handleInputChange}
          onKeyDown={onKeyDownEnhanced}
          ref={textareaRef}
          aria-autocomplete="list"
          data-command-target="chat-input"
        />

        {/* Highlighted item hint */}
        {menuOpen && highlightedItem && (
          <div className="absolute bottom-14 left-4 flex items-center gap-2 text-xs text-muted-foreground animate-fade-in">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Tab</kbd>
            <span>to select</span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              /{highlightedItem.mode === "command" ? highlightedItem.name : highlightedItem.trigger}
            </code>
          </div>
        )}

        {showFloatingModelPicker && (
          <ModelPicker
            setSelectedModel={setSelectedModel}
            selectedModel={selectedModel}
            variant="floating"
          />
        )}

        {/* Send button */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          {menuOpen && (
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-1">
              {items.length} results
            </span>
          )}

          <button
            type={isStreaming ? "button" : "submit"}
            onClick={isStreaming ? stop : undefined}
            disabled={(!isStreaming && !input.trim()) || (isStreaming && status === "submitted")}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl transition-all",
              isStreaming
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : !input.trim()
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
            )}
            aria-label={isStreaming ? "Stop" : "Send"}
          >
            {isStreaming ? <CircleStop className="h-5 w-5" /> : <ArrowUp className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Keyboard hints - desktop */}
      <div className="hidden sm:flex items-center justify-between text-[11px] text-muted-foreground/70">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono">Enter</kbd>
            Send
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono">Shift+Enter</kbd>
            New line
          </span>
        </div>
        <span>{input.length} chars</span>
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

          requestAnimationFrame(() => {
            const textarea = textareaRef.current;
            if (textarea) {
              textarea.focus();
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
