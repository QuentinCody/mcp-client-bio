"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  PlusCircle,
  ServerIcon,
  X,
  Globe,
  ExternalLink,
  Trash2,
  CheckCircle,
  Plus,
  Cog,
  Edit2,
  Eye,
  EyeOff,
  AlertTriangle,
  RefreshCw,
  Power,
  BarChart3,
  Activity,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import {
  KeyValuePair,
  MCPServer,
  ServerStatus,
  useMCP,
  MCPTool,
} from "@/lib/context/mcp-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { isServerLocked } from "@/lib/utils";

// Default template for a new MCP server
const INITIAL_NEW_SERVER: Omit<MCPServer, "id"> = {
  name: "",
  url: "",
  type: "sse",
  command: "",
  args: [],
  env: [],
  headers: [],
};

interface MCPServerManagerProps {
  servers: MCPServer[];
  onServersChange: (servers: MCPServer[]) => void;
  selectedServers: string[];
  onSelectedServersChange: (serverIds: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Check if a key name might contain sensitive information
const isSensitiveKey = (key: string): boolean => {
  const sensitivePatterns = [
    /key/i,
    /token/i,
    /secret/i,
    /password/i,
    /pass/i,
    /auth/i,
    /credential/i,
  ];
  return sensitivePatterns.some((pattern) => pattern.test(key));
};

// Mask a sensitive value
const maskValue = (value: string): string => {
  if (!value) return "";
  if (value.length < 8) return "••••••";
  return (
    value.substring(0, 3) +
    "•".repeat(Math.min(10, value.length - 4)) +
    value.substring(value.length - 1)
  );
};

// Update the StatusIndicator to use Tooltip component
const StatusIndicator = ({
  status,
  onClick,
  hoverInfo,
}: {
  status?: ServerStatus;
  onClick?: () => void;
  hoverInfo?: string;
}) => {
  const isClickable = !!onClick;
  const hasHoverInfo = !!hoverInfo;

  const className = `flex-shrink-0 flex items-center gap-1 ${
    isClickable ? "cursor-pointer" : ""
  }`;

  const statusIndicator = (status: ServerStatus | undefined) => {
    switch (status) {
      case "connected":
        return (
          <div className={className} onClick={onClick}>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-green-500 hover:underline">
              Connected
            </span>
          </div>
        );
      case "connecting":
        return (
          <div className={className} onClick={onClick}>
            <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />
            <span className="text-xs text-amber-500">Connecting</span>
          </div>
        );
      case "error":
        return (
          <div className={className} onClick={onClick}>
            <AlertTriangle className="w-3 h-3 text-red-500" />
            <span className="text-xs text-red-500 hover:underline">Error</span>
          </div>
        );
      case "disconnected":
      default:
        return (
          <div className={className} onClick={onClick}>
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-xs text-muted-foreground">Disconnected</span>
          </div>
        );
    }
  };

  // Use Tooltip if we have hover info
  if (hasHoverInfo) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{statusIndicator(status)}</TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          className="max-w-[300px] break-all text-wrap"
        >
          {hoverInfo}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Otherwise just return the status indicator
  return statusIndicator(status);
};

// Add a component to display tools
const ToolsList = ({ tools }: { tools?: MCPTool[] }) => {
  if (!tools || tools.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">No tools available</div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        Tools ({tools.length})
      </div>
      <div className="divide-y divide-border/40 rounded-2xl border border-border/40 bg-white/60 shadow-sm">
        {tools.slice(0, 3).map((tool, index) => (
          <div
            key={index}
            className="flex flex-col gap-0.5 px-3 py-2 first:rounded-t-2xl last:rounded-b-2xl hover:bg-primary/5 transition-colors"
          >
            <span className="text-sm font-semibold text-foreground">
              {tool.name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {tool.description || "Tool loaded from MCP server"}
            </span>
          </div>
        ))}
        {tools.length > 3 && (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">
            +{tools.length - 3} more tools available
          </div>
        )}
      </div>
    </div>
  );
};

export const MCPServerManager = ({
  servers,
  onServersChange,
  selectedServers,
  onSelectedServersChange,
  open,
  onOpenChange,
}: MCPServerManagerProps) => {
  const [newServer, setNewServer] =
    useState<Omit<MCPServer, "id">>(INITIAL_NEW_SERVER);
  const [view, setView] = useState<"list" | "add">("list");
  const [newEnvVar, setNewEnvVar] = useState<KeyValuePair>({
    key: "",
    value: "",
  });
  const [newHeader, setNewHeader] = useState<KeyValuePair>({
    key: "",
    value: "",
  });
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [showSensitiveEnvValues, setShowSensitiveEnvValues] = useState<
    Record<number, boolean>
  >({});
  const [showSensitiveHeaderValues, setShowSensitiveHeaderValues] = useState<
    Record<number, boolean>
  >({});
  const [editingEnvIndex, setEditingEnvIndex] = useState<number | null>(null);
  const [editingHeaderIndex, setEditingHeaderIndex] = useState<number | null>(
    null
  );
  const [locked, setLocked] = useState(false);

  // Check if servers are locked
  useEffect(() => {
    setLocked(isServerLocked());
  }, []);
  const [editedEnvValue, setEditedEnvValue] = useState<string>("");
  const [editedHeaderValue, setEditedHeaderValue] = useState<string>("");

  // Add access to the MCP context for server control
  const { startServer, stopServer, updateServerStatus } = useMCP();

  const resetAndClose = () => {
    setView("list");
    setNewServer(INITIAL_NEW_SERVER);
    setNewEnvVar({ key: "", value: "" });
    setNewHeader({ key: "", value: "" });
    setShowSensitiveEnvValues({});
    setShowSensitiveHeaderValues({});
    setEditingEnvIndex(null);
    setEditingHeaderIndex(null);
    onOpenChange(false);
  };

  const addServer = () => {
    if (isServerLocked()) {
      toast.error("Cannot add servers - demo is locked to preset servers");
      return;
    }

    if (!newServer.name) {
      toast.error("Server name is required");
      return;
    }

    if (!newServer.url) {
      toast.error("Server URL is required");
      return;
    }

    const id = crypto.randomUUID();
    const updatedServers = [...servers, { ...newServer, id }];
    onServersChange(updatedServers);

    toast.success(`Added MCP server: ${newServer.name}`);
    setView("list");
    setNewServer(INITIAL_NEW_SERVER);
    setNewEnvVar({ key: "", value: "" });
    setNewHeader({ key: "", value: "" });
    setShowSensitiveEnvValues({});
    setShowSensitiveHeaderValues({});
  };

  const removeServer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isServerLocked()) {
      toast.error("Cannot remove servers - demo is locked to preset servers");
      return;
    }
    
    const updatedServers = servers.filter((server) => server.id !== id);
    onServersChange(updatedServers);

    // If the removed server was selected, remove it from selected servers
    if (selectedServers.includes(id)) {
      onSelectedServersChange(
        selectedServers.filter((serverId) => serverId !== id)
      );
    }

    toast.success("Server removed");
  };

  const toggleServer = (id: string) => {
    if (selectedServers.includes(id)) {
      // Remove from selected servers but DON'T stop the server
      onSelectedServersChange(
        selectedServers.filter((serverId) => serverId !== id)
      );
      const server = servers.find((s) => s.id === id);

      if (server) {
        toast.success(`Disabled MCP server: ${server.name}`);
      }
    } else {
      // Add to selected servers
      onSelectedServersChange([...selectedServers, id]);
      const server = servers.find((s) => s.id === id);

      if (server) {
        // Auto-start the server if it's disconnected
        if (
          !server.status ||
          server.status === "disconnected" ||
          server.status === "error"
        ) {
          updateServerStatus(server.id, "connecting");
          void startServer(server.id)
            .then((success) => {
              if (!success) {
                toast.error(`Failed to start server: ${server.name}`);
              }
            })
            .catch((error) => {
              toast.error(
                `Error starting server: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            });
        }

        toast.success(`Enabled MCP server: ${server.name}`);
      }
    }
  };

  const clearAllServers = () => {
    if (selectedServers.length > 0) {
      // Just deselect all servers without stopping them
      onSelectedServersChange([]);
      toast.success("All MCP servers disabled");
      resetAndClose();
    }
  };

  const addEnvVar = () => {
    if (!newEnvVar.key) return;

    setNewServer({
      ...newServer,
      env: [...(newServer.env || []), { ...newEnvVar }],
    });

    setNewEnvVar({ key: "", value: "" });
  };

  const removeEnvVar = (index: number) => {
    const updatedEnv = [...(newServer.env || [])];
    updatedEnv.splice(index, 1);
    setNewServer({ ...newServer, env: updatedEnv });

    // Clean up visibility state for this index
    const updatedVisibility = { ...showSensitiveEnvValues };
    delete updatedVisibility[index];
    setShowSensitiveEnvValues(updatedVisibility);

    // If currently editing this value, cancel editing
    if (editingEnvIndex === index) {
      setEditingEnvIndex(null);
    }
  };

  const startEditEnvValue = (index: number, value: string) => {
    setEditingEnvIndex(index);
    setEditedEnvValue(value);
  };

  const saveEditedEnvValue = () => {
    if (editingEnvIndex !== null) {
      const updatedEnv = [...(newServer.env || [])];
      updatedEnv[editingEnvIndex] = {
        ...updatedEnv[editingEnvIndex],
        value: editedEnvValue,
      };
      setNewServer({ ...newServer, env: updatedEnv });
      setEditingEnvIndex(null);
    }
  };

  const addHeader = () => {
    if (!newHeader.key) return;

    setNewServer({
      ...newServer,
      headers: [...(newServer.headers || []), { ...newHeader }],
    });

    setNewHeader({ key: "", value: "" });
  };

  const removeHeader = (index: number) => {
    const updatedHeaders = [...(newServer.headers || [])];
    updatedHeaders.splice(index, 1);
    setNewServer({ ...newServer, headers: updatedHeaders });

    // Clean up visibility state for this index
    const updatedVisibility = { ...showSensitiveHeaderValues };
    delete updatedVisibility[index];
    setShowSensitiveHeaderValues(updatedVisibility);

    // If currently editing this value, cancel editing
    if (editingHeaderIndex === index) {
      setEditingHeaderIndex(null);
    }
  };

  const startEditHeaderValue = (index: number, value: string) => {
    setEditingHeaderIndex(index);
    setEditedHeaderValue(value);
  };

  const saveEditedHeaderValue = () => {
    if (editingHeaderIndex !== null) {
      const updatedHeaders = [...(newServer.headers || [])];
      updatedHeaders[editingHeaderIndex] = {
        ...updatedHeaders[editingHeaderIndex],
        value: editedHeaderValue,
      };
      setNewServer({ ...newServer, headers: updatedHeaders });
      setEditingHeaderIndex(null);
    }
  };

  const toggleSensitiveEnvValue = (index: number) => {
    setShowSensitiveEnvValues((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const toggleSensitiveHeaderValue = (index: number) => {
    setShowSensitiveHeaderValues((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const hasAdvancedConfig = (server: MCPServer) => {
    return (
      (server.env && server.env.length > 0) ||
      (server.headers && server.headers.length > 0)
    );
  };

  // Editing support
  const startEditing = (server: MCPServer) => {
    setEditingServerId(server.id);
    const { id: _ignoredId, ...rest } = server;
    setNewServer({ ...rest });
    setView("add");
    // Reset sensitive value visibility states
    setShowSensitiveEnvValues({});
    setShowSensitiveHeaderValues({});
    setEditingEnvIndex(null);
    setEditingHeaderIndex(null);
  };

  const handleFormCancel = () => {
    if (view === "add") {
      setView("list");
      setEditingServerId(null);
      setNewServer(INITIAL_NEW_SERVER);
      setShowSensitiveEnvValues({});
      setShowSensitiveHeaderValues({});
      setEditingEnvIndex(null);
      setEditingHeaderIndex(null);
    } else {
      resetAndClose();
    }
  };

  const updateServer = () => {
    if (isServerLocked()) {
      toast.error("Cannot edit servers - demo is locked to preset servers");
      return;
    }
    
    if (!newServer.name) {
      toast.error("Server name is required");
      return;
    }
    if (!newServer.url) {
      toast.error("Server URL is required");
      return;
    }
    const updated = servers.map((s) =>
      s.id === editingServerId ? { ...newServer, id: editingServerId! } : s
    );
    onServersChange(updated);
    toast.success(`Updated MCP server: ${newServer.name}`);
    setView("list");
    setEditingServerId(null);
    setNewServer(INITIAL_NEW_SERVER);
    setShowSensitiveEnvValues({});
    setShowSensitiveHeaderValues({});
  };

  // Update functions to control servers
  const toggleServerStatus = async (server: MCPServer, e: React.MouseEvent) => {
    e.stopPropagation();

    if (
      !server.status ||
      server.status === "disconnected" ||
      server.status === "error"
    ) {
      try {
        updateServerStatus(server.id, "connecting");
        const success = await startServer(server.id, { force: true });

        if (success) {
          toast.success(`Started server: ${server.name}`);
        } else {
          toast.error(`Failed to start server: ${server.name}`);
        }
      } catch (error) {
        updateServerStatus(
          server.id,
          "error",
          `Error: ${error instanceof Error ? error.message : String(error)}`
        );
        toast.error(
          `Error starting server: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else {
      try {
        const success = await stopServer(server.id);
        if (success) {
          toast.success(`Stopped server: ${server.name}`);
        } else {
          toast.error(`Failed to stop server: ${server.name}`);
        }
      } catch (error) {
        toast.error(
          `Error stopping server: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  };

  // Update function to restart a server
  const restartServer = async (server: MCPServer, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      // First stop it
      if (server.status === "connected" || server.status === "connecting") {
        await stopServer(server.id);
      }

      // Then start it again (with delay to ensure proper cleanup)
      setTimeout(async () => {
        updateServerStatus(server.id, "connecting");
        const success = await startServer(server.id, { force: true });

        if (success) {
          toast.success(`Restarted server: ${server.name}`);
        } else {
          toast.error(`Failed to restart server: ${server.name}`);
        }
      }, 500);
    } catch (error) {
      updateServerStatus(
        server.id,
        "error",
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
      toast.error(
        `Error restarting server: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  // UI element to display the correct server URL
  const getServerDisplayUrl = (server: MCPServer): string => {
    return server.url;
  };

  // Update the hover info function to return richer content
  const getServerStatusHoverInfo = (server: MCPServer): string | undefined => {
    // For error status, show the error message
    if (server.status === "error" && server.errorMessage) {
      return `Error: ${server.errorMessage}`;
    }

    return undefined;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden rounded-3xl border border-primary/20 bg-white/95 p-0 shadow-[0_32px_120px_-40px_rgba(79,70,229,0.35)] dark:bg-slate-950/95">
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white/92 backdrop-blur-xl dark:bg-slate-950/90">
        <DialogHeader className="space-y-2 px-6 pt-6 pb-4 bg-white/90 border-b border-primary/15 shadow-inner dark:bg-slate-950">
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <ServerIcon className="h-4 w-4" />
            </span>
            MCP Server Configuration
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Connect to Model Context Protocol servers to unlock additional tools, prompts, and automations.
            {selectedServers.length > 0 && (
              <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
                {selectedServers.length} server{selectedServers.length !== 1 ? "s" : ""} currently active
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {view === "list" ? (
          <div className="flex-1 overflow-y-auto px-6 pb-24">
            {/* Server Overview Stats */}
            <div className="mb-6 mt-4 rounded-2xl border border-primary/15 bg-white/95 p-5 shadow-[0_20px_45px_-30px_rgba(79,70,229,0.35)] dark:bg-slate-950/80">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Activity className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">
                  Server Overview
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-primary/30 bg-white/90 px-3 py-4 text-center shadow-sm dark:bg-slate-900/70">
                  <div className="text-xl font-semibold text-primary">
                    {servers.filter(
                      (s) => selectedServers.includes(s.id) && s.status === "connected"
                    ).length}
                  </div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Active
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/85 px-3 py-4 text-center shadow-sm dark:border-emerald-300/30 dark:bg-emerald-500/20">
                  <div className="text-xl font-semibold text-emerald-600 dark:text-emerald-200">
                    {
                      servers
                        .filter((s) => selectedServers.includes(s.id))
                        .flatMap((s) => s.tools || []).length
                    }
                  </div>
                  <div className="text-xs font-medium uppercase tracking-wide text-emerald-700/80 dark:text-emerald-200/80">
                    Tools
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/85 px-3 py-4 text-center shadow-sm dark:border-amber-300/30 dark:bg-amber-500/20">
                  <div className="text-xl font-semibold text-amber-600 dark:text-amber-200">
                    {servers.filter((s) => s.status === "error").length}
                  </div>
                  <div className="text-xs font-medium uppercase tracking-wide text-amber-700/80 dark:text-amber-200/80">
                    Issues
                  </div>
                </div>
              </div>
              {selectedServers.length > 0 && (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/10 px-4 py-3 text-xs font-medium text-primary">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/25">
                    <Zap className="h-3.5 w-3.5" />
                  </span>
                  <span>
                    {selectedServers.length} server
                    {selectedServers.length !== 1 ? "s" : ""} enabled for chat
                  </span>
                </div>
              )}
            </div>

            {servers.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">Available Servers</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(new CustomEvent("tool-metrics:toggle"));
                        }
                      }}
                      className="gap-1.5 h-7 text-xs"
                    >
                      <BarChart3 className="h-3 w-3" />
                      Metrics
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Select multiple servers to combine tools
                    </span>
                  </div>
                </div>

                <div className="space-y-4 rounded-3xl border border-primary/15 bg-white/90 p-5 shadow-sm dark:bg-slate-950/80 dark:border-slate-800/60">
                  {servers
                    .sort((a, b) => {
                      const aActive = selectedServers.includes(a.id);
                      const bActive = selectedServers.includes(b.id);
                      if (aActive && !bActive) return -1;
                      if (!aActive && bActive) return 1;
                      return 0;
                    })
                    .map((server) => {
                      const isActive = selectedServers.includes(server.id);
                      const isRunning =
                        server.status === "connected" || server.status === "connecting";

                      return (
                        <div
                          key={server.id}
                          className={cn(
                            "flex flex-col gap-4 overflow-hidden rounded-[28px] border border-border/60 bg-white/95 p-5 transition-all duration-200 dark:border-slate-800/60 dark:bg-slate-950/70",
                            isActive
                              ? "border-primary/30 bg-white shadow-[0_28px_60px_-32px_rgba(79,70,229,0.35)]"
                              : "hover:border-primary/40 hover:shadow-[0_20px_45px_-32px_rgba(15,23,42,0.3)]"
                          )}
                        >
                          {/* Server Header with Type Badge and Actions */}
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <span
                                className={cn(
                                  "flex h-10 w-10 items-center justify-center rounded-2xl border border-border/50 bg-muted/10 text-muted-foreground",
                                  isActive ? "border-primary/40 bg-primary/10 text-primary" : ""
                                )}
                              >
                                <Globe className="h-4 w-4" />
                              </span>
                              <div>
                                <h4 className="text-sm font-semibold text-foreground">
                                  {server.name || server.id}
                                </h4>
                                <p className="text-[11px] text-muted-foreground">
                                  {getServerDisplayUrl(server)}
                                </p>
                              </div>
                              {server.auth?.type === "oauth" && (
                                <span className="ml-1 flex-shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                  OAuth
                                </span>
                              )}
                              {hasAdvancedConfig(server) && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                                  <Cog className="h-3 w-3" />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[11px]">
                              <span className="rounded-full border border-border/40 bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground shadow-inner">
                                {server.url?.endsWith("/sse") ? "SSE" : "HTTP"}
                              </span>
                              <StatusIndicator
                                status={server.status}
                                onClick={() =>
                                  server.errorMessage && toast.error(server.errorMessage)
                                }
                                hoverInfo={getServerStatusHoverInfo(server)}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => toggleServerStatus(server, e)}
                                className="rounded-full border border-border/40 bg-muted/10 p-1 text-muted-foreground transition-all hover:border-primary hover:text-primary"
                                aria-label={isRunning ? "Stop server" : "Start server"}
                                title={isRunning ? "Stop server" : "Start server"}
                              >
                                <Power
                                  className={cn(
                                    "h-3.5 w-3.5",
                                    isRunning ? "text-red-500" : "text-emerald-600"
                                  )}
                                />
                              </button>
                              <button
                                onClick={(e) => restartServer(server, e)}
                                className="rounded-full border border-border/40 bg-muted/10 p-1 text-muted-foreground transition-all hover:border-primary hover:text-primary"
                                aria-label="Restart server"
                                title="Restart server"
                                disabled={server.status === "connecting"}
                              >
                                <RefreshCw
                                  className={cn(
                                    "h-3.5 w-3.5",
                                    server.status === "connecting" && "opacity-50"
                                  )}
                                />
                              </button>
                              {!locked && (
                                <button
                                  onClick={(e) => removeServer(server.id, e)}
                                  className="rounded-full border border-border/40 bg-muted/10 p-1 text-muted-foreground transition-all hover:border-rose-400 hover:text-rose-500"
                                  aria-label="Remove server"
                                  title="Remove server"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {!locked && (
                                <button
                                  onClick={() => startEditing(server)}
                                  className="rounded-full border border-border/40 bg-muted/10 p-1 text-muted-foreground transition-all hover:border-primary hover:text-primary"
                                  aria-label="Edit server"
                                  title="Edit server"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Server Details */}
                          <div className="rounded-2xl border border-border/40 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                            {server.description || getServerDisplayUrl(server)}
                          </div>

                          {/* Tools & Prompts */}
                          {server.status === "connected" && (
                            <div className="space-y-3 rounded-2xl border border-border/50 bg-muted/5 p-4">
                              <ToolsList tools={server.tools} />
                              {server.prompts && server.prompts.length > 0 && (
                                <div className="space-y-2">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                                    Prompts
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {server.prompts.slice(0, 6).map((p) => (
                                      <div
                                        key={p.name}
                                        className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-muted-foreground"
                                      >
                                        <div className="font-semibold text-foreground">
                                          {p.title || p.name}
                                        </div>
                                        {p.description && (
                                          <div className="text-[11px] text-muted-foreground/80">
                                            {p.description}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                    {server.prompts.length > 6 && (
                                      <div className="text-xs text-muted-foreground">
                                        +{server.prompts.length - 6} more…
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Action Button */}
                          <div className="pt-2 pb-1">
                            <Button
                              size="sm"
                              className={cn(
                                "w-full gap-1.5 rounded-2xl border transition-all duration-200",
                                isActive
                                  ? "border-primary/30 bg-primary/70 text-primary-foreground shadow-[0_10px_30px_-10px_rgba(79,70,229,0.7)]"
                                  : "border border-primary/25 bg-white/70 text-foreground hover:border-primary/40 hover:bg-primary/10"
                              )}
                              variant={isActive ? "default" : "outline"}
                              onClick={() => toggleServer(server.id)}
                            >
                              {isActive && <CheckCircle className="h-3.5 w-3.5" />}
                              {isActive ? "Active" : "Enable Server"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border border-primary/20 bg-white/95 py-12 text-foreground shadow-[0_24px_60px_-35px_rgba(79,70,229,0.35)] dark:bg-slate-950/80">
                <div className="rounded-2xl border border-primary/30 bg-primary/15 p-4 text-primary">
                  <ServerIcon className="h-7 w-7" />
                </div>
                <div className="space-y-1 text-center">
                  <h3 className="text-base font-semibold">No MCP Servers Added</h3>
                  <p className="mx-auto max-w-[320px] text-sm text-muted-foreground">
                    Add your first MCP server to access additional tools, prompts, and diagnostics inside the workspace.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <a
                    href="https://modelcontextprotocol.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-primary/30 px-3 py-1 text-primary transition-colors hover:bg-primary/10"
                  >
                    Learn about MCP
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 pb-10">
            <div className="mt-4 space-y-4 rounded-2xl border border-primary/15 bg-white/90 p-5 shadow-[0_24px_55px_-35px_rgba(79,70,229,0.45)] dark:bg-slate-950/70 dark:border-slate-800/60">
            <h3 className="text-sm font-medium">
              {editingServerId ? "Edit MCP Server" : "Add New MCP Server"}
            </h3>
            <div className="space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="name">Server Name</Label>
                <Input
                  id="name"
                  value={newServer.name}
                  onChange={(e) =>
                    setNewServer({ ...newServer, name: e.target.value })
                  }
                  placeholder="My MCP Server"
                  className="relative z-0"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="transport-type">Transport Type</Label>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Choose how to connect to your MCP server:
                  </p>
                  <div className="grid gap-2 grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        setNewServer({ ...newServer, type: "sse" })
                      }
                      className={`flex items-center gap-2 p-3 rounded-lg text-left border transition-all duration-200 ${
                        newServer.type === "sse"
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-sm"
                          : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                      }`}
                    >
                      <Globe
                        className={`h-5 w-5 shrink-0 ${
                          newServer.type === "sse" ? "text-primary" : ""
                        }`}
                      />
                      <div>
                        <p className="font-medium">SSE</p>
                        <p className="text-xs text-muted-foreground">
                          Server-Sent Events
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setNewServer({ ...newServer, type: "http" })
                      }
                      className={`flex items-center gap-2 p-3 rounded-lg text-left border transition-all duration-200 ${
                        newServer.type === "http"
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-sm"
                          : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                      }`}
                    >
                      <Globe
                        className={`h-5 w-5 shrink-0 ${
                          newServer.type === "http" ? "text-primary" : ""
                        }`}
                      />
                      <div>
                        <p className="font-medium">HTTP</p>
                        <p className="text-xs text-muted-foreground">
                          Streamable HTTP
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="url">Server URL</Label>
                <Input
                  id="url"
                  value={newServer.url}
                  onChange={(e) =>
                    setNewServer({ ...newServer, url: e.target.value })
                  }
                  placeholder="https://mcp.example.com/token/mcp"
                  className="relative z-0"
                />
                <p className="text-xs text-muted-foreground">
                  Full URL to the {newServer.type === "sse" ? "SSE" : "HTTP"}{" "}
                  endpoint of the MCP server
                </p>
              </div>

              {/* Advanced Configuration */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="env-vars">
                  <AccordionTrigger className="text-sm py-2">
                    Environment Variables
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <Label
                            htmlFor="env-key"
                            className="text-xs mb-1 block"
                          >
                            Key
                          </Label>
                          <Input
                            id="env-key"
                            value={newEnvVar.key}
                            onChange={(e) =>
                              setNewEnvVar({
                                ...newEnvVar,
                                key: e.target.value,
                              })
                            }
                            placeholder="API_KEY"
                            className="h-8 relative z-0"
                          />
                        </div>
                        <div className="flex-1">
                          <Label
                            htmlFor="env-value"
                            className="text-xs mb-1 block"
                          >
                            Value
                          </Label>
                          <Input
                            id="env-value"
                            value={newEnvVar.value}
                            onChange={(e) =>
                              setNewEnvVar({
                                ...newEnvVar,
                                value: e.target.value,
                              })
                            }
                            placeholder="your-secret-key"
                            className="h-8 relative z-0"
                            type="text"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addEnvVar}
                          disabled={!newEnvVar.key}
                          className="h-8 mt-1"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {newServer.env && newServer.env.length > 0 ? (
                        <div className="border rounded-md divide-y">
                          {newServer.env.map((env, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 text-sm"
                            >
                              <div className="flex-1 flex items-center gap-1 truncate">
                                <span className="font-mono text-xs">
                                  {env.key}
                                </span>
                                <span className="mx-2 text-muted-foreground">
                                  =
                                </span>

                                {editingEnvIndex === index ? (
                                  <div className="flex gap-1 flex-1">
                                    <Input
                                      className="h-6 text-xs py-1 px-2"
                                      value={editedEnvValue}
                                      onChange={(e) =>
                                        setEditedEnvValue(e.target.value)
                                      }
                                      onKeyDown={(e) =>
                                        e.key === "Enter" &&
                                        saveEditedEnvValue()
                                      }
                                      autoFocus
                                    />
                                    <Button
                                      size="sm"
                                      className="h-6 px-2"
                                      onClick={saveEditedEnvValue}
                                    >
                                      Save
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="text-xs text-muted-foreground truncate">
                                      {isSensitiveKey(env.key) &&
                                      !showSensitiveEnvValues[index]
                                        ? maskValue(env.value)
                                        : env.value}
                                    </span>
                                    <span className="flex ml-1 gap-1">
                                      {isSensitiveKey(env.key) && (
                                        <button
                                          onClick={() =>
                                            toggleSensitiveEnvValue(index)
                                          }
                                          className="p-1 hover:bg-muted/50 rounded-full"
                                        >
                                          {showSensitiveEnvValues[index] ? (
                                            <EyeOff className="h-3 w-3 text-muted-foreground" />
                                          ) : (
                                            <Eye className="h-3 w-3 text-muted-foreground" />
                                          )}
                                        </button>
                                      )}
                                      <button
                                        onClick={() =>
                                          startEditEnvValue(index, env.value)
                                        }
                                        className="p-1 hover:bg-muted/50 rounded-full"
                                      >
                                        <Edit2 className="h-3 w-3 text-muted-foreground" />
                                      </button>
                                    </span>
                                  </>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeEnvVar(index)}
                                className="h-6 w-6 p-0 ml-2"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          No environment variables added
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Environment variables will be passed to the MCP server
                        process.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="headers">
                  <AccordionTrigger className="text-sm py-2">
                    HTTP Headers
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <Label
                            htmlFor="header-key"
                            className="text-xs mb-1 block"
                          >
                            Key
                          </Label>
                          <Input
                            id="header-key"
                            value={newHeader.key}
                            onChange={(e) =>
                              setNewHeader({
                                ...newHeader,
                                key: e.target.value,
                              })
                            }
                            placeholder="Authorization"
                            className="h-8 relative z-0"
                          />
                        </div>
                        <div className="flex-1">
                          <Label
                            htmlFor="header-value"
                            className="text-xs mb-1 block"
                          >
                            Value
                          </Label>
                          <Input
                            id="header-value"
                            value={newHeader.value}
                            onChange={(e) =>
                              setNewHeader({
                                ...newHeader,
                                value: e.target.value,
                              })
                            }
                            placeholder="Bearer token123"
                            className="h-8 relative z-0"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addHeader}
                          disabled={!newHeader.key}
                          className="h-8 mt-1"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {newServer.headers && newServer.headers.length > 0 ? (
                        <div className="border rounded-md divide-y">
                          {newServer.headers.map((header, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 text-sm"
                            >
                              <div className="flex-1 flex items-center gap-1 truncate">
                                <span className="font-mono text-xs">
                                  {header.key}
                                </span>
                                <span className="mx-2 text-muted-foreground">
                                  :
                                </span>

                                {editingHeaderIndex === index ? (
                                  <div className="flex gap-1 flex-1">
                                    <Input
                                      className="h-6 text-xs py-1 px-2"
                                      value={editedHeaderValue}
                                      onChange={(e) =>
                                        setEditedHeaderValue(e.target.value)
                                      }
                                      onKeyDown={(e) =>
                                        e.key === "Enter" &&
                                        saveEditedHeaderValue()
                                      }
                                      autoFocus
                                    />
                                    <Button
                                      size="sm"
                                      className="h-6 px-2"
                                      onClick={saveEditedHeaderValue}
                                    >
                                      Save
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="text-xs text-muted-foreground truncate">
                                      {isSensitiveKey(header.key) &&
                                      !showSensitiveHeaderValues[index]
                                        ? maskValue(header.value)
                                        : header.value}
                                    </span>
                                    <span className="flex ml-1 gap-1">
                                      {isSensitiveKey(header.key) && (
                                        <button
                                          onClick={() =>
                                            toggleSensitiveHeaderValue(index)
                                          }
                                          className="p-1 hover:bg-muted/50 rounded-full"
                                        >
                                          {showSensitiveHeaderValues[index] ? (
                                            <EyeOff className="h-3 w-3 text-muted-foreground" />
                                          ) : (
                                            <Eye className="h-3 w-3 text-muted-foreground" />
                                          )}
                                        </button>
                                      )}
                                      <button
                                        onClick={() =>
                                          startEditHeaderValue(
                                            index,
                                            header.value
                                          )
                                        }
                                        className="p-1 hover:bg-muted/50 rounded-full"
                                      >
                                        <Edit2 className="h-3 w-3 text-muted-foreground" />
                                      </button>
                                    </span>
                                  </>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeHeader(index)}
                                className="h-6 w-6 p-0 ml-2"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          No headers added
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        HTTP headers will be sent with requests to the{" "}
                        {newServer.type === "sse" ? "SSE" : "HTTP"} endpoint.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            </div>
          </div>
        )}

        {/* Persistent fixed footer with buttons */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-sm border-t border-border flex justify-between z-10 shadow-lg">
          {view === "list" ? (
            <>
              <Button
                variant="outline"
                onClick={clearAllServers}
                size="sm"
                className="gap-1.5"
                disabled={selectedServers.length === 0}
              >
                <X className="h-3.5 w-3.5" />
                Disable All
              </Button>
              {!locked && (
                <Button
                  onClick={() => setView("add")}
                  size="sm"
                  className="gap-1.5"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Add Server
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleFormCancel}>
                Cancel
              </Button>
              <Button
                onClick={editingServerId ? updateServer : addServer}
                disabled={!newServer.name || !newServer.url}
              >
                {editingServerId ? "Save Changes" : "Add Server"}
              </Button>
            </>
          )}
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
};
