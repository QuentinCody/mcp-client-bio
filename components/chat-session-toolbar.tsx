"use client";

import { Settings2 } from "lucide-react";
import { useMemo } from "react";
import { modelDetails, type modelID } from "@/ai/providers";
import { ModelPicker } from "./model-picker";
import { Button } from "@/components/ui/button";
import { MCPServer, type ServerStatus } from "@/lib/context/mcp-context";

interface ChatSessionToolbarProps {
  selectedModel: modelID;
  onModelChange: (model: modelID) => void;
  servers: MCPServer[];
  selectedServerIds: string[];
  onToggleServer: (serverId: string) => void;
  onOpenServers: () => void;
  onToggleMetrics: () => void;
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

  const currentModel = modelDetails[selectedModel];

  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-[16px] border border-border/40 bg-background/95 px-3 py-2 shadow-sm">
      {/* Model picker - minimal */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-xs font-medium text-foreground">
            {currentModel?.name ?? selectedModel}
          </span>
        </div>
        <ModelPicker
          variant="inline"
          selectedModel={selectedModel}
          setSelectedModel={onModelChange}
          className="text-xs"
        />
      </div>

      {/* Server status - compact */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {selectedServerIds.length > 0 ? `${connectedCount}/${selectedServerIds.length}` : "0"} MCP
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenServers}
          className="h-6 px-2 text-xs"
        >
          <Settings2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}