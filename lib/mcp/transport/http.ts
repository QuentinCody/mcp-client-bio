export type McpTransport = {
  listPrompts: (
    serverId: string,
    cursor?: string
  ) => Promise<{ prompts: PromptSummary[]; nextCursor?: string }>;
  getPrompt: (
    serverId: string,
    name: string,
    args?: Record<string, string>
  ) => Promise<GetPromptResult>;
  complete: (
    serverId: string,
    promptName: string,
    argName: string,
    value: string,
    contextArgs: Record<string, string>
  ) => Promise<CompleteResult>;
};

export type PromptSummary = {
  name: string;
  title?: string;
  description?: string;
  arguments?: PromptArg[];
};

export type PromptArg = {
  name: string;
  required?: boolean;
  description?: string;
};

export type PromptMessage =
  | { role: "assistant" | "user" | "system"; content: { type: "text"; text: string } }
  | { role: "assistant" | "user" | "system"; content: { type: "resource"; uri: string; name?: string } };

export type GetPromptResult = { messages: PromptMessage[]; description?: string };

export type CompleteResult = {
  completion: { values: string[]; hasMore?: boolean; total?: number };
};

export function createHttpMcpTransport(
  baseUrl: string,
  headers?: Record<string, string>
): McpTransport {
  async function rpc<T>(method: string, params: unknown): Promise<T> {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(headers || {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Math.random().toString(36).slice(2),
        method,
        params,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.json().catch(() => ({}));
    if (body && typeof body === "object" && "error" in body && body.error) {
      const message =
        typeof body.error?.message === "string"
          ? body.error.message
          : "MCP error";
      throw new Error(message);
    }
    return body.result as T;
  }

  return {
    listPrompts: (serverId, cursor) =>
      rpc("prompts/list", { serverId, cursor }),
    getPrompt: (serverId, name, args) =>
      rpc("prompts/get", { serverId, name, arguments: args }),
    complete: (serverId, promptName, argName, value, contextArgs) =>
      rpc("completion/complete", {
        serverId,
        ref: { type: "ref/prompt", name: promptName },
        argument: { name: argName, value },
        context: { arguments: contextArgs },
      }),
  };
}
