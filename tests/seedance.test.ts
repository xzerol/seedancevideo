import { describe, expect, it } from "vitest";
import {
  buildSeedancePayload,
  normalizeProviderStatus
} from "@/lib/seedance";
import {
  generationProgress,
  generationStatusMessage
} from "@/lib/generation-status";

const imageAsset = {
  id: "asset_1",
  name: "人物",
  mimeType: "image/png",
  kind: "image",
  libraryType: "person",
  source: "uploaded",
  size: 100,
  storageKey: "a.png",
  publicUrl: "https://cdn.example.com/a.png",
  createdAt: new Date()
};

const videoAsset = {
  ...imageAsset,
  id: "asset_video",
  name: "参考视频",
  mimeType: "video/mp4",
  kind: "video",
  storageKey: "v.mp4",
  publicUrl: "https://cdn.example.com/v.mp4"
};

describe("buildSeedancePayload", () => {
  it("maps reference image assets to Seedance content", () => {
    const payload = buildSeedancePayload(
      {
        prompt: "让@人物跳舞",
        mode: "reference",
        ratio: "智能",
        resolution: "720p",
        duration: 5,
        count: 1,
        generateAudio: true,
        assetIds: ["asset_1"]
      },
      [imageAsset]
    );

    expect(payload.ratio).toBe("adaptive");
    expect(payload.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "image_url",
          role: "reference_image"
        }),
        expect.objectContaining({ type: "text", text: "让@人物跳舞" })
      ])
    );
  });

  it("normalizes provider statuses", () => {
    expect(normalizeProviderStatus("succeeded")).toBe("completed");
    expect(normalizeProviderStatus("in_progress")).toBe("running");
    expect(normalizeProviderStatus("failed")).toBe("failed");
  });

  it("maps reference videos to Seedance content", () => {
    const payload = buildSeedancePayload(
      {
        prompt: "参考视频里的动作",
        mode: "reference_video",
        ratio: "16:9",
        resolution: "720p",
        duration: 5,
        count: 1,
        generateAudio: true,
        assetIds: ["asset_video"]
      },
      [videoAsset]
    );

    expect(payload.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "video_url",
          role: "reference_video"
        })
      ])
    );
  });

  it("reports useful progress for active video tasks", () => {
    expect(
      generationStatusMessage("running", [
        { status: "completed", videoUrl: "https://cdn.example.com/a.mp4" },
        { status: "running" }
      ])
    ).toContain("1/2");
    expect(generationProgress("running", [{ status: "queued" }])).toBeGreaterThan(0);
  });
});
