import { NextRequest, NextResponse } from "next/server";
import type { Asset } from "@prisma/client";
import { saveGeneratedImageAssets } from "@/lib/generated-image-assets";
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
    let generatedAssets: Asset[] = [];
    if (result.status === "completed") {
      try {
        generatedAssets = await saveGeneratedImageAssets({
          imageUrls: result.imageUrls,
          projectId: input.projectId,
          baseUrl: request.nextUrl.origin
        });
      } catch (saveError) {
        await prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            errorMessage:
              saveError instanceof Error ? saveError.message : "生成图片本地保存失败",
            rawResponse: JSON.stringify(result.raw)
          }
        });
        throw saveError;
      }
    }
    const localImageUrls = generatedAssets.map((asset) => asset.publicUrl);
    const updatedJob = await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: result.status,
        resultUrl: localImageUrls[0] ?? result.imageUrls[0] ?? null,
        errorMessage: result.errorMessage,
        createdAssetId: generatedAssets[0]?.id ?? null,
        rawResponse: JSON.stringify(result.raw)
      }
    });

    return NextResponse.json({
      job: updatedJob,
      imageUrls: localImageUrls.length > 0 ? localImageUrls : result.imageUrls,
      assets: generatedAssets
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建 Seedream 任务失败" },
      { status: 400 }
    );
  }
}
