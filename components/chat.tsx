"use client";

import { defaultModel, type modelID } from "@/ai/providers";
import { Message, useChat } from "@ai-sdk/react";
import type { UIMessage } from 'ai';
import { resolvePromptsForInput, type ResolvedPromptContext } from "@/lib/mcp/prompts/resolve";
import { useState, useEffect, useMemo, useCallback } from "react";
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
import { useMCP } from "@/lib/context/mcp-context";

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
  
  // Get MCP server data from context
  const { mcpServersForApi, mcpServers } = useMCP();
  const [lastResolvedContext, setLastResolvedContext] = useState<ResolvedPromptContext | null>(null);
  
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
      },
      experimental_prepareRequestBody: ({ id, messages, requestData, requestBody }) => {
        const fromData = (requestData as any) || {};
        const computedPromptContext = fromData.promptContext ?? (lastResolvedContext
          ? { entries: lastResolvedContext.entries, flattened: lastResolvedContext.flattened }
          : undefined);
        // Recompute servers at send-time to avoid stale closure
        const servers = (mcpServersForApi as any)?.length > 0
          ? mcpServersForApi
          : (mcpServers as any[] || []).map((s: any) => ({ type: s.type, url: s.url, headers: s.headers }));
        try { console.log('[CHAT] prepare body servers len=', (servers as any)?.length || 0); } catch {}
        return {
          id,
          messages,
          ...(requestBody as any),
          ...(fromData || {}),
          promptContext: computedPromptContext,
          mcpServers: servers,
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
    
  // Custom submit handler
  const handleFormSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Resolve prompt tokens to MCP messages for this submit
    let resolved: ResolvedPromptContext | null = null;
    try {
      resolved = await resolvePromptsForInput(input, null, { mcpServers: mcpServers as any });
      setLastResolvedContext(resolved);
    } catch (err) {
      console.error('Prompt resolution failed:', err);
    }
    console.log('[CHAT] Submit with model=', selectedModel, 'serversForApiLen=', (mcpServersForApi as any)?.length || 0, 'serversLen=', (mcpServers as any)?.length || 0, 'resolvedMsgs=', resolved?.flattened?.length || 0);
    // Store a UI-only expansion preview so the sent user message shows what ran
    try {
      if (resolved && resolved.flattened?.length) {
        const serialized = resolved.flattened.map(m => `[${m.role}] ${m.text}`).join('\n');
        const userWithoutTokens = input.replace(/\/[a-z0-9-]+\/[a-z0-9-_]+\b/gi, '').trim();
        const expandedForDisplay = userWithoutTokens ? `${serialized}\n\n${userWithoutTokens}` : serialized;
        localStorage.setItem('last-message-original', input);
        localStorage.setItem('last-message-expanded', expandedForDisplay);
        // Also annotate the user message so expansion is visible even after assistant replies
        setTimeout(() => {
          try {
            setMessages((prev) => {
              if (!Array.isArray(prev) || prev.length === 0) return prev as any;
              let lastUserIndex = -1;
              for (let i = prev.length - 1; i >= 0; i--) {
                const r = (prev[i] as any).role;
                if (r === 'user') { lastUserIndex = i; break; }
              }
              if (lastUserIndex === -1) return prev as any;
              const clone: any[] = [...(prev as any[])];
              const msg = { ...(clone[lastUserIndex] as any) };
              msg.annotations = { ...(msg.annotations || {}), promptExpanded: expandedForDisplay };
              clone[lastUserIndex] = msg;
              console.log('[CHAT] Annotated user message with promptExpanded; chars=', expandedForDisplay.length);
              return clone as any;
            });
          } catch (err) {
            console.warn('[CHAT] Failed to annotate user message with promptExpanded:', err);
          }
        }, 50);
      } else {
        console.log('[CHAT] No prompt resolution; nothing to annotate');
      }
    } catch (err) {
      console.warn('[CHAT] Error preparing UI expansion preview:', err);
    }
    // Keep the input unchanged; preview shows exact text. Structured messages are sent via promptContext.
    
    if (!chatId && generatedChatId && input.trim()) {
      // If this is a new conversation, redirect to the chat page with the generated ID
      const effectiveChatId = generatedChatId;
      
      // Submit the form with prompt context
      handleSubmit(e, { data: { promptContext: resolved || undefined } as any });
      
      // Redirect to the chat page with the generated ID
      router.push(`/chat/${effectiveChatId}`);
    } else {
      // Normal submission for existing chats
      handleSubmit(e, { data: { promptContext: resolved || undefined } as any });
    }
  }, [chatId, generatedChatId, input, handleSubmit, handleInputChange, router, mcpServersForApi, mcpServers]);

  const isLoading = status === "streaming" || status === "submitted" || isLoadingChat;

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

  return (
    <div className="h-dvh flex flex-col justify-center w-full max-w-[430px] sm:max-w-3xl mx-auto px-4 sm:px-6 py-3">
  <ToolMetricsPanel />
      {messages.length === 0 && !isLoadingChat ? (
        <div className="max-w-xl mx-auto w-full">
          <ProjectOverview />
          <form
            onSubmit={handleFormSubmit}
            className="mt-4 w-full mx-auto"
          >
            <Textarea
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              handleInputChange={handleInputChange}
              input={input}
              isLoading={isLoading}
              status={status}
              stop={stop}
            />
          </form>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto min-h-0 pb-2">
            <Messages messages={displayMessages} isLoading={isLoading} status={status} />
          </div>
          <form
            onSubmit={handleFormSubmit}
            className="mt-2 w-full mx-auto"
          >
            <Textarea
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              handleInputChange={handleInputChange}
              input={input}
              isLoading={isLoading}
              status={status}
              stop={stop}
            />
          </form>
        </>
      )}
    </div>
  );
}
