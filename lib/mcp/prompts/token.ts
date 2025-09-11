export const PROMPT_TOKEN_RE = /\/([a-z0-9-]+)\/([a-z0-9-_]+)\b/gi;

export function toToken(namespace: string, name: string) {
  return `/${namespace}/${name}`;
}

export function findTokens(input: string) {
  const matches: Array<{ start: number; end: number; namespace: string; name: string }> = [];
  for (const m of input.matchAll(PROMPT_TOKEN_RE)) {
    matches.push({
      start: m.index!,
      end: m.index! + m[0].length,
      namespace: m[1],
      name: m[2],
    });
  }
  return matches;
}

