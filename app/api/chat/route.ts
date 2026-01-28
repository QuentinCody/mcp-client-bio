import { model, type modelID } from "@/ai/providers";
import { convertToModelMessages, dynamicTool, smoothStream, stepCountIs, streamText, type UIMessage } from "ai";
import { saveChat, saveMessages, convertToDBMessages } from '@/lib/chat-store';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { chats } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { initializeMCPClients, type MCPServerConfig, transformMCPToolsForResponsesAPI } from '@/lib/mcp-client';
import { generateTitle } from '@/app/actions';
import { z } from 'zod';
import { checkBotId } from "botid/server";
import { parse } from "acorn";
import {
  TokenUsage,
  createEmptyTokenUsage,
  mergeTokenUsage,
  recordTokenUsage,
  recordToolTokenUsage,
  resolveTotalTokens,
} from '@/lib/token-usage';
import {
  groupToolsByServer,
  generateHelpersImplementation,
  generateHelpersMetadata,
  createToolRegistry,
  type ToolRegistry,
} from '@/lib/code-mode/dynamic-helpers';
import { generateTransformingHelpersImplementation } from '@/lib/code-mode/helpers-with-transform';
// generateUsageExamples disabled - using API-only mode (uncomment to re-enable static examples)
import { generateCompactHelperDocs, generateCompactResponseTypeHints, generateCompactToolSchemas /* , generateUsageExamples */ } from '@/lib/code-mode/helper-docs';
import { generateHelperAPITypes, generateCompactHelperAPITypes } from '@/lib/code-mode/schema-to-typescript';
import { getCodeModeServers } from '@/lib/codemode/servers';

