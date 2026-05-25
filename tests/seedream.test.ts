import { describe, expect, it } from "vitest";
import { buildSeedreamPayload } from "@/lib/seedream";

const imageAsset = {
  id: "asset_1",
  name: "参考图",
  mimeType: "image/png",
  kind: "image",
  libraryType: "asset",
  source: "uploaded",
  size: 100,
  storageKey: "a.png",
  publicUrl: "https://cdn.example.com/a.png",
  createdAt: new Date()
};

describe("buildSeedreamPayload", () => {
  it("maps prompt and reference images to Seedream 5 payload", () => {
    const payload = buildSeedreamPayload(
      {
        prompt: "生成一张电影感人像",
        assetIds: ["asset_1"],
        ratio: "智能",
        size: "3K",
        count: 2,
        optimizePrompt: true,
        watermark: false
      },
      [imageAsset]
    );

    expect(payload.size).toBe("3K");
    expect(payload.n).toBe(2);
    expect(payload.image).toEqual(["https://cdn.example.com/a.png"]);
    expect(payload).not.toHaveProperty("image_urls");
    expect(payload).not.toHaveProperty("ratio");
  });

  it("maps explicit aspect ratio and resolution to Seedream size", () => {
    const payload = buildSeedreamPayload(
      {
        prompt: "生成一张电影感横版海报",
        assetIds: [],
        ratio: "16:9",
        size: "2K",
        count: 1,
        optimizePrompt: true,
        watermark: false
      },
      []
    );

    expect(payload.size).toBe("2848x1600");
    expect(payload).not.toHaveProperty("ratio");
  });

  it("omits reference image field when no image assets are selected", () => {
    const payload = buildSeedreamPayload(
      {
        prompt: "生成一张电影感人像",
        assetIds: [],
        ratio: "智能",
        size: "3K",
        count: 1,
        optimizePrompt: true,
        watermark: false
      },
      []
    );

    expect(payload).not.toHaveProperty("image");
  });
});
