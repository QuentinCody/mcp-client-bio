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
function validateUserCode(code) {
  const trimmed = code.trim();
  if (/^\s*(?:async\s+)?function\s+\w+/m.test(trimmed)) {
    return {
      valid: false,
      error: 'Function declarations are not allowed in Code Mode.\n\nFunction declarations are stripped at runtime by the Cloudflare Worker, causing "is not defined" errors.\n\nGOOD (top-level code):\nconst data = await helpers.server.getData("tool_name", { query: "..." });\nreturn data[0];\n\nBAD (function declaration):\nasync function fetchData() { ... }\nreturn fetchData();  // \u274C fetchData is not defined'
    };
  }
  if (/:\s*(?:string|number|boolean|any|void|object|Promise<)\s*[,;=)]/.test(trimmed)) {
    return {
      valid: false,
      error: 'TypeScript syntax is not allowed in Code Mode.\n\nRemove type annotations (: string, as Type, etc.).\n\nGOOD: const name = "value";\nBAD:  const name: string = "value";'
    };
  }
  return { valid: true };
}
__name(validateUserCode, "validateUserCode");
function buildRunnerModule(userCode, helpersImplementation) {
  const trimmed = userCode.trim();
  const validation = validateUserCode(trimmed);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const userLines = userCode.split(/\r?\n/);
  const indentedUserLines = userLines.map((line) => `        ${line}`);
  const functionLines = [
    `    const userFunction = async (helpers, console) => {`,
    `      return (async () => {`,
    ...indentedUserLines,
    `      })();`,
    `    };`
  ];
  const functionCode = functionLines.join("\n");
  const modules = {};
  const helperModuleName = helpersImplementation ? "helpers.js" : null;
  if (helperModuleName) {
    modules[helperModuleName] = helpersImplementation;
  }
  const importHelpersLine = helperModuleName ? `import "./${helperModuleName}";
` : "";
  const runnerSource = `
${importHelpersLine}
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
          \`Failed to reach Code Mode proxy (\${env.PROXY_URL}) while calling \${server}/\${tool}: \${reason}

This usually means:
- The proxy server is down
- Network connectivity issues
- PROXY_URL environment variable is misconfigured\`
        );
      }
      const text = await res.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok) {
        const errorMsg = parsed?.error || text || "HTTP " + res.status;
        throw new Error(
          \`MCP tool call failed: \${server}/\${tool}
Status: \${res.status}
Error: \${errorMsg}

Arguments: \${JSON.stringify(args, null, 2)}\`
        );
      }
      return parsed?.result ?? null;
    }

    globalThis.__invokeMCPTool = async function(server, tool, args) {
      return callProxy(server, tool, args);
    };

    const helpers = globalThis.helpers || {};

    try {
      ${functionCode}

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
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorCode = err?.code || 'EXECUTION_ERROR';
      const errorStack = err instanceof Error ? err.stack : undefined;

      // Log full error details for debugging
      safeConsole.log('[error]', errorMessage);
      if (err?.details) {
        safeConsole.log('[error details]', JSON.stringify(err.details, null, 2));
      }

      // Enhanced error handling - convert technical errors to user-friendly messages
      let userMessage = errorMessage;
      let suggestions = [];
      let category = 'unknown';
      let recoverable = true;

      // Pattern matching for common errors
      if (errorMessage.includes('is not defined')) {
        const match = errorMessage.match(/(\\w+) is not defined/);
        const varName = match?.[1] || 'variable';
        userMessage = \`Variable "\${varName}" was not found\`;
        suggestions = [
          'Check for typos in the variable name',
          'If using a helper, verify it exists with helpers.serverName.listTools()',
          'Use top-level code instead of function declarations'
        ];
        category = 'runtime';
      } else if (/helpers\\.(\\w+).*undefined|Cannot read.*helpers\\.(\\w+)/i.test(errorMessage)) {
        const match = errorMessage.match(/helpers\\.(\\w+)/);
        const serverName = match?.[1] || 'unknown';
        userMessage = \`Server "\${serverName}" is not available\`;
        suggestions = [
          'Check the server name spelling',
          'Verify the MCP server is connected',
          'Try: helpers.uniprot, helpers.pubmed, helpers.entrez, etc.'
        ];
        category = 'validation';
      } else if (/HTTP (\\d+)|Status: (\\d+)/.test(errorMessage)) {
        const match = errorMessage.match(/HTTP (\\d+)|Status: (\\d+)/);
        const status = parseInt(match?.[1] || match?.[2] || '0');
        if (status === 400) {
          userMessage = 'Invalid parameters sent to the tool';
          suggestions = ['Use getToolSchema(toolName) to see required parameters', 'Check parameter types'];
        } else if (status === 404) {
          userMessage = 'The requested data was not found';
          suggestions = ['Verify the ID or query is correct', 'The data may not exist'];
        } else if (status === 429) {
          userMessage = 'Rate limit exceeded - too many requests';
          suggestions = ['Wait a moment and try again', 'Reduce API calls'];
        } else if (status >= 500) {
          userMessage = 'The external service is temporarily unavailable';
          suggestions = ['This is not your fault - try again shortly'];
        }
        category = 'tool';
      } else if (/missing required|required parameter|MISSING_REQUIRED_PARAM/i.test(errorMessage)) {
        userMessage = 'A required parameter is missing';
        suggestions = [
          'Use getToolSchema(toolName) to see required parameters',
          'Check the tool documentation'
        ];
        category = 'validation';
      } else if (/timeout|timed out|ETIMEDOUT/i.test(errorMessage)) {
        userMessage = 'The request took too long';
        suggestions = ['Try a simpler query', 'The API may be slow - try again'];
        category = 'network';
      } else if (/Failed to reach|ECONNREFUSED|network/i.test(errorMessage)) {
        userMessage = 'Could not connect to the tool server';
        suggestions = ['This is usually temporary - try again', 'Check if MCP servers are running'];
        category = 'network';
      } else if (/INVALID_ARGUMENTS|invalid.*argument|type.*error/i.test(errorMessage)) {
        userMessage = 'Parameter type mismatch';
        suggestions = ['Check if strings should be numbers', 'Use getToolSchema() for types'];
        category = 'validation';
      }

      // Format the user-friendly error
      const formattedSuggestions = suggestions.length > 0
        ? '\\n\\nSuggestions:\\n' + suggestions.map(s => '\u2022 ' + s).join('\\n')
        : '';
      const enhancedError = userMessage + formattedSuggestions;

      return new Response(JSON.stringify({
        error: enhancedError,
        errorCode: category.toUpperCase(),
        userFriendly: true,
        suggestions: suggestions,
        recoverable: recoverable,
        logs,
        _debug: {
          originalMessage: errorMessage,
          originalCode: errorCode,
          details: err?.details,
          stack: errorStack?.split('\\n').slice(0, 3).join('\\n') // First 3 lines only
        }
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
  }
};
`;
  modules["runner.js"] = runnerSource.trim();
  console.log("[runner source preview]", runnerSource.substring(0, 200));
  console.log("[runner source length]", runnerSource.length);
  return {
    mainModule: "runner.js",
    modules
  };
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
      mainModule: runnerModule.mainModule,
      modules: runnerModule.modules,
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
