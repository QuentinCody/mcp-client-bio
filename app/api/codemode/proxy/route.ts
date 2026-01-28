import { NextResponse } from "next/server";
import { initializeMCPClients } from "@/lib/mcp-client";
import { CODEMODE_SERVERS, getCodeModeServerByKey } from "@/lib/codemode/servers";
import {
  validateArgs,
  extractToolSchema,
  formatValidationError,
  generateSchemaSummary,
} from "@/lib/code-mode/schema-validator";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-codemode-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  } as const;
}

function unauthorizedResponse(message = "Unauthorized") {
  return new NextResponse(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function badRequest(message: string) {
  return new NextResponse(JSON.stringify({ error: message }), {
    status: 400,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function validateToken(headers: Headers) {
  const expected = process.env.CODEMODE_PROXY_TOKEN;
  if (!expected) return true; // Allow if not configured
  return headers.get("x-codemode-token") === expected;
}

function resolveExecutor(tool: any) {
  if (!tool || typeof tool !== "object") return null;
  const candidates = ["call", "execute", "run", "invoke"] as const;
  for (const c of candidates) {
    if (typeof tool[c] === "function") return tool[c].bind(tool);
  }
  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders() });
}

export async function GET(req: Request) {
  if (!validateToken(req.headers)) return unauthorizedResponse();

  const url = new URL(req.url);
  const serverKey = url.searchParams.get("server");
  const serverConfig = serverKey ? getCodeModeServerByKey(serverKey) : undefined;
  if (!serverConfig) {
    return badRequest(`Unknown server. Use one of: ${Object.keys(CODEMODE_SERVERS).join(", ")}`);
  }

  const { tools, cleanup } = await initializeMCPClients([serverConfig], req.signal);

  try {
    const toolNames = Object.keys(tools || {});
    return new NextResponse(
      JSON.stringify({ server: serverKey, tools: toolNames }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      }
    );
  } finally {
    await cleanup();
  }
}

export async function POST(req: Request) {
  if (!validateToken(req.headers)) return unauthorizedResponse();

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const serverKey = typeof payload?.server === "string" ? payload.server : undefined;
  const server = serverKey ? getCodeModeServerByKey(serverKey) : undefined;
  const tool = typeof payload?.tool === "string" ? payload.tool : undefined;
  const args = payload?.args ?? {};

  if (!server) {
    return badRequest(`Unknown server. Use one of: ${Object.keys(CODEMODE_SERVERS).join(", ")}`);
  }
  if (!tool) return badRequest("Missing tool name");

  const { tools, cleanup } = await initializeMCPClients([server], req.signal);

  try {
    const selected = tools?.[tool];
    const executor = resolveExecutor(selected);
    if (!executor) {
      // Tool not found - provide helpful suggestion
      const availableTools = Object.keys(tools || {});
      const suggestions = availableTools.slice(0, 10).join(', ');
      const hint = availableTools.length > 10
        ? ` (and ${availableTools.length - 10} more)`
        : '';

      return new NextResponse(
        JSON.stringify({
          error: `Tool '${tool}' not found`,
          errorCode: 'TOOL_NOT_FOUND',
          availableTools: availableTools.slice(0, 20),
          suggestion: `Available tools in ${serverKey}: ${suggestions}${hint}`,
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        }
      );
    }

    // Validate arguments against tool schema BEFORE execution
    const schema = extractToolSchema(selected);
    if (schema) {
      const validation = validateArgs(args, schema, tool);
      if (!validation.valid) {
        const errorMessage = formatValidationError(validation, tool, serverKey!);
        const schemaSummary = generateSchemaSummary(schema);

        return new NextResponse(
          JSON.stringify({
            error: errorMessage,
            errorCode: 'INVALID_ARGUMENTS',
            validation: {
              errors: validation.errors,
              suggestions: validation.suggestions,
            },
            schema: schemaSummary,
            receivedArgs: args,
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(),
            },
          }
        );
      }
    }

    const result = await executor(args);
    return new NextResponse(JSON.stringify({ result }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (error: any) {
    // Enhance error message with schema info when available
    const message = error instanceof Error ? error.message : "Unknown error";
    const selected = tools?.[tool];
    const schema = extractToolSchema(selected);
    const schemaSummary = schema ? generateSchemaSummary(schema) : null;

    return new NextResponse(
      JSON.stringify({
        error: message,
        errorCode: error?.code || 'EXECUTION_ERROR',
        ...(schemaSummary && {
          hint: `Expected parameters: ${schemaSummary}`,
          tip: `Use helpers.${serverKey}.getToolSchema('${tool}') for full schema`,
        }),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      }
    );
  } finally {
    await cleanup();
  }
}
