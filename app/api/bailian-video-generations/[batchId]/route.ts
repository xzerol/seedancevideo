import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBailianVideoTask } from "@/lib/bailian-video";
import { ensureLocalVideoFile, isLocalVideoUrl } from "@/lib/local-video";

export const runtime = "nodejs";

function isTerminal(status: string) {
  return ["completed", "failed", "canceled"].includes(status);
}

function summarizeBatchStatus(statuses: string[]) {
  if (statuses.some((status) => status === "queued" || status === "running")) return "running";
  if (statuses.length > 0 && statuses.every((status) => status === "completed")) return "completed";
  if (statuses.some((status) => status === "completed")) return "completed";
  return "failed";
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await context.params;
  const batch = await prisma.generationBatch.findUnique({
    where: { id: batchId },
    include: { tasks: true }
  });

  if (!batch) return NextResponse.json({ error: "百炼视频批次不存在" }, { status: 404 });

  const updatedTasks = await Promise.all(
    batch.tasks.map(async (task) => {
      if (!task.providerTaskId) return task;
      if (isTerminal(task.status)) {
        if (task.status === "completed" && task.videoUrl && !isLocalVideoUrl(task.videoUrl)) {
          try {
            const videoUrl = await ensureLocalVideoFile(
              task.videoUrl,
              `bailian-${task.providerTaskId}.mp4`
            );
            return prisma.generationTask.update({
              where: { id: task.id },
              data: { videoUrl }
            });
          } catch {
            return task;
          }
        }
        return task;
      }
      try {
        const providerTask = await getBailianVideoTask(task.providerTaskId);
        return prisma.generationTask.update({
          where: { id: task.id },
          data: {
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
            errorMessage: error instanceof Error ? error.message : "查询百炼视频任务失败"
          }
        });
      }
    })
  );

  const updatedBatch = await prisma.generationBatch.update({
    where: { id: batch.id },
    data: { status: summarizeBatchStatus(updatedTasks.map((task) => task.status)) },
    include: { tasks: true }
  });

  await prisma.generationJob.updateMany({
    where: { type: "bailian-video", rawResponse: { contains: batch.id } },
    data: {
      status: updatedBatch.status,
      resultUrl: updatedBatch.tasks.find((task) => task.videoUrl)?.videoUrl,
      errorMessage: updatedBatch.tasks.find((task) => task.errorMessage)?.errorMessage
    }
  });

  return NextResponse.json({ batch: updatedBatch });
}
