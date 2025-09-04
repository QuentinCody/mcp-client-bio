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
  const {
    messages,
    chatId,
    selectedModel,
    userId,
    mcpServers = [],
  }: {
    messages: UIMessage[];
    chatId?: string;
    selectedModel: modelID;
    userId: string;
    mcpServers?: MCPServerConfig[];
  } = await req.json();

  const { isBot, isGoodBot } = await checkBotId();

  if (isBot && !isGoodBot) {
    return new Response(
      JSON.stringify({ error: "Bot is not allowed to access this endpoint" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!userId) {
    return new Response(
      JSON.stringify({ error: "User ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const id = chatId || nanoid();

  // Check if chat already exists for the given ID
  // If not, create it now
  let isNewChat = false;
  if (chatId) {
    try {
      const existingChat = await db.query.chats.findFirst({
        where: and(
          eq(chats.id, chatId),
          eq(chats.userId, userId)
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
        userId,
        title,
        messages: [],
      });
    } catch (error) {
      console.error("Error saving new chat:", error);
    }
  }

  // Initialize MCP clients using the already running persistent HTTP/SSE servers
  const { tools, cleanup } = await initializeMCPClients(mcpServers, req.signal);

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

  // Add cache control to tools if it's an object (which it should be for AI SDK)
  let toolsWithCache = tools;
  if (tools && typeof tools === 'object' && !Array.isArray(tools)) {
    // For AI SDK, tools is an object where each key is a tool name
    const toolKeys = Object.keys(tools);
    if (toolKeys.length > 0) {
      // Add cache control to the last tool (most likely to be reused)
      const lastToolKey = toolKeys[toolKeys.length - 1];
      toolsWithCache = {
        ...tools,
        [lastToolKey]: {
          ...tools[lastToolKey as keyof typeof tools],
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral' }
            }
          }
        }
      };
    }
  }

  // Truncate conversation history to manage token usage
  const maxHistoryLength = 10; // Keep only last 10 messages
  const truncatedMessages = messages.length > maxHistoryLength 
    ? [
        messages[0], // Keep first message for context
        ...messages.slice(-maxHistoryLength + 1) // Keep recent messages
      ]
    : messages;

  // Always use the selected model - no automatic fallbacks
  const effectiveModel = selectedModel;

  // For GPT-5 models using Responses API, we need different configuration
  const isGPT5Model = effectiveModel.startsWith('gpt-5');
  
  // Transform tools for GPT-5 Responses API if needed
  let finalTools = toolsWithCache;
  if (isGPT5Model && tools && typeof tools === 'object') {
    finalTools = transformMCPToolsForResponsesAPI(toolsWithCache);
  }
  
  // Base configuration for all models
  const baseConfig = {
    model: model.languageModel(effectiveModel),
    system: systemPrompt,
    messages: truncatedMessages,
    tools: finalTools,
    maxSteps: isComplexQuery ? 20 : 10, // Reduce steps for simple queries
  };

  // Add temperature: GPT-5 only supports temperature: 1, others use 0
  const configWithTemperature = isGPT5Model 
    ? { ...baseConfig, temperature: 1 } // GPT-5 only supports temperature: 1
    : { ...baseConfig, temperature: 0 };

  // Add maxTokens only for non-GPT-5 models  
  const configWithTokens = isGPT5Model
    ? configWithTemperature
    : { ...configWithTemperature, maxTokens: isComplexQuery ? 4000 : 2000 };

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
    // Diagnostic: serialize tool schemas (Zod -> simplified JSON) before first attempt for GPT-5
    if (isGPT5Model && config?.tools && !config.__loggedSchemas) {
      const serialize = (schema: any): any => {
        if (!schema || typeof schema !== 'object') return schema;
        if (schema._def?.typeName === 'ZodObject') {
          const shape = schema._def.shape ? schema._def.shape() : {};
            const properties: Record<string, any> = {};
            for (const [k, v] of Object.entries(shape)) {
              if (v && typeof v === 'object' && (v as any)._def) {
                const tn = (v as any)._def.typeName;
                if (tn === 'ZodString') properties[k] = { type: 'string' };
                else if (tn === 'ZodNumber') properties[k] = { type: 'number' };
                else if (tn === 'ZodBoolean') properties[k] = { type: 'boolean' };
                else if (tn === 'ZodObject') properties[k] = serialize(v);
                else if (tn === 'ZodArray') properties[k] = { type: 'array' };
                else properties[k] = { type: 'any' };
              } else {
                properties[k] = { type: 'any' };
              }
            }
            return {
              type: 'object',
              properties,
              additionalProperties: schema._def.unknownKeys === 'passthrough'
                ? true
                : false
            };
        }
        return schema;
      };
      try {
        const debugTools: Record<string, any> = {};
        for (const [tName, t] of Object.entries(config.tools)) {
          debugTools[tName] = {
            description: (t as any).description,
            serializedParameters: serialize((t as any).parameters)
          };
        }
        // Debug logging removed for performance
        config.__loggedSchemas = true;
      } catch (e) {
        console.warn('Failed to serialize tool schemas for debug:', e);
      }
    }
    try {
      const result = await streamText(config);
      
      // Optimized for streaming performance
      
      return result;
    } catch (error: any) {
      console.error("StreamText error:", error);
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      
      // Check if it's a schema validation error for GPT-5 models
      if (isGPT5Model && retryOnSchemaError && error?.statusCode === 400 && 
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

  const result = await attemptStreamText({
    ...configWithTokens,
    providerOptions: {
      ...(isGPT5Model ? {
        openai: {
          maxCompletionTokens: isComplexQuery ? 4000 : 2000,
          store: false, // Don't store for privacy
          serviceTier: 'auto' // Let OpenAI choose the best tier
        }
      } : {}),
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
      const allMessages = appendResponseMessages({
        messages,
        responseMessages: response.messages,
      });

      await saveChat({
        id,
        userId,
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

  result.consumeStream()
  
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
    
    // If it's the typeName error and we're using GPT-5, try a fallback approach
    if (isGPT5Model && responseError.message && responseError.message.includes('typeName')) {
      console.log("Detected typeName error with GPT-5, attempting fallback...");
      
      // Return a simple error response for now
      return new Response(
        JSON.stringify({ error: "GPT-5 response processing error. This is a known issue being investigated." }),
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