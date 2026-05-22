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

    expect(payload.ratio).toBe("adaptive");
    expect(payload.size).toBe("3K");
    expect(payload.n).toBe(2);
    expect(payload.image_urls).toEqual(["https://cdn.example.com/a.png"]);
  });
});
