import type { Asset } from "@prisma/client";
import { saveRemoteVideoFile } from "./local-video";
import type { CreateGenerationInput } from "./validation";

export type ProviderTask = {
  id: string;
  status: string;
  videoUrl?: string | null;
  errorMessage?: string | null;
  raw: unknown;
};

function arkBaseUrl() {
  return (
    process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"
  ).replace(/\/$/, "");
}

export function normalizeProviderStatus(status: unknown) {
  return providerStatus(status);
}

function arkApiKey() {
  const key = process.env.ARK_API_KEY;
  if (!key) throw new Error("缺少 ARK_API_KEY，无法创建 Seedance 任务");
  return key;
}

function normalizeRatio(ratio: string) {
  return ratio === "智能" ? "adaptive" : ratio;
}

function contentItemForAsset(asset: Asset, role: string) {
  if (asset.kind === "image") {
    return {
      type: "image_url",
      image_url: { url: asset.publicUrl },
      role
    };
  }

  if (asset.kind === "video") {
    return {
      type: "video_url",
      video_url: { url: asset.publicUrl },
      role
    };
  }

  if (asset.kind === "audio") {
    return {
      type: "audio_url",
      audio_url: { url: asset.publicUrl },
      role
    };
  }

  return null;
}

export function buildSeedancePayload(
  input: CreateGenerationInput,
  assets: Asset[]
) {
  const content: unknown[] = [];

  if (input.mode === "frames") {
    const imageAssets = assets.filter((asset) => asset.kind === "image");
    if (imageAssets.length < 2) {
      throw new Error("首尾帧模式需要至少选择 2 张图片素材");
    }
    content.push(contentItemForAsset(imageAssets[0], "first_frame"));
    content.push(contentItemForAsset(imageAssets[1], "last_frame"));
  } else {
    for (const asset of assets) {
      const role =
        asset.kind === "image"
          ? "reference_image"
          : asset.kind === "video"
            ? "reference_video"
            : "reference_audio";
      content.push(contentItemForAsset(asset, role));
    }
  }

  content.push({ type: "text", text: input.prompt });

  return {
    model: process.env.SEEDANCE_MODEL || "doubao-seedance-2-0-260128",
    content: content.filter(Boolean),
    ratio: normalizeRatio(input.ratio),
    resolution: input.resolution,
    duration: input.duration,
    generate_audio: input.generateAudio
  };
}

function providerStatus(status: unknown) {
  const normalized = String(status ?? "queued").toLowerCase();
  if (["succeeded", "success", "completed", "done"].includes(normalized)) {
    return "completed";
  }
  if (["failed", "error"].includes(normalized)) return "failed";
  if (["cancelled", "canceled"].includes(normalized)) return "canceled";
  if (["running", "processing", "in_progress", "generating"].includes(normalized)) {
    return "running";
  }
  return "queued";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function parseProviderTask(raw: any): ProviderTask {
  const firstContent = Array.isArray(raw?.content) ? raw.content[0] : undefined;
  return {
    id: firstString(raw?.id, raw?.task_id, raw?.data?.id, raw?.data?.task_id) ?? "",
    status: providerStatus(raw?.status ?? raw?.data?.status),
    videoUrl:
      firstString(
        raw?.video_url,
        raw?.data?.video_url,
        firstContent?.video_url,
        firstContent?.url,
        raw?.content?.video_url
      ) ?? null,
    errorMessage:
      firstString(
        raw?.error?.message,
        raw?.message,
        raw?.data?.error?.message,
        raw?.data?.message
      ) ?? null,
    raw
  };
}

async function arkFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${arkBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${arkApiKey()}`,
      ...(init?.headers ?? {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message =
      data?.error?.message || data?.message || `Seedance 请求失败：${response.status}`;
    throw new Error(message);
  }

  return data;
}

export async function createSeedanceTask(
  input: CreateGenerationInput,
  assets: Asset[]
) {
  const payload = buildSeedancePayload(input, assets);
  const raw = await arkFetch("/contents/generations/tasks", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const task = parseProviderTask(raw);

  if (!task.id) {
    throw new Error("Seedance 未返回任务 ID");
  }

  return task;
}

export async function getSeedanceTask(taskId: string) {
  const raw = await arkFetch(`/contents/generations/tasks/${taskId}`, {
    method: "GET"
  });
  const task = parseProviderTask(raw);

  if (task.status === "completed" && task.videoUrl) {
    const saved = await saveRemoteVideoFile(
      task.videoUrl,
      `seedance-${task.id || taskId}.mp4`
    );
    return { ...task, videoUrl: saved.publicUrl };
  }

  return task;
}
