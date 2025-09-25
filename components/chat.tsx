"use client";

import { defaultModel, type modelID } from "@/ai/providers";
import { Message, useChat } from "@ai-sdk/react";
import type { UIMessage } from 'ai';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Textarea } from "./textarea";
import { ProjectOverview } from "./project-overview";
import { Messages } from "./messages";
import { toast } from "sonner";
import { showRateLimitToast } from "@/lib/rate-limit-toast";
import { useRouter, useParams } from "next/navigation";
import { getUserId } from "@/lib/user-id";
import { useLocalStorage } from "@/lib/hooks/use-local-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { convertToUIMessages } from "@/lib/chat-store";
import { type Message as DBMessage } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { ToolMetricsPanel } from "./tool-metrics";
import { ChatSessionToolbar } from "./chat-session-toolbar";
import { useMCP } from "@/lib/context/mcp-context";
import type { SlashCommandMeta } from "@/lib/slash/types";
import { slashRegistry } from "@/lib/slash";
import type { PromptMessage } from "@/lib/context/mcp-context";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import {
  createResolvedPromptContext,
  createResolvedPromptEntry,
  normalizePromptMessages,
  type ResolvedPromptContext,
  type ResolvedPromptEntry,
} from "@/lib/mcp/prompts/resolve";
import { getSlashRuntimeActions, setSlashRuntimeActions } from "@/lib/slash/runtime";
import { isServerLocked } from "@/lib/utils";

// Type for chat data from DB
interface ChatData {
  id: string;
  messages: DBMessage[];
  createdAt: string;
  updatedAt: string;
}

