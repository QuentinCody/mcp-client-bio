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
## Common Usage Examples

### CRITICAL: Use Data Staging for Large Datasets (>100 records)

**❌ WRONG - Loading thousands of records into memory:**
\`\`\`javascript
const search = await helpers.entrez.invoke('entrez_query', {
  operation: 'search',
  database: 'pubmed',
  term: 'cancer',
  retmax: 5000  // Don't fetch all into context!
});
// This wastes tokens and may hit limits
\`\`\`

**✅ RIGHT - Stage data and use SQL:**
\`\`\`javascript
// Step 1: Search (get IDs only)
const search = await helpers.entrez.invoke('entrez_query', {
  operation: 'search',
  database: 'pubmed',
  term: 'cancer AND 2024[pdat]',
  retmax: 5000
});

// Step 2: Stage the data in SQLite
const staged = await helpers.entrez.invoke('entrez_data', {
  operation: 'fetch_and_stage',
  database: 'pubmed',
  ids: search.idlist.join(',')  // Can handle 1000+ IDs
});

// Step 3: Use SQL to aggregate/filter (runs server-side!)
const byJournal = await helpers.entrez.invoke('entrez_data', {
  operation: 'query',
  data_access_id: staged.data_access_id,
  sql: \`
    SELECT
      journal,
      COUNT(*) as count,
      AVG(CAST(citation_count AS REAL)) as avg_citations
    FROM article
    WHERE journal IS NOT NULL
    GROUP BY journal
    ORDER BY count DESC
    LIMIT 20
  \`
});

// Only the top 20 journals returned - much smaller!
return byJournal.results;
\`\`\`

### Pattern: Search → Stage → Query with SQL

This is the MOST IMPORTANT pattern for large-scale data work:

\`\`\`javascript
// 1. Search for IDs
const search = await helpers.entrez.invoke('entrez_query', {
  operation: 'search',
  database: 'pubmed',
  term: 'CRISPR AND therapy',
  retmax: 1000
});

console.log(\`Found \${search.count} papers, fetching \${search.idlist.length}\`);

// 2. Stage full data
const staged = await helpers.entrez.invoke('entrez_data', {
  operation: 'fetch_and_stage',
  database: 'pubmed',
  ids: search.idlist.join(',')
});

console.log(\`Staged \${staged.row_count} articles in table: \${staged.table}\`);

// 3. Query with SQL - examples:

// Get recent highly-cited papers
const topPapers = await helpers.entrez.invoke('entrez_data', {
  operation: 'query',
  data_access_id: staged.data_access_id,
  sql: \`
    SELECT pmid, title, journal, pub_date, citation_count
    FROM article
    WHERE citation_count > 10
    AND pub_date >= '2023-01-01'
    ORDER BY citation_count DESC
    LIMIT 50
  \`
});

// Get papers WITH abstracts containing specific terms
const relevantPapers = await helpers.entrez.invoke('entrez_data', {
  operation: 'query',
  data_access_id: staged.data_access_id,
  sql: \`
    SELECT pmid, title, abstract
    FROM article
    WHERE abstract LIKE '%clinical trial%'
    AND abstract IS NOT NULL
    LIMIT 100
  \`
});

// Temporal analysis
const byYear = await helpers.entrez.invoke('entrez_data', {
  operation: 'query',
  data_access_id: staged.data_access_id,
  sql: \`
    SELECT
      strftime('%Y', pub_date) as year,
      COUNT(*) as paper_count
    FROM article
    WHERE pub_date IS NOT NULL
    GROUP BY year
    ORDER BY year DESC
  \`
});

return { topPapers, relevantPapers, byYear };
\`\`\`

### Multi-Database Integration

Combining data from multiple sources:

\`\`\`javascript
// Get gene variants from CIViC
const civicVariants = await helpers.civic.invoke('search_variants', {
  gene: 'TP53',
  disease: 'cancer'
});

// Get clinical trials
const trials = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_search_studies', {
  query_intr: 'TP53',
  query_cond: 'cancer',
  recrs: 'open',
  pageSize: 500,
  jq_filter: '.'
});

// If trials are numerous, they may be staged
if (trials.data_access_id) {
  // Query only phase 3 trials
  const phase3 = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_query_data', {
    data_access_id: trials.data_access_id,
    sql: \`
      SELECT nct_id, title, phase, status
      FROM studies
      WHERE phase = '3'
      ORDER BY start_date DESC
      LIMIT 50
    \`
  });

  return {
    variants: civicVariants,
    total_trials: trials.totalCount,
    phase3_trials: phase3.results
  };
}
\`\`\`

### Advanced SQL Techniques

**Window functions for ranking:**
\`\`\`javascript
const ranked = await helpers.entrez.invoke('entrez_data', {
  operation: 'query',
  data_access_id: staged.data_access_id,
  sql: \`
    SELECT
      pmid,
      title,
      citation_count,
      ROW_NUMBER() OVER (ORDER BY citation_count DESC) as rank,
      PERCENT_RANK() OVER (ORDER BY citation_count) as percentile
    FROM article
    WHERE citation_count > 0
    ORDER BY rank
    LIMIT 100
  \`
});
\`\`\`

**Common Table Expressions (CTEs) for complex queries:**
\`\`\`javascript
const analysis = await helpers.entrez.invoke('entrez_data', {
  operation: 'query',
  data_access_id: staged.data_access_id,
  sql: \`
    WITH recent AS (
      SELECT * FROM article WHERE pub_date >= '2023-01-01'
    ),
    highly_cited AS (
      SELECT * FROM recent WHERE citation_count > 50
    )
    SELECT
      journal,
      COUNT(*) as count,
      AVG(citation_count) as avg_citations
    FROM highly_cited
    GROUP BY journal
    HAVING count >= 3
    ORDER BY avg_citations DESC
  \`
});
\`\`\`

**JSON extraction (when metadata is stored as JSON):**
\`\`\`javascript
const parsed = await helpers.server.invoke('query_staged', {
  data_access_id: staged.data_access_id,
  sql: \`
    SELECT
      id,
      json_extract(metadata, '$.author') as author,
      json_extract(metadata, '$.year') as year
    FROM publications
    WHERE CAST(json_extract(metadata, '$.year') AS INTEGER) >= 2020
  \`
});
\`\`\`

### When to Use Staging vs Direct Queries

**Use staging when:**
- Working with >100 records
- Need filtering, aggregation, or sorting
- Performing multi-step analysis
- Combining data from multiple queries
- Need to reference same dataset multiple times

**Direct queries when:**
- Need <20 records
- Simple ID lookup
- Quick exploratory search
- Only need metadata/counts

### Search clinical trials (simple case)
\`\`\`javascript
const trials = await helpers.clinicaltrials.invoke('mcp_clinicaltrial_ctgov_search_studies', {
  query_cond: 'breast cancer',
  phase: '3',
  recrs: 'open',
  pageSize: 20,
  jq_filter: '.'
});
// For small result sets, data is returned directly
\`\`\`

**Important Notes:**
- **ALWAYS use data staging for >100 records** - it's designed for this!
- Use SQL for filtering/aggregation instead of JavaScript loops
- Staged data persists for ~1-2 hours in session
- SQL runs server-side, saving tokens and memory
- Always use exact parameter names from schema (e.g., 'term' not 'query', 'ids' not 'id')
- Structured responses provide direct data access (no regex parsing needed)
- See docs/large-scale-data-workflows.md for comprehensive patterns
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
