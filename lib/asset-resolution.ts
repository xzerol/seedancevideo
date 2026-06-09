import type { Asset } from "@prisma/client";
import { prisma } from "./prisma";
import { parseAssetMentions } from "./prompt";

function orderByIds<T extends { id: string }>(items: T[], ids: string[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
}

export function mergeResolvedAssets(
  explicitAssets: Asset[],
  mentionedAssets: Asset[],
  mentionedNames: string[]
) {
  const ids = new Set<string>();
  const explicitNames = new Set(explicitAssets.map((asset) => asset.name));
  const mentionedByName = new Map<string, Asset>();

  for (const asset of mentionedAssets) {
    if (!mentionedByName.has(asset.name)) mentionedByName.set(asset.name, asset);
  }

  const resolved: Asset[] = [];
  for (const asset of explicitAssets) {
    if (ids.has(asset.id)) continue;
    ids.add(asset.id);
    resolved.push(asset);
  }

  for (const name of mentionedNames) {
    if (explicitNames.has(name)) continue;
    const asset = mentionedByName.get(name);
    if (!asset || ids.has(asset.id)) continue;
    ids.add(asset.id);
    resolved.push(asset);
  }

  return resolved;
}

export async function resolveAssetsForGeneration(
  assetIds: string[],
  prompt: string,
  projectId?: string | null
) {
  const uniqueAssetIds = [...new Set(assetIds)];
  const mentionedNames = parseAssetMentions(prompt);
  const explicitAssets =
    uniqueAssetIds.length > 0
      ? orderByIds(
          await prisma.asset.findMany({ where: { id: { in: uniqueAssetIds } } }),
          uniqueAssetIds
        )
      : [];
  const explicitNames = new Set(explicitAssets.map((asset) => asset.name));
  const namesToResolve = mentionedNames.filter((name) => !explicitNames.has(name));

  const mentionedAssets =
    namesToResolve.length > 0
      ? await prisma.asset.findMany({
          where: projectId
            ? {
                name: { in: namesToResolve },
                OR: [
                  { projectAssets: { some: { projectId } } },
                  { libraryType: "person" }
                ]
              }
            : { name: { in: namesToResolve } },
          orderBy: { createdAt: "desc" }
        })
      : [];

  return mergeResolvedAssets(explicitAssets, mentionedAssets, mentionedNames);
}
