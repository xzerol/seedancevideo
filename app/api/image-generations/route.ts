import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseAssetMentions } from "@/lib/prompt";
import { createSeedreamImages } from "@/lib/seedream";
import { createImageGenerationSchema } from "@/lib/validation";

export const runtime = "nodejs";

async function resolveAssets(assetIds: string[], prompt: string) {
  const mentionedNames = parseAssetMentions(prompt);
  const conditions = [];
  if (assetIds.length > 0) conditions.push({ id: { in: assetIds } });
  if (mentionedNames.length > 0) conditions.push({ name: { in: mentionedNames } });
  if (conditions.length === 0) return [];

  return prisma.asset.findMany({
    where: { OR: conditions },
    orderBy: { createdAt: "asc" }
  });
}

export async function POST(request: NextRequest) {
  try {
    const input = createImageGenerationSchema.parse(await request.json());
    const assets = await resolveAssets(input.assetIds, input.prompt);

    const job = await prisma.generationJob.create({
      data: {
        projectId: input.projectId,
        nodeId: input.nodeId,
        type: "seedream-image",
        prompt: input.prompt,
        status: "running"
      }
    });

    const result = await createSeedreamImages(input, assets);
    const updatedJob = await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: result.status,
        resultUrl: result.imageUrls[0] ?? null,
        errorMessage: result.errorMessage,
        rawResponse: JSON.stringify(result.raw)
      }
    });

    return NextResponse.json({
      job: updatedJob,
      imageUrls: result.imageUrls
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建 Seedream 任务失败" },
      { status: 400 }
    );
  }
}
