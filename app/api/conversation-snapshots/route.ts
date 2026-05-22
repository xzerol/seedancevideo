import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  if (!projectId || !nodeId) {
    return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
  }

  const snapshots = await prisma.conversationSnapshot.findMany({
    where: { projectId, nodeId },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  return NextResponse.json({ snapshots });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = String(body.projectId || "");
    const nodeId = String(body.nodeId || "");
    const nodeType = String(body.nodeType || "node");
    const prompt = String(body.prompt || "");
    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    const snapshot = await prisma.conversationSnapshot.create({
      data: {
        projectId,
        nodeId,
        nodeType,
        prompt,
        inputAssetIds: JSON.stringify(body.inputAssetIds || []),
        paramsJson: JSON.stringify(body.params || {})
      }
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存对话失败" },
      { status: 400 }
    );
  }
}
