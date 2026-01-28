/**
 * Generate documentation for helper APIs to include in system prompts
 * This helps the LLM understand available tools without loading all schemas
 */

export interface ParsedDescription {
  summary: string;
  returns?: string;
  examples: string[];
  patterns: string[];
  relatedTools: string[];
  outputStructure?: string;
}

export interface HelperToolDoc {
  name: string;
  description: string;
  parsed?: ParsedDescription;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
}

export interface HelperServerDoc {
  serverName: string;
  helperName: string;
  description: string;
  tools: HelperToolDoc[];
}

/**
 * Parse structured information from tool description
 * Extracts sections like Examples:, Common patterns:, Related tools:, etc.
 */
export function parseToolDescription(description: string): ParsedDescription {
  if (!description) {
    return {
      summary: '',
      examples: [],
      patterns: [],
      relatedTools: [],
    };
  }

  const lines = description.split('\n');
  const summary = lines[0]?.trim() || '';

  // Extract sections
  const returns = extractSingleLineSection(description, 'Returns:');
  const outputStructure = extractSingleLineSection(description, 'Output structure:');
  const examples = extractListSection(description, 'Examples:');
  const patterns = extractListSection(description, 'Common patterns:');
  const relatedToolsText = extractSingleLineSection(description, 'Related tools:');

  // Parse related tools from text
  const relatedTools: string[] = [];
  if (relatedToolsText) {
    // Look for tool names (usually in format "tool_name" or after "Use")
    const toolMatches = relatedToolsText.matchAll(/(?:Use\s+)?([a-z_][a-z0-9_]*)/gi);
    for (const match of toolMatches) {
      if (match[1] && match[1].includes('_')) {
        relatedTools.push(match[1]);
      }
    }
  }

  return {
    summary,
    returns,
    examples,
    patterns,
    relatedTools,
    outputStructure,
  };
}

/**
 * Extract a single-line section value (e.g., "Returns: something")
 */
