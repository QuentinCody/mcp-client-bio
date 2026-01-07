import { beforeEach, describe, expect, it, vi } from 'vitest';

import serversConfig from '../config/mcp-servers.json';
const mockServerBehaviors = new Map<
  string,
  { fail?: boolean; tools?: Record<string, any> }
>();

const disconnectMocks: Array<ReturnType<typeof vi.fn>> = [];

const createMCPClientMock = vi.fn(async ({ transport }: { transport: any }) => {
  const urlValue = typeof transport.url?.toString === 'function' ? transport.url.toString() : transport.url;
  const target = mockServerBehaviors.get(urlValue);
  if (!target) {
    throw new Error(`No mock behavior registered for ${urlValue}`);
  }
  if (target.fail) {
    throw new Error(`Failed to connect ${urlValue}`);
  }
  const disconnect = vi.fn();
  disconnectMocks.push(disconnect);
  return {
    tools: async () => target.tools ?? {},
    disconnect,
  };
});

vi.mock('ai', () => ({
  dynamicTool: vi.fn(),
  experimental_createMCPClient: createMCPClientMock,
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    url: URL;
    constructor(url: URL) {
      this.url = url;
    }
  },
}));

function makeTool(name: string, response: any = undefined) {
  return {
    description: `mock tool ${name}`,
    parameters: {
      jsonSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
    call: vi.fn().mockResolvedValue(response ?? { ok: name }),
  };
}

type ServerUseCase = {
  name: string;
  toolName: string;
  input: Record<string, string>;
  response: Record<string, unknown>;
};

const serverUseCases: ServerUseCase[] = [
  {
    name: 'ClinicalTrials',
    toolName: 'searchClinicalTrials',
    input: { query: 'lung cancer immunotherapy' },
    response: { studies: ['NCT12345', 'NCT67890'] },
  },
  {
    name: 'OpenTargets',
    toolName: 'queryTargets',
    input: { query: 'TP53 pathway' },
    response: { targets: ['TP53', 'MDM2'] },
  },
  {
    name: 'Entrez',
    toolName: 'findEntrezRecords',
    input: { query: 'BRCA1 variant' },
    response: { recordCount: 42 },
  },
  {
    name: 'CIViC',
    toolName: 'lookupCivicVariant',
    input: { query: 'EGFR L858R' },
    response: { variant: 'EGFR L858R', evidenceLevel: 'A' },
  },
  {
    name: 'CatalysisHub',
    toolName: 'listCatalysisModels',
    input: { query: 'yeast carbon fixation' },
    response: { models: ['model-a', 'model-b'] },
  },
  {
    name: 'DataCite',
    toolName: 'resolvePublication',
    input: { query: '10.1234/example' },
    response: { title: 'Example dataset', doi: '10.1234/example' },
  },
  {
    name: 'RCSB PDB',
    toolName: 'getProteinStructure',
    input: { query: '1TUP' },
    response: { pdbId: '1TUP', resolution: 2.0 },
  },
  {
    name: 'NCI GDC',
    toolName: 'listGDCProjects',
    input: { query: 'Lung Adenocarcinoma' },
    response: { projectIds: ['TCGA-LUAD'] },
  },
  {
    name: 'Pharos',
    toolName: 'discoverPharosTargets',
    input: { query: 'metformin' },
    response: { target: 'AMPK', confidence: 0.92 },
  },
  {
    name: 'NCI PDC',
    toolName: 'fetchPDCRecords',
    input: { query: 'pancreatic carcinoma' },
    response: { sampleCount: 8 },
  },
  {
    name: 'DGIdb',
    toolName: 'searchDrugGeneInteractions',
    input: { query: 'EGFR inhibitors' },
    response: { interactions: ['erlotinib', 'gefitinib'] },
  },
  {
    name: 'ZincBind',
    toolName: 'findZincBindingSites',
    input: { query: 'zinc finger motif' },
    response: { hits: 5 },
  },
  {
    name: 'OpenNeuro',
    toolName: 'retrieveNeuroDataset',
    input: { query: 'sleep fMRI' },
    response: { datasetId: 'ds000001' },
  },
  {
    name: 'UniProt',
    toolName: 'fetchProteinEntry',
    input: { query: 'P53_HUMAN' },
    response: { accession: 'P04637' },
  },
];

async function importClientModule() {
  const module = await import('../lib/mcp-client');
  return module;
}

beforeEach(() => {
  vi.resetModules();
  mockServerBehaviors.clear();
  createMCPClientMock.mockClear();
  disconnectMocks.length = 0;
});

describe('initializeMCPClients', () => {
  it('aggregates unique servers and keeps duplicates from re-connecting', async () => {
    mockServerBehaviors.set('https://one/mcp', { tools: { oneTool: makeTool('oneTool') } });
    mockServerBehaviors.set('https://two/mcp', { tools: { twoTool: makeTool('twoTool') } });

    const { initializeMCPClients } = await importClientModule();
    const manager = await initializeMCPClients([
      { url: 'https://one/mcp', type: 'sse' },
      { url: 'https://one/mcp', type: 'sse' },
      { url: 'https://two/mcp', type: 'sse' },
    ]);

    expect(Object.keys(manager.tools)).toEqual(expect.arrayContaining(['oneTool', 'twoTool']));
    expect(createMCPClientMock).toHaveBeenCalledTimes(2);
    expect(manager.clients).toHaveLength(2);

    await manager.cleanup();
    expect(disconnectMocks).toHaveLength(2);
    for (const disconnect of disconnectMocks) {
      expect(disconnect).toHaveBeenCalled();
    }
  });

  it('continues despite a failing server and still returns other tools and clients', async () => {
    mockServerBehaviors.set('https://fail/mcp', { fail: true });
    mockServerBehaviors.set('https://ok/mcp', { tools: { okTool: makeTool('okTool') } });

    const { initializeMCPClients } = await importClientModule();
    const manager = await initializeMCPClients([
      { url: 'https://fail/mcp', type: 'sse' },
      { url: 'https://ok/mcp', type: 'sse' },
    ]);

    expect(Object.keys(manager.tools)).toEqual(['okTool']);
    expect(manager.clients).toHaveLength(1);
    expect(createMCPClientMock).toHaveBeenCalledTimes(2);

    await manager.cleanup();
    expect(disconnectMocks).toHaveLength(1);
    expect(disconnectMocks[0]).toHaveBeenCalled();
  });
});

describe('MCP server use cases', () => {
  for (const useCase of serverUseCases) {
    it(`${useCase.name} provides ${useCase.toolName} for its use case`, async () => {
      const server = serversConfig.servers.find((entry) => entry.name === useCase.name);
      expect(server).toBeDefined();
      const normalizedType = server.type === 'sse' ? 'sse' : 'http';
      const mockTool = makeTool(useCase.toolName, useCase.response);
      const callSpy = mockTool.call;
      mockServerBehaviors.set(server.url, {
        tools: { [useCase.toolName]: mockTool },
      });

      const { initializeMCPClients } = await importClientModule();
      const manager = await initializeMCPClients([
        { url: server.url, type: normalizedType },
      ]);

      const tool = manager.tools[useCase.toolName];
      expect(tool).toBeDefined();
      expect(callSpy).not.toHaveBeenCalled();

      const result = await tool.call(useCase.input);

      expect(result).toEqual(useCase.response);
      expect(callSpy).toHaveBeenCalledWith(useCase.input);

      await manager.cleanup();
    });
  }
});
