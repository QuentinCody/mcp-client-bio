"use client";

import { modelDetails, type modelID } from "@/ai/providers";
import type { MCPServer } from "@/lib/context/mcp-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  ServerIcon,
  Settings2,
  BarChart3,
  Command,
  Plug,
  Loader2,
  AlertCircle,
  Zap,
  NotebookPen,
  Compass,
} from "lucide-react";

interface ProjectOverviewProps {
  selectedModel: modelID;
  servers: MCPServer[];
  activeServerIds: string[];
  onOpenServers: () => void;
  onToggleServer: (serverId: string) => void;
  onToggleMetrics: () => void;
}

function ServerStatusBadge({ server }: { server: MCPServer }) {
  const status = server.status ?? "disconnected";

  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <Plug className="h-3 w-3" />
        Online
      </span>
    );
  }
  if (status === "connecting") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
        <Loader2 className="h-3 w-3 animate-spin" />
        Connecting
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
        <AlertCircle className="h-3 w-3" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      <Plug className="h-3 w-3" />
      Disabled
    </span>
  );
}

export const ProjectOverview = ({
  selectedModel,
  servers,
  activeServerIds,
  onOpenServers,
  onToggleServer,
  onToggleMetrics,
}: ProjectOverviewProps) => {
  const model = modelDetails[selectedModel];
  const activeServers = activeServerIds
    .map((id) => servers.find((server) => server.id === id))
    .filter((value): value is MCPServer => Boolean(value));
  const inactiveServers = servers.filter(
    (server) => !activeServerIds.includes(server.id)
  );

  const highlightedTools = activeServers
    .flatMap((server) => server.tools ?? [])
    .slice(0, 6);
  const highlightedPrompts = activeServers
    .flatMap((server) => server.prompts ?? [])
    .slice(0, 4);

  const activeCount = activeServers.length;
  const connectingCount = activeServers.filter((server) => server.status === "connecting").length;
  const errorCount = activeServers.filter((server) => server.status === "error").length;
  const serverSummaryLabel = activeCount > 0
    ? `${activeCount} online${connectingCount ? ` • ${connectingCount} connecting` : ""}${errorCount ? ` • ${errorCount} issues` : ""}`
    : "No servers enabled";

  const focusComposer = () => {
    if (typeof window === "undefined") return;
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-command-target="chat-input"]'
    );
    textarea?.focus();
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/12 via-background/80 to-background/60 px-8 py-9 shadow-xl backdrop-blur-sm">
        <div className="pointer-events-none absolute -right-24 top-10 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-30%] left-[-10%] h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <Badge variant="secondary" className="w-fit gap-2 text-[11px] uppercase tracking-[0.25em]">
              Welcome back
            </Badge>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Harness MCP intelligence across your workspace.
              </h1>
              <p className="text-sm text-muted-foreground">
                Compose prompts, stitch tool calls, and monitor telemetry from one glassy command center built for velocity.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="sm" className="gap-2" onClick={onOpenServers}>
                <Settings2 className="h-3.5 w-3.5" />
                Manage servers
              </Button>
              <Button size="sm" variant="secondary" className="gap-2" onClick={onToggleMetrics}>
                <BarChart3 className="h-3.5 w-3.5" />
                View live metrics
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Model
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {model?.name ?? selectedModel}
              </div>
              <p className="text-xs text-muted-foreground/80">
                {model?.provider ?? "Custom"}{model?.capabilities?.length ? ` • ${model.capabilities.slice(0, 2).join(', ')}` : ''}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                <ServerIcon className="h-3.5 w-3.5 text-primary" />
                Servers
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {activeCount}/{servers.length}
              </div>
              <p className="text-xs text-muted-foreground/80">{serverSummaryLabel}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/90 px-4 py-3 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                <Zap className="h-3.5 w-3.5 text-primary" />
                Signals
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {highlightedTools.length + highlightedPrompts.length} surfaced
              </div>
              <p className="text-xs text-muted-foreground/80">Tools & prompts ready for this chat.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-background/85 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">Server lineup</h2>
              <p className="text-xs text-muted-foreground">Toggle transports to blend MCP capabilities per request.</p>
            </div>
            <Badge variant="outline" className="border-border/60 text-[11px] uppercase">
              {activeCount} active
            </Badge>
          </div>
          <div className="mt-4 space-y-2">
            {activeServers.length > 0 ? (
              activeServers.map((server) => (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => onToggleServer(server.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">{server.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {server.url?.replace(/^https?:\/\//, "") ?? server.type.toUpperCase()}
                    </div>
                  </div>
                  <ServerStatusBadge server={server} />
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                No servers are active yet. Enable one below to unlock tool calls.
              </div>
            )}
          </div>
          {inactiveServers.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {inactiveServers.slice(0, 3).map((server) => (
                <Button
                  key={server.id}
                  size="sm"
                  variant="outline"
                  className="h-8 gap-2 text-[11px]"
                  onClick={() => onToggleServer(server.id)}
                >
                  <ServerIcon className="h-3.5 w-3.5" />
                  Enable {server.name}
                </Button>
              ))}
              <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={onOpenServers}>
                View all
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/85 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">Workspace accelerators</h2>
              <p className="text-xs text-muted-foreground">Jump into common flows without leaving the composer.</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={focusComposer}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Command className="h-4 w-4 text-primary" />
                  Slash palette
                </div>
                <p className="text-xs text-muted-foreground">Focus the composer and browse prompts with the slash key.</p>
              </div>
            </button>
            <button
              type="button"
              onClick={onToggleMetrics}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Live telemetry
                </div>
                <p className="text-xs text-muted-foreground">Watch tool invocations stream in real time.</p>
              </div>
            </button>
            <button
              type="button"
              onClick={onOpenServers}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Compass className="h-4 w-4 text-primary" />
                  Curate transports
                </div>
                <p className="text-xs text-muted-foreground">Blend HTTP and SSE servers for richer context.</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background/85 p-5 shadow-sm backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-foreground">Quick start recipes</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <NotebookPen className="h-4 w-4 text-primary" />
              Draft a brief
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Ask the assistant to assemble plans or summaries—the composer will route tool calls automatically.</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Remix outputs
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Use slash prompts to seed structured instructions, then iterate inline with follow-up questions.</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ServerIcon className="h-4 w-4 text-primary" />
              Blend transports
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Pair HTTP and SSE servers to combine archive retrieval with streaming insights.</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Command className="h-4 w-4 text-primary" />
              Keep context
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Reopen recent slash prompts from the composer to rehydrate arguments instantly.</p>
          </div>
        </div>
      </div>

      {(highlightedTools.length > 0 || highlightedPrompts.length > 0) && (
        <div className="rounded-2xl border border-border/60 bg-background/85 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">What your tools can do</div>
              <p className="text-xs text-muted-foreground">Recently enabled servers share their capabilities here.</p>
            </div>
            <Button size="sm" variant="secondary" className="gap-2" onClick={onToggleMetrics}>
              <BarChart3 className="h-3.5 w-3.5" />
              Live telemetry
            </Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {highlightedTools.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Featured tools
                </div>
                <div className="flex flex-wrap gap-2">
                  {highlightedTools.map((tool, index) => (
                    <span
                      key={`${tool.name}-${index}`}
                      className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-1 text-xs text-muted-foreground"
                    >
                      <Sparkles className="h-3 w-3 text-primary" />
                      <span className="font-medium text-foreground/85">{tool.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {highlightedPrompts.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Prompt shortcuts
                </div>
                <div className="flex flex-wrap gap-2">
                  {highlightedPrompts.map((prompt, index) => (
                    <span
                      key={`${prompt.name}-${index}`}
                      className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-1 text-xs text-muted-foreground"
                    >
                      <Command className="h-3 w-3 text-primary" />
                      <span className="font-medium text-foreground/85">/mcp.{prompt.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