function validateCodeModeSnippet(code: string) {
  // First, check for forbidden patterns
  const forbiddenPatterns = [
    {
      pattern: /^\s*(?:async\s+)?function\s+\w+/m,
      message: 'Function declarations are not allowed. Use arrow functions or top-level code instead.\n\nGOOD:\nconst result = await helpers.server.invoke(...);\nreturn result;\n\nBAD:\nasync function myFunc() { ... }\nreturn myFunc();'
    },
    {
      pattern: /:\s*(?:string|number|boolean|any|void|object)\s*[,;=)]/,
      message: 'TypeScript type annotations are not allowed. Remove type annotations.\n\nGOOD:\nconst name = "value";\n\nBAD:\nconst name: string = "value";'
    },
    {
      pattern: /\bas\s+(?:string|number|boolean|any|unknown|object)\b/,
      message: 'TypeScript type assertions (as Type) are not allowed.\n\nGOOD:\nconst value = someVar;\n\nBAD:\nconst value = someVar as string;'
    }
  ];

  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(code)) {
      throw new Error(message);
    }
  }

  // Then validate syntax
  const wrapped = `(async () => {\n${code}\n})();`;
  try {
    parse(wrapped, { ecmaVersion: "latest", sourceType: "script" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Syntax error: ${message}`);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const messages: UIMessage[] = Array.isArray((body as any).messages) ? (body as any).messages : [];
  const chatId: string | undefined = (body as any).chatId;
  const headerModel = (req.headers as any).get?.('x-model-id') || undefined;
  const selectedModel: modelID = (body as any).selectedModel || headerModel;
  const userId: string = (body as any).userId;
  const mcpServers: MCPServerConfig[] = Array.isArray((body as any).mcpServers) ? (body as any).mcpServers : [];
  const codemodeWorkerUrl = process.env.CODEMODE_WORKER_URL;
  const useCodeMode = !!codemodeWorkerUrl;
  const codeModeServers = useCodeMode ? getCodeModeServers() : [];
  const mergedMcpServers = useCodeMode
    ? (() => {
        const existingUrls = new Set(mcpServers.map(server => server.url));
        const extras = codeModeServers.filter(server => !existingUrls.has(server.url));
        return [...mcpServers, ...extras];
      })()
    : mcpServers;
  if (useCodeMode) {
    // Initialization logs commented out - not relevant to JSON response debugging
    // try {
    //   console.log('[API /chat] Code Mode servers added:', codeModeServers.map(s => `${s.name || s.url}(${s.url})`).join(', '));
    //   console.log('[API /chat] merged MCP servers:', mergedMcpServers.map(s => `${s.name || s.url}(${s.url})`).join(', '));
    // } catch (err) {
    //   console.error('[API /chat] failed to log merged MCP servers', err);
    // }
  }
  const promptContext: {
    entries?: Array<{ id: string; namespace: string; name: string; title?: string; origin?: string; sourceServerId?: string; version?: string; args?: Record<string, string>; messages?: Array<{ role: string; text: string }> }>;
    flattened?: Array<{ role: string; text: string }>;
  } | undefined = (body as any).promptContext;

  const { isBot, isVerifiedBot } = await checkBotId();
  // Initialization logs commented out - not relevant to JSON response debugging
  // try {
  //   console.log('[API /chat] incoming model=', selectedModel, 'headerModel=', headerModel, 'messagesIn=', Array.isArray(messages) ? messages.length : 'N/A');
  //   if (promptContext) {
  //     console.log('[API /chat] promptContext entries=', (promptContext.entries || []).length, 'flattened=', (promptContext.flattened || []).length);
  //     if ((promptContext.entries || []).length) {
  //       console.log('[API /chat] prompt[0]=', promptContext.entries![0]);
  //     }
  //   }
  // } catch {}

  if (isBot && !isVerifiedBot) {
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
  // Initialization log commented out - not relevant to JSON response debugging
  // try { console.log('[API /chat] mcpServers in body len=', Array.isArray(mcpServers)? mcpServers.length : 'N/A', mcpServers && mcpServers[0] ? ('first='+mcpServers[0].url+' type='+mcpServers[0].type) : ''); } catch {}
  const { tools: rawTools, toolsByServer, cleanup } = await initializeMCPClients(mergedMcpServers, req.signal);

  // Transform MCP tools for compatibility with AI providers
  const tools = transformMCPToolsForResponsesAPI(rawTools);

  // Log per-server tool counts for token usage analysis
  if (toolsByServer && toolsByServer.size > 0) {
    const serverCounts = Array.from(toolsByServer.entries())
      .map(([serverName, serverData]) => `${serverName}:${Object.keys(serverData.tools).length}`)
      .sort((a, b) => {
        const countA = parseInt(a.split(':')[1]);
        const countB = parseInt(b.split(':')[1]);
        return countB - countA; // Sort by count descending
      });
    console.log('[API /chat] Tools by server:', serverCounts.join(', '));
    console.log('[API /chat] Total tools:', rawTools.length, 'across', toolsByServer.size, 'servers');
  }

  // Initialization log commented out - not relevant to JSON response debugging
  // try {
  //   console.log('[API /chat] initialized tools keys=', tools ? Object.keys(tools) : 'none');
  // } catch {}

  // Removed verbose logging for better performance

  // Track if the response has completed
  let responseCompleted = false;

  // Aggressive token reduction strategies
  const extractText = (message: UIMessage) => {
    if (Array.isArray((message as any).parts)) {
      return (message as any).parts
        .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
        .map((part: any) => part.text as string)
        .join(' ')
        .toLowerCase();
    }

    const content: any = (message as any).content;
    if (typeof content === 'string') {
      return content.toLowerCase();
    }
    if (Array.isArray(content)) {
      return content
        .map((value) => String(value ?? ''))
        .join(' ')
        .toLowerCase();
    }
    return '';
  };

  const complexityKeywords = ['analyze', 'complex', 'detailed'];
  const isComplexQuery = messages.some((message) => {
    const text = extractText(message);
    return complexityKeywords.some((keyword) => text.includes(keyword));
  });

  // Check if codemode is available and generate dynamic helper docs
  // (Variables already defined earlier)

  // Generate dynamic helper documentation from connected MCP servers
  let helpersDocs = '';
  let helpersMetadata: ReturnType<typeof generateHelpersMetadata> | undefined;
  let helpersImplementation: string | undefined;

  if (useCodeMode && mergedMcpServers.length > 0) {
    // Group tools by server for dynamic helper generation
    // Only use Code Mode servers (datacite, ncigdc, entrez) for helper generation
    const serverToolMap = groupToolsByServer(toolsByServer, codeModeServers);
    helpersMetadata = generateHelpersMetadata(serverToolMap);

    // Generate TypeScript API definitions for system prompt (like Cloudflare blog post)
    // This shows all available methods: helpers.server.toolName(args) instead of helpers.server.invoke('toolName', args)
    const serverToolsMap = new Map(
      Array.from(serverToolMap.entries()).map(([key, value]) => [key, value.tools])
    );
    // Use compact type definitions to reduce token usage by ~80%
    const typeDefinitions = generateCompactHelperAPITypes(serverToolsMap);

    // Generate dynamic examples from first available server (no hardcoded server names)
    const serverEntries = Array.from(serverToolsMap.entries());
    const firstServer = serverEntries[0];
    const firstServerName = firstServer?.[0] || 'server';
    const firstServerTools = firstServer?.[1] || {};
    const firstToolName = Object.keys(firstServerTools)[0] || 'tool_name';

    const baseHelperDocs = `## Helper APIs

${typeDefinitions}

Call tools via: \`await helpers.SERVER.toolName(args)\` or \`await helpers.SERVER.getData("toolName", args)\`
Discover tools: \`await helpers.SERVER.listTools()\` or \`await helpers.SERVER.searchTools("query")\`
Get params: \`await helpers.SERVER.getToolSchema("toolName")\`
Utils: \`helpers.utils.safeGet(obj, "path", fallback)\`, \`helpers.utils.hasValue(val)\``;

    // Static usage examples disabled - relying on dynamic API type definitions only
    // To re-enable, uncomment the following lines:
    // const usageExamples = generateUsageExamples();
    // helpersDocs = baseHelperDocs + '\n\n' + usageExamples + '\n\n' + sqlDocs;

    // Add SQL helper documentation (keeping this as it documents runtime helpers.sql.* API)
    const { generateSQLHelperDocs } = await import('@/lib/code-mode/sql-helpers');
    const sqlDocs = generateSQLHelperDocs();

    // Add response type hints to help LLMs understand API response shapes
    const responseTypeHints = generateCompactResponseTypeHints();

    // Add tool parameter schemas to help LLMs avoid "Invalid parameters" errors
    const toolSchemas = generateCompactToolSchemas();

    // API-only mode: type definitions + response type hints + tool schemas + SQL helpers
    helpersDocs = baseHelperDocs + '\n\n' + responseTypeHints + '\n\n' + toolSchemas + '\n\n' + sqlDocs;

    // Log documentation component sizes for token analysis
    console.log('[API /chat] Helper docs breakdown (API-only mode):');
    console.log('  - Type definitions:', typeDefinitions.length, 'chars');
    console.log('  - Base helper docs:', baseHelperDocs.length, 'chars');
    console.log('  - Response type hints:', responseTypeHints.length, 'chars');
    console.log('  - Tool schemas:', toolSchemas.length, 'chars');
    console.log('  - SQL docs:', sqlDocs.length, 'chars');
    console.log('  - Total helpersDocs:', helpersDocs.length, 'chars (~', Math.round(helpersDocs.length / 4), 'tokens)');

    const aliasMap: Record<string, string> = {};
    if (!aliasMap.mcp) {
      const httpServer = Array.from(serverToolMap.entries()).find(
        ([, data]) => data.config.type === "http"
      );
      if (httpServer) aliasMap.mcp = httpServer[0];
    }
    if (!aliasMap.sse) {
      const sseServer = Array.from(serverToolMap.entries()).find(
        ([, data]) => data.config.type === "sse"
      );
      if (sseServer) aliasMap.sse = sseServer[0];
    }
    if (!aliasMap.mcp && serverToolMap.size > 0) {
      aliasMap.mcp = Array.from(serverToolMap.keys())[0];
    }
    // Log Code Mode server tool counts
    const codeModeToolCounts = Array.from(serverToolMap.entries())
      .map(([key, data]) => `${key}:${Object.keys(data.tools).length}`)
      .sort((a, b) => {
        const countA = parseInt(a.split(':')[1]);
        const countB = parseInt(b.split(':')[1]);
        return countB - countA;
      })
      .join(", ");
    console.log("[API /chat] Code Mode tools by server:", codeModeToolCounts);

    // Use transforming helpers implementation for automatic response parsing
    helpersImplementation = generateTransformingHelpersImplementation(serverToolMap, aliasMap);
    // Helper implementation logs commented out - not relevant to JSON response debugging
    // if (helpersImplementation) {
    //   console.log("[API /chat] helpersImplementation length=", helpersImplementation.length);
    //   const matches = Array.from(new Set(helpersImplementation.match(/helpers\.([a-z0-9_]+)/gi) || []));
    //   console.log("[API /chat] Code Mode helpers emitted:", matches.join(", ").slice(0, 400));
    // } else {
    //   console.log("[API /chat] helpersImplementation was empty, skipping helper injection");
    // }
  }

  // Use shorter system prompt for simple queries
  const shortSystemPrompt = useCodeMode
    ? `You are a helpful assistant with the ability to write and execute JavaScript code.

Code Requirements:
- NO function declarations - use top-level code only
- NO TypeScript syntax (no type annotations)
- Use await directly
- ALWAYS check Array.isArray() before .map()/.forEach()
- ALWAYS use optional chaining (?.) for nested access
- ALWAYS provide fallback values (|| [] or ?? 0)

${helpersDocs || 'No helper APIs available.'}

CRITICAL WORKFLOW:
1. Execute code ONCE
2. Code returns a plain text string
3. OUTPUT THAT STRING AS YOUR RESPONSE - do NOT call the tool again

Your code should return a PLAIN TEXT STRING - this becomes your final response.

Example:
\`\`\`javascript
const proteins = await helpers.uniprot.getData("search", { query: "TP53" });
// DEFENSIVE: check array before using .length or .map()
const items = Array.isArray(proteins) ? proteins : proteins?.results || [];
return \`Found \${items.length} proteins. Top result: \${items[0]?.name || "N/A"}\`;
\`\`\`

After execution, output the returned string directly. Do NOT generate more code.

If the user says "no tools" or "no code", respond in plain conversational text without using the codemode_sandbox tool.`
    : `You are a helpful assistant with access to tools.

The tools are powerful - choose the most relevant one for the user's question.

Multiple tools can be used in a single response. Always respond after using tools.

Response format: Markdown supported. Use tools to answer questions.`;

  const fullSystemPrompt = useCodeMode
    ? `You are a helpful assistant with the ability to write and execute JavaScript code.

Today's date is ${new Date().toISOString().split('T')[0]}.

Code Requirements:
- NO function declarations - use top-level code with await
- NO TypeScript syntax
- Use helpers.server.getData() for automatic data handling

${helpersDocs || 'No helper APIs available.'}

Available methods:
- helpers.server.getData(tool, args) - Returns data directly
- helpers.server.invoke(tool, args) - Returns raw response
- helpers.server.listTools() - List available tools
- helpers.utils.safeGet(obj, "path", fallback) - Safe property access
- helpers.utils.extractArray(result, "path") - Safely extract arrays
- console.log() - Debug output

## Defensive Coding Patterns (REQUIRED)

ALWAYS use these patterns to prevent runtime errors:

1. **Safe Array Operations:**
\`\`\`javascript
// CORRECT - check before using array methods
const items = Array.isArray(data?.results) ? data.results : [];
items.forEach(item => console.log(item));

// WRONG - crashes if data.results is undefined or not an array
data.results.map(x => x.name);  // ❌ "map is not a function"
\`\`\`

2. **Optional Chaining for Nested Access:**
\`\`\`javascript
// CORRECT
const name = result?.data?.items?.[0]?.name || "Unknown";

// WRONG - crashes if any property is missing
const name = result.data.items[0].name;  // ❌ "Cannot read property"
\`\`\`

3. **Default Values:**
\`\`\`javascript
// CORRECT
const count = data?.total ?? 0;
const items = data?.results || [];

// WRONG - no fallback
const count = data.total;  // ❌ undefined if missing
\`\`\`

## Anti-Patterns to AVOID

❌ **Never assume response shape without checking:**
\`\`\`javascript
// BAD - assumes data is an array
return data.map(x => x.name).join(", ");

// GOOD - verify first
const items = Array.isArray(data) ? data : data?.results || [];
return items.map(x => x?.name || "N/A").join(", ");
\`\`\`

❌ **Never access nested properties without optional chaining:**
\`\`\`javascript
// BAD
const diseases = target.associatedDiseases.rows;

// GOOD
const diseases = target?.associatedDiseases?.rows || [];
\`\`\`

CRITICAL WORKFLOW:
1. Execute code ONCE to gather data
2. Code returns a PLAIN TEXT STRING with your analysis
3. OUTPUT THAT STRING AS YOUR RESPONSE - do NOT call the tool again

DO NOT return objects like {summary: ..., data: ...}. Return a template string.

Example:
\`\`\`javascript
const proteins = await helpers.uniprot.getData("search", { query: "TP53" });
const diseases = await helpers.opentargets.getData("get_target", { target_id: "ENSG00000141510" });

// DEFENSIVE: safely extract arrays and handle missing data
const proteinList = Array.isArray(proteins) ? proteins : proteins?.results || [];
const diseaseList = diseases?.associatedDiseases?.rows || [];

return \`## TP53 Analysis

Found \${proteinList.length} protein entries.
Primary isoform: \${proteinList[0]?.name || "Unknown"}
Associated diseases: \${diseaseList.length} conditions.\`;
\`\`\`

After code execution completes, output the returned string. Do NOT generate more code.

If the user says "no tools" or "no code", respond in plain conversational text without using the codemode_sandbox tool.`
    : `You are a helpful assistant with access to a variety of tools.

    Today's date is ${new Date().toISOString().split('T')[0]}.

    IMPORTANT: You MUST use the available tools to answer user questions. The tools are very powerful and provide access to scientific databases and research data. Always prioritize using tools over providing general responses.

    Choose the tool that is most relevant to the user's question and USE IT.

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

  // Optional Cloudflare Dynamic Worker Loader codemode sandbox
  // When Code Mode is enabled, ONLY expose the codemode_sandbox tool (not direct MCP tools)
  const codemodeWorkerUrl2 = process.env.CODEMODE_WORKER_URL;
  let toolsWithCache: Record<string, any> | undefined;

  if (codemodeWorkerUrl2) {
    // Create tool registry for code execution
    const toolRegistry = createToolRegistry(rawTools);

    // Code Mode enabled: create codemode_sandbox tool
    const codemodeTool = dynamicTool({
      description:
        "Execute JavaScript code to query databases. Your code MUST return a plain text string (using template literals) - this string becomes your response to the user. Example: return `Found ${data.length} results`. Available APIs: helpers.serverName.getData(tool, args), helpers.serverName.listTools(). Use console.log() for debugging.",
      inputSchema: z.object({
        code: z
          .string()
          .describe(
            "JavaScript code (NOT TypeScript). Must return a template string summarizing findings. Example: const data = await helpers.uniprot.getData('search', {query: 'TP53'}); return `Found ${data.length} proteins`;"
          ),
      }),
      execute: async (input) => {
        const { code } = input as { code: string };
        if (!code || typeof code !== 'string') {
          return { error: "Provide a JavaScript code string in 'code'" };
        }

        try {
          validateCodeModeSnippet(code);
        } catch (error: unknown) {
          const message =
            error instanceof Error && error.message
              ? error.message
              : "Failed to parse code";
          return {
            error: `Syntax error in Code Mode snippet: ${message}`,
            status: 400,
          };
        }

        const headers: Record<string, string> = { "content-type": "application/json" };
        const workerToken = process.env.CODEMODE_WORKER_TOKEN;
        if (workerToken) headers["x-codemode-token"] = workerToken;

        // Prepare payload with code, tool registry, and helpers metadata
        const payload = {
          code,
          toolRegistry: Object.keys(toolRegistry), // Send tool names only
        helpersMetadata: helpersMetadata || { servers: [], totalTools: 0 },
        helpersImplementation: helpersImplementation || '',
      };

        try {
          const res = await fetch(codemodeWorkerUrl2, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });
          const text = await res.text();
          let parsed: any = null;
          try { parsed = text ? JSON.parse(text) : null; } catch {}

          if (!res.ok) {
            return {
              error: parsed?.error || text || `Codemode worker error (${res.status})`,
              status: res.status,
              logs: parsed?.logs || [],
            };
          }

          // Include console logs in the response
          const result = parsed?.result;
          const logs = parsed?.logs || [];

          // Return result directly - let the model decide how to present it
          // If string, the model should use it as-is. If object, model interprets it.
          return {
            result: result ?? null,
            logs,
          };
        } catch (error: any) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      },
    });

    // In Code Mode, ONLY expose codemode_sandbox - hide direct MCP tools
    toolsWithCache = {
      codemode_sandbox: codemodeTool,
    };
  } else {
    // Traditional mode: expose all MCP tools directly
    toolsWithCache = (Array.isArray(tools) ? {} : tools) as Record<string, any> | undefined;
  }

  // Add cache control to ALL tools when using Anthropic to maximize prefix cache hits
  if (isAnthropicModel && toolsWithCache && typeof toolsWithCache === 'object' && !Array.isArray(toolsWithCache)) {
    const enriched: Record<string, any> = {};
    for (const [k, v] of Object.entries(toolsWithCache)) {
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
        if (part.type === 'dynamic-tool' || (typeof part.type === 'string' && part.type.startsWith('tool-'))) {
          const toolPart: any = part;
          const derivedName =
            part.type === 'dynamic-tool'
              ? toolPart.toolName || 'tool'
              : part.type.replace(/^tool-/, '') || 'tool';
          const state = toolPart.state;
          let summary = `⧉ ${derivedName}`;
          if (state) summary += ` (${state})`;
          const output =
            toolPart.output !== undefined
              ? toolPart.output
              : toolPart.errorText
                ? { error: toolPart.errorText }
                : undefined;
          if (output) {
            try {
              const textResult =
                typeof output === 'string'
                  ? output
                  : JSON.stringify(output);
              summary += ': ' + textResult.slice(0, 1000).replace(/\s+/g, ' ');
              if (textResult.length > 1000) summary += '…';
            } catch {
              // ignore stringify errors
            }
          }
          newParts.push({ type: 'text', text: summary });
          continue;
        }
        if (part.type === 'tool-invocation') {
          const toolName = part.toolInvocation?.toolName || 'tool';
          const state = part.toolInvocation?.state;
          let summary = `⧉ ${toolName}`;
          if (state) summary += ` (${state})`;
          if ('result' in part.toolInvocation && part.toolInvocation.result) {
            const textResult =
              typeof part.toolInvocation.result === 'string'
                ? part.toolInvocation.result
                : JSON.stringify(part.toolInvocation.result);
            summary += ': ' + textResult.slice(0, 1000).replace(/\s+/g, ' ');
            if (textResult.length > 1000) summary += '…';
          }
          newParts.push({ type: 'text', text: summary });
          continue;
        }
        if (part.type === 'text') {
          // Optionally compress long past text
          const text: string = part.text || '';
          if (text.length > 3000) {
            newParts.push({ type: 'text', text: text.slice(0, 1500) + ' …(truncated older content)… ' + text.slice(-500) });
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
  const stripTokens = (text: string) =>
    text.replace(/\/[a-z0-9][a-z0-9._-]*\.[a-z0-9][a-z0-9._-]*/gi, '').replace(/\s+/g, ' ').trim();

  const normalizeToParts = (message: UIMessage): UIMessage => {
    if (Array.isArray((message as any).parts)) {
      return message;
    }
    const content = (message as any).content;
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((value) => String(value ?? '')).join('\n')
          : '';
    return {
      ...message,
      parts: [{ type: 'text', text }] as any,
    };
  };

  const extractMessageText = (message: UIMessage): string => {
    if (Array.isArray((message as any).parts)) {
      return (message as any).parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => String(part.text ?? ''))
        .join('\n')
        .trim();
    }
    const content = (message as any).content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      return content.map((value) => String(value ?? '')).join('\n').trim();
    }
    return '';
  };


  const sanitizeForStorage = (message: UIMessage): UIMessage => {
    const normalized = normalizeToParts(message);
    if (normalized.role !== 'user') {
      return normalized;
    }

    const cleanedParts = (normalized as any).parts.map((part: any) =>
      part?.type === 'text'
        ? { ...part, text: stripTokens(String(part.text ?? '')) }
        : part,
    );

    return { ...normalized, parts: cleanedParts } as UIMessage;
  };

  const baseClientMessages = sanitizedMessages.map(sanitizeForStorage);

  const truncatedMessages =
    baseClientMessages.length > maxHistoryLength
      ? [baseClientMessages[0], ...baseClientMessages.slice(-maxHistoryLength + 1)]
      : baseClientMessages;

  const conversationMessages: UIMessage[] = [
    ...promptInjectedMessages,
    ...truncatedMessages,
  ];
  const modelMessages = convertToModelMessages(conversationMessages);

  // Debug: Log the last message to see what the model receives after tool execution
  if (modelMessages.length > 0) {
    const lastMsg = modelMessages[modelMessages.length - 1];
    console.log('[API /chat] Last message role:', lastMsg.role);
    if (lastMsg.role === 'tool' || (lastMsg as any).content?.[0]?.type === 'tool-result') {
      console.log('[API /chat] Tool result being sent to model:', JSON.stringify(lastMsg).slice(0, 500));
    }
  }

  // Log what's ACTUALLY being sent to the LLM (toolsWithCache, not raw tools)
  const actualToolCount = toolsWithCache ? Object.keys(toolsWithCache).length : 0;
  const isCodeModeActive = !!process.env.CODEMODE_WORKER_URL;
  console.log(
    '[API /chat] Tools sent to LLM:',
    actualToolCount,
    isCodeModeActive ? '(Code Mode: only codemode_sandbox)' : '(Traditional: all MCP tools)',
    'model=',
    effectiveModel,
  );
  console.log('[API /chat] System prompt length:', systemPrompt.length, 'chars');
  if (toolsWithCache) {
    console.log('[API /chat] Tool names sent:', Object.keys(toolsWithCache).join(', '));
  }

  let streamResult;

  try {
    streamResult = await streamText({
      model: model.languageModel(effectiveModel),
      system: systemPrompt,
      messages: modelMessages,
      tools: toolsWithCache,
      toolChoice: 'auto',
      stopWhen: stepCountIs(20),
      temperature: 1,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 24576,
          },
          structuredOutputs: false, // Disable automatic JSON schema enforcement
        },
        anthropic: {
          thinking: {
            type: 'enabled',
            budgetTokens: 12000,
          },
          headers: {
            'anthropic-beta': 'prompt-caching-2024-07-31',
          },
        },
      },
      experimental_transform: smoothStream(),
      onError: (error: any) => {
        console.error('[API /chat] Stream error:', JSON.stringify(error, null, 2));
      },
      onStepFinish: (event) => {
        console.log('[API /chat] Step finished:', {
          toolCalls: event.toolCalls?.length || 0,
          toolResults: event.toolResults?.length || 0,
          text: event.text?.slice(0, 200),
          finishReason: event.finishReason,
        });

        // Log tool results and track per-tool token usage
        if (event.toolResults && event.toolResults.length > 0) {
          event.toolResults.forEach((result, idx) => {
            const toolName = result.toolName;
            console.log(`[API /chat] Tool result ${idx}:`, {
              toolName,
              resultPreview: JSON.stringify(result).slice(0, 300),
            });

            // Estimate tool token usage based on result size
            // This is approximate since we don't have exact token counts from tools
            // In the Vercel AI SDK, the tool result object contains the result directly
            const resultStr = JSON.stringify(result);
            // Look for args in the corresponding tool call from the same step
            // Cast to any to access dynamic properties since TypeScript doesn't know the shape
            const toolCall = event.toolCalls?.find(tc => tc.toolName === toolName);
            const argsStr = JSON.stringify((toolCall as any)?.args || {});
            // Rough estimate: ~4 characters per token
            const estimatedInputTokens = Math.ceil(argsStr.length / 4);
            const estimatedOutputTokens = Math.ceil(resultStr.length / 4);

            recordToolTokenUsage(id, toolName, estimatedInputTokens, estimatedOutputTokens);
          });
        }
      },
      onFinish: (event) => {
        try {
          const toolPartCount = event.steps.reduce((count, step) => {
            const toolCalls = step.toolCalls ?? [];
            return count + toolCalls.length;
          }, 0);
          console.log(
            '[API /chat] stream finished with',
            event.steps.length,
            'steps and',
            toolPartCount,
            'tool call entries',
          );

          // Log final text to see what model actually generated
          const finalText = event.steps[event.steps.length - 1]?.text || '';
          console.log('[API /chat] Final generated text:', finalText.slice(0, 500));

          // Extract token usage from the event
          // The AI SDK provides usage per step and totalUsage across all steps
          const totalUsage = (event as any).usage || (event as any).totalUsage;
          if (totalUsage) {
            const inputTokens = totalUsage.promptTokens ?? 0;
            const outputTokens = totalUsage.completionTokens ?? 0;
            const totalTokens = resolveTotalTokens(
              inputTokens,
              outputTokens,
              totalUsage.totalTokens
            );
            const tokenUsage: TokenUsage = {
              inputTokens,
              outputTokens,
              totalTokens,
              cacheReadTokens: totalUsage.promptTokenDetails?.cachedTokens ?? 0,
              cacheWriteTokens: 0, // Not always available
              reasoningTokens: totalUsage.completionTokenDetails?.reasoningTokens ?? 0,
            };
            console.log('[API /chat] Token usage:', tokenUsage);
          }

          // Also aggregate per-step usage for detailed breakdown
          let aggregatedUsage = createEmptyTokenUsage();
          for (const step of event.steps) {
            const stepUsage = (step as any).usage;
            if (stepUsage) {
              const inputTokens = stepUsage.promptTokens ?? 0;
              const outputTokens = stepUsage.completionTokens ?? 0;
              const totalTokens = resolveTotalTokens(
                inputTokens,
                outputTokens,
                stepUsage.totalTokens
              );
              const stepTokens: TokenUsage = {
                inputTokens,
                outputTokens,
                totalTokens,
                cacheReadTokens: stepUsage.promptTokenDetails?.cachedTokens ?? 0,
                cacheWriteTokens: 0,
                reasoningTokens: stepUsage.completionTokenDetails?.reasoningTokens ?? 0,
              };
              aggregatedUsage = mergeTokenUsage(aggregatedUsage, stepTokens);
              console.log('[API /chat] Step token usage:', stepTokens);
            }
          }
          if (aggregatedUsage.totalTokens > 0) {
            console.log('[API /chat] Aggregated token usage:', aggregatedUsage);
            // Record the aggregated usage for metrics display (per-conversation)
            recordTokenUsage(aggregatedUsage, effectiveModel, id);
          }
        } catch (error) {
          console.warn('[API /chat] logging finish event failed:', error);
        }
      },
    });
  } catch (error: any) {
    console.error('streamText failed:', error);
    await cleanup().catch((cleanupError) =>
      console.error('cleanup after streamText failure failed:', cleanupError),
    );

    if (typeof error?.message === 'string' && error.message.includes('typeName')) {
      return new Response(
        JSON.stringify({
          error: 'Response processing error. This is a known issue being investigated.',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Chat-ID': id,
          },
        },
      );
    }

    throw error;
  }

  const originalMessages = (promptAuditMessage ? [promptAuditMessage, ...messages] : messages).map(
    (message) => sanitizeForStorage(message),
  );

  const streamResponse = streamResult.toUIMessageStreamResponse({
    headers: {
      'X-Chat-ID': id,
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
    sendReasoning: true,
    originalMessages,
    generateMessageId: () => nanoid(),
    onError: (error) => {
      console.error('Error surfaced from UI stream:', error);

      const stringifyProviderError = (err: any) => {
        const stringified = typeof err === 'string' ? err : err?.message || '';
        if (!stringified) return null;

        const providerMatch = stringified.match(/provider:\s*([A-Za-z]+)/i);
        const modelMatch =
          stringified.match(/model `([^`]+)`/) || stringified.match(/model ([A-Za-z0-9\-\/]+)/);
        const retryMatch =
          stringified.match(/try again in ([0-9.]+s)/i) ||
          stringified.match(/retry-after.*?([0-9.]+)/i);

        const retry =
          retryMatch &&
          (() => {
            const seconds = parseFloat(retryMatch[1]);
            if (!Number.isFinite(seconds)) return null;
            if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
            return `${Math.ceil(seconds / 60)} minutes`;
          })();

        return {
          provider: providerMatch?.[1] ?? 'Unknown provider',
          model: modelMatch?.[1],
          retry,
        };
      };

      const rateLimitDetails = stringifyProviderError(error);
      if (rateLimitDetails) {
        let message = `Rate limit exceeded for ${rateLimitDetails.provider}`;
        if (rateLimitDetails.model) {
          message += ` (${rateLimitDetails.model})`;
        }
        message += rateLimitDetails.retry
          ? `. Please try again in ${rateLimitDetails.retry}.`
          : '. Please try again later.';
        return message;
      }

      if (typeof error === 'string') {
        return error;
      }

      if (error instanceof Error) {
        if (error.message.includes('typeName')) {
          return 'Response processing error occurred.';
        }
        if (error.message.includes('Rate limit')) {
          return 'Rate limit exceeded. Please try again later.';
        }
        return error.message;
      }

      return 'An error occurred.';
    },
    onFinish: async ({ messages: finalMessages }) => {
      responseCompleted = true;
      try {
        await saveChat({
          id,
          userId: effectiveUserId,
          messages: finalMessages,
        });

        const dbMessages = convertToDBMessages(finalMessages, id);
        await saveMessages({ messages: dbMessages });
      } finally {
        await cleanup().catch((cleanupError) =>
          console.error('cleanup after stream completion failed:', cleanupError),
        );
      }
    },
  });

  req.signal.addEventListener('abort', async () => {
    if (!responseCompleted) {
      console.log('Request aborted, cleaning up resources');
      try {
        await cleanup();
      } catch (error) {
        console.error('Error during cleanup on abort:', error);
      }
    }
  });

  return streamResponse;
}
