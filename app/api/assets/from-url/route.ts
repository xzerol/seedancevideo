import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = String(body.url || "");
    if (!url.startsWith("http") && !url.startsWith("/api/local-files/")) {
      return NextResponse.json({ error: "缺少可收藏的结果 URL" }, { status: 400 });
    }

    const asset = await prisma.asset.create({
      data: {
        name: String(body.name || "生成图片"),
        mimeType: String(body.mimeType || "image/png"),
        kind: String(body.kind || "image"),
        libraryType: String(body.libraryType || "asset"),
        source: "generated",
        size: 0,
        storageKey: String(body.storageKey || `generated:${url}`),
        publicUrl: url,
        projectAssets:
          body.projectId && String(body.libraryType || "asset") !== "person"
            ? {
                create: {
                  projectId: String(body.projectId),
                  role: "library"
                }
              }
            : undefined
      }
    });

    return NextResponse.json({ asset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "收藏素材失败" },
      { status: 500 }
    );
  }
}
