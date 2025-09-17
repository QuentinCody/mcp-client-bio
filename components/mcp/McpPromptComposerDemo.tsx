"use client";

import { useMemo, useState } from "react";
import { PromptArgDialog } from "@/components/mcp/PromptArgDialog";
import { SlashPicker } from "@/components/mcp/SlashPicker";
import { createHttpMcpTransport } from "@/lib/mcp/transport/http";
import { useMcpPrompts } from "@/hooks/use-mcp-prompts";
import type { PromptSummary, GetPromptResult } from "@/lib/mcp/transport/http";

export function McpPromptComposerDemo() {
  const transport = useMemo(() => createHttpMcpTransport("/mcp"), []);
  const fetchPrompts = useMcpPrompts(transport, "fetch");
  const githubPrompts = useMcpPrompts(transport, "github");
  const registries = [
    { id: "fetch", hook: fetchPrompts },
    { id: "github", hook: githubPrompts },
  ];
  const [argDialog, setArgDialog] = useState<{
    open: boolean;
    serverId?: string;
    prompt?: PromptSummary;
  }>({ open: false });
  const [previewText, setPreviewText] = useState("");
  const [previewResources, setPreviewResources] = useState<
    { uri: string; name?: string }[]
  >([]);

  function handleResolved(result: GetPromptResult) {
    const textParts: string[] = [];
    const resourceParts: { uri: string; name?: string }[] = [];
    for (const message of result.messages) {
      const content = message.content;
      if (!content) continue;
      if (content.type === "text" && typeof content.text === "string") {
        textParts.push(content.text);
      }
      if (content.type === "resource") {
        const uri = content.uri ?? "";
        if (uri) {
          resourceParts.push({ uri, name: content.name });
        }
      }
    }
    setPreviewText(textParts.join("\n\n"));
    setPreviewResources(resourceParts);
  }

  async function handleSelect(entry: any) {
    if (entry.kind === "mcp" && entry.prompt && entry.serverId) {
      const requiresArgs = (entry.prompt.arguments ?? []).some((arg: any) => arg.required);
      if (requiresArgs) {
        setArgDialog({ open: true, serverId: entry.serverId, prompt: entry.prompt });
        return;
      }
      const result = await transport.getPrompt(entry.serverId, entry.prompt.name);
      handleResolved(result);
    }
  }

  return (
    <div className="space-y-3 p-4">
      <SlashPicker
        builtins={[{ id: "explain", title: "Explain code" }]}
        userPrompts={[{ id: "tests", title: "Generate tests" }]}
        mcpServers={registries.map((entry) => ({
          id: entry.id,
          prompts: entry.hook.prompts,
        }))}
        onSelect={handleSelect}
      />
      {previewResources.length ? (
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            {previewResources.map((resource) => (
              <button
                key={resource.uri}
                type="button"
                className="rounded-full border bg-white px-3 py-1 text-xs text-muted-foreground shadow"
                onClick={() => setPreviewResources((current) => current.filter((item) => item.uri !== resource.uri))}
              >
                {resource.name ?? resource.uri}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <PromptArgDialog
        open={argDialog.open}
        onOpenChange={(open) => setArgDialog((state) => ({ ...state, open }))}
        serverId={argDialog.serverId ?? "server"}
        prompt={argDialog.prompt ?? { name: "", arguments: [] }}
        onResolve={async (values) => {
          if (!argDialog.serverId || !argDialog.prompt) return;
          const result = await transport.getPrompt(argDialog.serverId, argDialog.prompt.name, values);
          handleResolved(result);
        }}
        onCompleteArgument={async (argName, value, context) => {
          if (!argDialog.serverId || !argDialog.prompt) return [];
          const result = await transport.complete(
            argDialog.serverId,
            argDialog.prompt.name,
            argName,
            value,
            context
          );
          return result.completion.values ?? [];
        }}
      />
    </div>
  );
}

export default McpPromptComposerDemo;
