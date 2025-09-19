export type SlashServerStatus = "connected" | "connecting" | "disconnected" | "error" | "unknown";

export interface SlashRuntimePrompt {
  name: string;
  title?: string;
  description?: string;
  trigger?: string;
}

export interface SlashRuntimeTool {
  name: string;
  description?: string;
}

export interface SlashRuntimeServer {
  id: string;
  name: string;
  url: string;
  type: "http" | "sse";
  status: SlashServerStatus;
  active: boolean;
  description?: string;
  errorMessage?: string;
  prompts?: SlashRuntimePrompt[];
  tools?: SlashRuntimeTool[];
}

interface SlashRuntimeState {
  servers: SlashRuntimeServer[];
}

const runtimeState: SlashRuntimeState = {
  servers: [],
};

export type SlashClearChatResult = { cleared: boolean; message?: string } | void;

export interface SlashRuntimeActions {
  openServerManager?: () => void;
  clearChat?: () => SlashClearChatResult;
}

const runtimeActions: SlashRuntimeActions = {};

function cloneServer(server: SlashRuntimeServer): SlashRuntimeServer {
  return {
    ...server,
    prompts: server.prompts?.map((prompt) => ({ ...prompt })) ?? undefined,
    tools: server.tools?.map((tool) => ({ ...tool })) ?? undefined,
  };
}

export function setSlashRuntimeServers(servers: SlashRuntimeServer[]) {
  runtimeState.servers = servers.map(cloneServer);
}

export function getSlashRuntimeServers(): SlashRuntimeServer[] {
  return runtimeState.servers.map(cloneServer);
}

export function setSlashRuntimeActions(next: Partial<SlashRuntimeActions>) {
  (Object.entries(next) as [keyof SlashRuntimeActions, SlashRuntimeActions[keyof SlashRuntimeActions]][]).forEach(([key, value]) => {
    if (value) {
      runtimeActions[key] = value;
    } else {
      delete runtimeActions[key];
    }
  });
}

export function getSlashRuntimeActions(): SlashRuntimeActions {
  return { ...runtimeActions };
}
