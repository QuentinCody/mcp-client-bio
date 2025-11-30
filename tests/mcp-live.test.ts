import { describe, expect, it } from 'vitest';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import serversConfig from '../config/mcp-servers.json';

const TEST_TIMEOUT_MS = 120_000;
const nonAuthServers = serversConfig.servers.filter((server) => !server.auth);
const manualCheckServers = new Set(['CatalysisHub']);

function toTransport(server: { type: string; url: string }) {
  if (server.type === 'sse') {
    return { type: 'sse' as const, url: server.url, headers: {} };
  }
  return new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: {} } });
}

describe('live MCP servers (non-auth)', () => {
  for (const server of nonAuthServers) {
    it(
      `${server.name} exposes tools`,
      async () => {
        if (manualCheckServers.has(server.name)) {
          const response = await fetch(server.url);
          const body = await response.text();
          expect(response.ok).toBe(true);
          expect(body).toMatch(/Catalysis Hub MCP Server/);
          return;
        }
        const transport = toTransport(server);
        const client = await createMCPClient({ transport, timeout: TEST_TIMEOUT_MS });
        const tools = await client.tools();
        expect(tools).toBeTruthy();
        expect(typeof tools).toBe('object');
        await client.disconnect?.();
      },
      TEST_TIMEOUT_MS
    );
  }
});
