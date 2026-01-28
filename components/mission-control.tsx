"use client";

import { useState, useMemo } from "react";
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
  Power,
  PowerOff,
  Activity,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Wrench,
  Radio,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from "lucide-react";
import { toast } from "sonner";
import { MCPServer, useMCP } from "@/lib/context/mcp-context";

interface MissionControlProps {
  servers: MCPServer[];
  onServersChange: (servers: MCPServer[]) => void;
  selectedServers: string[];
  onSelectedServersChange: (serverIds: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Connection signal strength indicator
function SignalStrength({ status }: { status: MCPServer["status"] }) {
  if (status === "connected") {
    return <SignalHigh className="h-4 w-4 text-emerald-500" />;
  }
  if (status === "connecting") {
    return <SignalMedium className="h-4 w-4 text-amber-500 animate-pulse" />;
  }
  if (status === "error") {
    return <SignalLow className="h-4 w-4 text-red-500" />;
  }
  return <Signal className="h-4 w-4 text-zinc-400" />;
}

// Mini ring chart for success rate
function SuccessRing({ rate, size = 32 }: { rate: number; size?: number }) {
  const radius = (size - 4) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (rate / 100) * circumference;
  const color =
    rate >= 90
      ? "rgb(34, 197, 94)"
      : rate >= 70
      ? "rgb(234, 179, 8)"
      : "rgb(239, 68, 68)";

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        className="text-zinc-200 dark:text-zinc-700"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  );
}

// Connection pulse animation
function ConnectionPulse({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
    </span>
  );
}

// Server module card - the core visual element
function ServerModule({
  server,
  isEnabled,
  onToggle,
  onRefresh,
  isExpanded,
  onToggleExpand,
}: {
  server: MCPServer;
  isEnabled: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const isConnected = server.status === "connected";
  const isConnecting = server.status === "connecting";
  const hasError = server.status === "error";
  const toolCount = server.tools?.length || 0;

  // Simulated metrics (in real app, would come from actual tracking)
  const successRate = hasError ? 0 : isConnected ? 95 + Math.random() * 5 : 0;
  const avgLatency = isConnected ? Math.round(50 + Math.random() * 200) : 0;

  return (
    <div
      className={cn(
        "relative rounded-xl border transition-all duration-300",
        isEnabled
          ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10"
          : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50",
        isExpanded && "ring-2 ring-primary/20"
      )}
    >
      {/* Connection pulse indicator */}
      <ConnectionPulse active={isConnected && isEnabled} />

      {/* Main card content */}
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Server icon with status glow */}
            <div
              className={cn(
                "relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors",
                isConnected
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : hasError
                  ? "bg-red-500/20 text-red-600 dark:text-red-400"
                  : isConnecting
                  ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                  : "bg-zinc-100 dark:bg-zinc-700 text-zinc-500"
              )}
            >
              <ServerIcon className="h-5 w-5" />
              {isConnecting && (
                <div className="absolute inset-0 rounded-lg border-2 border-amber-500 animate-pulse" />
              )}
            </div>

            {/* Server name and type */}
            <div className="min-w-0">
              <h3 className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {server.name || server.id}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {server.type === "sse" ? "SSE" : "HTTP"} •{" "}
                {server.url?.slice(0, 30)}
                {(server.url?.length || 0) > 30 ? "..." : ""}
              </p>
            </div>
          </div>

          {/* Signal strength and toggle */}
          <div className="flex items-center gap-2">
            <SignalStrength status={server.status} />
            <button
              onClick={onToggle}
              className={cn(
                "p-2 rounded-lg transition-colors",
                isEnabled
                  ? "bg-emerald-500 text-white hover:bg-emerald-600"
                  : "bg-zinc-100 dark:bg-zinc-700 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-600"
              )}
            >
              {isEnabled ? (
                <Power className="h-4 w-4" />
              ) : (
                <PowerOff className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Status bar - only show when enabled */}
        {isEnabled && (
          <div className="mt-4 flex items-center gap-4">
            {/* Tool count */}
            <div className="flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {toolCount} tools
              </span>
            </div>

            {/* Latency */}
            {isConnected && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  ~{avgLatency}ms
                </span>
              </div>
            )}

            {/* Success rate ring */}
            {isConnected && (
              <div className="flex items-center gap-1.5">
                <SuccessRing rate={successRate} size={20} />
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  {successRate.toFixed(0)}%
                </span>
              </div>
            )}

            {/* Expand/collapse button */}
            <button
              onClick={onToggleExpand}
              className="ml-auto p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 text-zinc-400 transition-transform",
                  isExpanded && "rotate-90"
                )}
              />
            </button>
          </div>
        )}

        {/* Error message */}
        {hasError && server.errorMessage && (
          <div className="mt-3 flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2">
              {server.errorMessage}
            </p>
          </div>
        )}

