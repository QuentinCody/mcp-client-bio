/**
 * Optional importer: snapshot MCP server prompts into public/slash-prompts.json
 *
 * Usage: pnpm tsx scripts/import-mcp-prompts.ts [--force]
 *
 * Notes:
 * - This is a minimal scaffold. Integrate your transport to call prompts/list and prompts/get
 *   from your existing MCP client, then map to the SlashPromptDef shape.
 */
import fs from "node:fs";
import path from "node:path";

type SlashPromptMessage = { role: "system" | "user" | "assistant"; text: string };
type SlashPromptDef = {
  id: string;
  namespace: string;
  name: string;
  title: string;
  description?: string;
  origin: "client" | "server-import";
  sourceServerId?: string;
  mode: "template" | "server" | "template-required";
  args?: { name: string; description?: string; required?: boolean; placeholder?: string }[];
  template?: { messages: SlashPromptMessage[] };
  updatedAt?: string;
};

type Catalog = { version: string; prompts: SlashPromptDef[] };

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "slash-prompts.json");
const FORCE = process.argv.includes("--force");

async function main() {
  const current: Catalog = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, "utf8"))
    : { version: "1", prompts: [] };

  // TODO: wire to your MCP client here and populate `serverPrompts`
  const serverPrompts: SlashPromptDef[] = [];

  const mergedById = new Map<string, SlashPromptDef>();
  for (const p of current.prompts) mergedById.set(p.id, p);
  for (const p of serverPrompts) {
    if (!mergedById.has(p.id) || FORCE) mergedById.set(p.id, p);
  }

  const merged: Catalog = { version: "1", prompts: Array.from(mergedById.values()) };
  fs.writeFileSync(OUT, JSON.stringify(merged, null, 2));
  console.log(`Wrote ${merged.prompts.length} prompts to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

