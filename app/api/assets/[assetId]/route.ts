import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await context.params;
  const body = await request.json();
  const nextName = typeof body.name === "string" ? body.name.trim() : "";

  if (typeof body.name === "string" && !nextName) {
    return NextResponse.json({ error: "素材名称不能为空" }, { status: 400 });
  }

  const asset = await prisma.asset.update({
    where: { id: assetId },
    data: {
      ...(typeof body.name === "string" ? { name: nextName } : {}),
      ...(body.libraryType === "person" || body.libraryType === "asset"
        ? { libraryType: body.libraryType }
        : {})
    }
  });

  return NextResponse.json({ asset });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await context.params;

  await prisma.asset.delete({
    where: { id: assetId }
  });

  return NextResponse.json({ ok: true });
}
