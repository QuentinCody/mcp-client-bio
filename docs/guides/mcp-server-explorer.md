# MCP Server Explorer

## Where the data lives
The canonical list of MCP servers is `config/mcp-servers.json`—it adheres to `config/mcp-servers.schema.json` and is loaded early inside `lib/context/mcp-context.tsx` by the `MCPProvider`. Any UI that needs server metadata (names, descriptions, transport URLs, OAuth settings, etc.) reads from that context so they stay coordinated with the JSON file.

## How the UI surfaces MCP servers
- `components/mcp-server-manager.tsx`: Lets you inspect, add, or remove MCP servers and mirrors the JSON entries for each server. You can trigger OAuth flows here (BioMCP Remote) and toggle servers on/off.
- `components/chat-sidebar.tsx`: Shows the “MCP Servers” section, reports connection status, and links to the manager so you can explore which servers are active right from the sidebar.
- `components/chat-session-toolbar.tsx`: Displays how many MCP servers are selected for the current session and lets you drop into the settings sheet where you can inspect server details.
- `components/project-overview.tsx`: Highlights how many MCP servers are available versus connected and encourages toggling transports to blend SSE/HTTP servers per request.
- `components/prompts/slash-prompt-menu.tsx` & `components/prompts/enhanced-prompt-preview.tsx`: Surface slash commands derived from MCP servers (formatted as `/mcp.<server>.<prompt>`) and show which server will execute each prompt so you can explore the toolset.
- `components/chat.tsx` and `components/textarea.tsx`: Both consume `useMCP()` to keep the chat composer aware of the selected MCP servers, show status badges, and feed prompt metadata into the composer experience.
- `app/api/chat/route.ts`: Merges the selected MCP servers from the client with any defaults before initializing MCP clients, so changing `config/mcp-servers.json` affects every chat request.

## Server catalog

| Name | Transport | Endpoint | Why use it |
| --- | --- | --- | --- |
| **BioMCP Remote** | `streamable-http` | `https://remote.biomcp.org/mcp` | A hosted, OAuth-protected BioMCP server with general-purpose biological tooling. Use it when you want authenticated access to the curated BioMCP prompt library and tools. |
| **ClinicalTrials** | `streamable-http` | `https://clinicaltrialsgov-mcp-server.quentincody.workers.dev/mcp` | Access the ClinicalTrials.gov database. Useful when you need trial eligibility, study milestones, principal investigators, or intervention descriptions. |
| **OpenTargets** | `streamable-http` | `https://open-targets-mcp-server.quentincody.workers.dev/mcp` | Tap into genetics-and-drug-discovery datasets. Use it for gene-disease association evidence, target prioritization, or therapeutic hypothesis generation. |
| **Entrez** | `streamable-http` | `https://entrez-mcp-server.quentincody.workers.dev/mcp` | Proxy to NCBI’s Entrez system so you can search PubMed, Gene, Protein, and other NCBI resources without directly calling the public APIs. |
| **CIViC** | `streamable-http` | `https://civic-mcp-server.quentincody.workers.dev/mcp` | Query the Clinical Interpretations of Variants in Cancer knowledgebase—handy for precision oncology variant annotations and evidence statements. |
| **CatalysisHub** | `sse` | `https://catalysis-hub-mcp-server.quentincody.workers.dev/sse` | Provides catalytic materials and reaction data. Use it when exploring heterogeneous catalysis datasets or looking up reaction energetics. |
| **DataCite** | `streamable-http` | `https://datacite-mcp-server.quentincody.workers.dev/mcp` | Fetch metadata for scholarly datasets via DOI. Useful for citing datasets, tracking provenance, or discovering related studies. |
| **RCSB PDB** | `sse` | `https://rcsb-pdb-mcp-server.quentincody.workers.dev/sse` | Access the Protein Data Bank for macromolecular structures and related metadata, ideal when reasoning about protein shape, ligands, or experimental methods. |
| **NCI GDC** | `streamable-http` | `https://nci-gdc-mcp-server.quentincody.workers.dev/mcp` | Connect to the NCI Genomic Data Commons for cancer genomics datasets and clinical metadata, which is helpful for cohort definitions and mutation summaries. |
| **Pharos** | `sse` | `https://pharos-mcp-server.quentincody.workers.dev/sse` | Explore the Pharos druggable genome portal—good for checking target development levels, tractability, and associated ligands. |
| **NCI PDC** | `sse` | `https://nci-pdc-mcp-server.quentincody.workers.dev/sse` | Fetch proteogenomic and imaging data from the NCI Proteogenomic Data Commons to supplement genomic findings with protein expression context. |
| **DGIdb** | `streamable-http` | `https://dgidb-mcp-server.quentincody.workers.dev/mcp` | Query the Drug-Gene Interaction Database to surface known inhibitors, activators, or clinical drugs tied to genes of interest. |
| **ZincBind** | `sse` | `https://zincbind-mcp-server.quentincody.workers.dev/sse` | Lookup protein metal-binding interactions from the ZincBind resource—beneficial for metalloprotein or structural biology work. |
| **OpenNeuro** | `sse` | `https://open-neuro-mcp-server.quentincody.workers.dev/sse` | Pull neuroimaging dataset metadata from OpenNeuro, helpful when you need dataset descriptions, modalities, or DOI references. |
| **UniProt** | `sse` | `https://uniprot-mcp-server.quentincody.workers.dev/sse` | Access UniProt protein records, sequences, and annotations. Use this for protein function, domain, or cross-reference lookups. |

Every entry above mirrors the JSON fields (name, type, url, description), and the “Why use it” column gives a quick rationale tied to the data each server exposes.

## Tips for exploration
- Open the sidebar (or the chat toolbar picker) to see which MCP servers are connected before composing a prompt—those components read from the same context that backs the server catalog.
- Use `/mcp.<server>` slash commands (browse via the prompt menu) to discover available prompts for each server without leaving the chat.
- If you need to add or tweak a server, edit `config/mcp-servers.json` and restart (`pnpm dev` or `pnpm build && pnpm start`) so the `MCPProvider` picks up the change.
