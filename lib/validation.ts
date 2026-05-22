import { z } from "zod";

export const ratioSchema = z.enum([
  "21:9",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "智能"
]);

export const resolutionSchema = z.enum(["480p", "720p", "1080p"]);
export const modeSchema = z.enum(["reference", "frames", "reference_video"]);

export const createGenerationSchema = z.object({
  projectId: z.string().optional(),
  nodeId: z.string().optional(),
  prompt: z.string().trim().min(1, "请先输入文案").max(4000),
  mode: modeSchema,
  ratio: ratioSchema,
  resolution: resolutionSchema,
  duration: z.number().int().min(4).max(15),
  count: z.number().int().min(1).max(4),
  generateAudio: z.boolean().default(true),
  assetIds: z.array(z.string()).max(12).default([])
});

export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;

export const createImageGenerationSchema = z.object({
  projectId: z.string().optional(),
  nodeId: z.string().optional(),
  prompt: z.string().trim().min(1, "请先输入生图文案").max(4000),
  assetIds: z.array(z.string()).max(12).default([]),
  ratio: ratioSchema.default("智能"),
  size: z.enum(["2K", "3K"]).default("2K"),
  count: z.number().int().min(1).max(4).default(1),
  optimizePrompt: z.boolean().default(true),
  watermark: z.boolean().default(false)
});

export type CreateImageGenerationInput = z.infer<
  typeof createImageGenerationSchema
>;

export const bailianVideoModeSchema = z.enum([
  "text-to-video",
  "image-to-video",
  "reference-to-video",
  "first-last-frame",
  "video-edit"
]);

export const createBailianVideoSchema = z.object({
  projectId: z.string().optional(),
  nodeId: z.string().optional(),
  prompt: z.string().trim().min(1, "请先输入百炼视频文案").max(2500),
  mode: bailianVideoModeSchema,
  ratio: ratioSchema.default("16:9"),
  resolution: z.enum(["720p", "1080p"]).default("720p"),
  duration: z.number().int().min(2).max(15).default(5),
  count: z.number().int().min(1).max(4).default(1),
  generateAudio: z.boolean().default(true),
  watermark: z.boolean().default(false),
  assetIds: z.array(z.string()).max(12).default([])
});

export type CreateBailianVideoInput = z.infer<typeof createBailianVideoSchema>;

export const saveCanvasSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  nodes: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
      width: z.number().optional(),
      height: z.number().optional(),
      data: z.record(z.string(), z.unknown()).default({})
    })
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      sourceHandle: z.string().nullable().optional(),
      targetHandle: z.string().nullable().optional(),
      data: z.record(z.string(), z.unknown()).optional()
    })
  )
});

export function kindFromMime(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

export function ensureSupportedAsset(mimeType: string) {
  const supported =
    mimeType.startsWith("image/") ||
    mimeType.startsWith("video/") ||
    mimeType.startsWith("audio/");

  if (!supported) {
    throw new Error("仅支持上传图片、视频或音频素材");
  }
}
