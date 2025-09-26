"use client";

import { defaultModel, modelDetails, type modelID } from "@/ai/providers";
import { Message, useChat } from "@ai-sdk/react";
import type { UIMessage } from 'ai';
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Textarea } from "./textarea";
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
import { Button } from "./ui/button";
import { ServerIcon, ArrowDown } from "lucide-react";
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
import { useScrollToBottom } from "@/lib/hooks/use-scroll-to-bottom";
import { AnimatePresence, motion } from "motion/react";
import { ChatHeader } from "./chat-header";

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
  
  const { mcpServersForApi, mcpServers, selectedMcpServers } = useMCP();
  
  useEffect(() => {
    setUserId(getUserId());
  }, []);
  
  useEffect(() => {
    if (!chatId) {
      setGeneratedChatId(nanoid());
    }
  }, [chatId]);
  
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
        if (response.status === 404) {
          return { id: chatId, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        }
        throw new Error('Failed to load chat');
      }
      
      return response.json() as Promise<ChatData>;
    },
    enabled: !!chatId && !!userId,
    retry: 1,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });
  
  useEffect(() => {
    if (error) {
      console.error('Error loading chat history:', error);
      toast.error('Failed to load chat history');
    }
  }, [error]);
  
  const initialMessages = useMemo(() => {
    if (!chatData || !chatData.messages || chatData.messages.length === 0) {
      return [];
    }
    
    const uiMessages = convertToUIMessages(chatData.messages);
    return uiMessages.map(msg => ({
      id: msg.id,
      role: msg.role as Message['role'],
      content: msg.content,
      parts: msg.parts,
    } as Message));
  }, [chatData]);
  
  const { messages, input, handleInputChange, handleSubmit, status, stop, setMessages } = 
    useChat({
      api: '/api/chat',
      id: chatId || generatedChatId,
      initialMessages,
      headers: {
        'x-model-id': selectedModel,
      },
      body: {
        selectedModel,
        mcpServers: mcpServersForApi,
        chatId: chatId || generatedChatId,
        userId,
        promptContext: promptPreview?.context,
      },
      onFinish: () => {
        setPromptPreview(null);
        if (userId) {
          queryClient.invalidateQueries({ queryKey: ['chats', userId] });
        }
        setTimeout(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>(
            'textarea[data-command-target="chat-input"]'
          );
          textarea?.focus();
        }, 100);
      },
      onError: (error) => {
        const errorMessage = error.message.length > 0
          ? error.message
          : "An error occurred, please try again later.";
        if (/rate limit/i.test(errorMessage)) {
          showRateLimitToast(errorMessage, () => {
            if (input.trim()) {
              handleSubmit();
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
  const [containerRef, endRef, isPinned, scrollToBottom] = useScrollToBottom();

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

  const isChatLoading = status === "streaming" || status === "submitted" || isLoadingChat;

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setPromptPreview(null);
    setGeneratedChatId(nanoid());
    router.push("/");
  }, [router, setMessages, setPromptPreview, setGeneratedChatId]);

  const handleFormSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isChatLoading) return;
    if (!chatId && generatedChatId) {
      const effectiveChatId = generatedChatId;
      handleSubmit(e);
      router.push(`/chat/${effectiveChatId}`);
    } else {
      handleSubmit(e);
    }
  }, [chatId, generatedChatId, input, handleSubmit, router, isChatLoading]);

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
    if (promptPreview && status === "streaming") {
      setPromptPreview(null);
    }
  }, [promptPreview, status]);

  const openServerManager = useCallback(() => {
    const actions = getSlashRuntimeActions();
    if (actions.openServerManager) {
      actions.openServerManager();
      return;
    }
    toast.info("Open the sidebar to manage MCP servers.");
  }, []);

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
  const modelInfo = useMemo(() => modelDetails[selectedModel], [selectedModel]);
  const serverStatusCounts = useMemo(() => {
    const counts = {
      total: selectedMcpServers.length,
      online: 0,
      connecting: 0,
      error: 0,
    };
    if (!Array.isArray(mcpServers) || mcpServers.length === 0) {
      return counts;
    }
    selectedMcpServers.forEach((serverId) => {
      const server = mcpServers.find((entry) => entry.id === serverId);
      if (!server) return;
      if (server.status === "connected") {
        counts.online += 1;
      } else if (server.status === "connecting") {
        counts.connecting += 1;
      } else if (server.status === "error") {
        counts.error += 1;
      }
    });
    return counts;
  }, [mcpServers, selectedMcpServers]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col bg-[#f7f7f8] dark:bg-[#0d0d0d]">
      <ToolMetricsPanel />
      <div className="flex h-full min-h-0 flex-col">
        <ChatHeader
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          onNewChat={handleNewChat}
          onOpenServerManager={openServerManager}
          serverStatusCounts={serverStatusCounts}
          status={status as "error" | "submitted" | "streaming" | "ready"}
        />
        <div
          className="relative flex-1 min-h-0 overflow-hidden"
        >
          <div
            className="no-scrollbar h-full min-h-0 overflow-y-auto"
            ref={containerRef}
          >
            {showWelcomeState ? (
              <div className="flex h-full items-center justify-center px-6 py-12">
                <div className="w-full max-w-2xl space-y-4 text-center">
                  <h1 className="text-2xl font-semibold text-[#202123] dark:text-[#f7f7f8]">
                    Ready to chat
                  </h1>
                  <p className="text-sm text-[#5f6368] dark:text-[#9ca3af]">
                    {modelInfo
                      ? `Using ${modelInfo.name} with ${
                          serverStatusCounts.total > 0
                            ? `${serverStatusCounts.online}/${serverStatusCounts.total}`
                            : "0"
                        } servers active`
                      : "Configure your model and servers to get started"}
                  </p>
                  {serverStatusCounts.total === 0 && (
                    <div className="flex items-center justify-center">
                      <Button
                        variant="outline"
                        onClick={openServerManager}
                        className="gap-2 border-[#d4d4d4] bg-white text-[#202123] hover:bg-[#f2f2f2] dark:border-[#2b2b2b] dark:bg-[#141414] dark:text-[#f7f7f8] dark:hover:bg-[#1f1f1f]"
                      >
                        <ServerIcon className="h-4 w-4" />
                        Setup MCP Servers
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <Messages
                messages={displayMessages}
                isLoading={isChatLoading}
                status={status as "error" | "submitted" | "streaming" | "ready"}
                endRef={endRef}
              />
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {!isPinned && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={() => scrollToBottom("smooth")}
            className="group absolute bottom-24 right-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/95 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/10 hover:shadow-xl"
            aria-label="Scroll to bottom to follow conversation"
          >
            <ArrowDown className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
            {status === "streaming" ? "Follow stream" : "Resume live view"}
          </motion.button>
        )}
      </AnimatePresence>
      <div className="shrink-0 border-t border-[#e3e3e3] bg-white/95 px-4 py-5 shadow-[0_-8px_24px_rgba(15,15,15,0.05)] dark:border-[#1f1f1f] dark:bg-[#090909]/95">
        <div className="mx-auto w-full max-w-4xl">
          <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
            <Textarea
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              handleInputChange={handleInputChange}
              input={input}
              isLoading={isChatLoading}
              status={status}
              stop={stop}
              onRunCommand={runSlashCommand}
              onPromptResolved={handlePromptResolved}
              promptPreview={promptPreview ? { resources: promptPreview.resources, sending: isChatLoading } : null}
              onPromptPreviewCancel={cancelPromptPreview}
              onPromptPreviewResourceRemove={removePromptResource}
              showModelPicker={false}
              modelPickerVariant="inline"
            />
          </form>
        </div>
      </div>
    </div>
  );
}
