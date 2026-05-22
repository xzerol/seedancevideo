import type { Asset } from "@prisma/client";
import type { CreateImageGenerationInput } from "./validation";

export type SeedreamResult = {
  status: string;
  imageUrls: string[];
  errorMessage?: string | null;
  raw: unknown;
};

function arkBaseUrl() {
  return (
    process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"
  ).replace(/\/$/, "");
}

function arkApiKey() {
  const key = process.env.ARK_API_KEY;
  if (!key) throw new Error("缺少 ARK_API_KEY，无法创建 Seedream 任务");
  return key;
}

function normalizeRatio(ratio: string) {
  return ratio === "智能" ? "adaptive" : ratio;
}

export function buildSeedreamPayload(
  input: CreateImageGenerationInput,
  assets: Asset[]
) {
  const imageAssets = assets.filter((asset) => asset.kind === "image");
  return {
    model: process.env.SEEDREAM_MODEL || "doubao-seedream-5-0-260128",
    prompt: input.prompt,
    response_format: "url",
    size: input.size,
    ratio: normalizeRatio(input.ratio),
    n: input.count,
    watermark: input.watermark,
    optimize_prompt: input.optimizePrompt,
    image_urls: imageAssets.map((asset) => asset.publicUrl)
  };
}

function collectImageUrls(raw: any) {
  const candidates = [
    raw?.url,
    raw?.image_url,
    raw?.data?.url,
    raw?.data?.image_url,
    ...(Array.isArray(raw?.data)
      ? raw.data.flatMap((item: any) => [item?.url, item?.image_url, item?.b64_json])
      : []),
    ...(Array.isArray(raw?.images)
      ? raw.images.flatMap((item: any) => [item?.url, item?.image_url])
      : [])
  ];

  return candidates.filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
}

export async function createSeedreamImages(
  input: CreateImageGenerationInput,
  assets: Asset[]
): Promise<SeedreamResult> {
  const payload = buildSeedreamPayload(input, assets);
  const response = await fetch(`${arkBaseUrl()}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${arkApiKey()}`
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const raw = text ? JSON.parse(text) : {};

  if (!response.ok) {
    return {
      status: "failed",
      imageUrls: [],
      errorMessage:
        raw?.error?.message || raw?.message || `Seedream 请求失败：${response.status}`,
      raw
    };
  }

  const imageUrls = collectImageUrls(raw);
  return {
    status: imageUrls.length > 0 ? "completed" : "failed",
    imageUrls,
    errorMessage: imageUrls.length > 0 ? null : "Seedream 未返回图片 URL",
    raw
  };
}