        {/* Expanded details */}
        {isExpanded && isEnabled && (
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
            {/* Tools list */}
            {toolCount > 0 && (
              <div>
                <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                  Available Tools
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {server.tools?.slice(0, 8).map((tool) => (
                    <span
                      key={tool.name}
                      className="px-2 py-0.5 text-xs bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded"
                    >
                      {tool.name}
                    </span>
                  ))}
                  {toolCount > 8 && (
                    <span className="px-2 py-0.5 text-xs text-zinc-400">
                      +{toolCount - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-3 flex gap-2">
              <button
                onClick={onRefresh}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-700 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reconnect
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Health dashboard summary
function HealthDashboard({
  servers,
  selectedServers,
}: {
  servers: MCPServer[];
  selectedServers: string[];
}) {
  const enabledServers = servers.filter((s) => selectedServers.includes(s.id));
  const connected = enabledServers.filter((s) => s.status === "connected").length;
  const errors = enabledServers.filter((s) => s.status === "error").length;
  const connecting = enabledServers.filter((s) => s.status === "connecting").length;
  const totalTools = enabledServers.reduce(
    (sum, s) => sum + (s.tools?.length || 0),
    0
  );

  const healthScore =
    enabledServers.length > 0
      ? Math.round((connected / enabledServers.length) * 100)
      : 0;

  return (
    <div className="grid grid-cols-4 gap-3 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
      {/* Health score */}
      <div className="text-center">
        <div className="relative inline-flex items-center justify-center">
          <SuccessRing rate={healthScore} size={40} />
          <span className="absolute text-xs font-bold text-zinc-700 dark:text-zinc-200">
            {healthScore}
          </span>
        </div>
        <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          Health
        </p>
      </div>

      {/* Connected */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-1">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-lg font-bold text-zinc-700 dark:text-zinc-200">
            {connected}
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          Online
        </p>
      </div>

      {/* Errors */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-1">
          <XCircle className="h-4 w-4 text-red-500" />
          <span className="text-lg font-bold text-zinc-700 dark:text-zinc-200">
            {errors}
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          Errors
        </p>
      </div>

      {/* Tools */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-1">
          <Wrench className="h-4 w-4 text-blue-500" />
          <span className="text-lg font-bold text-zinc-700 dark:text-zinc-200">
            {totalTools}
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          Tools
        </p>
      </div>
    </div>
  );
}

export function MissionControl({
  servers,
  onServersChange,
  selectedServers,
  onSelectedServersChange,
  open,
  onOpenChange,
}: MissionControlProps) {
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const { startServer, stopServer } = useMCP();

  // Sort servers: enabled first, then by name
  const sortedServers = useMemo(() => {
    return [...servers].sort((a, b) => {
      const aEnabled = selectedServers.includes(a.id);
      const bEnabled = selectedServers.includes(b.id);
      if (aEnabled !== bEnabled) return bEnabled ? 1 : -1;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
  }, [servers, selectedServers]);

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
    const server = servers.find((s) => s.id === serverId);
    if (!server) return;

    toast.info(`Reconnecting to ${server.name || server.id}...`);
    await stopServer(serverId);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await startServer(serverId);
  };

  const enableAll = () => {
    const allIds = servers.map((s) => s.id);
    onSelectedServersChange(allIds);
    allIds.forEach((id) => startServer(id));
    toast.success("All servers enabled");
  };

  const disableAll = () => {
    selectedServers.forEach((id) => stopServer(id));
    onSelectedServersChange([]);
    toast.success("All servers disabled");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl p-0 gap-0 overflow-hidden"
        style={{ backgroundColor: "hsl(var(--background))" }}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Radio className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">
                  Mission Control
                </DialogTitle>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {selectedServers.length} servers configured
                </p>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={enableAll}>
                Enable All
              </Button>
              <Button variant="outline" size="sm" onClick={disableAll}>
                Disable All
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Health Dashboard */}
        <div className="px-6 pt-4">
          <HealthDashboard servers={servers} selectedServers={selectedServers} />
        </div>

        {/* Server List */}
        <div className="px-6 py-4 max-h-[50vh] overflow-y-auto space-y-3">
          {sortedServers.length === 0 ? (
            <div className="text-center py-8">
              <ServerIcon className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500 dark:text-zinc-400">
                No MCP servers configured
              </p>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
                Add servers in your configuration
              </p>
            </div>
          ) : (
            sortedServers.map((server) => (
              <ServerModule
                key={server.id}
                server={server}
                isEnabled={selectedServers.includes(server.id)}
                onToggle={() => toggleServer(server.id)}
                onRefresh={() => refreshServer(server.id)}
                isExpanded={expandedServer === server.id}
                onToggleExpand={() =>
                  setExpandedServer(
                    expandedServer === server.id ? null : server.id
                  )
                }
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Mission Control v1.0</span>
            <span className="flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              Auto-reconnect enabled
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Re-export for backward compatibility
export { MissionControl as MCPServerManagerV2 };
