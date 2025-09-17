"use client";
import { useState, useEffect, useMemo } from "react";
import { Eye, EyeOff, Copy, Check, Loader2, AlertTriangle, User, Bot, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { findTokens } from "@/lib/mcp/prompts/token";
import { promptRegistry } from "@/lib/mcp/prompts/singleton";
import { renderPrompt } from "@/lib/mcp/prompts/renderer";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";

interface PromptExpansionPreviewProps {
  input: string;
  args: { def: SlashPromptDef; vals: Record<string, string> } | null;
  mcpServers: any[];
  onExpandedChange?: (expanded: string) => void;
  className?: string;
}

export function PromptExpansionPreview({ 
  input, 
  args, 
  mcpServers, 
  onExpandedChange, 
  className 
}: PromptExpansionPreviewProps) {
  const [expanded, setExpanded] = useState("");
  const [isExpanding, setIsExpanding] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const tokens = useMemo(() => findTokens(input), [input]);
  const hasTokens = tokens.length > 0;

  useEffect(() => {
    if (!hasTokens) {
      setExpanded("");
      onExpandedChange?.("");
      return;
    }

    let mounted = true;
    setIsExpanding(true);

    (async () => {
      try {
        const expandedText = await expandInputWithPrompts(input, args, mcpServers);
        if (mounted) {
          setExpanded(expandedText);
          onExpandedChange?.(expandedText);
        }
      } catch (error) {
        console.error('Failed to expand prompts:', error);
      } finally {
        if (mounted) setIsExpanding(false);
      }
    })();

    return () => { mounted = false; };
  }, [input, args, mcpServers, hasTokens, onExpandedChange]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(expanded);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  if (!hasTokens) {
    return null;
  }

  const messages = parseExpandedMessages(expanded);
  const userMessage = getUserMessage(expanded, input);

  return (
    <div className={cn(
      "mt-3 rounded-2xl border border-blue-200/60 bg-gradient-to-br from-blue-50/80 to-indigo-50/60 backdrop-blur-xl shadow-lg animate-in slide-in-from-bottom-2 duration-300",
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-blue-100/80 bg-gradient-to-r from-blue-50/80 to-white/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
              {isExpanding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Settings className="w-4 h-4" />
              )}
              <span>Prompt Expansion Preview</span>
            </div>
            <div className="px-2 py-0.5 bg-blue-200/60 text-blue-800 text-xs font-medium rounded-full">
              {tokens.length} prompt{tokens.length !== 1 ? 's' : ''} found
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={isExpanding || !expanded}
              className="p-1.5 rounded-lg hover:bg-blue-200/60 transition-colors text-blue-700 hover:text-blue-900 disabled:opacity-50"
              title="Copy expanded text"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
            
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="p-1.5 rounded-lg hover:bg-blue-200/60 transition-colors text-blue-700 hover:text-blue-900"
              title={showPreview ? "Hide preview" : "Show preview"}
            >
              {showPreview ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Token summary */}
        <div className="mt-2 flex flex-wrap gap-1">
          {tokens.map((token, index) => {
            const def = promptRegistry.getByTrigger(token.trigger);
            const group = def?.sourceServerName || def?.namespace || token.trigger.split('.')[0];
            return (
              <div
                key={`${token.trigger}-${index}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100/80 text-blue-700 text-xs font-medium rounded-lg"
              >
                <span className="font-mono">/{token.trigger}</span>
                {group && (
                  <>
                    <span className="text-blue-600">·</span>
                    <span>{group}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status */}
      <div className="px-4 py-2 text-xs">
        {isExpanding ? (
          <div className="flex items-center gap-2 text-blue-600">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Expanding prompts...</span>
          </div>
        ) : expanded ? (
          <div className="flex items-center gap-2 text-green-600">
            <Check className="w-3 h-3" />
            <span>Prompts expanded successfully. This is what will be sent to the LLM:</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-3 h-3" />
            <span>Failed to expand some prompts</span>
          </div>
        )}
      </div>

      {/* Preview */}
      {showPreview && expanded && (
        <div className="border-t border-blue-100/80">
          <div className="max-h-64 overflow-auto">
            {messages.length > 0 ? (
              <div className="p-4 space-y-3">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn(
                      "p-3 rounded-lg border text-sm",
                      message.role === 'system' && "bg-gray-50 border-gray-200 text-gray-700",
                      message.role === 'user' && "bg-blue-50 border-blue-200 text-blue-700",
                      message.role === 'assistant' && "bg-green-50 border-green-200 text-green-700"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider">
                      {message.role === 'system' && <Bot className="w-3 h-3" />}
                      {message.role === 'user' && <User className="w-3 h-3" />}
                      {message.role === 'assistant' && <Bot className="w-3 h-3" />}
                      <span>{message.role}</span>
                    </div>
                    <div className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                      {message.content}
                    </div>
                  </div>
                ))}
                
                {/* User message */}
                {userMessage && (
                  <div className="p-3 rounded-lg border bg-blue-50 border-blue-200 text-blue-700 text-sm">
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider">
                      <User className="w-3 h-3" />
                      <span>USER (Your Message)</span>
                    </div>
                    <div className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                      {userMessage}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4">
                <div className="text-sm font-mono whitespace-pre-wrap bg-white/60 rounded-lg p-3 border">
                  {expanded}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer help */}
      <div className="px-4 py-2 border-t border-blue-100/80 bg-blue-50/40 text-xs text-blue-700">
        <div className="flex items-center justify-between">
          <span>The expanded text above will be sent to the LLM when you submit your message.</span>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            {showPreview ? 'Hide' : 'Show'} Details
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper functions
async function expandInputWithPrompts(
  text: string, 
  argState: { def: SlashPromptDef; vals: Record<string, string> } | null,
  mcpServers: any[]
): Promise<string> {
  const tokens = findTokens(text);
  if (!tokens.length) return text;
  
  const prefixBlocks: string[] = [];
  let processedText = text;
  
  for (const token of tokens) {
    const def = promptRegistry.getByTrigger(token.trigger);
    if (!def) continue;

    const vars = argState?.def.id === def.id ? argState.vals : JSON.parse(localStorage.getItem(`prompt:${def.id}:args`) || "{}");

    if (def.mode === "template" && def.template) {
      const rendered = renderPrompt(def, vars);
      const asText = rendered
        .map((m) => {
          const role = m.role === "system" ? "system" : m.role;
          return `[${role}] ${m.content}`;
        })
        .join("\n");
      prefixBlocks.push(asText);
    } else if (def.mode === 'server') {
      try {
        const server = mcpServers.find(s => s.id === def.sourceServerId);
        if (server) {
          console.log(`Fetching server prompt ${def.trigger} from ${server.url}`);
          const res = await fetch('/api/mcp-prompts/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              url: server.url, 
              type: server.type === 'http' ? 'http' : 'sse', 
              headers: server.headers, 
              name: def.name, 
              args: vars 
            })
          });
          
          if (res.ok) {
            const data = (await res.json().catch(() => ({}))) as {
              messages?: Array<{ role?: string; text?: string }>;
            };
            console.log(`Server prompt ${def.trigger} response:`, data);
            const msgs: Array<{ role: string; text: string }> = Array.isArray(data.messages)
              ? data.messages.map((m) => ({
                  role: m?.role ?? 'user',
                  text: m?.text ?? '',
                }))
              : [];
            const asText = msgs.map(m => `[${m.role === 'system' ? 'system' : m.role}] ${m.text || ''}`).join('\n');
            if (asText) {
              prefixBlocks.push(asText);
              console.log(`Added server prompt content for ${def.trigger}`);
            }
          } else {
          console.warn(`Server prompt ${def.trigger} failed:`, res.status, res.statusText);
            const errorData = await res.json().catch(() => ({}));
            console.warn('Error details:', errorData);
          }
        } else {
          console.warn(`Server not found for prompt ${def.trigger}, sourceServerId: ${def.sourceServerId}`);
        }
      } catch (error) {
        console.warn(`Failed to fetch server prompt ${def.trigger}:`, error);
      }
    }

    // Remove the token from the text
    const escaped = escapeRegExp(`/${token.trigger}`);
    const tokenPattern = new RegExp(`${escaped}(?=\b|\s|$)`, 'gi');
    processedText = processedText.replace(tokenPattern, ' ').replace(/\s+/g, ' ').trim();
  }
  
  if (!prefixBlocks.length) return text;
  
  // Clean up any double spaces or empty lines
  processedText = processedText.replace(/\s+/g, ' ').trim();
  
  return prefixBlocks.length > 0 ? `${prefixBlocks.join("\n\n")}${processedText ? `\n\n${processedText}` : ''}` : processedText;
}

function parseExpandedMessages(expanded: string): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  const lines = expanded.split('\n');
  let currentMessage: { role: string; content: string } | null = null;
  
  for (const line of lines) {
    const roleMatch = line.match(/^\[(system|user|assistant)\]\s*(.*)$/);
    if (roleMatch) {
      if (currentMessage) {
        messages.push(currentMessage);
      }
      currentMessage = {
        role: roleMatch[1],
        content: roleMatch[2]
      };
    } else if (currentMessage && line.trim()) {
      currentMessage.content += '\n' + line;
    }
  }
  
  if (currentMessage) {
    messages.push(currentMessage);
  }
  
  return messages;
}

function escapeRegExp(value: string) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function getUserMessage(expanded: string, original: string): string | null {
  const tokens = findTokens(original);
  if (!tokens.length) return null;
  
  let remaining = original;
  for (const token of tokens) {
    const escaped = escapeRegExp(`/${token.trigger}`);
    const tokenPattern = new RegExp(`${escaped}(?=\b|\s|$)`, 'gi');
    remaining = remaining.replace(tokenPattern, ' ').replace(/\s+/g, ' ').trim();
  }
  
  return remaining || null;
}
