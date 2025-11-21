/**
 * Generate TypeScript interface definitions from JSON Schema (MCP tool schemas)
 * This enables type-safe code generation for Code Mode
 */

export interface TypeScriptInterface {
  name: string;
  definition: string;
  documentation?: string;
}

/**
 * Convert JSON Schema to TypeScript type string
 */
export function jsonSchemaToTypeScript(
  schema: any,
  typeName: string = 'UnknownType'
): string {
  if (!schema || typeof schema !== 'object') {
    return 'any';
  }

  // Handle different schema types
  if (schema.type === 'string') {
    if (Array.isArray(schema.enum)) {
      return schema.enum.map((v: any) => `'${v}'`).join(' | ');
    }
    return 'string';
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    return 'number';
  }

  if (schema.type === 'boolean') {
    return 'boolean';
  }

  if (schema.type === 'null') {
    return 'null';
  }

  if (schema.type === 'array') {
    const items = schema.items || {};
    const itemType = jsonSchemaToTypeScript(items, typeName + 'Item');
    return `Array<${itemType}>`;
  }

  // Handle oneOf/anyOf unions
  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
    const variants = schema.oneOf || schema.anyOf;
    const types = variants.map((v: any, i: number) =>
      jsonSchemaToTypeScript(v, `${typeName}Variant${i}`)
    );
    return types.join(' | ');
  }

  // Handle allOf (intersection types)
  if (Array.isArray(schema.allOf)) {
    const types = schema.allOf.map((v: any, i: number) =>
      jsonSchemaToTypeScript(v, `${typeName}Part${i}`)
    );
    return types.join(' & ');
  }

  // Handle object type
  if (schema.type === 'object' || schema.properties) {
    const properties = schema.properties || {};
    const required = Array.isArray(schema.required) ? schema.required : [];

    const props = Object.entries(properties).map(([key, propSchema]) => {
      const isRequired = required.includes(key);
      const propType = jsonSchemaToTypeScript(propSchema as any, key);
      const desc = (propSchema as any)?.description;
      const comment = desc ? `\n  /** ${desc} */` : '';
      return `${comment}\n  ${key}${isRequired ? '' : '?'}: ${propType};`;
    }).join('\n');

    return `{\n${props}\n}`;
  }

  return 'any';
}

/**
 * Generate TypeScript interface from tool schema
 */
export function generateToolInterface(
  toolName: string,
  toolDefinition: any
): TypeScriptInterface {
  const schema = toolDefinition.parameters?.jsonSchema ||
                 toolDefinition.parameters ||
                 toolDefinition.inputSchema ||
                 { type: 'object', properties: {} };

  const interfaceName = toPascalCase(toolName) + 'Args';
  const typeDefinition = jsonSchemaToTypeScript(schema, interfaceName);

  const documentation = toolDefinition.description
    ? `/**\n * ${toolDefinition.description}\n */`
    : '';

  // For simple objects, create a proper interface
  if (typeDefinition.startsWith('{')) {
    const definition = `${documentation}\nexport interface ${interfaceName} ${typeDefinition}`;
    return { name: interfaceName, definition, documentation: toolDefinition.description };
  }

  // For other types, create a type alias
  const definition = `${documentation}\nexport type ${interfaceName} = ${typeDefinition};`;
  return { name: interfaceName, definition, documentation: toolDefinition.description };
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[_\-\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Generate complete TypeScript definitions file for all MCP tools
 */
export function generateToolsTypeDefinitions(
  tools: Record<string, any>
): string {
  const interfaces: string[] = [
    '/**',
    ' * Auto-generated TypeScript definitions for MCP tools',
    ' * Generated for Code Mode execution',
    ' */',
    '',
  ];

  // Group tools by server/namespace if possible
  const toolEntries = Object.entries(tools);

  for (const [toolName, toolDef] of toolEntries) {
    try {
      const interfaceDef = generateToolInterface(toolName, toolDef);
      interfaces.push(interfaceDef.definition);
      interfaces.push('');
    } catch (error) {
      console.warn(`Failed to generate interface for ${toolName}:`, error);
      // Fallback to any type
      const interfaceName = toPascalCase(toolName) + 'Args';
      interfaces.push(`/** ${toolDef.description || toolName} */`);
      interfaces.push(`export type ${interfaceName} = any;`);
      interfaces.push('');
    }
  }

  return interfaces.join('\n');
}

/**
 * Generate helper API type definitions
 */
export function generateHelperAPITypes(
  serverTools: Map<string, Record<string, any>>
): string {
  const lines: string[] = [
    '/**',
    ' * Helper API types for Code Mode',
    ' * These helpers provide access to MCP tools with full type safety',
    ' */',
    '',
  ];

  for (const [serverName, tools] of serverTools.entries()) {
    const helperName = serverName.toLowerCase().replace(/[^a-z0-9]/g, '_');

    lines.push(`export interface ${toPascalCase(helperName)}Helper {`);
    lines.push(`  /** List all available tools in ${serverName} */`);
    lines.push(`  listTools(): Promise<string[]>;`);
    lines.push('');

    for (const [toolName, toolDef] of Object.entries(tools)) {
      const argsType = toPascalCase(toolName) + 'Args';
      const desc = toolDef.description ? `  /** ${toolDef.description} */` : '';
      if (desc) lines.push(desc);
      lines.push(`  ${toolName}(args: ${argsType}): Promise<any>;`);
    }

    lines.push('}');
    lines.push('');
  }

  // Generate main Helpers interface
  lines.push('export interface Helpers {');
  for (const [serverName] of serverTools.entries()) {
    const helperName = serverName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    lines.push(`  ${helperName}: ${toPascalCase(helperName)}Helper;`);
  }
  lines.push('}');

  return lines.join('\n');
}
