import { modelID } from "@/ai/providers";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2, Hash, Info, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelPicker } from "./model-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { ensurePromptsLoaded, promptRegistry } from "@/lib/mcp/prompts/singleton";
import { SlashPromptMenu } from "@/components/prompts/slash-prompt-menu";
import { toToken, findTokens } from "@/lib/mcp/prompts/token";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import { renderPrompt } from "@/lib/mcp/prompts/renderer";
import { PromptArgsSheet } from "@/components/prompts/prompt-args-sheet";
import { ArgsPanel } from "@/components/prompts/args-panel";
import { useMCP } from "@/lib/context/mcp-context";

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

  useEffect(() => {
    ensurePromptsLoaded();
  }, []);

  const items = useMemo(() => promptRegistry.search(query), [query]);

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
      // Expand tokens inline before submit
      const expanded = await expandInputWithPrompts(input, args);
      if (expanded !== input) {
        // Update chat hook input state before submitting
        const fakeEvent = { target: { value: expanded } } as any;
        handleInputChange(fakeEvent);
      }
      e.currentTarget.form?.requestSubmit();
    }
  }

  async function expandInputWithPrompts(text: string, argState: { def: SlashPromptDef; vals: Record<string, string> } | null) {
    const tokens = findTokens(text);
    if (!tokens.length) return text;
    const prefixBlocks: string[] = [];
    for (const t of tokens) {
      const def = promptRegistry.getByNamespaceName(t.namespace, t.name);
      if (!def) continue;
      const vars = argState?.def.id === def.id ? argState.vals : JSON.parse(localStorage.getItem(`prompt:${def.id}:args`) || "{}");
      if (def.mode === "template" && def.template) {
        const rendered = renderPrompt(def, vars);
        const asText = rendered
          .map((m) => {
            const tag = m.role === "system" ? "assistant" : m.role;
            return `[${tag}] ${m.content}`;
          })
          .join("\n");
        prefixBlocks.push(asText);
      } else if (def.mode === 'server') {
        // Resolve via server prompts/get through our API
        try {
          const server = mcpServers.find(s => s.id === def.sourceServerId);
          if (server) {
            const res = await fetch('/api/mcp-prompts/get', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: server.url, type: server.type === 'http' ? 'http' : 'sse', headers: server.headers, name: def.name, args: vars })
            });
            if (res.ok) {
              const data = await res.json();
              const msgs: Array<{ role: string; text: string }> = data.messages || [];
              const asText = msgs.map(m => `[${m.role === 'system' ? 'assistant' : m.role}] ${m.text || ''}`).join('\n');
              if (asText) prefixBlocks.push(asText);
            }
          }
        } catch {
          // swallow
        }
      }
    }
    if (!prefixBlocks.length) return text;
    return `${prefixBlocks.join("\n\n")}\n\n${text}`;
  }

  function insertPrompt(def: SlashPromptDef) {
    // Replace the current "/partial" with canonical token
    const selStart = textareaRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, selStart);
    const after = input.slice(selStart);
    const replaced = before.replace(/(^|\s)\/([^\s/]*)$/, `$1${toToken(def.namespace, def.name)}`) + after;
    const fakeEvent = { target: { value: replaced } } as any;
    handleInputChange(fakeEvent);
    setMenuOpen(false);
    if (def.args?.length) {
      const saved = JSON.parse(localStorage.getItem(`prompt:${def.id}:args`) || "{}");
      setArgs({ def, vals: saved });
    }
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
          />
        </div>
      )}
      {args && (
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
          onClose={() => setArgs(null)}
        />
      )}
    </div>
  );
};
