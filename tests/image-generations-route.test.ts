import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveGeneratedImageAssets } from "@/lib/generated-image-assets";
import { prisma } from "@/lib/prisma";
import { createSeedreamImages } from "@/lib/seedream";
import { POST } from "@/app/api/image-generations/route";

vi.mock("@/lib/generated-image-assets", () => ({
  saveGeneratedImageAssets: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      findMany: vi.fn()
    },
    generationJob: {
      create: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock("@/lib/seedream", () => ({
  createSeedreamImages: vi.fn()
}));

const createSeedreamImagesMock = vi.mocked(createSeedreamImages);
const saveGeneratedImageAssetsMock = vi.mocked(saveGeneratedImageAssets);
const assetFindManyMock = vi.mocked(prisma.asset.findMany);
const jobCreateMock = vi.mocked(prisma.generationJob.create);
const jobUpdateMock = vi.mocked(prisma.generationJob.update);

function request(body: unknown) {
  return new NextRequest("http://localhost:3001/api/image-generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/image-generations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetFindManyMock.mockResolvedValue([]);
    jobCreateMock.mockResolvedValue({
      id: "job_1",
      projectId: "project_1",
      nodeId: "node_1",
      type: "seedream-image",
      prompt: "生成图片",
      status: "running",
      providerTaskId: null,
      resultUrl: null,
      errorMessage: null,
      rawResponse: null,
      createdAssetId: null,
      createdAt: new Date("2026-05-27T00:00:00Z"),
      updatedAt: new Date("2026-05-27T00:00:00Z")
    });
    jobUpdateMock.mockImplementation((async ({ data }: any) => ({
      id: "job_1",
      projectId: "project_1",
      nodeId: "node_1",
      type: "seedream-image",
      prompt: "生成图片",
      providerTaskId: null,
      createdAt: new Date("2026-05-27T00:00:00Z"),
      updatedAt: new Date("2026-05-27T00:00:00Z"),
      ...data
    })) as any);
    createSeedreamImagesMock.mockResolvedValue({
      status: "completed",
      imageUrls: ["https://bucket.example.com/a.png", "https://bucket.example.com/b.png"],
      errorMessage: null,
      raw: { ok: true }
    });
    saveGeneratedImageAssetsMock.mockResolvedValue([
      {
        id: "asset_1",
        name: "Seedream 图片 1",
        mimeType: "image/png",
        kind: "image",
        libraryType: "asset",
        source: "generated",
        size: 123,
        storageKey: "local-asset:2026-05-27/a.png",
        publicUrl: "/api/local-files/assets/2026-05-27/a.png",
        createdAt: new Date("2026-05-27T00:00:00Z")
      },
      {
        id: "asset_2",
        name: "Seedream 图片 2",
        mimeType: "image/png",
        kind: "image",
        libraryType: "asset",
        source: "generated",
        size: 124,
        storageKey: "local-asset:2026-05-27/b.png",
        publicUrl: "/api/local-files/assets/2026-05-27/b.png",
        createdAt: new Date("2026-05-27T00:00:00Z")
      }
    ]);
  });

  it("returns local generated assets and stores the first local URL on the job", async () => {
    const response = await POST(
      request({
        projectId: "project_1",
        nodeId: "node_1",
        prompt: "生成图片",
        assetIds: [],
        ratio: "智能",
        size: "2K",
        count: 2,
        optimizePrompt: true,
        watermark: false
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(saveGeneratedImageAssetsMock).toHaveBeenCalledWith({
      imageUrls: ["https://bucket.example.com/a.png", "https://bucket.example.com/b.png"],
      projectId: "project_1",
      baseUrl: "http://localhost:3001"
    });
    expect(jobUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultUrl: "/api/local-files/assets/2026-05-27/a.png",
          createdAssetId: "asset_1"
        })
      })
    );
    expect(payload.imageUrls).toEqual([
      "/api/local-files/assets/2026-05-27/a.png",
      "/api/local-files/assets/2026-05-27/b.png"
    ]);
    expect(payload.assets).toHaveLength(2);
  });
});
