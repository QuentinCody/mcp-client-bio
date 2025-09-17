"use client";
import { useState } from "react";
import { Eye, EyeOff, Copy, Check, FileText, Server, Sparkles, Info, AlertCircle, Clock, User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";

interface EnhancedPromptPreviewProps {
  prompt: SlashPromptDef;
  values?: Record<string, string>;
  onClose?: () => void;
  className?: string;
}

export function EnhancedPromptPreview({ 
  prompt, 
  values = {}, 
  onClose,
  className 
}: EnhancedPromptPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const handleCopy = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const getPromptIcon = () => {
    if (prompt.origin === 'server-import') return <Server className="w-5 h-5 text-blue-500" />;
    if (prompt.mode === 'template') return <FileText className="w-5 h-5 text-green-500" />;
    return <Sparkles className="w-5 h-5 text-purple-500" />;
  };

  const getOriginBadge = () => {
    if (prompt.origin === 'server-import') {
      return (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-lg">
          <Server className="w-3 h-3" />
          <span>MCP Server</span>
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg">
        <FileText className="w-3 h-3" />
        <span>Template</span>
      </div>
    );
  };

  const renderMessage = (message: { role: string; text: string }, index: number) => {
    const roleIcons = {
      system: <Bot className="w-4 h-4 text-gray-500" />,
      user: <User className="w-4 h-4 text-blue-500" />,
      assistant: <Bot className="w-4 h-4 text-green-500" />
    };

    const roleColors = {
      system: "bg-gray-50 border-gray-200 text-gray-700",
      user: "bg-blue-50 border-blue-200 text-blue-700", 
      assistant: "bg-green-50 border-green-200 text-green-700"
    };

    return (
      <div 
        key={index}
        className={cn(
          "p-3 rounded-lg border",
          roleColors[message.role as keyof typeof roleColors] || roleColors.system
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {roleIcons[message.role as keyof typeof roleIcons] || roleIcons.system}
            <span className="text-xs font-semibold uppercase tracking-wider">
              {message.role}
            </span>
          </div>
          <button
            onClick={() => handleCopy(message.text, `message-${index}`)}
            className="p-1 rounded-md hover:bg-black/5 transition-colors"
            title="Copy message"
          >
            {copiedSection === `message-${index}` ? (
              <Check className="w-3 h-3 text-green-600" />
            ) : (
              <Copy className="w-3 h-3 opacity-60" />
            )}
          </button>
        </div>
        <div className="text-sm font-mono whitespace-pre-wrap break-words">
          {message.text}
        </div>
      </div>
    );
  };

  return (
    <div className={cn(
      "bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/60 overflow-hidden animate-in slide-in-from-bottom-4 duration-300",
      className
    )}>
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-gray-50/80 to-white/80 border-b border-gray-100/80">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="mt-1">
              {getPromptIcon()}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-bold text-gray-900 truncate">
                  {prompt.title}
                </h3>
                {getOriginBadge()}
              </div>
              
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <code className="px-2 py-0.5 bg-gray-100 rounded font-mono text-xs">
                  /{prompt.trigger}
                </code>
                <span>·</span>
                <span className="font-medium">{prompt.sourceServerName || prompt.namespace}</span>
                {prompt.version && (
                  <>
                    <span>·</span>
                    <span className="text-xs">v{prompt.version}</span>
                  </>
                )}
              </div>
              
              {prompt.description && (
                <p className="text-sm text-gray-600 leading-relaxed">
                  {prompt.description}
                </p>
              )}
            </div>
          </div>
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
              aria-label="Close preview"
            >
              <EyeOff className="w-5 h-5" />
            </button>
          )}
        </div>
        
        {/* Metadata */}
        <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
          {prompt.updatedAt && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Updated {new Date(prompt.updatedAt).toLocaleDateString()}</span>
            </div>
          )}
          {prompt.args && prompt.args.length > 0 && (
            <div className="flex items-center gap-1">
              <Info className="w-3 h-3" />
              <span>{prompt.args.length} parameter{prompt.args.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>

      {/* Parameters Section */}
      {prompt.args && prompt.args.length > 0 && (
        <div className="px-6 py-4 border-b border-gray-100/80">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Parameters</h4>
          <div className="space-y-2">
            {prompt.args.map((arg) => (
              <div key={arg.name} className="flex items-center justify-between p-3 bg-gray-50/60 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{arg.name}</span>
                    {arg.required && (
                      <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">
                        required
                      </span>
                    )}
                  </div>
                  {arg.description && (
                    <p className="text-xs text-gray-600 mt-0.5">{arg.description}</p>
                  )}
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  {values[arg.name] ? `"${values[arg.name]}"` : arg.placeholder || "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Template Preview */}
      {prompt.mode === 'template' && prompt.template && (
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-gray-900">Template Messages</h4>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {isExpanded ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
            </button>
          </div>

          <div className={cn(
            "space-y-3 transition-all duration-300",
            !isExpanded && "max-h-48 overflow-hidden relative"
          )}>
            {prompt.template.messages.map((message, index) => 
              renderMessage(message, index)
            )}
            
            {!isExpanded && prompt.template.messages.length > 2 && (
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none" />
            )}
          </div>

          {prompt.template.messages.length > 2 && !isExpanded && (
            <div className="mt-3 text-center">
              <button
                onClick={() => setIsExpanded(true)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Show {prompt.template.messages.length - 2} more message{prompt.template.messages.length - 2 !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Server Mode Info */}
      {prompt.mode === 'server' && (
        <div className="px-6 py-4 bg-blue-50/50">
          <div className="flex items-start gap-3">
            <Server className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-blue-900 mb-1">Server Prompt</h4>
              <p className="text-xs text-blue-700">
                This prompt will be executed on the MCP server and may return dynamic content based on current data.
              </p>
              {prompt.sourceServerId && (
                <p className="text-xs text-blue-600 mt-1 font-mono">
                  Server: {prompt.sourceServerId}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="px-6 py-3 bg-gray-50/60 border-t border-gray-100/80">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span>Prompt ID: {prompt.id}</span>
            <button
              onClick={() => handleCopy(prompt.id, 'id')}
              className="p-1 rounded hover:bg-gray-200 transition-colors"
            >
              {copiedSection === 'id' ? (
                <Check className="w-3 h-3 text-green-600" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
          <div className="text-gray-400">
            MCP Prompt Preview
          </div>
        </div>
      </div>
    </div>
  );
}
