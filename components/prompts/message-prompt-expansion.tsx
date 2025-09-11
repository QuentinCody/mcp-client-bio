"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, Hash, User, Bot, Settings, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessagePromptExpansionProps {
  originalMessage: string;
  expandedMessage: string;
  className?: string;
}

export function MessagePromptExpansion({ 
  originalMessage, 
  expandedMessage, 
  className 
}: MessagePromptExpansionProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  // Show if we have an expanded payload at all. Prefer original vs expanded comparison when available.
  const hasExpanded = typeof expandedMessage === 'string' && expandedMessage.trim().length > 0;
  const wasExpanded = hasExpanded && (originalMessage !== expandedMessage || (originalMessage || '').includes('/') || expandedMessage.trim().startsWith('['));
  if (!wasExpanded) return null;
  try { console.log('[UI] MessagePromptExpansion render; hasOriginal=', !!originalMessage, 'expandedLen=', expandedMessage.length); } catch {}

  const messages = parseExpandedMessages(expandedMessage);
  const userMessage = extractUserMessage(expandedMessage, originalMessage);

  return (
    <div className={cn(
      "mb-3 rounded-lg border border-blue-200/50 bg-gradient-to-r from-blue-50/30 to-indigo-50/20 overflow-hidden",
      className
    )}>
      {/* Header */}
      <div className="px-4 py-2 bg-blue-50/50 border-b border-blue-200/30">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center justify-between w-full text-left text-sm font-medium text-blue-900 hover:text-blue-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4" />
            <span>This message included MCP prompts that were expanded</span>
            <div className="px-2 py-0.5 bg-blue-200/60 text-blue-800 text-xs font-medium rounded-full">
              {messages.length} prompt message{messages.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showDetails ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
      </div>

      {/* Content */}
      {showDetails && (
        <div className="p-4">
          <div className="space-y-3">
            {originalMessage && originalMessage.trim().length > 0 && (
              <>
                <div className="text-xs text-blue-700 font-medium mb-3">
                  Original message with slash commands:
                </div>
                <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200/40">
                  <div className="text-sm font-mono text-blue-800 whitespace-pre-wrap">
                    {originalMessage}
                  </div>
                </div>
              </>
            )}

            <div className="text-xs text-blue-700 font-medium">
              Expanded to these prompt messages:
            </div>

            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "p-3 rounded-lg border text-sm",
                  message.role === 'system' && "bg-gray-50/80 border-gray-200 text-gray-700",
                  message.role === 'user' && "bg-blue-50/80 border-blue-200 text-blue-700",
                  message.role === 'assistant' && "bg-green-50/80 border-green-200 text-green-700"
                )}
              >
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider">
                  {message.role === 'system' && <Bot className="w-3 h-3" />}
                  {message.role === 'user' && <User className="w-3 h-3" />}
                  {message.role === 'assistant' && <Bot className="w-3 h-3" />}
                  <span>{message.role}</span>
                </div>
                <div className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </div>
              </div>
            ))}

            {userMessage && (
              <>
                <div className="text-xs text-blue-700 font-medium">
                  Plus your message:
                </div>
                <div className="p-3 bg-blue-50/80 border border-blue-200 text-blue-700 rounded-lg text-sm">
                  <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider">
                    <User className="w-3 h-3" />
                    <span>USER</span>
                  </div>
                  <div className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    {userMessage}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-blue-200/30 text-xs text-blue-600">
            <div className="flex items-center gap-1.5">
              <Settings className="w-3 h-3" />
              <span>This is what was actually sent to the AI model</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to parse the expanded message format
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
  
  return messages.filter(msg => msg.content.trim());
}

// Extract any remaining user message after prompt expansion
function extractUserMessage(expanded: string, original: string): string | null {
  const lines = expanded.split('\n');
  let foundPromptMessages = false;
  let remainingText = '';
  
  for (const line of lines) {
    if (line.match(/^\[(system|user|assistant)\]/)) {
      foundPromptMessages = true;
    } else if (foundPromptMessages && line.trim() && !line.match(/^\[/)) {
      remainingText += (remainingText ? '\n' : '') + line;
    }
  }
  
  // If no remaining text found through parsing, try to extract from the original
  if (!remainingText.trim()) {
    // Simple approach: remove any slash command tokens from original
    const tokens = original.match(/\b[\w-]+\/[\w-]+\b/g) || [];
    let filtered = original;
    for (const token of tokens) {
      filtered = filtered.replace(new RegExp(`\\b${token}\\b`, 'g'), '').trim();
    }
    remainingText = filtered;
  }
  
  return remainingText.trim() || null;
}
