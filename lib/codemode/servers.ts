import serversConfig from "@/config/mcp-servers.json";
import type { MCPServerConfig, KeyValuePair } from "@/lib/mcp-client";
import { extractServerKey } from "@/lib/code-mode/dynamic-helpers";

export interface CodeModeServerConfig extends MCPServerConfig {
  key: string;
  description?: string;
}

export type CodeModeServerKey = string;

type PresetHeader = { key?: string; value?: string };

const normalizeServerType = (type?: string): "http" | "sse" => {
  if (type === "sse") return "sse";
  return "http";
};

const normalizeHeaders = (headers?: PresetHeader[]): KeyValuePair[] | undefined => {
  if (!Array.isArray(headers)) return undefined;
  return headers
    .filter((header): header is KeyValuePair => {
      return (
        header &&
        typeof header === "object" &&
        typeof header.key === "string" &&
        typeof header.value === "string"
      );
    });
};

const buildCodeModeServers = (): CodeModeServerConfig[] => {
  const preset = Array.isArray(serversConfig?.servers) ? serversConfig.servers : [];
  const seenKeys = new Map<string, number>();
  const servers: CodeModeServerConfig[] = [];

  for (const entry of preset) {
    if (!entry || typeof entry.url !== "string") continue;

    const entryHeaders = (entry as { headers?: PresetHeader[] }).headers;
    const baseConfig: MCPServerConfig = {
      name: typeof entry.name === "string" ? entry.name : entry.url,
      url: entry.url,
      type: normalizeServerType(entry.type),
      headers: normalizeHeaders(entryHeaders),
    };

    const baseKey = extractServerKey(baseConfig);
    const occurrence = seenKeys.get(baseKey) ?? 0;
    seenKeys.set(baseKey, occurrence + 1);
    const key = occurrence === 0 ? baseKey : `${baseKey}${occurrence + 1}`;

    servers.push({
      key,
      ...baseConfig,
      description: typeof entry.description === "string" ? entry.description : undefined,
    });
  }

  return servers;
};

const CODE_MODE_SERVER_LIST = buildCodeModeServers();

export const CODEMODE_SERVER_LIST = CODE_MODE_SERVER_LIST;
export const CODEMODE_SERVERS: Record<CodeModeServerKey, CodeModeServerConfig> = CODE_MODE_SERVER_LIST.reduce(
  (acc, server) => {
    acc[server.key] = server;
    return acc;
  },
  {} as Record<CodeModeServerKey, CodeModeServerConfig>
);

export function getCodeModeServers(): CodeModeServerConfig[] {
  return CODEMODE_SERVER_LIST.slice();
}

export function getCodeModeServerByKey(key: string): CodeModeServerConfig | undefined {
  return CODEMODE_SERVERS[key];
}
