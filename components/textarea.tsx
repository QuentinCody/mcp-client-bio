import { modelID } from "@/ai/providers";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2, Hash, Info, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelPicker } from "./model-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { ensurePromptsLoaded, isPromptsLoaded, promptRegistry } from "@/lib/mcp/prompts/singleton";
import { SlashPromptMenu } from "@/components/prompts/slash-prompt-menu";
import { toToken, findTokens } from "@/lib/mcp/prompts/token";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import { renderPrompt } from "@/lib/mcp/prompts/renderer";
import { PromptArgsSheet } from "@/components/prompts/prompt-args-sheet";
import { ArgsPanel } from "@/components/prompts/args-panel";
import { useMCP } from "@/lib/context/mcp-context";
import { resolvePromptsForInput, type ResolvedPromptContext } from "@/lib/mcp/prompts/resolve";
import { ResolvedPromptPreview } from "@/components/prompts/resolved-preview";

interface InputProps {
  input: string;
  handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
  status: string;
  stop: () => void;
  selectedModel: modelID;
  setSelectedModel: (model: modelID) => void;
}

export const Textarea = ({
  input,
  handleInputChange,
  isLoading,
  status,
  stop,
  selectedModel,
  setSelectedModel,
}: InputProps) => {
  const isStreaming = status === "streaming" || status === "submitted";
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [args, setArgs] = useState<{ def: SlashPromptDef; vals: Record<string, string> } | null>(null);
  const [showingSlashHint, setShowingSlashHint] = useState(false);
  const [isTypingSlash, setIsTypingSlash] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { mcpServers } = useMCP();
  const requiredMissing = !!(args && (args.def.args || []).some(a => a.required && !((args.vals[a.name] ?? "").trim().length)));
  const [activeIndex, setActiveIndex] = useState(0);
  const [resolved, setResolved] = useState<ResolvedPromptContext | null>(null);
  const [resolving, setResolving] = useState(false);
  const [promptsLoaded, setPromptsLoaded] = useState(false);
  const [previewInserted, setPreviewInserted] = useState(false);
  const previewOriginalRef = useRef<string>("");

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

  const items = useMemo(() => promptRegistry.search(query), [query]);

  // Live-resolve prompt content for preview when tokens are present or args change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hasToken = /\/[a-z0-9-]+\/[a-z0-9-_]+\b/i.test(input);
      if (!hasToken) { setResolved(null); return; }
      setResolving(true);
      try {
        const ctx = await resolvePromptsForInput(input, args, { mcpServers });
        if (!cancelled) setResolved(ctx);
      } catch {
        if (!cancelled) setResolved(null);
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [input, args, mcpServers]);

  // Close parameter panel with Escape
  useEffect(() => {
    if (!args) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setArgs(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [args]);

  // Helper: strip slash tokens from text
  function stripTokensFromText(text: string) {
    return text.replace(/\/[a-z0-9-]+\/[a-z0-9-_]+\b/gi, '').replace(/\s+/g, ' ').trim();
  }

  // When in preview mode, keep the input replaced with the expanded prompt so user can review before sending
  useEffect(() => {
    (async () => {
      if (!previewInserted) return;
      try {
        const ctx = await resolvePromptsForInput(input, args, { mcpServers });
        if (!ctx || !ctx.flattened?.length) {
          try { console.log('[UI/PREVIEW] No resolved messages; keeping current input'); } catch {}
          return;
        }
        const serialized = ctx.flattened.map(m => `[${m.role}] ${m.text}`).join('\n');
        const original = previewOriginalRef.current || input;
        const remaining = stripTokensFromText(original);
        const next = remaining ? `${serialized}\n\n${remaining}` : serialized;
        if (next !== input) {
          try { console.log('[UI/PREVIEW] Updating input with expanded prompt. chars=', next.length); } catch {}
          const ev = { target: { value: next } } as any;
          handleInputChange(ev);
          try { localStorage.setItem('last-message-expanded', next); } catch {}
        }
      } catch (err) {
        try { console.warn('[UI/PREVIEW] Failed to resolve preview:', err); } catch {}
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args, mcpServers, previewInserted]);

  async function onKeyDownEnhanced(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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

  function insertPrompt(def: SlashPromptDef) {
    // Replace the current "/partial" with canonical token
    const selStart = textareaRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, selStart);
    const after = input.slice(selStart);
    const replaced = before.replace(/(^|\s)\/([^\s/]*)$/, `$1${toToken(def.namespace, def.name)}`) + after;
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
    if (def.args?.length) {
      const saved = JSON.parse(localStorage.getItem(`prompt:${def.id}:args`) || "{}");
      setArgs({ def, vals: saved });
    }
    // Enter preview mode so the input shows the full expanded prompt prior to send
    try { console.log('[UI/PREVIEW] Prompt inserted; preview mode enabled for', def.id); } catch {}
    previewOriginalRef.current = replaced;
    setPreviewInserted(true);
  }

  return (
    <div className="w-full">
      <div className="relative">
        {/* Slash command hint overlay */}
        {showingSlashHint && !menuOpen && (
          <div className="absolute top-2 left-4 z-20 animate-in slide-in-from-left-2 duration-200">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/90 text-white text-xs font-medium rounded-lg backdrop-blur-sm">
              <Hash className="w-3 h-3" />
              <span>Type to search prompts</span>
              <Sparkles className="w-3 h-3 animate-pulse" />
            </div>
          </div>
        )}
        
        <ShadcnTextarea
          className={cn(
            "resize-none bg-background/50 dark:bg-muted/50 backdrop-blur-sm w-full rounded-2xl pr-12 pt-4 pb-16 border-input focus-visible:ring-ring placeholder:text-muted-foreground transition-all duration-200",
            menuOpen && "border-blue-300 shadow-lg",
            args && "border-amber-300 shadow-amber-100"
          )}
          value={input}
          autoFocus
          placeholder={menuOpen ? "Continue typing to filter prompts..." : args ? "Fill parameters above, then send your message..." : "Send a message or type / for prompts..."}
          onChange={handleInputChange}
          onKeyDown={onKeyDownEnhanced}
          ref={textareaRef}
          aria-autocomplete="list"
        />
        <ModelPicker
          setSelectedModel={setSelectedModel}
          selectedModel={selectedModel}
        />
        {/* Enhanced send button with status indicators */}
        <div className="absolute right-2 bottom-2 flex items-center gap-2">
          {args && (
            <div className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-lg">
              <Info className="w-3 h-3" />
              <span>{args.def.args?.filter(a => a.required && !args.vals[a.name]?.trim()).length || 0} required</span>
            </div>
          )}
          
          {menuOpen && (
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-lg">
              <Hash className="w-3 h-3" />
              <span>{items.length}</span>
            </div>
          )}
          
          <button
            type={isStreaming ? "button" : "submit"}
            onClick={isStreaming ? stop : undefined}
            disabled={
              (!isStreaming && !input.trim()) ||
              (!!args && requiredMissing) ||
              (isStreaming && status === "submitted")
            }
            className={cn(
              "rounded-full p-2 transition-all duration-200 shadow-lg",
              isStreaming 
                ? "bg-red-500 hover:bg-red-600 text-white" 
                : (!input.trim() || (args && requiredMissing))
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground hover:shadow-xl hover:scale-105"
            )}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="mt-2 animate-in slide-in-from-top-2 duration-200">
          <SlashPromptMenu
            className="w-full"
            query={query}
            items={items}
            onSelect={insertPrompt}
            onClose={() => { setMenuOpen(false); setIsTypingSlash(false); }}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            loading={!promptsLoaded}
          />
        </div>
      )}
      {resolved?.flattened?.length ? (
        <ResolvedPromptPreview messages={resolved.flattened} />
      ) : null}
      {args && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 w-[min(90vw,40rem)] pointer-events-auto">
          <div className="relative">
            <ArgsPanel
              title={args.def.title}
              namespace={args.def.namespace}
              args={args.def.args ?? []}
              values={args.vals}
              onChange={(k, v) => {
                setArgs((s) => (s ? { def: s.def, vals: { ...s.vals, [k]: v } } : s));
                const next = { ...((args?.vals as any) || {}), [k]: v };
                localStorage.setItem(`prompt:${args?.def.id}:args`, JSON.stringify(next));
              }}
              onClose={() => {
                // Close the parameters panel without altering the user's current input.
                // This keeps the expanded prompt text in the textbox (intuitive slash client behavior).
                try { console.log('[UI/PREVIEW] Closing params; preserving current input'); } catch {}
                setPreviewInserted(false);
                setArgs(null);
              }}
            />
            <div className="mt-2 flex justify-between gap-2 text-xs text-muted-foreground">
              <div className="px-2 py-1 rounded bg-muted/30 border border-border/30">
                Preview inserted into the input; edit and press Send when ready.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // Re-run preview manually
                    setPreviewInserted(true);
                    try { console.log('[UI/PREVIEW] Manual refresh requested'); } catch {}
                  }}
                  className="px-2 py-1 rounded border bg-white hover:bg-gray-50"
                >
                  Refresh Preview
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Revert to original text but keep panel open
                    try { console.log('[UI/PREVIEW] Reverting input to original, keeping panel open'); } catch {}
                    const ev = { target: { value: previewOriginalRef.current || input } } as any;
                    handleInputChange(ev);
                    setPreviewInserted(false);
                  }}
                  className="px-2 py-1 rounded border bg-white hover:bg-gray-50"
                >
                  Revert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Preview handled by ResolvedPromptPreview above */}
    </div>
  );
};
