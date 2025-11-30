import type { MCPServerConfig } from '@/lib/mcp-client';

export type CodeModeServerKey = 'datacite' | 'ncigdc' | 'entrez';

export const CODEMODE_SERVERS: Record<CodeModeServerKey, MCPServerConfig & { name: string }> = {
  datacite: {
    name: 'DataCite',
    url: 'https://datacite-mcp-server.quentincody.workers.dev/mcp',
    type: 'http',
  },
  ncigdc: {
    name: 'NCI GDC',
    url: 'https://nci-gdc-mcp-server.quentincody.workers.dev/mcp',
    type: 'http',
  },
  entrez: {
    name: 'Entrez',
    url: 'https://entrez-mcp-server.quentincody.workers.dev/mcp',
    type: 'http',
  },
};
