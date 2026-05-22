import type { Asset } from "@prisma/client";
import { saveRemoteVideoFile } from "./local-video";
import type { CreateBailianVideoInput } from "./validation";

export type BailianVideoTask = {
  id: string;
  status: string;
  videoUrl?: string | null;
  errorMessage?: string | null;
  raw: unknown;
};

function dashscopeBaseUrl() {
  return (
    process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1"
  ).replace(/\/$/, "");
}

function dashscopeApiKey() {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("缺少 DASHSCOPE_API_KEY，无法创建百炼视频任务");
  return key;
}

function normalizeRatio(ratio: string) {
  return ratio === "智能" ? "16:9" : ratio;
}

function normalizeResolution(resolution: string) {
  return resolution.toUpperCase();
}

function modelForMode(mode: CreateBailianVideoInput["mode"]) {
  const models = {
    "text-to-video": process.env.HAPPYHORSE_T2V_MODEL || "happyhorse-1.0-t2v",
    "image-to-video": process.env.HAPPYHORSE_I2V_MODEL || "happyhorse-1.0-i2v",
    "reference-to-video": process.env.HAPPYHORSE_R2V_MODEL || "happyhorse-1.0-r2v",
    "first-last-frame": process.env.WAN_I2V_MODEL || "wan2.7-i2v",
    "video-edit":
      process.env.HAPPYHORSE_VIDEO_EDIT_MODEL || "happyhorse-1.0-video-edit"
  };
  return models[mode];
}

function providerStatus(status: unknown) {
  const normalized = String(status ?? "PENDING").toUpperCase();
  if (["SUCCEEDED", "SUCCESS", "COMPLETED"].includes(normalized)) return "completed";
  if (["FAILED", "FAILURE", "ERROR"].includes(normalized)) return "failed";
  if (["CANCELED", "CANCELLED"].includes(normalized)) return "canceled";
  if (["RUNNING", "PROCESSING"].includes(normalized)) return "running";
  return "queued";
}

function splitAssets(assets: Asset[]) {
  return {
    images: assets.filter((asset) => asset.kind === "image"),
    videos: assets.filter((asset) => asset.kind === "video")
  };
}

function requireAsset<T>(items: T[], message: string) {
  if (items.length === 0) throw new Error(message);
  return items[0];
}

function requireExactCount<T>(items: T[], count: number, message: string) {
  if (items.length !== count) throw new Error(message);
}

export function buildBailianVideoPayload(
  input: CreateBailianVideoInput,
  assets: Asset[]
) {
  const { images, videos } = splitAssets(assets);
  const media: Array<{ type: string; url: string }> = [];
  const parameters: Record<string, unknown> = {
    resolution: normalizeResolution(input.resolution),
    watermark: input.watermark
  };

  if (input.mode === "text-to-video") {
    parameters.ratio = normalizeRatio(input.ratio);
    parameters.duration = input.duration;
  }

  if (input.mode === "image-to-video") {
    requireExactCount(images, 1, "HappyHorse 图生视频需要且只能选择 1 张首帧图片");
    const firstFrame = requireAsset(images, "图生视频需要至少 1 张图片素材");
    media.push({ type: "first_frame", url: firstFrame.publicUrl });
    parameters.duration = input.duration;
  }

  if (input.mode === "reference-to-video") {
    const references = images.slice(0, 9);
    if (references.length === 0) {
      throw new Error("参考图生视频需要至少 1 张图片素材");
    }
    if (images.length > 9) {
      throw new Error("HappyHorse 参考图生视频最多支持 9 张参考图");
    }
    references.forEach((asset) => media.push({ type: "reference_image", url: asset.publicUrl }));
    parameters.ratio = normalizeRatio(input.ratio);
    parameters.duration = Math.min(input.duration, 10);
  }

  if (input.mode === "first-last-frame") {
    requireExactCount(images, 2, "首尾帧生视频需要且只能选择 2 张图片素材");
    media.push({ type: "first_frame", url: images[0].publicUrl });
    media.push({ type: "last_frame", url: images[1].publicUrl });
    parameters.duration = input.duration;
    parameters.prompt_extend = true;
  }

  if (input.mode === "video-edit") {
    const sourceVideo = requireAsset(videos, "参考视频生成需要至少 1 个视频素材");
    media.push({ type: "video", url: sourceVideo.publicUrl });
    images.slice(0, 5).forEach((asset) => {
      media.push({ type: "reference_image", url: asset.publicUrl });
    });
    parameters.audio_setting = input.generateAudio ? "auto" : "origin";
  }

  return {
    model: modelForMode(input.mode),
    input: {
      prompt: input.prompt,
      ...(media.length > 0 ? { media } : {})
    },
    parameters
  };
}

function parseTask(raw: any): BailianVideoTask {
  const output = raw?.output ?? {};
  return {
    id: String(output?.task_id ?? raw?.task_id ?? ""),
    status: providerStatus(output?.task_status ?? raw?.task_status),
    videoUrl:
      typeof output?.video_url === "string"
        ? output.video_url
        : typeof raw?.video_url === "string"
          ? raw.video_url
          : null,
    errorMessage:
      output?.message || raw?.message || raw?.code || output?.code || null,
    raw
  };
}

async function dashscopeFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${dashscopeBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${dashscopeApiKey()}`,
      ...(init?.headers ?? {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.message || data?.code || `百炼请求失败：${response.status}`);
  }
  return data;
}

export async function createBailianVideoTask(
  input: CreateBailianVideoInput,
  assets: Asset[]
) {
  const payload = buildBailianVideoPayload(input, assets);
  const raw = await dashscopeFetch("/services/aigc/video-generation/video-synthesis", {
    method: "POST",
    headers: { "X-DashScope-Async": "enable" },
    body: JSON.stringify(payload)
  });
  const task = parseTask(raw);
  if (!task.id) throw new Error("百炼未返回任务 ID");
  return task;
}

export async function getBailianVideoTask(taskId: string) {
  const raw = await dashscopeFetch(`/tasks/${taskId}`, { method: "GET" });
  const task = parseTask(raw);

  if (task.status === "completed" && task.videoUrl) {
    const saved = await saveRemoteVideoFile(
      task.videoUrl,
      `bailian-${task.id || taskId}.mp4`
    );
    return { ...task, videoUrl: saved.publicUrl };
  }

  return task;
}
