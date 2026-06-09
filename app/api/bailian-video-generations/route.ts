import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAssetsForGeneration } from "@/lib/asset-resolution";
import {
  bailianModelFamilyForInput,
  createBailianVideoTask,
  modelForInput,
  validateBailianModelMode
} from "@/lib/bailian-video";
import {
  createBailianVideoSchema,
  type CreateBailianVideoInput
} from "@/lib/validation";

export const runtime = "nodejs";

function summarizeBatchStatus(statuses: string[]) {
  if (statuses.some((status) => status === "queued" || status === "running")) return "running";
  if (statuses.length > 0 && statuses.every((status) => status === "completed")) return "completed";
  if (statuses.some((status) => status === "completed")) return "completed";
  return "failed";
}

function validateModeAssets(
  input: CreateBailianVideoInput,
  assets: Awaited<ReturnType<typeof resolveAssetsForGeneration>>
) {
  const modelFamily = bailianModelFamilyForInput(input);
  const imageCount = assets.filter((asset) => asset.kind === "image").length;
  const videoCount = assets.filter((asset) => asset.kind === "video").length;
  if (input.mode === "image-to-video" && imageCount !== 1) {
    throw new Error("图生视频需要且只能选择 1 张首帧图片");
  }
  if (input.mode === "reference-to-video") {
    const referenceCount = modelFamily === "wan" ? imageCount + videoCount : imageCount;
    const limit = modelFamily === "wan" ? 5 : 9;
    if (referenceCount < 1 || referenceCount > limit) {
      throw new Error(
        modelFamily === "wan"
          ? "Wan 参考生视频需要 1-5 个参考图片或视频素材"
          : "HappyHorse 参考图生视频需要 1-9 张参考图"
      );
    }
  }
  if (input.mode === "first-last-frame" && imageCount !== 2) {
    throw new Error("首尾帧生视频需要且只能选择 2 张图片素材");
  }
  if (input.mode === "video-edit" && videoCount < 1) {
    throw new Error("参考视频生成需要至少 1 个视频素材");
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createBailianVideoSchema.parse(await request.json());
    validateBailianModelMode(input);
    const assets = await resolveAssetsForGeneration(
      input.assetIds,
      input.prompt,
      input.projectId
    );
    validateModeAssets(input, assets);

    const batch = await prisma.generationBatch.create({
      data: {
        projectId: input.projectId,
        provider: "dashscope",
        model: modelForInput(input),
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
