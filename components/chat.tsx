"use client";

import { defaultModel, modelDetails, MODELS, type modelID } from "@/ai/providers";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
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
import { ServerIcon, ArrowDown, Plus, Loader2, Sparkles, ChevronsDown } from "lucide-react";
import { useMCP } from "@/lib/context/mcp-context";
import { cn } from "@/lib/utils";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";

const MESSAGE_WINDOW_SIZE = 45;

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
  const [isModelSheetOpen, setIsModelSheetOpen] = useState(false);
  // Generate chatId immediately if not provided, don't use useState to avoid async issues
  const generatedChatId = useMemo(() => {
    return chatId ? '' : nanoid();
  }, [chatId]);
  const [promptPreview, setPromptPreview] = useState<{ 
    def: SlashPromptDef;
    args: Record<string, string>;
    entry: ResolvedPromptEntry;
    context: ResolvedPromptContext | null;
    resources: { uri: string; name?: string }[];
    rawMessages: PromptMessage[];
  } | null>(null);
  
  const { mcpServersForApi, mcpServers, selectedMcpServers } = useMCP();
  
  useEffect(() => {
    const id = getUserId();
    setUserId(id);
  }, []);

  const { data: chatData, isLoading: isLoadingChat, error } = useQuery({
    queryKey: ['chat', chatId, userId] as const,
    queryFn: async ({ queryKey }) => {
      const [_, chatId, userId] = queryKey;
      if (!chatId || !userId) {
        return null;
      }

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

      const data = await response.json() as ChatData;
      return data;
    },
    enabled: !!chatId && !!userId,
    retry: 1,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => query.isStale(), // Only re-fetch on mount when data is stale
  });

  useEffect(() => {
    if (error) {
      console.error('Error loading chat history:', error);
      toast.error('Failed to load chat history');
    }
  }, [error, chatId, userId]);
  
  const initialMessages = useMemo(() => {
    if (isLoadingChat || !userId || !chatId) {
      return [];
    }

    if (!chatData || !chatData.messages || chatData.messages.length === 0) {
      return [];
    }

    return convertToUIMessages(chatData.messages) as UIMessage[];
  }, [chatData, chatId, isLoadingChat, userId]);
  
  const chatSessionId = chatId || generatedChatId;

  const { messages, sendMessage, status, stop, setMessages } =
    useChat({
      id: chatSessionId,
      messages: initialMessages,
      transport: new DefaultChatTransport({
        api: '/api/chat',
        credentials: 'include',
      }),
      onFinish: useCallback(() => {
        setPromptPreview(null);
        if (userId) {
          queryClient.invalidateQueries({ queryKey: ['chats', userId] });
        }

        // Update URL without navigation if we're on home page with new chat
        const isHomePage = window?.location?.pathname === '/';
        if (isHomePage && !chatId && generatedChatId) {
          window.history.replaceState(null, '', `/chat/${generatedChatId}`);
        }

        // Focus textarea for continued conversation
        setTimeout(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>(
            'textarea[data-command-target="chat-input"]'
          );
          textarea?.focus();
        }, 100);
      }, [setPromptPreview, userId, queryClient, chatId, generatedChatId]),
      onError: (error) => {
        console.error('useChat onError:', error);
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

  const [input, setInput] = useState<string>("");

  // Update messages when initial messages load
  useEffect(() => {
    if (initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages, messages.length, setMessages, chatId]);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(event.target.value);
    },
    []
  );

  const handleSubmit = useCallback(
    (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault?.();
      if (!input.trim()) return;
      if (status === "streaming" || status === "submitted") return;
      const chatBody = {
        selectedModel,
        mcpServers: mcpServersForApi,
        chatId: chatId || generatedChatId,
        userId,
        promptContext: promptPreview?.context,
      };
      sendMessage(
        {
          role: 'user',
          parts: [{ type: 'text', text: input }]
        },
        {
          headers: {
            'x-model-id': selectedModel,
          },
          body: chatBody,
        }
      );
      setInput("");
    },
    [
      input,
      status,
      selectedModel,
      mcpServersForApi,
      chatId,
      generatedChatId,
      userId,
      promptPreview,
      sendMessage,
    ]
  );

  const messagesRef = useRef<UIMessage[]>(messages);
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
    router.push("/");
  }, [router, setMessages, setPromptPreview]);

  const handleFormSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isChatLoading) return;
    // Always just submit - let onFinish handle navigation for new chats
    handleSubmit();
  }, [input, handleSubmit, isChatLoading]);

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

    const toTextParts = (text: string): UIMessage["parts"] => [
      { type: "text", text },
    ];

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
                msg.id === targetId
                  ? { ...msg, parts: toTextParts(snapshot) }
                  : msg
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
          msg.id === targetId
            ? { ...msg, parts: toTextParts(finalText) }
            : msg
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
      const newMessage: UIMessage = {
        id: messageId,
        role: "assistant",
        parts: toTextParts(""),
      };
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
              ? { ...msg, parts: toTextParts(`Error: ${errorText}`) }
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
    const context = payload.def.origin === 'client-prompt'
      ? null
      : createResolvedPromptContext(entry);
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
    setInput(previewText);
  }, [setInput]);

  const cancelPromptPreview = useCallback(() => {
    setPromptPreview(null);
    setInput("");
  }, [setInput]);

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
    const subset =
      messages.length > MESSAGE_WINDOW_SIZE
        ? messages.slice(-MESSAGE_WINDOW_SIZE)
        : messages;

    return subset.map((m) => {
      if (m.parts && m.parts.length > 0) return m;
      let text = "";
      const anyContent: any = (m as any).content;
      if (typeof anyContent === "string") text = anyContent;
      else if (Array.isArray(anyContent))
        text = anyContent.map((x) => String(x ?? "")).join("\n");
      else if (anyContent && typeof anyContent.toString === "function")
        text = anyContent.toString();
      return {
        ...m,
        parts: [{ type: "text", text } as any],
      } as unknown as UIMessage;
    });
  }, [messages]);

  const showWelcomeState = messages.length === 0 && !isLoadingChat;
  const disableMessageAnimations = status === "ready";
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

  const statusLabel = (() => {
    if (status === "streaming") return "Streaming";
    if (status === "submitted") return "Thinking";
    if (status === "error") return "Error";
    return "Ready";
  })();

  const mobileStatusTone = (() => {
    if (status === "streaming") {
      return "bg-gradient-to-r from-success/10 to-success/5 text-success border border-success/20 shadow-sm dark:from-success/20 dark:to-success/10 dark:border-success/30";
    }
    if (status === "submitted") {
      return "bg-gradient-to-r from-warning/10 to-warning/5 text-warning border border-warning/20 shadow-sm dark:from-warning/20 dark:to-warning/10 dark:border-warning/30";
    }
    if (status === "error") {
      return "bg-gradient-to-r from-destructive/10 to-destructive/5 text-destructive border border-destructive/20 shadow-sm dark:from-destructive/20 dark:to-destructive/10 dark:border-destructive/30";
    }
    return "bg-gradient-to-r from-info/10 to-info/5 text-info border border-info/20 shadow-sm dark:from-info/20 dark:to-info/10 dark:border-info/30";
  })();

  const serverSummary =
    serverStatusCounts.total > 0
      ? `${serverStatusCounts.online}/${serverStatusCounts.total} online`
      : "No servers configured";

  const mobileModelName = modelInfo?.name ?? "Model";

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col bg-background">
      <div className="hidden sm:block">
        <ToolMetricsPanel />
        <ChatHeader
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          onNewChat={handleNewChat}
          onOpenServerManager={openServerManager}
          serverStatusCounts={serverStatusCounts}
          status={status as "error" | "submitted" | "streaming" | "ready"}
        />
      </div>
      <div className="flex h-full min-h-0 flex-col">
        <div className="sm:hidden border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="px-4 py-3 pt-[60px]">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsModelSheetOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="truncate">{mobileModelName}</span>
                <ChevronsDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {(status === "streaming" || status === "submitted") && (
                <span className="flex items-center gap-1.5 text-xs text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {statusLabel}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <ServerIcon className="h-3 w-3" />
              <span>{serverSummary}</span>
            </div>
          </div>
        </div>
        <div
          className="relative flex-1 min-h-0 overflow-hidden"
        >
          <div
            className="no-scrollbar h-full min-h-0 overflow-y-auto"
            ref={containerRef}
          >
            {showWelcomeState ? (
              <div className="flex h-full items-center justify-center px-4 sm:px-6 py-12 sm:py-16">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="w-full max-w-lg space-y-6 text-center"
                >
                  <div className="space-y-4">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10">
                      <Sparkles className="h-7 w-7 text-primary" />
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-semibold text-foreground">
                      Bio MCP Chat
                    </h1>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      {modelInfo
                        ? `${modelInfo.name}${
                            serverStatusCounts.total > 0
                              ? ` · ${serverStatusCounts.online}/${serverStatusCounts.total} servers`
                              : ""
                          }`
                        : "Configure your model and servers to get started"}
                    </p>
                  </div>
                  {serverStatusCounts.total === 0 && (
                    <Button
                      variant="default"
                      onClick={openServerManager}
                      className="gap-2"
                    >
                      <ServerIcon className="h-4 w-4" />
                      Connect Servers
                    </Button>
                  )}
                </motion.div>
              </div>
            ) : (
              <Messages
                messages={displayMessages}
                isLoading={isChatLoading}
                status={status as "error" | "submitted" | "streaming" | "ready"}
                disableAnimations={disableMessageAnimations}
                endRef={endRef}
              />
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {!isPinned && (
          <motion.button
            key="scroll-to-bottom"
            type="button"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={() => scrollToBottom("smooth")}
            className="absolute bottom-[140px] sm:bottom-24 right-4 sm:right-6 flex items-center gap-2 rounded-full bg-background border border-border px-3 py-2 text-xs font-medium text-muted-foreground shadow-md hover:bg-muted transition-colors"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Scroll to bottom</span>
          </motion.button>
        )}
      </AnimatePresence>

      <Sheet open={isModelSheetOpen} onOpenChange={setIsModelSheetOpen}>
        <SheetContent
          side="bottom"
          className="z-[60] w-full max-w-full rounded-t-2xl border border-border bg-background px-0 pt-5 pb-6"
        >
          <div className="px-4 pb-3">
            <SheetHeader>
              <SheetTitle className="text-base font-medium">
                Select Model
              </SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                Choose an AI model
              </SheetDescription>
            </SheetHeader>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-3">
            <div className="space-y-1">
              {MODELS.map((id) => {
                const modelId = id as modelID;
                const model = modelDetails[modelId];
                const isSelected = selectedModel === modelId;

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setSelectedModel(modelId);
                      setIsModelSheetOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors",
                      isSelected
                        ? "bg-primary/10"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Sparkles className={cn(
                        "h-4 w-4 flex-shrink-0",
                        model.provider === "Anthropic" && "text-orange-500",
                        model.provider === "OpenAI" && "text-green-500",
                        model.provider === "Google" && "text-blue-500",
                        model.provider === "Groq" && "text-purple-500",
                        model.provider === "XAI" && "text-yellow-500"
                      )} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-foreground">
                          {model.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {model.provider}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <svg className="h-2.5 w-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Floating Action Buttons for Mobile */}
      <div className="sm:hidden absolute bottom-[140px] left-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleNewChat}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-95"
          aria-label="New chat"
        >
          <Plus className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={openServerManager}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-background border border-border text-foreground shadow-md transition-transform active:scale-95"
          aria-label="MCP Servers"
        >
          <ServerIcon className={cn(
            "h-4 w-4",
            serverStatusCounts.online > 0 ? "text-success" : "text-muted-foreground"
          )} />
        </button>
      </div>
      <div className="shrink-0 border-t border-border bg-background px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 sm:py-5">
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
              promptPreview={promptPreview ? { def: promptPreview.def, args: promptPreview.args, resources: promptPreview.resources, sending: isChatLoading } : null}
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
