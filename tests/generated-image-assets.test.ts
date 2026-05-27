import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveGeneratedImageAssets } from "@/lib/generated-image-assets";
import { saveRemoteAssetFile } from "@/lib/local-asset";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/local-asset", () => ({
  saveRemoteAssetFile: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      create: vi.fn()
    }
  }
}));

const saveRemoteAssetFileMock = vi.mocked(saveRemoteAssetFile);
const assetCreateMock = vi.mocked(prisma.asset.create);

describe("saveGeneratedImageAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveRemoteAssetFileMock.mockImplementation(async (_url, fileName) => ({
      size: 123,
      storageKey: `local-asset:2026-05-27/${fileName}`,
      publicUrl: `/api/local-files/assets/2026-05-27/${fileName}`
    }));
    assetCreateMock.mockImplementation((async ({ data }: any) => ({
      id: `asset_${data.name}`,
      createdAt: new Date("2026-05-27T00:00:00Z"),
      ...data
    })) as any);
  });

  it("downloads generated image URLs into project assets", async () => {
    const assets = await saveGeneratedImageAssets({
      imageUrls: ["https://bucket.example.com/a.png", "https://bucket.example.com/b.png"],
      projectId: "project_1",
      baseUrl: "http://localhost:3001"
    });

    expect(saveRemoteAssetFileMock).toHaveBeenCalledTimes(2);
    expect(saveRemoteAssetFileMock).toHaveBeenNthCalledWith(
      1,
      "https://bucket.example.com/a.png",
      "seedream-image-1.png",
      "image/png",
      "http://localhost:3001"
    );
    expect(assetCreateMock).toHaveBeenCalledTimes(2);
    expect(assetCreateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Seedream 图片 1",
          kind: "image",
          libraryType: "asset",
          source: "generated",
          publicUrl: "/api/local-files/assets/2026-05-27/seedream-image-1.png",
          projectAssets: { create: { projectId: "project_1", role: "library" } }
        })
      })
    );
    expect(assets.map((asset) => asset.publicUrl)).toEqual([
      "/api/local-files/assets/2026-05-27/seedream-image-1.png",
      "/api/local-files/assets/2026-05-27/seedream-image-2.png"
    ]);
  });

  it("does not create project links when no project is provided", async () => {
    await saveGeneratedImageAssets({
      imageUrls: ["https://bucket.example.com/a.png"]
    });

    expect(assetCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Seedream 图片",
          projectAssets: undefined
        })
      })
    );
  });
});
