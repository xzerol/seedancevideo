import { describe, expect, it } from "vitest";
import { buildBailianVideoPayload } from "@/lib/bailian-video";

const imageAsset = {
  id: "image_1",
  name: "首帧",
  mimeType: "image/png",
  kind: "image",
  libraryType: "asset",
  source: "uploaded",
  size: 100,
  storageKey: "a.png",
  publicUrl: "https://cdn.example.com/a.png",
  createdAt: new Date()
};

const videoAsset = {
  ...imageAsset,
  id: "video_1",
  name: "参考视频",
  mimeType: "video/mp4",
  kind: "video",
  storageKey: "a.mp4",
  publicUrl: "https://cdn.example.com/a.mp4"
};

describe("buildBailianVideoPayload", () => {
  it("builds text-to-video payload", () => {
    const payload = buildBailianVideoPayload(
      {
        prompt: "一只小马奔跑",
        mode: "text-to-video",
        ratio: "16:9",
        resolution: "720p",
        duration: 5,
        count: 1,
        generateAudio: true,
        watermark: false,
        assetIds: []
      },
      []
    );
    expect(payload.model).toBe("happyhorse-1.0-t2v");
    expect(payload.parameters).toMatchObject({ ratio: "16:9", resolution: "720P" });
  });

  it("builds first-last-frame payload with Wan", () => {
    const payload = buildBailianVideoPayload(
      {
        prompt: "镜头推进",
        mode: "first-last-frame",
        ratio: "智能",
        resolution: "1080p",
        duration: 6,
        count: 1,
        generateAudio: true,
        watermark: false,
        assetIds: ["image_1", "image_2"]
      },
      [imageAsset, { ...imageAsset, id: "image_2", publicUrl: "https://cdn.example.com/b.png" }]
    );
    expect(payload.model).toBe("wan2.7-i2v");
    expect(payload.input).toMatchObject({
      media: [
        { type: "first_frame", url: "https://cdn.example.com/a.png" },
        { type: "last_frame", url: "https://cdn.example.com/b.png" }
      ]
    });
  });

  it("rejects first-last-frame without exactly two images", () => {
    expect(() =>
      buildBailianVideoPayload(
        {
          prompt: "镜头推进",
          mode: "first-last-frame",
          ratio: "智能",
          resolution: "1080p",
          duration: 6,
          count: 1,
          generateAudio: true,
          watermark: false,
          assetIds: ["image_1"]
        },
        [imageAsset]
      )
    ).toThrow("首尾帧生视频需要且只能选择 2 张图片素材");
  });

  it("requires exactly one first-frame image for HappyHorse I2V", () => {
    expect(() =>
      buildBailianVideoPayload(
        {
          prompt: "首帧动起来",
          mode: "image-to-video",
          ratio: "智能",
          resolution: "720p",
          duration: 5,
          count: 1,
          generateAudio: true,
          watermark: false,
          assetIds: ["image_1", "image_2"]
        },
        [imageAsset, { ...imageAsset, id: "image_2", publicUrl: "https://cdn.example.com/b.png" }]
      )
    ).toThrow("HappyHorse 图生视频需要且只能选择 1 张首帧图片");
  });

  it("builds video edit payload", () => {
    const payload = buildBailianVideoPayload(
      {
        prompt: "保持动作，换成电影质感",
        mode: "video-edit",
        ratio: "智能",
        resolution: "720p",
        duration: 5,
        count: 1,
        generateAudio: false,
        watermark: false,
        assetIds: ["video_1", "image_1"]
      },
      [videoAsset, imageAsset]
    );
    expect(payload.model).toBe("happyhorse-1.0-video-edit");
    expect(payload.input).toMatchObject({
      media: [
        { type: "video", url: "https://cdn.example.com/a.mp4" },
        { type: "reference_image", url: "https://cdn.example.com/a.png" }
      ]
    });
    expect(payload.parameters).toMatchObject({ audio_setting: "origin" });
  });
});
