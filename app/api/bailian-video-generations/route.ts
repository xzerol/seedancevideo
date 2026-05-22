import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseAssetMentions } from "@/lib/prompt";
import { createBailianVideoTask } from "@/lib/bailian-video";
import { createBailianVideoSchema } from "@/lib/validation";

export const runtime = "nodejs";

async function resolveAssets(assetIds: string[], prompt: string) {
  const mentionedNames = parseAssetMentions(prompt);
  const conditions = [];
  if (assetIds.length > 0) conditions.push({ id: { in: assetIds } });
  if (mentionedNames.length > 0) conditions.push({ name: { in: mentionedNames } });
  if (conditions.length === 0) return [];
  return prisma.asset.findMany({ where: { OR: conditions }, orderBy: { createdAt: "asc" } });
}

function modelForMode(mode: string) {
  if (mode === "text-to-video") return process.env.HAPPYHORSE_T2V_MODEL || "happyhorse-1.0-t2v";
  if (mode === "image-to-video") return process.env.HAPPYHORSE_I2V_MODEL || "happyhorse-1.0-i2v";
  if (mode === "reference-to-video") return process.env.HAPPYHORSE_R2V_MODEL || "happyhorse-1.0-r2v";
  if (mode === "first-last-frame") return process.env.WAN_I2V_MODEL || "wan2.7-i2v";
  return process.env.HAPPYHORSE_VIDEO_EDIT_MODEL || "happyhorse-1.0-video-edit";
}

function summarizeBatchStatus(statuses: string[]) {
  if (statuses.some((status) => status === "queued" || status === "running")) return "running";
  if (statuses.length > 0 && statuses.every((status) => status === "completed")) return "completed";
  if (statuses.some((status) => status === "completed")) return "completed";
  return "failed";
}

function validateModeAssets(mode: string, assets: Awaited<ReturnType<typeof resolveAssets>>) {
  const imageCount = assets.filter((asset) => asset.kind === "image").length;
  const videoCount = assets.filter((asset) => asset.kind === "video").length;
  if (mode === "image-to-video" && imageCount < 1) throw new Error("图生视频需要至少 1 张图片素材");
  if (mode === "reference-to-video" && imageCount < 1) throw new Error("参考图生视频需要至少 1 张图片素材");
  if (mode === "first-last-frame" && imageCount < 2) throw new Error("首尾帧需要至少 2 张图片素材");
  if (mode === "video-edit" && videoCount < 1) throw new Error("参考视频生成需要至少 1 个视频素材");
}

export async function POST(request: NextRequest) {
  try {
    const input = createBailianVideoSchema.parse(await request.json());
    const assets = await resolveAssets(input.assetIds, input.prompt);
    validateModeAssets(input.mode, assets);

    const batch = await prisma.generationBatch.create({
      data: {
        projectId: input.projectId,
        provider: "dashscope",
        model: modelForMode(input.mode),
        nodeType: "bailian-video",
        prompt: input.prompt,
        mode: input.mode,
        ratio: input.ratio,
        resolution: input.resolution,
        duration: input.duration,
        count: input.count,
        generateAudio: input.generateAudio,
        status: "running",
        assets: {
          create: assets.map((asset) => ({
            assetId: asset.id,
            role: asset.kind === "video" ? "reference_video" : "reference"
          }))
        },
        tasks: {
          create: Array.from({ length: input.count }).map(() => ({ status: "queued" }))
        }
      },
      include: { tasks: true }
    });

    const taskUpdates = await Promise.all(
      batch.tasks.map(async (task) => {
        try {
          const providerTask = await createBailianVideoTask(input, assets);
          return prisma.generationTask.update({
            where: { id: task.id },
            data: {
              providerTaskId: providerTask.id,
              status: providerTask.status,
              videoUrl: providerTask.videoUrl,
              errorMessage: providerTask.errorMessage,
              rawResponse: JSON.stringify(providerTask.raw)
            }
          });
        } catch (error) {
          return prisma.generationTask.update({
            where: { id: task.id },
            data: {
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "创建百炼视频任务失败"
            }
          });
        }
      })
    );

    const updatedBatch = await prisma.generationBatch.update({
      where: { id: batch.id },
      data: { status: summarizeBatchStatus(taskUpdates.map((task) => task.status)) },
      include: { tasks: true }
    });

    await prisma.generationJob.create({
      data: {
        projectId: input.projectId,
        nodeId: input.nodeId,
        type: "bailian-video",
        prompt: input.prompt,
        status: updatedBatch.status,
        providerTaskId: updatedBatch.tasks[0]?.providerTaskId,
        resultUrl: updatedBatch.tasks[0]?.videoUrl,
        errorMessage: updatedBatch.tasks.find((task) => task.errorMessage)?.errorMessage,
        rawResponse: JSON.stringify({ batchId: updatedBatch.id })
      }
    });

    return NextResponse.json({ batch: updatedBatch });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建百炼视频批次失败" },
      { status: 400 }
    );
  }
}
