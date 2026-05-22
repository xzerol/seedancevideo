import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";

function cleanFileName(fileName: string) {
  return fileName
    .replace(/[^\w.\-\u4e00-\u9fa5]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 96);
}

export function localVideoRoot() {
  return process.env.LOCAL_VIDEO_DIR || "generated-videos";
}

export function localVideoPublicUrl(storageKey: string) {
  const base = process.env.LOCAL_VIDEO_PUBLIC_BASE_URL || "/api/local-files/videos";
  return `${base.replace(/\/$/, "")}/${storageKey
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function isLocalVideoUrl(url?: string | null) {
  if (!url) return false;
  return url.startsWith("/api/local-files/videos/");
}

export async function saveRemoteVideoFile(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载生成视频失败：${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const extension = fileName.match(/\.[a-z0-9]{1,8}$/i)?.[0] || ".mp4";
  const baseName = fileName.endsWith(extension)
    ? fileName.slice(0, -extension.length)
    : fileName;
  const safeName = cleanFileName(baseName) || "generated-video";
  const day = new Date().toISOString().slice(0, 10);
  const storageKey = `${day}/${randomUUID()}-${safeName}${extension}`;
  const outputDir = `${localVideoRoot().replace(/\/$/, "")}/${day}`;
  const outputPath = `${outputDir}/${storageKey.split("/").pop()}`;

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, Buffer.from(arrayBuffer));

  return {
    storageKey: `local-video:${storageKey}`,
    publicUrl: localVideoPublicUrl(storageKey)
  };
}

export async function ensureLocalVideoFile(url: string, fileName: string) {
  if (isLocalVideoUrl(url)) return url;
  const saved = await saveRemoteVideoFile(url, fileName);
  return saved.publicUrl;
}
