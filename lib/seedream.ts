import type { Asset } from "@prisma/client";
import { prepareAssetsForProvider } from "./storage";
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

const SEEDREAM_SIZE_BY_RATIO = {
  "2K": {
    "1:1": "2048x2048",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "16:9": "2848x1600",
    "9:16": "1600x2848",
    "21:9": "3136x1344"
  },
  "3K": {
    "1:1": "3072x3072",
    "4:3": "3456x2592",
    "3:4": "2592x3456",
    "16:9": "4096x2304",
    "9:16": "2304x4096",
    "21:9": "4704x2016"
  }
} as const;

function seedreamSize(ratio: string, size: "2K" | "3K") {
  if (ratio === "智能") return size;
  return (
    SEEDREAM_SIZE_BY_RATIO[size][
      ratio as keyof (typeof SEEDREAM_SIZE_BY_RATIO)[typeof size]
    ] || size
  );
}

export function buildSeedreamPayload(
  input: CreateImageGenerationInput,
  assets: Asset[]
) {
  const imageAssets = assets.filter((asset) => asset.kind === "image");
  const imageUrls = imageAssets.map((asset) => asset.publicUrl);
  return {
    model: process.env.SEEDREAM_MODEL || "doubao-seedream-5-0-260128",
    prompt: input.prompt,
    response_format: "url",
    size: seedreamSize(input.ratio, input.size),
    n: input.count,
    watermark: input.watermark,
    optimize_prompt: input.optimizePrompt,
    ...(imageUrls.length > 0 ? { image: imageUrls } : {})
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
  const providerAssets = await prepareAssetsForProvider(assets);
  const payload = buildSeedreamPayload(input, providerAssets);
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
