var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import { WorkerEntrypoint } from "cloudflare:workers";
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
__name(jsonResponse, "jsonResponse");
var OutboundProxy = class extends WorkerEntrypoint {
  static {
    __name(this, "OutboundProxy");
  }
  async fetch(request) {
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
};
function buildRunnerModule(userCode, helpersImplementation) {
  const userLines = userCode.split(/\r?\n/);
  const executionLines = [
    "    const userFunction = async (helpers, console) => {",
    "      return (async () => {",
    ...userLines.map((line) => `        ${line}`),
    "      })();",
    "    };"
  ];
  const executionCode = executionLines.join("\n");
  return `
    ${helpersImplementation || ""}

    export default {
      async fetch(request, env) {
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
        const console = safeConsole;
        // Define proxy functions inside fetch handler where env is available
        async function callProxy(server, tool, args) {
          const headers = new Headers({ 'content-type': 'application/json' });
          if (env.PROXY_TOKEN) headers.set('x-codemode-token', env.PROXY_TOKEN);
          let res;
          try {
            res = await fetch(env.PROXY_URL, {
              method: 'POST',
              headers,
              body: JSON.stringify({ server, tool, args })
            });
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(
              "Failed to reach Code Mode proxy (" +
                env.PROXY_URL +
                ") while calling " +
                server +
                "/" +
                tool +
                ": " +
                reason
            );
          }
          const text = await res.text();
          let parsed = null;
          try { parsed = text ? JSON.parse(text) : null; } catch {}
          if (!res.ok) {
            throw new Error(parsed?.error || text || ('Proxy error ' + res.status));
          }
          return parsed?.result ?? null;
        }

        // Make __invokeMCPTool available globally for helpers
        globalThis.__invokeMCPTool = async function(server, tool, args) {
          return callProxy(server, tool, args);
        };

        const helpers = globalThis.helpers || {};

        try {
          ${executionCode}

          const result = await userFunction(helpers, safeConsole);
          const payload = {
            logs,
            result: result === undefined ? null : result,
          };

          return new Response(JSON.stringify(payload), {
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
__name(buildRunnerModule, "buildRunnerModule");
var index_default = {
  async fetch(request, env, ctx) {
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
    let payload = {};
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    const code = typeof payload?.code === "string" ? payload.code : "";
    if (!code) {
      return jsonResponse({ error: "Missing code" }, 400);
    }
    const proxyHost = (() => {
      try {
        return new URL(env.PROXY_URL).host;
      } catch {
        return "";
      }
    })();
    let helpersImplementation = typeof payload?.helpersImplementation === "string" ? payload.helpersImplementation : "";
    if (!helpersImplementation) {
      console.log("[CodeMode Worker] payload missing helpersImplementation, injecting stub");
      helpersImplementation = "const helpers = {}; globalThis.helpers = helpers;";
    }
    console.log("[CodeMode Worker] helpersImplementation preview:", helpersImplementation.substring(0, 500));
    const helperMatches = Array.from(
      new Set((helpersImplementation.match(/helpers\\.([a-z0-9_]+)/gi) || []).map((m) => m.replace(/^helpers\\./, "")))
    );
    console.log("[CodeMode Worker] helpersImplementation length=", helpersImplementation.length);
    console.log("[CodeMode Worker] helper keys:", helperMatches.join(", "));
    const runnerModule = buildRunnerModule(code, helpersImplementation);
    const isolateId = `codemode-${crypto.randomUUID()}`;
    const loaderConfig = {
      compatibilityDate: "2025-06-01",
      mainModule: "runner.js",
      modules: {
        "runner.js": runnerModule
      },
      env: {
        PROXY_URL: env.PROXY_URL,
        PROXY_TOKEN: env.PROXY_TOKEN
      }
    };
    if (ctx.exports && ctx.exports.OutboundProxy) {
      loaderConfig.globalOutbound = ctx.exports.OutboundProxy({ props: { allowedHost: proxyHost, proxyToken: env.PROXY_TOKEN } });
    }
    const loader = env.LOADER.get(isolateId, () => loaderConfig);
    const entrypoint = loader.getEntrypoint();
    return entrypoint.fetch(new Request("https://sandbox.internal/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    }));
  }
};
export {
  OutboundProxy,
  index_default as default
};
//# sourceMappingURL=index.js.map
