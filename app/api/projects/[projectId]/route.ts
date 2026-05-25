import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSeedanceTask } from "@/lib/seedance";
import { getBailianVideoTask } from "@/lib/bailian-video";
import { ensureLocalVideoFile, isLocalVideoUrl } from "@/lib/local-video";
import { assetsForClient } from "@/lib/storage";
import { saveCanvasSchema } from "@/lib/validation";

export const runtime = "nodejs";

function parseJson(value: string | null | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function isTerminal(status: string) {
  return ["completed", "failed", "canceled"].includes(status);
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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      nodes: true,
      edges: true,
      assets: { include: { asset: true } },
      jobs: { orderBy: { createdAt: "desc" }, take: 50 },
      batches: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { tasks: true }
      }
    }
  });

  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  const syncedBatches = await Promise.all(
    project.batches.map(async (batch) => {
      const syncedTasks = await Promise.all(
        batch.tasks.map(async (task) => {
          if (!task.providerTaskId) return task;
          if (isTerminal(task.status)) {
            if (
              task.status === "completed" &&
              task.videoUrl &&
              !isLocalVideoUrl(task.videoUrl)
            ) {
              try {
                const videoUrl = await ensureLocalVideoFile(
                  task.videoUrl,
                  `${batch.provider === "dashscope" ? "bailian" : "seedance"}-${task.providerTaskId}.mp4`
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
            const providerTask =
              batch.provider === "dashscope"
                ? await getBailianVideoTask(task.providerTaskId)
                : await getSeedanceTask(task.providerTaskId);
            return prisma.generationTask.update({
              where: { id: task.id },
              data: {
                status: providerTask.status,
                videoUrl: providerTask.videoUrl,
                errorMessage: providerTask.errorMessage,
                rawResponse: JSON.stringify(providerTask.raw)
              }
            });
          } catch {
            return task;
          }
        })
      );

      const status = summarizeBatchStatus(syncedTasks.map((task) => task.status));
      if (status !== batch.status) {
        await prisma.generationBatch.update({
          where: { id: batch.id },
          data: { status }
        });
      }
      return { ...batch, status, tasks: syncedTasks };
    })
  );

  const videoJobs = syncedBatches
    .flatMap((batch) =>
      batch.tasks.map((task, index) => ({
        id: task.id,
        batchId: batch.id,
        nodeId: null,
        type: batch.nodeType || "seedance-video",
        prompt: batch.count > 1 ? `${batch.prompt} #${index + 1}` : batch.prompt,
        status: task.status,
        resultUrl: task.videoUrl,
        errorMessage: task.errorMessage,
        createdAt: task.createdAt
      }))
    )
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const nonVideoJobs = project.jobs.filter(
    (job) => job.type !== "seedance-video" && job.type !== "bailian-video"
  );

  const clientAssets = await assetsForClient(
    project.assets.map((projectAsset) => projectAsset.asset)
  );

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      nodes: project.nodes.map((node) => ({
        id: node.nodeId,
        type: node.type,
        position: { x: node.positionX, y: node.positionY },
        width: node.width ?? undefined,
        height: node.height ?? undefined,
        data: parseJson(node.dataJson)
      })),
      edges: project.edges.map((edge) => ({
        id: edge.edgeId,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        data: parseJson(edge.dataJson)
      })),
      assets: clientAssets,
      jobs: [...videoJobs, ...nonVideoJobs]
    }
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  const input = saveCanvasSchema.parse(await request.json());

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        updatedAt: new Date()
      }
    });

    await tx.canvasNode.deleteMany({ where: { projectId } });
    await tx.canvasEdge.deleteMany({ where: { projectId } });

    if (input.nodes.length > 0) {
      await tx.canvasNode.createMany({
        data: input.nodes.map((node) => ({
          projectId,
          nodeId: node.id,
          type: node.type,
          positionX: node.position.x,
          positionY: node.position.y,
          width: node.width,
          height: node.height,
          dataJson: JSON.stringify(node.data)
        }))
      });
    }

    if (input.edges.length > 0) {
      await tx.canvasEdge.createMany({
        data: input.edges.map((edge) => ({
          projectId,
          edgeId: edge.id,
          sourceNodeId: edge.source,
          targetNodeId: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          dataJson: edge.data ? JSON.stringify(edge.data) : null
        }))
      });
    }

    const assetIds = new Set<string>();
    for (const node of input.nodes) {
      const assetId = node.data.assetId;
      if (typeof assetId === "string") assetIds.add(assetId);
      const inputAssetIds = node.data.inputAssetIds;
      if (Array.isArray(inputAssetIds)) {
        for (const id of inputAssetIds) {
          if (typeof id === "string") assetIds.add(id);
        }
      }
    }

    if (assetIds.size > 0) {
      await Promise.all(
        [...assetIds].map((assetId) =>
          tx.projectAsset.upsert({
            where: { projectId_assetId: { projectId, assetId } },
            update: {},
            create: { projectId, assetId, role: "reference" }
          })
        )
      );
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;

  await prisma.$transaction(async (tx) => {
    await tx.generationJob.deleteMany({ where: { projectId } });
    await tx.generationBatch.deleteMany({ where: { projectId } });
    await tx.project.delete({ where: { id: projectId } });
  });

  return NextResponse.json({ ok: true });
}
