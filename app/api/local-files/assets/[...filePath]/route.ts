import { NextRequest, NextResponse } from "next/server";
import {
  contentTypeFromPath,
  localAssetStats,
  streamLocalAsset
} from "@/lib/local-asset";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ filePath: string[] }> }
) {
  const { filePath } = await context.params;
  const storageKey = `local-asset:${filePath.join("/")}`;

  try {
    const fileStat = await localAssetStats(storageKey);
    const range = request.headers.get("range");
    const contentType = contentTypeFromPath(filePath[filePath.length - 1] || "");
    const headers = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes"
    };

    if (!range) {
      return new NextResponse(streamLocalAsset(storageKey, 0, fileStat.size - 1), {
        headers: {
          ...headers,
          "Content-Length": String(fileStat.size)
        }
      });
    }

    const match = range.match(/bytes=(\d*)-(\d*)/);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : fileStat.size - 1;
    const safeEnd = Math.min(end, fileStat.size - 1);

    return new NextResponse(streamLocalAsset(storageKey, start, safeEnd), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(safeEnd - start + 1),
        "Content-Range": `bytes ${start}-${safeEnd}/${fileStat.size}`
      }
    });
  } catch {
    return NextResponse.json({ error: "本地素材不存在" }, { status: 404 });
  }
}
