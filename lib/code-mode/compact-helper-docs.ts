/**
 * Compact Helper Documentation Generator
 *
 * Generates minimal documentation for Code Mode that uses ~90% fewer tokens
 * than full TypeScript interfaces while still enabling effective code generation.
 *
 * Strategy: Instead of full interface definitions, provide:
 * 1. Server names with tool counts
 * 2. Tool names grouped by category/pattern
 * 3. Common parameter patterns (not per-tool schemas)
 * 4. Reference to getToolSchema() for details
 */

export interface CompactServerDoc {
  name: string;
  toolCount: number;
  categories: Array<{
    name: string;
    tools: string[];
  }>;
}

/**
 * Categorize tools by common prefixes/patterns
 */
function categorizeTool(toolName: string): string {
  const name = toolName.toLowerCase();

  // Common patterns
  if (name.includes('search') || name.includes('query')) return 'search';
  if (name.includes('fetch') || name.includes('get') || name.includes('retrieve')) return 'fetch';
  if (name.includes('list') || name.includes('browse')) return 'list';
  if (name.includes('parse') || name.includes('validate')) return 'parse';
  if (name.includes('link') || name.includes('map') || name.includes('convert')) return 'link';
  if (name.includes('stage') || name.includes('data')) return 'data';
  if (name.includes('graphql')) return 'graphql';

  // Default to first word before underscore
  const firstPart = name.split('_')[0];
  return firstPart || 'other';
}

/**
 * Generate compact server documentation
 */
export function generateCompactServerDocs(
  serverTools: Map<string, Record<string, any>>
): CompactServerDoc[] {
  const docs: CompactServerDoc[] = [];

  for (const [serverName, tools] of serverTools.entries()) {
    const toolNames = Object.keys(tools);

    // Group tools by category
    const categoryMap = new Map<string, string[]>();
    for (const toolName of toolNames) {
      const category = categorizeTool(toolName);
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(toolName);
    }

    const categories = Array.from(categoryMap.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, toolList]) => ({
        name,
        tools: toolList.sort()
      }));

    docs.push({
      name: serverName,
      toolCount: toolNames.length,
      categories
    });
  }

  return docs.sort((a, b) => b.toolCount - a.toolCount);
}

/**
 * Generate extremely compact helper documentation
 * Target: <500 tokens for any number of servers/tools
 */
export function generateMinimalHelperDocs(
  serverTools: Map<string, Record<string, any>>
): string {
  const serverDocs = generateCompactServerDocs(serverTools);

  const lines: string[] = [
    '## Code Mode API',
    '',
    'Execute JavaScript to query MCP servers. Return a template string as your response.',
    '',
    '### Quick Reference',
    '',
  ];

  // List servers with tool counts
  for (const server of serverDocs) {
    const topTools = server.categories
      .flatMap(c => c.tools)
      .slice(0, 5)
      .join(', ');
    const more = server.toolCount > 5 ? ` +${server.toolCount - 5} more` : '';
    lines.push(`- **helpers.${server.name}** (${server.toolCount} tools): ${topTools}${more}`);
  }

  lines.push('');
  lines.push('### Usage');
  lines.push('```javascript');
  lines.push('// Call tools directly');
  lines.push('const data = await helpers.server.toolName({ arg: value });');
  lines.push('');
  lines.push('// Or use getData for automatic response handling');
  lines.push('const data = await helpers.server.getData("toolName", { arg: value });');
  lines.push('');
  lines.push('// Discover tools');
  lines.push('const tools = await helpers.server.listTools();');
  lines.push('const schema = await helpers.server.getToolSchema("toolName");');
  lines.push('');
  lines.push('// Safe access');
  lines.push('const value = helpers.utils.safeGet(data, "nested.field", "default");');
  lines.push('```');
  lines.push('');
  lines.push('### Response Format');
  lines.push('Return a template string: `return \\`Found ${count} results\\`;`');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate compact documentation with tool lists
 * Target: ~1000 tokens for 50+ tools
 */
export function generateCompactHelperDocs(
  serverTools: Map<string, Record<string, any>>
): string {
  const serverDocs = generateCompactServerDocs(serverTools);

  const lines: string[] = [
    '## Available Helper APIs',
    '',
    'Each helper provides async methods for MCP tools. Use `getData()` for automatic response handling.',
    '',
  ];

  for (const server of serverDocs) {
    lines.push(`### helpers.${server.name}`);
    lines.push('');

    // Group tools by category with compact formatting
    for (const category of server.categories.slice(0, 3)) { // Limit categories
      const toolList = category.tools.slice(0, 8).join(', '); // Limit tools per category
      const more = category.tools.length > 8 ? `, +${category.tools.length - 8}` : '';
      lines.push(`- **${category.name}**: ${toolList}${more}`);
    }

    if (server.categories.length > 3) {
      lines.push(`- ...and ${server.categories.length - 3} more categories`);
    }

    lines.push('');
  }

  lines.push('### Common Methods');
  lines.push('```javascript');
  lines.push('helpers.server.getData(toolName, args)  // Auto-parse response');
  lines.push('helpers.server.invoke(toolName, args)   // Raw response');
  lines.push('helpers.server.listTools()              // List all tools');
  lines.push('helpers.server.getToolSchema(toolName)  // Get parameters');
  lines.push('helpers.utils.safeGet(obj, "path", default)');
  lines.push('```');
  lines.push('');
  lines.push('### Response Format');
  lines.push('```javascript');
  lines.push('const data = await helpers.server.getData("search", { query: "term" });');
  lines.push('return `Found ${data.length} results. Top: ${data[0]?.name || "N/A"}`;');
  lines.push('```');

  return lines.join('\n');
}

/**
 * Calculate token estimate for documentation
 */
export function estimateDocTokens(doc: string): number {
  return Math.ceil(doc.length / 4);
}
