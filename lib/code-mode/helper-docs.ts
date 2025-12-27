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
- \`helpers.uniprot.getData("uniprot_search", { query: "gene:BRCA1" })\` → UniProt accession (P38398)
- \`helpers.uniprot.getData("uniprot_id_mapping", { from_db: "Gene_Name", to_db: "UniProtKB", ids: ["BRCA1"] })\` → Maps gene names to UniProt
- \`helpers.entrez.getData("entrez_query", { operation: "search", database: "gene", term: "TP53" })\` → Gene ID
- \`helpers.opentargets.getData("opentargets_graphql_query", { query: "{ search(queryString: \\"BRCA1\\") { hits { id } } }" })\` → Ensembl ID

**ID Consumers (what they require):**
- OpenTargets \`get_target_info\`: Requires Ensembl ID (ENSG...). Don't have one? First use OpenTargets search or UniProt ID mapping.
- RCSB PDB: Requires PDB ID or UniProt accession. Don't have one? First lookup via UniProt search.
- Pharos: Requires UniProt ID or gene symbol.

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
