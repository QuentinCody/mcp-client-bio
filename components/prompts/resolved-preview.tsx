"use client";
import { cn } from "@/lib/utils";
import type { ResolvedPromptMessage } from "@/lib/mcp/prompts/resolve";
import { Copy, Check, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function ResolvedPromptPreview({
  messages,
  className,
}: {
  messages: ResolvedPromptMessage[];
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const serialized = messages
    .map((m) => `[${m.role}] ${m.text}`)
    .join("\n");

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(serialized);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className={cn("mt-2 rounded-xl border border-gray-200/70 bg-white/70 backdrop-blur p-2", className)}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-gray-600 hover:text-gray-800 inline-flex items-center gap-1"
        >
          {expanded ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          <span>View prompt text</span>
          <span className="ml-1 text-gray-400">({messages.length} message{messages.length !== 1 ? 's' : ''})</span>
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
          title="Copy full prompt text"
        >
          {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
          <span className="sr-only">Copy</span>
        </button>
      </div>
      {expanded && (
        <pre className="mt-2 text-[11px] leading-5 whitespace-pre-wrap font-mono text-gray-800 max-h-48 overflow-auto">
{serialized}
        </pre>
      )}
    </div>
  );
}

