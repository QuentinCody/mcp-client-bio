"use client";

import {
  Circle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ServerIcon,
  Settings2,
  BarChart3,
} from "lucide-react";
import { useMemo } from "react";
import { modelDetails, type modelID } from "@/ai/providers";
import { ModelPicker } from "./model-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MCPServer, type ServerStatus } from "@/lib/context/mcp-context";
import { cn } from "@/lib/utils";

type StatusKind = "offline" | "connecting" | "error" | "online";

interface ChatSessionToolbarProps {
  selectedModel: modelID;
  onModelChange: (model: modelID) => void;
  servers: MCPServer[];
  selectedServerIds: string[];
  onToggleServer: (serverId: string) => void;
  onOpenServers: () => void;
  onToggleMetrics: () => void;
}

function getStatusKind(status?: ServerStatus): StatusKind {
  switch (status) {
    case "connected":
      return "online";
    case "connecting":
      return "connecting";
    case "error":
      return "error";
    default:
      return "offline";
  }
}

function getStatusIcon(kind: StatusKind) {
  switch (kind) {
    case "online":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "connecting":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />;
    case "error":
      return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    default:
      return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getStatusLabel(kind: StatusKind) {
  switch (kind) {
    case "online":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "error":
      return "Error";
    default:
      return "Disabled";
  }
}

export function ChatSessionToolbar({
  selectedModel,
  onModelChange,
  servers,
  selectedServerIds,
  onToggleServer,
  onOpenServers,
  onToggleMetrics,
}: ChatSessionToolbarProps) {
  const selectedServers = useMemo(() => {
    return selectedServerIds
      .map((id) => servers.find((server) => server.id === id))
      .filter((server): server is MCPServer => Boolean(server));
  }, [servers, selectedServerIds]);

  const connectedCount = selectedServers.filter(
    (server) => server.status === "connected"
  ).length;

  const connectingCount = selectedServers.filter(
    (server) => server.status === "connecting"
  ).length;

  const offlineCount = selectedServerIds.length - connectedCount - connectingCount;

  const currentModel = modelDetails[selectedModel];

  const statusSummary = useMemo(() => {
    if (selectedServerIds.length === 0) {
      return "No MCP servers enabled";
    }

    const parts = [] as string[];
    if (connectedCount > 0) parts.push(`${connectedCount} online`);
    if (connectingCount > 0) parts.push(`${connectingCount} connecting`);
    if (offlineCount > 0) parts.push(`${offlineCount} disabled`);
    return parts.join(" • ");
  }, [connectedCount, connectingCount, offlineCount, selectedServerIds.length]);

  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 backdrop-blur-sm px-4 py-3 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Model
          </span>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <ModelPicker
              variant="inline"
              selectedModel={selectedModel}
              setSelectedModel={onModelChange}
              className="sm:w-64"
            />
            {currentModel && (
              <div className="text-xs text-muted-foreground/80">
                {currentModel.provider} • {currentModel.capabilities.slice(0, 3).join(", ")}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="gap-2"
            onClick={onToggleMetrics}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Tool activity
          </Button>
          <Button size="sm" className="gap-2" onClick={onOpenServers}>
            <Settings2 className="h-3.5 w-3.5" />
            Manage servers
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="gap-1 px-2 py-0 h-6 text-[11px] uppercase tracking-wide">
            <ServerIcon className="h-3 w-3" />
            MCP servers
          </Badge>
          <span>{statusSummary}</span>
        </div>
        {selectedServers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedServers.map((server) => {
              const statusKind = getStatusKind(server.status);
              return (
                <button
                  key={server.id}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                    statusKind === "online" &&
                      "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200",
                    statusKind === "connecting" &&
                      "border-amber-300/60 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-200",
                    statusKind === "error" &&
                      "border-red-400/60 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-200",
                    statusKind === "offline" &&
                      "border-border/60 bg-muted/50 text-muted-foreground",
                    "hover:border-primary/60 hover:bg-primary/5"
                  )}
                  title="Toggle server for this chat"
                  onClick={() => onToggleServer(server.id)}
                >
                  {getStatusIcon(statusKind)}
                  <span className="font-medium">{server.name}</span>
                  <span className="text-[10px] uppercase tracking-wide">
                    {getStatusLabel(statusKind)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
            <span className="font-medium">
              No servers are active for this conversation.
            </span>
            <div className="flex flex-wrap gap-2">
              {servers.slice(0, 3).map((server) => (
                <Button
                  key={server.id}
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() => onToggleServer(server.id)}
                >
                  <ServerIcon className="h-3 w-3" />
                  Enable {server.name}
                </Button>
              ))}
              {servers.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenServers}
                >
                  Add a server
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

