import { describe, expect, it } from 'vitest';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import serversConfig from '../config/mcp-servers.json';

const TEST_TIMEOUT_MS = 120_000;
const nonAuthServers = serversConfig.servers.filter((server) => !(server as any).auth);
const manualCheckServers = new Set(['CatalysisHub']);

function toTransport(server: { type: string; url: string }) {
  if (server.type === 'sse') {
    return { type: 'sse' as const, url: server.url, headers: {} };
  }
  return new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: {} } });
}

describe('live MCP servers (non-auth)', () => {
  const shouldSkipForDns = (error: unknown) => {
    const msg = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
    const code = typeof error === 'object' && error && 'code' in (error as any) ? (error as any).code : undefined;
    if (code === 'ENOTFOUND') return true;
    if (msg.includes('getaddrinfo')) return true;
    if (msg.includes('fetch failed')) return true;
    return false;
  };

  for (const server of nonAuthServers) {
    it(
      `${server.name} exposes tools`,
      async () => {
        if (manualCheckServers.has(server.name)) {
          try {
            const response = await fetch(server.url);
            const body = await response.text();
            expect(response.ok).toBe(true);
            expect(body).toMatch(/Catalysis Hub MCP Server/);
          } catch (error: unknown) {
            if (shouldSkipForDns(error)) {
              console.warn(`[tests/mcp-live] Skipping ${server.name}: ${error}`);
              return;
            }
            throw error;
          }
          return;
        }

        const transport = toTransport(server);
        let client;
        try {
          client = await createMCPClient({ transport, timeout: TEST_TIMEOUT_MS });
        } catch (error: unknown) {
          if (shouldSkipForDns(error)) {
            console.warn(`[tests/mcp-live] Skipping ${server.name}: ${error}`);
            return;
          }
          throw error;
        }
        try {
          const tools = await client.tools();
          expect(tools).toBeTruthy();
          expect(typeof tools).toBe('object');
        } catch (error: unknown) {
          if (shouldSkipForDns(error)) {
            console.warn(`[tests/mcp-live] Skipping ${server.name}: ${error}`);
            return;
          }
          throw error;
        } finally {
          await client.disconnect?.();
        }
      },
      TEST_TIMEOUT_MS
    );
  }
});
