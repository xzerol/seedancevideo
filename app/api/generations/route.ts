import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseAssetMentions } from "@/lib/prompt";
import { createSeedanceTask } from "@/lib/seedance";
import { createGenerationSchema } from "@/lib/validation";

export const runtime = "nodejs";

async function resolveAssets(assetIds: string[], prompt: string) {
  const mentionedNames = parseAssetMentions(prompt);
  const conditions = [];
  if (assetIds.length > 0) conditions.push({ id: { in: assetIds } });
  if (mentionedNames.length > 0) conditions.push({ name: { in: mentionedNames } });
  if (conditions.length === 0) return [];

  const assets = await prisma.asset.findMany({
    where: {
      OR: conditions
    },
    orderBy: { createdAt: "asc" }
  });

  return assets;
}

function summarizeBatchStatus(statuses: string[]) {
  if (statuses.some((status) => status === "queued" || status === "running")) {
    return "running";
  }
  if (statuses.length > 0 && statuses.every((status) => status === "completed")) {
    return "completed";
  }
  if (statuses.some((status) => status === "completed")) return "completed";
  return "failed";
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const input = createGenerationSchema.parse(json);
    const assets = await resolveAssets(input.assetIds, input.prompt);
    if (
      input.mode === "reference_video" &&
      !assets.some((asset) => asset.kind === "video")
    ) {
      return NextResponse.json(
        { error: "参考视频模式需要至少选择 1 个视频素材" },
        { status: 400 }
      );
    }

    const batch = await prisma.generationBatch.create({
      data: {
        prompt: input.prompt,
        projectId: input.projectId,
        provider: "ark",
        model: process.env.SEEDANCE_MODEL || "doubao-seedance-2-0-260128",
        nodeType: "seedance-video",
        mode: input.mode,
        ratio: input.ratio,
        resolution: input.resolution,
        duration: input.duration,
        count: input.count,
        generateAudio: input.generateAudio,
        status: "running",
        assets: {
          create: assets.map((asset, index) => ({
            assetId: asset.id,
            role:
              input.mode === "frames"
                ? index === 0
                  ? "first_frame"
                  : index === 1
                    ? "last_frame"
                    : "reference"
                : asset.kind === "video"
                  ? "reference_video"
                  : "reference"
          }))
        },
        tasks: {
          create: Array.from({ length: input.count }).map(() => ({
            status: "queued"
          }))
        }
      },
      include: { tasks: true, assets: { include: { asset: true } } }
    });

    const taskUpdates = await Promise.all(
      batch.tasks.map(async (task) => {
        try {
          const providerTask = await createSeedanceTask(input, assets);
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
              errorMessage:
                error instanceof Error ? error.message : "创建 Seedance 任务失败"
            }
          });
        }
      })
    );

    const updatedBatch = await prisma.generationBatch.update({
      where: { id: batch.id },
      data: {
        status: summarizeBatchStatus(taskUpdates.map((task) => task.status))
      },
      include: { tasks: true }
    });

    await prisma.generationJob.create({
      data: {
        projectId: input.projectId,
        nodeId: input.nodeId,
        type: "seedance-video",
        prompt: input.prompt,
        status: updatedBatch.status,
        providerTaskId: updatedBatch.tasks[0]?.providerTaskId,
        resultUrl: updatedBatch.tasks[0]?.videoUrl,
        errorMessage: updatedBatch.tasks.find((task) => task.errorMessage)
          ?.errorMessage,
        rawResponse: JSON.stringify({ batchId: updatedBatch.id })
      }
    });

    return NextResponse.json({ batch: updatedBatch });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "创建生成批次失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
