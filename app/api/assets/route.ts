import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadAssetFile } from "@/lib/storage";
import { ensureSupportedAsset, kindFromMime } from "@/lib/validation";

export const runtime = "nodejs";

function maxUploadBytes() {
  return Number(process.env.MAX_UPLOAD_MB || 80) * 1024 * 1024;
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");

  if (projectId) {
    const [people, projectAssets, orphanAssets] = await Promise.all([
      prisma.asset.findMany({
        where: { libraryType: "person" },
        orderBy: { createdAt: "desc" },
        take: 200
      }),
      prisma.projectAsset.findMany({
        where: { projectId },
        include: { asset: true },
        orderBy: { createdAt: "desc" },
        take: 200
      }),
      prisma.asset.findMany({
        where: { libraryType: "asset", projectAssets: { none: {} } },
        orderBy: { createdAt: "desc" },
        take: 200
      })
    ]);

    if (orphanAssets.length > 0) {
      await Promise.all(
        orphanAssets.map((asset) =>
          prisma.projectAsset.upsert({
            where: { projectId_assetId: { projectId, assetId: asset.id } },
            update: {},
            create: { projectId, assetId: asset.id, role: "library" }
          })
        )
      );
    }

    const byId = new Map<string, (typeof people)[number]>();
    for (const asset of [
      ...people,
      ...orphanAssets,
      ...projectAssets.map((item) => item.asset)
    ]) {
      byId.set(asset.id, asset);
    }
    return NextResponse.json({ assets: [...byId.values()] });
  }

  const assets = await prisma.asset.findMany({
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return NextResponse.json({ assets });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const libraryType = String(formData.get("libraryType") || "asset");
    const projectId = String(formData.get("projectId") || "");
    const normalizedLibraryType = libraryType === "person" ? "person" : "asset";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择要上传的素材" }, { status: 400 });
    }

    ensureSupportedAsset(file.type);

    if (file.size > maxUploadBytes()) {
      return NextResponse.json(
        { error: `素材不能超过 ${process.env.MAX_UPLOAD_MB || 80}MB` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadAssetFile({
      buffer,
      fileName: file.name,
      mimeType: file.type
    });

    const asset = await prisma.asset.create({
      data: {
        name: file.name.replace(/\.[^.]+$/, ""),
        mimeType: file.type,
        kind: kindFromMime(file.type),
        libraryType: normalizedLibraryType,
        source: "uploaded",
        size: file.size,
        storageKey: uploaded.storageKey,
        publicUrl: uploaded.publicUrl,
        projectAssets:
          normalizedLibraryType === "asset" && projectId
            ? { create: { projectId, role: "library" } }
            : undefined
      }
    });

    return NextResponse.json({ asset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "素材上传失败" },
      { status: 500 }
    );
  }
}