function extractSingleLineSection(text: string, header: string): string | undefined {
  const regex = new RegExp(`${header}\\s*([^\n]+)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim();
}

/**
 * Extract a list section (e.g., "Examples:" followed by numbered/bulleted items)
 */
function extractListSection(text: string, header: string): string[] {
  const headerIndex = text.indexOf(header);
  if (headerIndex === -1) return [];

  // Get text after header
  const afterHeader = text.slice(headerIndex + header.length);

  // Find next section or end
  const nextSectionMatch = afterHeader.match(/\n\n|(?:Returns:|Examples:|Common patterns:|Related tools:|Output structure:)/);
  const sectionEnd = nextSectionMatch ? nextSectionMatch.index : afterHeader.length;
  const sectionText = afterHeader.slice(0, sectionEnd);

  // Extract list items (numbered, bulleted, or plain lines)
  return sectionText
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      // Match numbered (1., 2.), bulleted (•, -, *), or non-empty lines
      return line && (
        /^\d+\./.test(line) ||
        /^[•\-*]/.test(line) ||
        (line.length > 0 && !line.match(/^[A-Z][a-z]+:/)) // Not a new section header
      );
    })
    .map(line => line.replace(/^[•\-*\d.]+\s*/, '').trim())
    .filter(line => line.length > 0);
}

/**
 * Extract parameter info from JSON schema
 */
function extractParameterInfo(schema: any): Array<{
  name: string;
  type: string;
  required: boolean;
  description?: string;
}> {
  if (!schema || typeof schema !== 'object') {
    return [];
  }

  const properties = schema.properties || {};
  const required = Array.isArray(schema.required) ? schema.required : [];

  return Object.entries(properties).map(([name, propSchema]) => {
    const prop = propSchema as any;
    let type = prop.type || 'any';

    // Simplify type display
    if (Array.isArray(prop.enum)) {
      type = prop.enum.slice(0, 3).map((v: any) => `'${v}'`).join('|');
      if (prop.enum.length > 3) type += '|...';
    } else if (type === 'array') {
      const itemType = prop.items?.type || 'any';
      type = `${itemType}[]`;
    }

    return {
      name,
      type,
      required: required.includes(name),
      description: prop.description,
    };
  });
}

/**
 * Generate concise documentation for a single tool
 */
export function generateToolDoc(toolName: string, toolDef: any): HelperToolDoc {
  const schema = toolDef.parameters?.jsonSchema ||
                 toolDef.parameters ||
                 toolDef.inputSchema ||
                 {};

  const description = toolDef.description || 'No description available';
  const parsed = parseToolDescription(description);

  return {
    name: toolName,
    description,
    parsed,
    parameters: extractParameterInfo(schema),
  };
}

/**
 * Generate documentation for all tools grouped by server
 */
export function generateServerDocs(
  serverTools: Map<string, Record<string, any>>,
  serverNames?: Map<string, string> // Map of server ID to display name
): HelperServerDoc[] {
  const docs: HelperServerDoc[] = [];

  for (const [serverId, tools] of serverTools.entries()) {
    const serverName = serverNames?.get(serverId) || serverId;
    const helperName = serverId.toLowerCase().replace(/[^a-z0-9]/g, '_');

    const toolDocs = Object.entries(tools).map(([name, def]) =>
      generateToolDoc(name, def)
    );

    docs.push({
      serverName,
      helperName,
      description: `Access to ${serverName} tools`,
      tools: toolDocs,
    });
  }

  return docs;
}

/**
 * Generate compact system prompt documentation for Code Mode
 */
export function generateCompactHelperDocs(
  serverTools: Map<string, Record<string, any>>,
  options: {
    maxToolsPerServer?: number;
    includeParameters?: boolean;
    includeExamples?: boolean;
  } = {}
): string {
  const { maxToolsPerServer = 10, includeParameters = false, includeExamples = true } = options;

  const lines: string[] = [
    'Available Helper APIs:',
    '',
  ];

  for (const [serverId, tools] of serverTools.entries()) {
    const helperName = serverId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const toolNames = Object.keys(tools);

    lines.push(`helpers.${helperName}.invoke(toolName, args)`);
    lines.push(`  Available tools: ${toolNames.slice(0, 5).join(', ')}${toolNames.length > 5 ? `, ...${toolNames.length - 5} more` : ''}`);
    lines.push(`  Use helpers.${helperName}.listTools() to see all tools`);
    lines.push(`  Use helpers.${helperName}.searchTools(query) to find relevant tools`);

    // Add example from first tool if available
    if (includeExamples && toolNames.length > 0) {
      const firstToolName = toolNames[0];
      const firstTool = tools[firstToolName];
      const parsed = parseToolDescription(firstTool.description || '');

      if (parsed.examples.length > 0) {
        lines.push(`  Example: helpers.${helperName}.invoke('${firstToolName}', ${parsed.examples[0]})`);
      } else if (includeParameters) {
        const params = extractParameterInfo(
          firstTool.parameters?.jsonSchema || firstTool.parameters || {}
        );
        if (params.length > 0) {
          lines.push(`  Example: helpers.${helperName}.invoke('${firstToolName}', { ${params[0].name}: ... })`);
        }
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate detailed helper documentation for learning/reference
 */
export function generateDetailedHelperDocs(
  serverDocs: HelperServerDoc[]
): string {
  const lines: string[] = [
    '# Available Helper APIs',
    '',
    'The following helper APIs are available in your code execution environment:',
    '',
  ];

  for (const server of serverDocs) {
    lines.push(`## helpers.${server.helperName}`);
    lines.push('');
    lines.push(server.description);
    lines.push('');

    // List all tools method
    lines.push(`### \`helpers.${server.helperName}.listTools()\``);
    lines.push('Returns a list of all available tool names.');
    lines.push('');

    // Invoke method
    lines.push(`### \`helpers.${server.helperName}.invoke(toolName, args)\``);
    lines.push('');

    // List up to 10 tools with descriptions
    const toolsToShow = server.tools.slice(0, 10);
    for (const tool of toolsToShow) {
      lines.push(`**\`${tool.name}\`** - ${tool.description}`);

      if (tool.parameters.length > 0) {
        const requiredParams = tool.parameters.filter(p => p.required);
        const optionalParams = tool.parameters.filter(p => !p.required);

        if (requiredParams.length > 0) {
          lines.push(`  - Required: ${requiredParams.map(p => `${p.name} (${p.type})`).join(', ')}`);
        }
        if (optionalParams.length > 0 && optionalParams.length <= 3) {
          lines.push(`  - Optional: ${optionalParams.map(p => `${p.name} (${p.type})`).join(', ')}`);
        }
      }

      lines.push('');
    }

    if (server.tools.length > 10) {
      lines.push(`...and ${server.tools.length - 10} more tools. Use \`listTools()\` to see all.`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate tool search index for discovery
 */
export function generateToolSearchIndex(
  serverTools: Map<string, Record<string, any>>
): Map<string, { serverId: string; toolName: string; tool: any }> {
  const index = new Map<string, { serverId: string; toolName: string; tool: any }>();

  for (const [serverId, tools] of serverTools.entries()) {
    for (const [toolName, tool] of Object.entries(tools)) {
      // Index by tool name
      index.set(toolName.toLowerCase(), { serverId, toolName, tool });

      // Index by keywords from description
      const description = tool.description || '';
      const keywords = description.toLowerCase().match(/\b\w{4,}\b/g) || [];
      for (const keyword of keywords.slice(0, 5)) {
        const key = `keyword:${keyword}:${toolName}`;
        index.set(key, { serverId, toolName, tool });
      }
    }
  }

  return index;
}

/**
 * Generate common usage examples for helper APIs
 * These examples show typical workflows and correct parameter usage
 */
export function generateUsageExamples(): string {
  return `
## Response Format

Your code must return a PLAIN TEXT STRING. This becomes your response to the user.

**✓ CORRECT - Return a formatted string:**
\`\`\`javascript
const proteins = await helpers.uniprot.getData("search", { query: "TP53" });
return \`Found \${proteins.length} proteins for TP53. Top result: \${proteins[0]?.name || "N/A"}\`;
\`\`\`

**✗ WRONG - Never return objects:**
\`\`\`javascript
return { summary: "Found proteins", data: proteins };  // BAD!
\`\`\`

## Cross-Server ID Resolution (IMPORTANT)

**⚠️ NEVER hard-code database IDs (UniProt accessions, PDB IDs, Ensembl IDs, etc.)!** Even if you "know" the ID from training data, ALWAYS resolve it dynamically using the appropriate tool. Database IDs change, and hard-coded IDs may be outdated or wrong.

When querying across servers, you must resolve identifiers dynamically. Here's what each server provides and requires:

**ID Providers (use these to lookup/resolve IDs):**
- \`helpers.uniprot.getData("uniprot_search", { query: "gene:BRCA1" })\` → UniProt accession
- \`helpers.uniprot.getData("uniprot_id_mapping", { from_db: "Gene_Name", to_db: "UniProtKB", ids: ["BRCA1"] })\` → Maps gene names to UniProt
- \`helpers.entrez.getData("entrez_query", { operation: "search", database: "gene", term: "TP53" })\` → NCBI Gene ID
- \`helpers.entrez.getData("entrez_query", { operation: "search", database: "pubmed", term: "BRCA1" })\` → PubMed IDs
- \`helpers.opentargets.getData("opentargets_graphql_query", { query: "{ search(queryString: \\"BRCA1\\") { hits { id } } }" })\` → Ensembl ID
- \`helpers.civic.getData("civic_search_genes", { query: "BRCA1" })\` → CIViC gene ID for variant queries

**Server-Specific ID Requirements:**

| Server | Accepts | Lookup Method |
|--------|---------|---------------|
| **UniProt** | Gene names, UniProt accessions | Primary source - use for initial resolution |
| **RCSB PDB** | PDB IDs, UniProt accessions | First resolve gene → UniProt, then query PDB |
| **OpenTargets** | Ensembl IDs (ENSG...) | Use OpenTargets search or UniProt ID mapping |
| **Pharos** | UniProt IDs, gene symbols | Use UniProt search or gene symbol directly |
| **CIViC** | Gene names, variant names | Use civic_search_genes for gene ID, then query variants |
| **DGIdb** | Gene names, drug names | Accepts gene symbols directly via GraphQL |
| **ClinicalTrials** | Conditions, interventions, NCT IDs | Use condition/intervention text search |
| **NCI GDC** | Gene symbols, project IDs | Use gene symbols; explore projects first |
| **Entrez** | Gene symbols, PMIDs, various IDs | Use entrez_query with appropriate database |

**Common ID Resolution Chains:**
- Gene → Protein: \`gene name\` → UniProt search → \`UniProt accession\`
- Gene → Structure: \`gene name\` → UniProt → \`accession\` → RCSB PDB
- Gene → Drugs: \`gene name\` → DGIdb/Pharos (accepts gene symbols)
- Gene → Variants: \`gene name\` → CIViC search → \`gene_id\` → variant queries
- Gene → Diseases: \`gene name\` → OpenTargets search → \`Ensembl ID\` → disease associations
- Gene → Trials: \`gene name\` → ClinicalTrials condition/intervention search

### Cross-Server Chaining Example

**Step 1:** User asks "What structures exist for BRCA1?" - you don't have the UniProt accession.
**Step 2:** First resolve the gene name to UniProt accession, then query PDB.

**✗ WRONG - Never hard-code IDs:**
\`\`\`javascript
// BAD! Don't hard-code IDs even if you "know" them
const accession = "P38398";  // WRONG!
const pdbIds = ["1JNX", "1JMZ"];  // WRONG!
const structures = await helpers.rcsbpdb.getData("fetch", { pdb_ids: pdbIds });
\`\`\`

**✓ CORRECT - Always resolve IDs dynamically:**

\`\`\`javascript
// Step 1: Resolve gene name to UniProt accession
const mapping = await helpers.uniprot.getData("uniprot_id_mapping", {
  from_db: "Gene_Name",
  to_db: "UniProtKB",
  ids: ["BRCA1"],
  taxon_id: "9606"  // human
});
const accession = mapping?.results?.[0]?.to?.primaryAccession || mapping?.results?.[0]?.to;

// Step 2: Now query PDB with the resolved accession
const structures = await helpers.rcsbpdb.getData("search_by_uniprot", { uniprot_id: accession });

return \`## BRCA1 Protein Structures

UniProt accession: \${accession}
Found \${structures?.length || 0} PDB structures.

Top structures:
\${(structures || []).slice(0, 5).map(s => \`- \${s.pdb_id}: \${s.title || "N/A"}\`).join("\\n")}\`;
\`\`\`

### Multi-Source Example
\`\`\`javascript
const proteins = await helpers.uniprot.getData("uniprot_search", { query: "gene:BRCA1 AND organism_id:9606" });
const diseases = await helpers.opentargets.getData("get_disease_associated_targets", { efo_id: "EFO_0000305" });

return \`## BRCA1 Analysis

**Proteins:** \${proteins?.results?.length || 0} entries found
**Top isoform:** \${proteins?.results?.[0]?.primaryAccession || "Unknown"}

**Associated diseases:** \${diseases?.disease?.associatedTargets?.count || 0} conditions
\`;
\`\`\`

### Large Dataset Pattern (>100 records)
\`\`\`javascript
const search = await helpers.entrez.getData('entrez_query', {
  operation: 'search', database: 'pubmed', term: 'cancer AND 2024[pdat]', retmax: 100
});

const staged = await helpers.entrez.getData('entrez_data', {
  operation: 'fetch_and_stage', database: 'pubmed', ids: search.idlist.join(',')
});

const topJournals = await helpers.entrez.getData('entrez_data', {
  operation: 'query', data_access_id: staged.data_access_id,
  sql: 'SELECT journal, COUNT(*) as count FROM article GROUP BY journal ORDER BY count DESC LIMIT 5'
});

return \`## Cancer Research Papers (2024)

Found \${search.count} papers. Top journals:
\${topJournals.map(j => \`- \${j.journal}: \${j.count} papers\`).join('\\n')}\`;
\`\`\`

### Drug-Gene Interactions (DGIdb/Pharos)
\`\`\`javascript
// DGIdb accepts gene symbols directly
const drugs = await helpers.dgidb.getData("dgidb_graphql_query", {
  query: \`{ genes(names: ["EGFR"]) { nodes { name interactions { nodes { drug { name } interactionScore } } } } }\`
});

// Or use Pharos for more comprehensive drug target info
const target = await helpers.pharos.getData("pharos_graphql_query", {
  query: \`{ target(q: { sym: "EGFR" }) { name tdl drugs { name } } }\`
});

return \`## EGFR Drug Interactions
Drugs targeting EGFR: \${drugs?.data?.genes?.nodes?.[0]?.interactions?.nodes?.length || 0}\`;
\`\`\`

### Clinical Trials Search
\`\`\`javascript
// Search clinical trials by condition and intervention
const trials = await helpers.clinicaltrials.getData("ctgov_search_studies", {
  query_cond: "breast cancer",
  query_intr: "BRCA1",
  recrs: "open",
  pageSize: 20
});

return \`## BRCA1 Breast Cancer Trials
Found \${trials?.studies?.length || 0} open trials.\`;
\`\`\`

### CIViC Variant Evidence
\`\`\`javascript
// First search for the gene
const genes = await helpers.civic.getData("civic_search_genes", { query: "BRAF" });
const geneId = genes?.nodes?.[0]?.id;

// Then get variants for that gene
const variants = await helpers.civic.getData("civic_variants", { geneId: geneId });

return \`## BRAF Variants in CIViC
Found \${variants?.nodes?.length || 0} variants with clinical evidence.\`;
\`\`\`

### NCI GDC Cancer Mutations
\`\`\`javascript
// Query mutations for a gene in cancer samples
const mutations = await helpers.ncigdc.getData("gdc_graphql_query", {
  query: \`{
    explore {
      ssms {
        hits(filters: { content: { field: "consequence.transcript.gene.symbol", value: ["TP53"] } }) {
          edges { node { ssm_id genomic_dna_change } }
        }
      }
    }
  }\`
});

return \`## TP53 Mutations in GDC
Found mutations across cancer samples.\`;
\`\`\`

### Complete Gene Analysis Pipeline
\`\`\`javascript
// Comprehensive analysis: gene → protein → structure → drugs → trials
const geneName = "ALK";

// Step 1: Get protein info from UniProt
const protein = await helpers.uniprot.getData("uniprot_search", {
  query: \`gene:\${geneName} AND organism_id:9606 AND reviewed:true\`
});
const accession = protein?.results?.[0]?.primaryAccession;

// Step 2: Get structures from PDB (using UniProt cross-references)
const entry = await helpers.uniprot.getData("uniprot_entry", { accession });
const pdbRefs = entry?.uniProtKBCrossReferences?.filter(r => r.database === "PDB") || [];

// Step 3: Get drug interactions from DGIdb
const drugs = await helpers.dgidb.getData("dgidb_graphql_query", {
  query: \`{ genes(names: ["\${geneName}"]) { nodes { interactions { nodes { drug { name } } } } } }\`
});

// Step 4: Get clinical trials
const trials = await helpers.clinicaltrials.getData("ctgov_search_studies", {
  query_term: geneName,
  type: "intr",
  recrs: "open"
});

return \`## \${geneName} Comprehensive Analysis

**Protein:** \${accession || "Not found"}
**PDB Structures:** \${pdbRefs.length}
**Drug Interactions:** \${drugs?.data?.genes?.nodes?.[0]?.interactions?.nodes?.length || 0}
**Open Clinical Trials:** \${trials?.studies?.length || 0}\`;
\`\`\`
`.trim();
}

/**
 * Generate response type hints for common MCP server APIs
 * This helps LLMs understand expected response shapes and avoid type errors
 * like "targetsData.map is not a function"
 */
export function generateResponseTypeHints(): string {
  return `
## Response Type Hints (CRITICAL)

**⚠️ API responses vary in structure. ALWAYS use defensive extraction patterns.**

### Common Response Wrappers

Most APIs wrap data in container objects. NEVER assume an array is returned directly:

| Pattern | Example APIs | Safe Extraction |
|---------|--------------|-----------------|
| \`{ results: T[] }\` | UniProt, OpenTargets search | \`response?.results || []\` |
| \`{ data: T[] }\` | OpenTargets GraphQL | \`response?.data?.targets || []\` |
| \`{ nodes: T[] }\` | CIViC, DGIdb GraphQL | \`response?.nodes || []\` |
| \`{ studies: T[] }\` | ClinicalTrials.gov | \`response?.studies || []\` |
| \`{ hits: T[] }\` | OpenTargets search | \`response?.hits || []\` |
| \`{ edges: [{node: T}] }\` | GraphQL connections | \`response?.edges?.map(e => e.node) || []\` |
| \`{ idlist: string[] }\` | Entrez search | \`response?.idlist || []\` |

### Server-Specific Response Shapes

**UniProt:**
\`\`\`typescript
// uniprot_search response
{ results: Array<{ primaryAccession: string; uniProtkbId: string; ... }> }

// uniprot_entry response
{ primaryAccession: string; sequence: { value: string; length: number }; ... }

// uniprot_id_mapping response
{ results: Array<{ from: string; to: { primaryAccession: string } | string }> }

// Safe extraction:
const accession = mapping?.results?.[0]?.to?.primaryAccession || mapping?.results?.[0]?.to;
const proteins = response?.results || [];
\`\`\`

**OpenTargets:**
\`\`\`typescript
// GraphQL responses are nested under 'data'
{ data: { search: { hits: Array<{ id: string; name: string; ... }> } } }
{ data: { target: { id: string; associatedDiseases: { rows: Array<...> } } } }
{ data: { disease: { associatedTargets: { rows: Array<...>; count: number } } } }

// Safe extraction:
const hits = response?.data?.search?.hits || [];
const targets = response?.data?.disease?.associatedTargets?.rows || [];
const count = response?.data?.disease?.associatedTargets?.count || 0;
\`\`\`

**CIViC:**
\`\`\`typescript
// GraphQL responses use 'nodes' pattern
{ nodes: Array<{ id: number; name: string; ... }>, totalCount: number }

// Connections have edges
{ edges: Array<{ node: { id: number; ... } }> }

// Safe extraction:
const genes = response?.nodes || [];
const variants = response?.edges?.map(e => e.node) || [];
\`\`\`

**Entrez/NCBI:**
\`\`\`typescript
// entrez_query search response
{ count: number; idlist: string[]; ... }

// entrez_data fetch response (varies by database)
// PubMed: { result: { [pmid]: { title: string; authors: [...] } } }
// Gene: { result: { [geneId]: { symbol: string; ... } } }

// Safe extraction:
const ids = response?.idlist || [];
const count = parseInt(response?.count) || 0;
\`\`\`

**ClinicalTrials.gov:**
\`\`\`typescript
// ctgov_search_studies response
{ studies: Array<{ protocolSection: { ... }; ... }>; totalCount: number }

// Safe extraction:
const studies = response?.studies || [];
const total = response?.totalCount || 0;
\`\`\`

**RCSB PDB:**
\`\`\`typescript
// search_by_uniprot response
Array<{ pdb_id: string; title?: string; ... }>  // NOTE: Direct array!

// fetch response
{ entry: { id: string; struct: { title: string }; ... } }

// Safe extraction:
const structures = Array.isArray(response) ? response : [];
\`\`\`

**DGIdb:**
\`\`\`typescript
// GraphQL response
{ data: { genes: { nodes: Array<{ name: string; interactions: { nodes: [...] } }> } } }

// Safe extraction:
const genes = response?.data?.genes?.nodes || [];
const interactions = genes[0]?.interactions?.nodes || [];
\`\`\`

**Pharos:**
\`\`\`typescript
// GraphQL response
{ data: { targets: Array<{ name: string; tdl: string; ... }> } }
{ data: { target: { name: string; drugs: Array<...> } } }

// Safe extraction:
const targets = response?.data?.targets || [];
const drugs = response?.data?.target?.drugs || [];
\`\`\`

**NCI GDC:**
\`\`\`typescript
// GraphQL explore response
{ data: { explore: { ssms: { hits: { edges: Array<{ node: { ... } }> } } } } }
{ data: { explore: { genes: { hits: { edges: [...] } } } } }

// Safe extraction:
const mutations = response?.data?.explore?.ssms?.hits?.edges?.map(e => e.node) || [];
\`\`\`

### Defensive Extraction Patterns

**Always check before iterating:**
\`\`\`javascript
// ✓ CORRECT - Check type before map
const items = response?.results || [];
if (!Array.isArray(items)) {
  return "Unexpected response format";
}
const names = items.map(i => i.name);

// ✓ CORRECT - Use optional chaining with fallback
const count = response?.data?.associatedTargets?.count ?? 0;
const rows = response?.data?.associatedTargets?.rows || [];

// ✗ WRONG - Assumes response is array
const names = response.map(i => i.name);  // TypeError if response is object!

// ✗ WRONG - No null check
const first = response.results[0].name;  // TypeError if results undefined!
\`\`\`

**Safe iteration patterns:**
\`\`\`javascript
// For arrays that might be undefined/null
(items || []).map(i => i.name)
(items ?? []).forEach(i => process(i))

// For possibly-empty results
const first = items?.[0]?.name || "Unknown";

// For nested GraphQL data
const targets = response?.data?.disease?.associatedTargets?.rows || [];
targets.slice(0, 10).map(t => t.target?.approvedSymbol || "N/A")
\`\`\`

### Type Coercion Safety

**Numbers from APIs may be strings:**
\`\`\`javascript
// ✓ Safe number handling
const count = parseInt(response?.count) || 0;
const score = parseFloat(response?.score) ?? 0;

// ✗ Unsafe - may get "100" string
const count = response.count + 1;  // "1001" if count is "100"!
\`\`\`

**IDs may be numbers or strings:**
\`\`\`javascript
// ✓ Safe ID handling (always convert to string for comparison)
const id = String(response?.id || "");
const matches = items.filter(i => String(i.id) === targetId);
\`\`\`
`.trim();
}

/**
 * Generate compact response type hints for system prompts
 * This is a shorter version optimized for token efficiency
 */
export function generateCompactResponseTypeHints(): string {
  return `
## API Response Patterns (CRITICAL - Prevent Type Errors)

**⚠️ NEVER assume response shape. ALWAYS use defensive extraction.**

### Common Response Wrappers (use these patterns):
| API | Response Shape | Safe Extraction |
|-----|---------------|-----------------|
| UniProt search | \`{ results: [...] }\` | \`response?.results || []\` |
| OpenTargets | \`{ data: { X: { rows: [...] } } }\` | \`response?.data?.X?.rows || []\` |
| CIViC | \`{ nodes: [...] }\` | \`response?.nodes || []\` |
| ClinicalTrials | \`{ studies: [...] }\` | \`response?.studies || []\` |
| Entrez search | \`{ idlist: [...], count: N }\` | \`response?.idlist || []\` |
| GraphQL edges | \`{ edges: [{node:...}] }\` | \`response?.edges?.map(e=>e.node) || []\` |
| RCSB PDB | Direct array OR object | \`Array.isArray(r) ? r : []\` |

### Mandatory Defensive Patterns:
\`\`\`javascript
// ✓ ALWAYS check before iterating
const items = response?.results || [];
if (!Array.isArray(items)) return "Unexpected response";
const names = items.map(i => i.name);

// ✓ ALWAYS use fallbacks for nested data
const targets = response?.data?.disease?.associatedTargets?.rows || [];
const count = response?.data?.disease?.associatedTargets?.count ?? 0;

// ✗ WRONG - Will crash if response is not array
response.map(i => i.name);  // TypeError!

// ✗ WRONG - No null check
response.results[0].name;  // TypeError if undefined!
\`\`\`
`.trim();
}

/**
 * Enhanced search that uses parsed descriptions
 */
export function searchToolsWithParsing(
  tools: Record<string, any>,
  query: string
): Array<{ name: string; relevance: number; reason: string }> {
  const queryLower = query.toLowerCase();
  const results: Array<{ name: string; relevance: number; reason: string }> = [];

  for (const [name, tool] of Object.entries(tools)) {
    let relevance = 0;
    const reasons: string[] = [];

    // 1. Name match (highest priority)
    if (name.toLowerCase().includes(queryLower)) {
      relevance += 10;
      reasons.push('name match');
    }

    // 2. Parse description for structured search
    const parsed = parseToolDescription(tool.description || '');

    // 3. Summary match
    if (parsed.summary.toLowerCase().includes(queryLower)) {
      relevance += 5;
      reasons.push('summary match');
    }

    // 4. Examples match
    for (const example of parsed.examples) {
      if (example.toLowerCase().includes(queryLower)) {
        relevance += 3;
        reasons.push('example match');
        break;
      }
    }

    // 5. Patterns match
    for (const pattern of parsed.patterns) {
      if (pattern.toLowerCase().includes(queryLower)) {
        relevance += 2;
        reasons.push('pattern match');
        break;
      }
    }

    // 6. Related tools match
    for (const relatedTool of parsed.relatedTools) {
      if (relatedTool.toLowerCase().includes(queryLower)) {
        relevance += 1;
        reasons.push('related tool');
        break;
      }
    }

    // 7. General description match (lowest priority)
    if (relevance === 0 && tool.description?.toLowerCase().includes(queryLower)) {
      relevance += 1;
      reasons.push('description match');
    }

    if (relevance > 0) {
      results.push({
        name,
        relevance,
        reason: reasons.join(', '),
      });
    }
  }

  // Sort by relevance (descending)
  return results.sort((a, b) => b.relevance - a.relevance);
}
