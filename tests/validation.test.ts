import { describe, expect, it } from "vitest";
import { createGenerationSchema } from "@/lib/validation";

describe("createGenerationSchema", () => {
  it("accepts supported generation controls", () => {
    const parsed = createGenerationSchema.parse({
      prompt: "角色向镜头走来",
      mode: "reference",
      ratio: "智能",
      resolution: "720p",
      duration: 5,
      count: 4,
      generateAudio: true,
      assetIds: []
    });

    expect(parsed.duration).toBe(5);
  });

  it("rejects unsupported duration", () => {
    expect(() =>
      createGenerationSchema.parse({
        prompt: "test",
        mode: "reference",
        ratio: "16:9",
        resolution: "720p",
        duration: 2,
        count: 1,
        generateAudio: true,
        assetIds: []
      })
    ).toThrow();
  });
});
