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
      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
        <Plug className="h-3 w-3" />
        Online
      </span>
    );
  }
  if (status === "connecting") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        Connecting
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-red-600">
        <AlertCircle className="h-3 w-3" />
        Error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="rounded-3xl border border-border/80 bg-background/95 px-6 py-7 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Welcome back
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          Bio MCP Chat is ready to orchestrate your tools.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Start the conversation, enable a server, or run a slash command. Your
          messages can blend large language models with Model Context Protocol
          tool calls, prompts, and streaming telemetry.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-muted/30 px-5 py-4 backdrop-blur-sm">
          <Badge variant="outline" className="mb-2 w-fit gap-2 text-[11px] uppercase">
            Model ready
          </Badge>
          <div className="text-lg font-semibold text-foreground">
            {model.name}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {model.provider} • {model.capabilities.slice(0, 3).join(", ")}
          </div>
          <p className="mt-3 text-xs text-muted-foreground/90">
            {model.description}
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/80 px-5 py-4 backdrop-blur-sm">
          <Badge variant="outline" className="mb-2 w-fit gap-2 text-[11px] uppercase">
            MCP servers
          </Badge>
          <div className="space-y-3">
            {activeServers.length > 0 ? (
              activeServers.map((server) => (
                <button
                  key={server.id}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => onToggleServer(server.id)}
                >
                  <div>
                    <div className="font-medium text-foreground">
                      {server.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {server.url?.replace(/^https?:\/\//, "")}
                    </div>
                  </div>
                  <ServerStatusBadge server={server} />
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
                No servers enabled yet. Pick one below to fast-track your next
                tool call.
              </div>
            )}

            {inactiveServers.length > 0 && (
              <div className="flex flex-wrap gap-2">
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
                  Manage all
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {(highlightedTools.length > 0 || highlightedPrompts.length > 0) && (
        <div className="rounded-2xl border border-border/70 bg-background/80 px-5 py-4 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">
                What your tools can do
              </div>
              <p className="text-xs text-muted-foreground">
                Enabled servers share their tools and prompts here.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="gap-2"
              onClick={onToggleMetrics}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Live metrics
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {highlightedTools.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Featured tools
                </div>
                <div className="flex flex-wrap gap-2">
                  {highlightedTools.map((tool, index) => (
                    <span
                      key={`${tool.name}-${index}`}
                      className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
                    >
                      <Sparkles className="h-3 w-3 text-primary" />
                      <span className="font-medium text-foreground/80">
                        {tool.name}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {highlightedPrompts.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Prompt shortcuts
                </div>
                <div className="flex flex-wrap gap-2">
                  {highlightedPrompts.map((prompt, index) => (
                    <span
                      key={`${prompt.name}-${index}`}
                      className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/60 px-3 py-1 text-xs text-muted-foreground"
                    >
                      <Command className="h-3 w-3" />
                      <span className="font-medium text-foreground/80">
                        /mcp.{prompt.name}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border/70 bg-muted/20 px-5 py-4 backdrop-blur-sm">
        <div className="text-sm font-semibold text-foreground">
          Quick start tips
        </div>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs">
            <span className="font-semibold text-foreground">Send a message.</span>{" "}
            Ask a question and Bio MCP Chat will route tool calls automatically.
          </li>
          <li className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs">
            <span className="font-semibold text-foreground">Press ⌘/Ctrl + K.</span>{" "}
            Open the slash palette to browse MCP prompts and commands.
          </li>
          <li className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs">
            <span className="font-semibold text-foreground">Review metrics.</span>{" "}
            Use the tool metrics overlay to see streaming invocation health.
          </li>
          <li className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs">
            <span className="font-semibold text-foreground">Manage servers.</span>{" "}
            Combine HTTP and SSE transports for broader capabilities.
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" className="gap-2" onClick={onOpenServers}>
            <Settings2 className="h-3.5 w-3.5" />
            Configure servers
          </Button>
          <Button size="sm" variant="secondary" onClick={onToggleMetrics} className="gap-2">
            <BarChart3 className="h-3.5 w-3.5" />
            View tool metrics
          </Button>
        </div>
      </div>
    </div>
  );
};
