"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import {
  ServerIcon,
  RefreshCw,
  ChevronDown,
  Power,
  PowerOff,
  ExternalLink,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import {
  MCPServer,
  useMCP,
} from "@/lib/context/mcp-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

interface MCPServerManagerProps {
  servers: MCPServer[];
  onServersChange: (servers: MCPServer[]) => void;
  selectedServers: string[];
  onSelectedServersChange: (serverIds: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Status dot colors
const statusColors = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500 animate-pulse",
  error: "bg-red-500",
  disconnected: "bg-zinc-300 dark:bg-zinc-600",
};

const statusLabels = {
  connected: "Connected",
  connecting: "Connecting...",
  error: "Error",
  disconnected: "Disconnected",
};

export const MCPServerManager = ({
  servers,
  onServersChange,
  selectedServers,
  onSelectedServersChange,
  open,
  onOpenChange,
}: MCPServerManagerProps) => {
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const { startServer, stopServer } = useMCP();

  // Sort servers: enabled first, then by name
  const sortedServers = [...servers].sort((a, b) => {
    const aEnabled = selectedServers.includes(a.id);
    const bEnabled = selectedServers.includes(b.id);
    if (aEnabled !== bEnabled) return bEnabled ? 1 : -1;
    return (a.name || a.id).localeCompare(b.name || b.id);
  });

  const enabledCount = selectedServers.length;
  const connectedCount = servers.filter(s => s.status === "connected").length;

  const toggleServer = (serverId: string) => {
    if (selectedServers.includes(serverId)) {
      onSelectedServersChange(selectedServers.filter((id) => id !== serverId));
      stopServer(serverId);
      toast.success("Server disabled");
    } else {
      onSelectedServersChange([...selectedServers, serverId]);
      startServer(serverId);
      toast.success("Server enabled");
    }
  };

  const refreshServer = async (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server) return;

    toast.info(`Reconnecting to ${server.name || server.id}...`);
    await stopServer(serverId);
    await new Promise(resolve => setTimeout(resolve, 500));
    await startServer(serverId);
  };

  const toggleExpand = (serverId: string) => {
    setExpandedServer(expandedServer === serverId ? null : serverId);
  };

  const enableAll = () => {
    const allIds = servers.map(s => s.id);
    onSelectedServersChange(allIds);
    allIds.forEach(id => startServer(id));
    toast.success("All servers enabled");
  };

  const disableAll = () => {
    selectedServers.forEach(id => stopServer(id));
    onSelectedServersChange([]);
    toast.success("All servers disabled");
  };

  const handleCopyError = async (message: string) => {
    if (!navigator?.clipboard?.writeText) {
      toast.error("Clipboard not available");
      return;
    }

    try {
      await navigator.clipboard.writeText(message);
      toast.success("Error copied to clipboard");
    } catch (error) {
      console.error("Failed to copy error message:", error);
      toast.error("Failed to copy error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <DialogTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Servers
          </DialogTitle>
          {enabledCount > 0 && (
            <p className="text-sm mt-1 text-zinc-600 dark:text-zinc-400">
              {connectedCount} of {enabledCount} connected
            </p>
          )}
        </DialogHeader>

        {/* Server List */}
        <div className="max-h-[60vh] overflow-y-auto">
          {sortedServers.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-zinc-500">
              No servers configured.
              <br />
              <span className="text-xs">Add servers to config/mcp-servers.json</span>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sortedServers.map((server) => {
                const isEnabled = selectedServers.includes(server.id);
                const isExpanded = expandedServer === server.id;
                const toolCount = server.tools?.length || 0;
                const status = isEnabled ? (server.status || "disconnected") : "disconnected";
                const errorMessage = server.errorMessage || "Connection failed. Try refreshing.";

                return (
                  <div key={server.id} className="bg-white dark:bg-zinc-900">
                    {/* Collapsed Row */}
                    <button
                      onClick={() => toggleExpand(server.id)}
                      className={cn(
                        "w-full px-6 py-4 flex items-center gap-4 text-left transition-colors",
                        "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                        !isEnabled && "opacity-50"
                      )}
                    >
                      {/* Status Dot */}
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full shrink-0",
                          statusColors[status as keyof typeof statusColors] || statusColors.disconnected
                        )}
                      />

                      {/* Server Name */}
                      <span className="flex-1 font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {server.name || server.id}
                      </span>

                      {/* Tool Count */}
                      {isEnabled && toolCount > 0 && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {toolCount} {toolCount === 1 ? "tool" : "tools"}
                        </span>
                      )}

                      {/* Expand Chevron */}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-zinc-400 transition-transform",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </button>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-6 pb-4 space-y-4">
                        {/* Status & URL */}
                        <div className="flex items-center justify-between text-xs">
                          <span className={cn(
                            "font-medium",
                            status === "connected" && "text-emerald-600 dark:text-emerald-400",
                            status === "connecting" && "text-amber-600 dark:text-amber-400",
                            status === "error" && "text-red-600 dark:text-red-400",
                            status === "disconnected" && "text-zinc-500"
                          )}>
                            {statusLabels[status as keyof typeof statusLabels] || "Disconnected"}
                          </span>

                          {isEnabled && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                refreshServer(server.id);
                              }}
                              className="h-7 px-2 text-xs text-zinc-500 hover:text-zinc-700"
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Refresh
                            </Button>
                          )}
                        </div>

                        {/* URL */}
                        {server.url && (
                          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate font-mono">{server.url}</span>
                          </div>
                        )}

                        {/* Tools List */}
                        {isEnabled && toolCount > 0 && (
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                              Available Tools
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {server.tools?.slice(0, 12).map((tool, idx) => (
                                <TooltipProvider key={idx}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-block px-2 py-1 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded border border-zinc-200 dark:border-zinc-700">
                                        {tool.name}
                                      </span>
                                    </TooltipTrigger>
                                    {tool.description && (
                                      <TooltipContent side="top" className="max-w-xs">
                                        <p className="text-xs">{tool.description}</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              ))}
                              {toolCount > 12 && (
                                <span className="inline-block px-2 py-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  +{toolCount - 12} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Error Message */}
                        {status === "error" && (
                          <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                            <div className="flex items-start justify-between gap-2">
                              <span className="whitespace-pre-wrap">{errorMessage}</span>
                              {server.errorMessage && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyError(errorMessage);
                                  }}
                                  className="h-7 px-2 text-[10px] text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-200"
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  Copy
                                </Button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Toggle Button */}
                        <Button
                          variant={isEnabled ? "outline" : "default"}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleServer(server.id);
                          }}
                          className="w-full"
                        >
                          {isEnabled ? (
                            <>
                              <PowerOff className="h-3.5 w-3.5 mr-2" />
                              Disable Server
                            </>
                          ) : (
                            <>
                              <Power className="h-3.5 w-3.5 mr-2" />
                              Enable Server
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {servers.length > 1 && (
          <div className="px-6 py-4 flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
            <button
              onClick={disableAll}
              disabled={enabledCount === 0}
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Disable all
            </button>
            <span className="text-zinc-400">·</span>
            <button
              onClick={enableAll}
              disabled={enabledCount === servers.length}
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Enable all
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
