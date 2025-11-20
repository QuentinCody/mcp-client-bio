import { WorkerEntrypoint } from "cloudflare:workers";

type Env = {
  LOADER: any;
  PROXY_URL: string;
  PROXY_TOKEN: string;
  CODEMODE_CLIENT_TOKEN?: string;
};

type OutboundProps = { allowedHost: string; proxyToken?: string };

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Outbound guard to keep the dynamic worker confined to the proxy endpoint
export class OutboundProxy extends WorkerEntrypoint<OutboundProps> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.host !== this.ctx.props.allowedHost) {
      return new Response("Blocked outbound host", { status: 403 });
    }

    const headers = new Headers(request.headers);
    if (this.ctx.props.proxyToken) {
      headers.set("x-codemode-token", this.ctx.props.proxyToken);
    }

    const forwarded = new Request(request, { headers });
    return fetch(forwarded);
  }
}

// Helper to build a module that wraps user code
function buildRunnerModule(userCode: string): string {
  // Check if the code looks like a complete function
  const trimmed = userCode.trim();
  const isFunction = trimmed.startsWith('async ') || 
                     trimmed.startsWith('function') || 
                     (trimmed.startsWith('(') && trimmed.includes('=>'));
  
  const executionCode = isFunction
    ? `const userFunction = ${userCode};`
    : `const userFunction = async (helpers, console) => {
         ${userCode}
       };`;
  
  return `
    const logs = [];
    
    const safeConsole = {
      log: (...args) => {
        try {
          const safe = args.map((v) => {
            if (typeof v === 'string') return v;
            try { return JSON.stringify(v); } catch { return String(v); }
          }).join(' ');
          logs.push(safe);
        } catch {
          logs.push('[log error]');
        }
      },
      error: (...args) => safeConsole.log(...args),
      warn: (...args) => safeConsole.log(...args),
      info: (...args) => safeConsole.log(...args),
    };
    
    async function callProxy(env, server, tool, args) {
      const headers = new Headers({ 'content-type': 'application/json' });
      if (env.PROXY_TOKEN) headers.set('x-codemode-token', env.PROXY_TOKEN);
      const res = await fetch(env.PROXY_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ server, tool, args })
      });
      const text = await res.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok) {
        throw new Error(parsed?.error || text || ('Proxy error ' + res.status));
      }
      return parsed?.result ?? null;
    }
    
    async function listTools(env, server) {
      const headers = new Headers();
      if (env.PROXY_TOKEN) headers.set('x-codemode-token', env.PROXY_TOKEN);
      const url = new URL(env.PROXY_URL);
      url.searchParams.set('server', server);
      const res = await fetch(url.toString(), { headers });
      const text = await res.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok) {
        throw new Error(parsed?.error || text || ('Proxy list error ' + res.status));
      }
      return parsed?.tools ?? [];
    }
    
    export default {
      async fetch(request, env) {
        const helpers = {
          datacite: {
            invoke: (tool, args) => callProxy(env, 'datacite', tool, args || {}),
            listTools: () => listTools(env, 'datacite'),
          },
          ncigdc: {
            invoke: (tool, args) => callProxy(env, 'ncigdc', tool, args || {}),
            listTools: () => listTools(env, 'ncigdc'),
          },
          entrez: {
            invoke: (tool, args) => callProxy(env, 'entrez', tool, args || {}),
            listTools: () => listTools(env, 'entrez'),
          },
        };
        
        try {
          ${executionCode}
          
          const result = await userFunction(helpers, safeConsole);
          
          return new Response(JSON.stringify({ result, logs }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
          });
        } catch (err) {
          safeConsole.log('[error]', err && err.message ? err.message : String(err));
          return new Response(JSON.stringify({ 
            error: err instanceof Error ? err.message : String(err), 
            logs 
          }), { 
            status: 500, 
            headers: { 'content-type': 'application/json' } 
          });
        }
      }
    };
  `;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
    }

    if (env.CODEMODE_CLIENT_TOKEN) {
      const headerToken = request.headers.get("x-codemode-token");
      if (headerToken !== env.CODEMODE_CLIENT_TOKEN) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Use POST" }, 405);
    }

    if (!env.PROXY_URL) {
      return jsonResponse({ error: "Missing PROXY_URL binding" }, 500);
    }

    // Parse the request to get the user's code
    let payload: any = {};
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const code = typeof payload?.code === 'string' ? payload.code : '';
    if (!code) {
      return jsonResponse({ error: "Missing code" }, 400);
    }

    const proxyHost = (() => {
      try { return new URL(env.PROXY_URL).host; } catch { return ""; }
    })();

    // Build a dynamic module with the user's code embedded
    const runnerModule = buildRunnerModule(code);

    const isolateId = `codemode-${crypto.randomUUID()}`;
    const loaderConfig: any = {
      compatibilityDate: "2025-06-01",
      mainModule: "runner.js",
      modules: {
        "runner.js": runnerModule,
      },
      env: {
        PROXY_URL: env.PROXY_URL,
        PROXY_TOKEN: env.PROXY_TOKEN,
      },
    };
    
    // Only set globalOutbound in production where ctx.exports is available
    if (ctx.exports && ctx.exports.OutboundProxy) {
      loaderConfig.globalOutbound = ctx.exports.OutboundProxy({ props: { allowedHost: proxyHost, proxyToken: env.PROXY_TOKEN } });
    }
    
    const loader = env.LOADER.get(isolateId, () => loaderConfig);

    const entrypoint = loader.getEntrypoint();
    return entrypoint.fetch(new Request("https://sandbox.internal/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));
  },
};
