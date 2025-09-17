import { model, type modelID } from "@/ai/providers";
import { smoothStream, streamText, type UIMessage } from "ai";
import { appendResponseMessages } from 'ai';
import { saveChat, saveMessages, convertToDBMessages } from '@/lib/chat-store';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { chats } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { initializeMCPClients, type MCPServerConfig, transformMCPToolsForResponsesAPI } from '@/lib/mcp-client';
import { generateTitle } from '@/app/actions';

import { checkBotId } from "botid/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const messages: UIMessage[] = Array.isArray((body as any).messages) ? (body as any).messages : [];
  const chatId: string | undefined = (body as any).chatId;
  const headerModel = (req.headers as any).get?.('x-model-id') || undefined;
  const selectedModel: modelID = (body as any).selectedModel || headerModel;
  const userId: string = (body as any).userId;
  const mcpServers: MCPServerConfig[] = Array.isArray((body as any).mcpServers) ? (body as any).mcpServers : [];
  const promptContext: {
    entries?: Array<{ id: string; namespace: string; name: string; title?: string; origin?: string; sourceServerId?: string; version?: string; args?: Record<string, string>; messages?: Array<{ role: string; text: string }> }>;
    flattened?: Array<{ role: string; text: string }>;
  } | undefined = (body as any).promptContext;

  const { isBot, isGoodBot } = await checkBotId();
  try {
    console.log('[API /chat] incoming model=', selectedModel, 'headerModel=', headerModel, 'messagesIn=', Array.isArray(messages) ? messages.length : 'N/A');
    if (promptContext) {
      console.log('[API /chat] promptContext entries=', (promptContext.entries || []).length, 'flattened=', (promptContext.flattened || []).length);
      if ((promptContext.entries || []).length) {
        console.log('[API /chat] prompt[0]=', promptContext.entries![0]);
      }
    }
  } catch {}

  if (isBot && !isGoodBot) {
    return new Response(
      JSON.stringify({ error: "Bot is not allowed to access this endpoint" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const effectiveUserId = userId || (req.headers as any).get?.('x-user-id') || 'anon';

  const id = chatId || nanoid();

  // Check if chat already exists for the given ID
  // If not, create it now
  let isNewChat = false;
  if (chatId) {
    try {
      const existingChat = await db.query.chats.findFirst({
        where: and(
          eq(chats.id, chatId),
          eq(chats.userId, effectiveUserId)
        )
      });
      isNewChat = !existingChat;
    } catch (error) {
      console.error("Error checking for existing chat:", error);
      isNewChat = true;
    }
  } else {
    // No ID provided, definitely new
    isNewChat = true;
  }

  // If it's a new chat, save it immediately
  if (isNewChat && messages.length > 0) {
    try {
      // Generate a title based on first user message
      const userMessage = messages.find(m => m.role === 'user');
      let title = 'New Chat';

      if (userMessage) {
        try {
          title = await generateTitle([userMessage]);
        } catch (error) {
          console.error("Error generating title:", error);
        }
      }

      // Save the chat immediately so it appears in the sidebar
      await saveChat({
        id,
        userId: effectiveUserId,
        title,
        messages: [],
      });
    } catch (error) {
      console.error("Error saving new chat:", error);
    }
  }

  // Initialize MCP clients using the already running persistent HTTP/SSE servers
  try { console.log('[API /chat] mcpServers in body len=', Array.isArray(mcpServers)? mcpServers.length : 'N/A', mcpServers && mcpServers[0] ? ('first='+mcpServers[0].url+' type='+mcpServers[0].type) : ''); } catch {}
  const { tools, cleanup } = await initializeMCPClients(mcpServers, req.signal);
  try {
    console.log('[API /chat] initialized tools keys=', tools ? Object.keys(tools) : 'none');
  } catch {}

  // Removed verbose logging for better performance

  // Track if the response has completed
  let responseCompleted = false;

  // Aggressive token reduction strategies
  const isComplexQuery = messages.some(m => 
    m.content?.toString().toLowerCase().includes('analyze') || 
    m.content?.toString().toLowerCase().includes('complex') ||
    m.content?.toString().toLowerCase().includes('detailed')
  );

  // Use shorter system prompt for simple queries
  const shortSystemPrompt = `You are a helpful assistant with access to tools.

The tools are powerful - choose the most relevant one for the user's question.

Multiple tools can be used in a single response. Always respond after using tools.

Response format: Markdown supported. Use tools to answer questions.`;

  const fullSystemPrompt = `You are a helpful assistant with access to a variety of tools.

    Today's date is ${new Date().toISOString().split('T')[0]}.

    The tools are very powerful, and you can use them to answer the user's question.
    So choose the tool that is most relevant to the user's question.

    If tools are not available, say you don't know or if the user wants a tool they can add one from the server icon in bottom left corner in the sidebar.

    You can use multiple tools in a single response.
    Always respond after using the tools for better user experience.
    You can run multiple steps using all the tools!!!!
    Make sure to use the right tool to respond to the user's question.

    Multiple tools can be used in a single response and multiple steps can be used to answer the user's question.

    ## Response Format
    - Markdown is supported.
    - Respond according to tool's response.
    - Use the tools to answer the user's question.
    - If you don't know the answer, use the tools to find the answer or say you don't know.
    `;

  const systemPrompt = isComplexQuery ? fullSystemPrompt : shortSystemPrompt;

  // Always use the selected model - no automatic fallbacks (moved earlier for ordering)
  // Ensure we always have a model id
  const { defaultModel } = await import('@/ai/providers');
  const effectiveModel = (selectedModel as any) || (defaultModel as any);
  // Detect if we are using an Anthropic model for prompt caching specific logic
  const isAnthropicModel = typeof effectiveModel === 'string' && effectiveModel.startsWith('claude');

  // Build structured system blocks for Anthropic prompt caching to avoid re-sending large static instructions counting toward ITPM.
  // We separate static (cacheable) and dynamic (date) parts so that the changing date does not invalidate the cached prefix.
  // NOTE: Attempted structured system blocks for Anthropic caching caused AI SDK error (system must be a string).
  // Keeping system as plain string to satisfy streamText validation.
  // (Future enhancement: leverage providerOptions to pass structured blocks if SDK adds support.)

  // Add cache control to ALL tools (not just last) when using Anthropic to maximize prefix cache hits
  let toolsWithCache = tools;
  if (isAnthropicModel && tools && typeof tools === 'object' && !Array.isArray(tools)) {
    const enriched: Record<string, any> = {};
    for (const [k, v] of Object.entries(tools)) {
      enriched[k] = {
        ...v,
        providerOptions: {
          ...(v as any)?.providerOptions,
          anthropic: {
            ...(v as any)?.providerOptions?.anthropic,
            cacheControl: { type: 'ephemeral', ttl: '1h' }
          }
        }
      };
    }
    toolsWithCache = enriched;
  }

  // Truncate conversation history to manage token usage
  // First sanitize older history to strip high-token reasoning and verbose tool results
  const SANITIZE_KEEP_LAST = 6; // always keep last N messages verbatim
  function sanitizeHistory(msgs: UIMessage[]) {
    if (msgs.length <= SANITIZE_KEEP_LAST + 2) return msgs; // small chats unchanged
    const keepTail = msgs.slice(-SANITIZE_KEEP_LAST);
    const head = msgs.slice(0, -SANITIZE_KEEP_LAST).map((m, idx) => {
      // Preserve very first user message intact for context
      if (idx === 0) return m;
      if (!('parts' in m) || !Array.isArray((m as any).parts)) return m;
      const newParts: any[] = [];
      for (const part of (m as any).parts) {
        if (part.type === 'reasoning') {
          // Drop historical reasoning to save tokens
          continue;
        }
        if (part.type === 'tool-invocation') {
          const toolName = part.toolInvocation?.toolName || 'tool';
            const state = part.toolInvocation?.state;
            let summary = `⧉ ${toolName}`;
            if (state) summary += ` (${state})`;
            if ('result' in part.toolInvocation && part.toolInvocation.result) {
              const textResult = typeof part.toolInvocation.result === 'string'
                ? part.toolInvocation.result
                : JSON.stringify(part.toolInvocation.result);
              // Include a truncated preview (max 140 chars)
              summary += ': ' + textResult.slice(0, 140).replace(/\s+/g, ' ');
              if (textResult.length > 140) summary += '…';
            }
          newParts.push({ type: 'text', text: summary });
          continue;
        }
        if (part.type === 'text') {
          // Optionally compress long past text
          const text: string = part.text || '';
          if (text.length > 1200) {
            newParts.push({ type: 'text', text: text.slice(0, 600) + ' …(truncated older content)… ' + text.slice(-200) });
          } else {
            newParts.push(part);
          }
          continue;
        }
        // Pass through any other part types
        newParts.push(part);
      }
      return { ...m, parts: newParts } as UIMessage;
    });
    return [...head, ...keepTail];
  }

  const sanitizedMessages = sanitizeHistory(messages);

  // Build prompt injection messages (resolved from MCP prompts) to prepend to LLM context
  const promptInjectedMessages: UIMessage[] = [];
  const promptAuditMessage: UIMessage | null = (() => {
    try {
      if (!promptContext || (!promptContext.entries && !promptContext.flattened)) return null;
      // Push the flattened messages for LLM consumption with preserved roles
      for (const m of promptContext.flattened || []) {
        const role = (m.role === 'system' || m.role === 'assistant' || m.role === 'user') ? m.role : 'user';
        promptInjectedMessages.push({
          id: nanoid(),
          role,
          content: m.text,
          parts: [{ type: 'text', text: m.text }],
        } as any);
      }
      // Create a compact audit record for observability
      const audit = {
        type: 'prompt-context',
        at: new Date().toISOString(),
        entries: (promptContext.entries || []).map((e) => ({
          id: e.id,
          namespace: e.namespace,
          name: e.name,
          title: e.title,
          origin: e.origin,
          sourceServerId: e.sourceServerId,
          version: e.version,
          args: e.args || {},
          messageCount: e.messages?.length || 0,
          messages: (e.messages || []).map(m => ({ role: m.role, text: m.text })),
        })),
      };
      return {
        id: nanoid(),
        role: 'system',
        content: '',
        parts: [audit as any],
      } as any as UIMessage;
    } catch {
      return null;
    }
  })();

  const maxHistoryLength = 10; // target maximum messages after sanitization
  // Strip raw slash prompt tokens like "/mcp.server.prompt" from user-visible messages
  const stripTokens = (text: string) => text.replace(/\/[a-z0-9][a-z0-9._-]*\.[a-z0-9][a-z0-9._-]*/gi, '').replace(/\s+/g, ' ').trim();
  const normalizeToParts = (m: UIMessage): UIMessage => {
    if ((m as any).parts && Array.isArray((m as any).parts)) return m;
    const content: any = (m as any).content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((x) => String(x ?? '')).join('\n') : '';
    return { ...m, parts: [{ type: 'text', text }] as any } as UIMessage;
  };
  const baseClientMessages = sanitizedMessages.map((m) => {
    const msg = normalizeToParts(m);
    if (msg.role !== 'user') return msg;
    const newParts = (msg as any).parts.map((p: any) => (p?.type === 'text' ? { ...p, text: stripTokens(String(p.text ?? '')) } : p));
    return { ...msg, parts: newParts } as any;
  });
  const truncatedMessages = baseClientMessages.length > maxHistoryLength 
    ? [
        baseClientMessages[0], // Keep first message for context
        ...baseClientMessages.slice(-maxHistoryLength + 1) // Keep recent messages
      ]
    : baseClientMessages;

  // Base configuration for all models
  const baseConfig = {
    model: model.languageModel(effectiveModel),
    system: systemPrompt, // must remain a string for AI SDK
    messages: truncatedMessages,
    tools: toolsWithCache,
    maxSteps: isComplexQuery ? 20 : 10, // Reduce steps for simple queries
    temperature: 1, // Use temperature: 1 for all models
    maxOutputTokens: isComplexQuery ? 4000 : 2000, // Standard token limits for all models
  };

  // Helper function to create fallback tools with permissive schema
  const createFallbackTools = (originalTools: Record<string, any>) => {
    const fallbackTools: Record<string, any> = {};
    for (const [name, tool] of Object.entries(originalTools)) {
      fallbackTools[name] = {
        ...tool,
        parameters: {
          type: "object",
          additionalProperties: true
        }
      };
    }
    return fallbackTools;
  };

  // Helper function to attempt streamText with retry on schema errors
  const attemptStreamText = async (config: any, retryOnSchemaError = true) => {
    try {
      const result = await streamText(config);
      return result;
    } catch (error: any) {
      console.error("StreamText error:", error);
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      
      // Check if it's a schema validation error and retry with permissive schema
      if (retryOnSchemaError && error?.statusCode === 400 && 
          /invalid_function_parameters/i.test(error?.responseBody ?? "")) {
        
        console.log("Schema validation error detected, retrying with permissive schema...");
        
        // Create fallback config with permissive tool schemas
        const fallbackConfig = {
          ...config,
          tools: createFallbackTools(config.tools || {})
        };
        
        // Retry once with permissive schemas
        return await streamText(fallbackConfig);
      }
      
      throw error;
    }
  };

  console.log('[API /chat] tools count=', tools ? Object.keys(tools).length : 0, 'model=', effectiveModel);
  const result = await attemptStreamText({
    ...baseConfig,
    // Prepend prompt-injected messages (if any) to the current context
    messages: [...promptInjectedMessages, ...truncatedMessages],
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 2048,
        },
      },
      anthropic: {
        thinking: {
          type: 'enabled',
          budgetTokens: 12000
        },
        // Enable caching headers for Anthropic
        headers: {
          'anthropic-beta': 'prompt-caching-2024-07-31'
        }
      }
    },
    experimental_transform: smoothStream({
      delayInMs: 0, // Send tokens as fast as possible
      chunking: 'word', // Stream individual words for responsiveness
    }),
    onError: (error: any) => {
      console.error(JSON.stringify(error, null, 2));
    },
    async onFinish({ response }: { response: any }) {
      responseCompleted = true;
      try {
        const outMsgs = (response as any)?.messages || [];
        let toolParts = 0;
        for (const m of outMsgs) {
          const parts = (m as any)?.parts || [];
          for (const p of parts) if (p?.type === 'tool-invocation') toolParts++;
        }
        console.log('[API /chat] response messages=', outMsgs.length, 'toolParts=', toolParts);
      } catch (err) {
        console.warn('[API /chat] logging response failed:', err);
      }
      const seedMessages = promptAuditMessage ? [promptAuditMessage, ...messages] : messages;
      const allMessages = appendResponseMessages({
        messages: seedMessages,
        responseMessages: response.messages,
      });

      await saveChat({
        id,
        userId: effectiveUserId,
        messages: allMessages,
      });

      const dbMessages = convertToDBMessages(allMessages, id);
      await saveMessages({ messages: dbMessages });

      // Clean up resources - now this just closes the client connections
      // not the actual servers which persist in the MCP context
      await cleanup();
    }
  });

  // Ensure cleanup happens if the request is terminated early
  req.signal.addEventListener('abort', async () => {
    if (!responseCompleted) {
      console.log("Request aborted, cleaning up resources");
      try {
        await cleanup();
      } catch (error) {
        console.error("Error during cleanup on abort:", error);
      }
    }
  });

  // Add chat ID to response headers so client can know which chat was created
  try {
    // Stream response optimized for speed
    return result.toDataStreamResponse({
      sendReasoning: true,
      headers: {
        'X-Chat-ID': id,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable nginx buffering for faster streaming
      },
      getErrorMessage: (error) => {
        console.error("Error in getErrorMessage:", error);
        
        // Helper function to extract rate limit details from various error structures
        const extractRateLimitInfo = (err: any) => {
          const errorStr = err?.toString() || '';
          const messageStr = err?.message || '';
          const responseBodyStr = err?.responseBody || '';
          const fullErrorStr = JSON.stringify(err, null, 2);
          
          // Check if this is a rate limit error from various sources
          const isRateLimit = 
            /rate limit/i.test(errorStr) || 
            /rate limit/i.test(messageStr) || 
            /rate limit/i.test(responseBodyStr) ||
            err?.statusCode === 429;
            
          if (!isRateLimit) return null;
          
          // Extract provider information
          let provider = 'Unknown';
          if (/groq/i.test(fullErrorStr) || /llama/i.test(messageStr)) provider = 'Groq';
          else if (/openai/i.test(fullErrorStr) || /gpt/i.test(messageStr)) provider = 'OpenAI';
          else if (/anthropic/i.test(fullErrorStr) || /claude/i.test(messageStr)) provider = 'Anthropic';
          else if (/google/i.test(fullErrorStr) || /gemini/i.test(messageStr)) provider = 'Google';
          
          // Extract model name
          let model = '';
          const modelMatch = messageStr.match(/model `([^`]+)`/) || 
                           messageStr.match(/model ([a-zA-Z0-9\-\/]+)/);
          if (modelMatch) model = modelMatch[1];
          
          // Extract retry time
          let retryTime = '';
          const retryMatch = messageStr.match(/try again in ([0-9.]+s)/i) ||
                           messageStr.match(/retry-after.*?([0-9.]+)/i);
          if (retryMatch) {
            const seconds = parseFloat(retryMatch[1]);
            if (seconds < 60) {
              retryTime = `${Math.ceil(seconds)} seconds`;
            } else {
              retryTime = `${Math.ceil(seconds / 60)} minutes`;
            }
          }
          
          // Extract token usage info if available
          let tokenInfo = '';
          const tokenMatch = messageStr.match(/Limit ([0-9,]+), Used ([0-9,]+), Requested ([0-9,]+)/);
          if (tokenMatch) {
            const [, limit, used] = tokenMatch;
            const remaining = parseInt(limit.replace(/,/g, '')) - parseInt(used.replace(/,/g, ''));
            tokenInfo = `${remaining.toLocaleString()} tokens remaining of ${limit} limit`;
          }
          
          return {
            provider,
            model,
            retryTime,
            tokenInfo,
            hasUpgradeInfo: /upgrade/i.test(messageStr) || /billing/i.test(messageStr)
          };
        };
        
        // Check if this is the typeName error we're seeing
        if (error && error.toString && error.toString().includes('typeName')) {
          console.log("Detected typeName error in stream processing");
          return "Response processing error occurred.";
        }
        
        // Enhanced rate limit error handling
        const rateLimitInfo = extractRateLimitInfo(error);
        if (rateLimitInfo) {
          let message = `Rate limit exceeded for ${rateLimitInfo.provider}`;
          if (rateLimitInfo.model) {
            message += ` (${rateLimitInfo.model})`;
          }
          
          if (rateLimitInfo.retryTime) {
            message += `. Please try again in ${rateLimitInfo.retryTime}`;
          } else {
            message += '. Please try again later';
          }
          
          if (rateLimitInfo.tokenInfo) {
            message += `. ${rateLimitInfo.tokenInfo}`;
          }
          
          if (rateLimitInfo.hasUpgradeInfo) {
            message += '. Consider upgrading your account for higher limits';
          }
          
          message += '.';
          return message;
        }
        
        // Legacy rate limit detection
        if (error instanceof Error) {
          if (error.message.includes("Rate limit")) {
            return "Rate limit exceeded. Please try again later.";
          }
          if (error.message.includes("typeName")) {
            return "Response processing error occurred.";
          }
        }
        
        console.error("Final error log:", error);
        return "An error occurred.";
      },
    });
  } catch (responseError: any) {
    console.error("Error creating data stream response:", responseError);
    
    // If it's a typeName error, handle gracefully
    if (responseError.message && responseError.message.includes('typeName')) {
      console.log("Detected typeName error, attempting fallback...");
      
      // Return a simple error response for now
      return new Response(
        JSON.stringify({ error: "Response processing error. This is a known issue being investigated." }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Chat-ID': id
          }
        }
      );
    }
    
    throw responseError;
  }
}
