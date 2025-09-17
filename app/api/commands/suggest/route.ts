import { NextResponse } from "next/server";
import { slashRegistry } from "@/lib/slash";

const GROUP_LABELS: Record<string, string> = {
  local: "Local Commands",
  mcp: "MCP Prompts",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const suggestions = slashRegistry.list(query);

  const groups = Array.from(new Set(suggestions.map((s) => s.groupId))).map((id) => ({
    id,
    label: GROUP_LABELS[id] ?? id,
  }));

  const items = suggestions.map((item) => ({
    id: item.id,
    name: item.name,
    title: item.title,
    description: item.description,
    sourceId: item.sourceId,
    kind: item.kind,
    groupId: item.groupId,
    score: item.score,
    arguments: item.arguments,
    argHint: item.arguments?.length ? `${item.arguments.length} arg${item.arguments.length === 1 ? '' : 's'}` : undefined,
  }));

  return NextResponse.json({ groups, items });
}