export default function Chat() {
  const router = useRouter();
  const params = useParams();
  const chatId = params?.id as string | undefined;
  const queryClient = useQueryClient();
  
  const [selectedModel, setSelectedModel] = useLocalStorage<modelID>("selectedModel", defaultModel);
  const [userId, setUserId] = useState<string>('');
  const [generatedChatId, setGeneratedChatId] = useState<string>('');
  const [promptPreview, setPromptPreview] = useState<{
    def: SlashPromptDef;
    args: Record<string, string>;
    entry: ResolvedPromptEntry;
    context: ResolvedPromptContext;
    resources: { uri: string; name?: string }[];
    rawMessages: PromptMessage[];
  } | null>(null);
  
  // Get MCP server data from context
  const {
    mcpServersForApi,
    mcpServers,
    selectedMcpServers,
    setSelectedMcpServers,
  } = useMCP();
  
  // Initialize userId
  useEffect(() => {
    setUserId(getUserId());
  }, []);
  
  // Generate a chat ID if needed
  useEffect(() => {
    if (!chatId) {
      setGeneratedChatId(nanoid());
    }
  }, [chatId]);
  
  // Use React Query to fetch chat history
  const { data: chatData, isLoading: isLoadingChat, error } = useQuery({
    queryKey: ['chat', chatId, userId] as const,
    queryFn: async ({ queryKey }) => {
      const [_, chatId, userId] = queryKey;
      if (!chatId || !userId) return null;
      
      const response = await fetch(`/api/chats/${chatId}`, {
        headers: {
          'x-user-id': userId
        }
      });
      
      if (!response.ok) {
        // For 404, return empty chat data instead of throwing
        if (response.status === 404) {
          return { id: chatId, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        }
        throw new Error('Failed to load chat');
      }
      
      return response.json() as Promise<ChatData>;
    },
    enabled: !!chatId && !!userId,
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false
  });
  
  // Handle query errors
  useEffect(() => {
    if (error) {
      console.error('Error loading chat history:', error);
      toast.error('Failed to load chat history');
    }
  }, [error]);
  
  // Prepare initial messages from query data
  const initialMessages = useMemo(() => {
    if (!chatData || !chatData.messages || chatData.messages.length === 0) {
      return [];
    }
    
    // Convert DB messages to UI format, then ensure it matches the Message type from @ai-sdk/react
    const uiMessages = convertToUIMessages(chatData.messages);
    return uiMessages.map(msg => ({
      id: msg.id,
      role: msg.role as Message['role'], // Ensure role is properly typed
      content: msg.content,
      parts: msg.parts,
    } as Message));
  }, [chatData]);
  
  const { messages, input, handleInputChange, handleSubmit, status, stop, setMessages } =
    useChat({
      id: chatId || generatedChatId, // Use generated ID if no chatId in URL
      initialMessages,
      maxSteps: 20,
      headers: {
        'x-model-id': selectedModel,
      },
      body: {
        selectedModel,
        // Fallback: if no servers are selected, include all configured servers for this request
        mcpServers: (mcpServersForApi && (mcpServersForApi as any).length > 0)
          ? mcpServersForApi
          : (mcpServers as any[] || []).map((s: any) => ({ type: s.type, url: s.url, headers: s.headers })),
        chatId: chatId || generatedChatId, // Use generated ID if no chatId in URL
        userId,
        promptContext: promptPreview?.context,
      },
      experimental_prepareRequestBody: ({ id, messages, requestData, requestBody }) => {
        const fromData = (requestData as any) || {};
        const servers = (mcpServersForApi as any)?.length > 0
          ? mcpServersForApi
          : (mcpServers as any[] || []).map((s: any) => ({ type: s.type, url: s.url, headers: s.headers }));
        try { console.log('[CHAT] prepare body servers len=', (servers as any)?.length || 0); } catch {}
        return {
          id,
          messages,
          ...(requestBody as any),
          ...(fromData || {}),
          mcpServers: servers,
          promptContext: promptPreview?.context,
        };
      },
      experimental_throttle: 16, // ~60fps for smoother streaming
      onFinish: () => {
        // Invalidate the chats query to refresh the sidebar
        if (userId) {
          queryClient.invalidateQueries({ queryKey: ['chats', userId] });
        }
      },
      onError: (error) => {
        const errorMessage = error.message.length > 0
          ? error.message
          : "An error occurred, please try again later.";
        
        // Check if this is a rate limit error and show enhanced notification
        if (/rate limit/i.test(errorMessage)) {
          showRateLimitToast(errorMessage, () => {
            // Retry the last message by re-submitting the form
            if (input.trim()) {
              handleSubmit(new Event('submit') as any);
            }
          });
        } else {
          toast.error(errorMessage, { 
            position: "top-center", 
            richColors: true 
          });
        }
      },
    });

  const messagesRef = useRef<Message[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setSlashRuntimeActions({
      clearChat: () => {
        const hadMessages = messagesRef.current.length > 0;
        if (hadMessages) {
          setMessages([]);
        }
        setPromptPreview(null);
        return {
          cleared: hadMessages,
          message: hadMessages ? undefined : "Conversation is already empty.",
        };
      },
    });
    return () => {
      setSlashRuntimeActions({ clearChat: undefined });
    };
  }, [setMessages, setPromptPreview]);

  // Custom submit handler
  const handleFormSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('[CHAT] Submit with model=', selectedModel, 'serversForApiLen=', (mcpServersForApi as any)?.length || 0, 'serversLen=', (mcpServers as any)?.length || 0);

    if (!chatId && generatedChatId && input.trim()) {
      const effectiveChatId = generatedChatId;
      handleSubmit(e);
      router.push(`/chat/${effectiveChatId}`);
    } else {
      handleSubmit(e);
    }
  }, [chatId, generatedChatId, input, handleSubmit, router, mcpServersForApi, mcpServers, selectedModel]);

  const runSlashCommand = useCallback(async (
    command: SlashCommandMeta,
    args: Record<string, string> | string[] | undefined = undefined
  ) => {
    slashRegistry.markUsed(command.id);
    const controller = new AbortController();
    const toastId = toast.loading(`Running /${command.name}…`);
    let messageId: string | null = null;

    const toStream = (value: unknown): ReadableStream<Uint8Array> => {
      if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) {
        return value;
      }
      if (value instanceof Uint8Array) {
        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(value);
            controller.close();
          },
        });
      }
      const encoder = new TextEncoder();
      let text = "";
      if (typeof value === "string") {
        text = value;
      } else if (value == null) {
        text = "";
      } else {
        try {
          text = JSON.stringify(value, null, 2);
        } catch {
          text = String(value);
        }
      }
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(text));
          controller.close();
        },
      });
    };

    const pipeStreamToMessage = async (stream: ReadableStream<Uint8Array>, targetId: string) => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            accumulated += decoder.decode(value, { stream: true });
            const snapshot = accumulated;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === targetId ? { ...msg, content: snapshot } : msg
              )
            );
          }
        }
        accumulated += decoder.decode();
      } finally {
        reader.releaseLock?.();
      }
      const finalText = accumulated.trim();
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === targetId ? { ...msg, content: finalText } : msg
        )
      );
    };

    try {
      let stream: ReadableStream<Uint8Array>;
      if (command.kind === "local") {
        const result = await command.run({ args: args ?? [], signal: controller.signal });
        stream = toStream(result);
      } else {
        const response = await fetch("/api/commands/execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: command.name, args }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Command failed");
          throw new Error(errorText || `Failed to run /${command.name}`);
        }

        if (!response.body) {
          throw new Error("Command response missing body");
        }

        stream = response.body as ReadableStream<Uint8Array>;
      }

      messageId = `slash-${command.id}-${Date.now()}`;
      const newMessage: Message = {
        id: messageId,
        role: "assistant",
        content: "",
      } as Message;
      setMessages((prev) => [...prev, newMessage]);

      await pipeStreamToMessage(stream, messageId);
      toast.success(`/${command.name} completed`, { id: toastId });
    } catch (err) {
      console.error("Slash command failed", err);
      if (messageId) {
        const errorText = err instanceof Error ? err.message : "Unknown error executing command";
        const failedId = messageId;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === failedId
              ? { ...msg, content: `Error: ${errorText}` }
              : msg
          )
        );
      }
      toast.error(`/${command.name} failed`, {
        id: toastId,
        description: err instanceof Error ? err.message : "Unknown error executing command",
      });
    } finally {
      controller.abort();
    }
  }, [setMessages]);

  const isLoading = status === "streaming" || status === "submitted" || isLoadingChat;

  const handlePromptResolved = useCallback((payload: {
    def: SlashPromptDef;
    serverId?: string;
    args: Record<string, string>;
    result: { messages: PromptMessage[]; description?: string };
  }) => {
    const entry = createResolvedPromptEntry(payload.def, payload.args, payload.result.messages as any);
    const context = createResolvedPromptContext(entry);
    const normalized = normalizePromptMessages(payload.result.messages as any);
    const previewText = normalized
      .map((message) => message.text)
      .filter(Boolean)
      .join("\n\n");
    const resources = entry.messages
      .flatMap((message) => message.content || [])
      .filter((item) => item?.type === 'resource')
      .map((item) => {
        const uri = item.resource?.uri ?? (item as any).uri ?? "";
        const name = item.resource?.name ?? (item as any).name;
        return { uri, name };
      })
      .filter((resource) => resource.uri);
    setPromptPreview({
      def: payload.def,
      args: payload.args,
      entry,
      context,
      resources,
      rawMessages: payload.result.messages,
    });
    handleInputChange({ target: { value: previewText } } as any);
  }, [handleInputChange]);

  const cancelPromptPreview = useCallback(() => {
    setPromptPreview(null);
    handleInputChange({ target: { value: "" } } as any);
  }, [handleInputChange]);

  const removePromptResource = useCallback((uri: string) => {
    setPromptPreview((current) => {
      if (!current) return null;
      let changed = false;
      const filteredRaw = current.rawMessages.map((message) => {
        const contentArray = Array.isArray(message.content) ? [...message.content] : [];
        const nextContent = contentArray.filter((item) => {
          const itemUri = item?.resource?.uri ?? (item as any)?.uri;
          if (!itemUri) return true;
          if (itemUri === uri) {
            changed = true;
            return false;
          }
          return true;
        });
        if (!changed) return message;
        return { ...message, content: nextContent } as PromptMessage;
      });
      if (!changed) return current;
      const filteredResources = current.resources.filter((resource) => resource.uri !== uri);
      const entry = createResolvedPromptEntry(current.def, current.args, filteredRaw as any);
      const context = createResolvedPromptContext(entry);
      return { ...current, entry, context, resources: filteredResources, rawMessages: filteredRaw };
    });
  }, []);

  useEffect(() => {
    if (promptPreview && (status === "submitted" || status === "streaming")) {
      setPromptPreview(null);
    }
  }, [promptPreview, status]);

  const toggleServerSelection = useCallback(
    (serverId: string) => {
      if (isServerLocked()) {
        toast.info("MCP servers are locked in this environment.");
        return;
      }

      const server = mcpServers.find((entry) => entry.id === serverId);
      setSelectedMcpServers((prev) => {
        const isSelected = prev.includes(serverId);
        const next = isSelected
          ? prev.filter((id) => id !== serverId)
          : [...prev, serverId];
        if (server) {
          toast.success(
            `${isSelected ? "Disabled" : "Enabled"} ${server.name} for this chat`
          );
        }
        return next;
      });
    },
    [mcpServers, setSelectedMcpServers]
  );

  const openServerManager = useCallback(() => {
    const actions = getSlashRuntimeActions();
    if (actions.openServerManager) {
      actions.openServerManager();
      return;
    }
    toast.info("Open the sidebar to manage MCP servers.");
  }, []);

  const handleToggleMetrics = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("tool-metrics:toggle"));
  }, []);

  // Ensure messages always have parts so the renderer displays user messages
  const displayMessages: UIMessage[] = useMemo(() => {
    return messages.map((m) => {
      if (m.parts && m.parts.length > 0) return m;
      let text = '';
      const anyContent: any = (m as any).content;
      if (typeof anyContent === 'string') text = anyContent;
      else if (Array.isArray(anyContent)) text = anyContent.map((x) => String(x ?? '')).join('\n');
      else if (anyContent && typeof anyContent.toString === 'function') text = anyContent.toString();
      return {
        ...m,
        parts: [{ type: 'text', text } as any],
      } as unknown as UIMessage;
    });
  }, [messages]);

  const showWelcomeState = messages.length === 0 && !isLoadingChat;

  return (
    <div className="relative flex h-dvh w-full">
      <div className="flex h-full w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-8">
        <ToolMetricsPanel />
        <ChatSessionToolbar
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          servers={mcpServers}
          selectedServerIds={selectedMcpServers}
          onToggleServer={toggleServerSelection}
          onOpenServers={openServerManager}
          onToggleMetrics={handleToggleMetrics}
        />
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          <div className="flex-1 min-h-0 overflow-hidden">
            {showWelcomeState ? (
              <div className="h-full overflow-y-auto pr-1">
                <ProjectOverview
                  selectedModel={selectedModel}
                  servers={mcpServers}
                  activeServerIds={selectedMcpServers}
                  onOpenServers={openServerManager}
                  onToggleServer={toggleServerSelection}
                  onToggleMetrics={handleToggleMetrics}
                />
              </div>
            ) : (
              <Messages
                messages={displayMessages}
                isLoading={isLoading}
                status={status as "error" | "submitted" | "streaming" | "ready"}
              />
            )}
          </div>
          <form
            onSubmit={handleFormSubmit}
            className="mx-auto w-full max-w-3xl"
          >
            <Textarea
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              handleInputChange={handleInputChange}
              input={input}
              isLoading={isLoading}
              status={status}
              stop={stop}
              onRunCommand={runSlashCommand}
              onPromptResolved={handlePromptResolved}
              promptPreview={promptPreview ? { resources: promptPreview.resources, sending: isLoading } : null}
              onPromptPreviewCancel={cancelPromptPreview}
              onPromptPreviewResourceRemove={removePromptResource}
              showModelPicker={false}
            />
          </form>
        </div>
      </div>
    </div>
  );
}
