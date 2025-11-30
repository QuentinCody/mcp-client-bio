import { NextResponse } from "next/server";
import { initializeMCPClients } from "@/lib/mcp-client";
import { CODEMODE_SERVERS, type CodeModeServerKey } from "@/lib/codemode/servers";

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
  const serverKey = url.searchParams.get("server") as CodeModeServerKey | null;
  if (!serverKey || !(serverKey in CODEMODE_SERVERS)) {
    return badRequest("Unknown server. Use datacite, ncigdc, or entrez.");
  }

  const serverConfig = CODEMODE_SERVERS[serverKey];
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

  const server = payload?.server as CodeModeServerKey | undefined;
  const tool = typeof payload?.tool === "string" ? payload.tool : undefined;
  const args = payload?.args ?? {};

  if (!server || !(server in CODEMODE_SERVERS)) {
    return badRequest("Unknown server. Use datacite, ncigdc, or entrez.");
  }
  if (!tool) return badRequest("Missing tool name");

  const serverConfig = CODEMODE_SERVERS[server];
  const { tools, cleanup } = await initializeMCPClients([serverConfig], req.signal);

  try {
    const selected = tools?.[tool];
    const executor = resolveExecutor(selected);
    if (!executor) {
      return badRequest(`Tool '${tool}' not found or not callable`);
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
    const message = error instanceof Error ? error.message : "Unknown error";
    return new NextResponse(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } finally {
    await cleanup();
  }
}
