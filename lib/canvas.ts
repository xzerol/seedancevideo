import type { Asset } from "@prisma/client";

type CanvasEdgeLike = {
  id: string;
  source: string;
  target: string;
};

type CanvasNodeLike = {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
};

export function edgeAssetIdsForNode(
  nodeId: string,
  nodes: CanvasNodeLike[],
  edges: CanvasEdgeLike[]
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => byId.get(edge.source))
    .map((node) => node?.data?.assetId)
    .filter((assetId): assetId is string => typeof assetId === "string");
}

export function ensurePromptMentions(prompt: string, assets: Pick<Asset, "name">[]) {
  let nextPrompt = prompt.trim();
  for (const asset of assets) {
    const mention = `@${asset.name}`;
    if (!nextPrompt.includes(mention)) {
      nextPrompt = nextPrompt ? `${nextPrompt} ${mention}` : mention;
    }
  }
  return nextPrompt;
}

export function mentionQueryAtCursor(prompt: string, cursor: number) {
  const beforeCursor = prompt.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|\s)@([\p{L}\p{N}_\-\u4e00-\u9fa5]*)$/u);
  if (!match || match.index === undefined) return null;
  return {
    query: match[1] ?? "",
    start: match.index + match[0].indexOf("@"),
    end: cursor
  };
}

export function insertMentionAtCursor(
  prompt: string,
  cursor: number,
  assetName: string
) {
  const mention = `@${assetName}`;
  const query = mentionQueryAtCursor(prompt, cursor);
  if (!query) {
    const prefix = prompt.slice(0, cursor);
    const suffix = prompt.slice(cursor);
    const spacer = prefix.length > 0 && !/\s$/.test(prefix) ? " " : "";
    return {
      prompt: `${prefix}${spacer}${mention} ${suffix}`,
      cursor: prefix.length + spacer.length + mention.length + 1
    };
  }

  const prefix = prompt.slice(0, query.start);
  const suffix = prompt.slice(query.end);
  return {
    prompt: `${prefix}${mention} ${suffix}`,
    cursor: prefix.length + mention.length + 1
  };
}

export function nextNodePosition(
  selectedPosition?: { x: number; y: number } | null,
  viewportCenter = { x: 420, y: 260 },
  offsetIndex = 0
) {
  const base = selectedPosition
    ? { x: selectedPosition.x + 420, y: selectedPosition.y }
    : viewportCenter;
  return {
    x: base.x + offsetIndex * 24,
    y: base.y + offsetIndex * 18
  };
}
