import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { localVideoRoot } from "@/lib/local-video";

export const runtime = "nodejs";

function contentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  return "video/mp4";
}

function streamFile(filePath: string, start: number, end: number) {
  return Readable.toWeb(createReadStream(filePath, { start, end })) as BodyInit;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ filePath: string[] }> }
) {
  const { filePath } = await context.params;
  const root = localVideoRoot();
  const requestedPath = path.resolve(root, ...filePath);

  if (!requestedPath.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "文件路径无效" }, { status: 400 });
  }

  try {
    const fileStat = await stat(requestedPath);
    const range = request.headers.get("range");
    const headers = {
      "Content-Type": contentType(requestedPath),
      "Accept-Ranges": "bytes"
    };

    if (!range) {
      return new NextResponse(streamFile(requestedPath, 0, fileStat.size - 1), {
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

    return new NextResponse(streamFile(requestedPath, start, safeEnd), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(safeEnd - start + 1),
        "Content-Range": `bytes ${start}-${safeEnd}/${fileStat.size}`
      }
    });
  } catch {
    return NextResponse.json({ error: "本地视频不存在" }, { status: 404 });
  }
}
