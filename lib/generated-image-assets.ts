import type { Asset } from "@prisma/client";
import { saveRemoteAssetFile } from "./local-asset";
import { prisma } from "./prisma";

export async function saveGeneratedImageAssets({
  imageUrls,
  projectId,
  baseUrl
}: {
  imageUrls: string[];
  projectId?: string;
  baseUrl?: string;
}): Promise<Asset[]> {
  const assets: Asset[] = [];

  for (const [index, imageUrl] of imageUrls.entries()) {
    const saved = await saveRemoteAssetFile(
      imageUrl,
      `seedream-image-${index + 1}.png`,
      "image/png",
      baseUrl
    );
    const name =
      imageUrls.length > 1 ? `Seedream 图片 ${index + 1}` : "Seedream 图片";

    const asset = await prisma.asset.create({
      data: {
        name,
        mimeType: "image/png",
        kind: "image",
        libraryType: "asset",
        source: "generated",
        size: saved.size,
        storageKey: saved.storageKey,
        publicUrl: saved.publicUrl,
        projectAssets: projectId
          ? {
              create: {
                projectId,
                role: "library"
              }
            }
          : undefined
      }
    });

    assets.push(asset);
  }

  return assets;
}
