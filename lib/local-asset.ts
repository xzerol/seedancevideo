import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";

type SaveAssetInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

function cleanFileName(fileName: string) {
  return fileName
    .replace(/[^\w.\-\u4e00-\u9fa5]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 96);
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/webm") return ".webm";
  if (mimeType === "video/quicktime") return ".mov";
  if (mimeType === "audio/mpeg") return ".mp3";
  if (mimeType === "audio/wav") return ".wav";
  return "";
}

export function localAssetRoot() {
  const configuredDir = process.env.LOCAL_ASSET_DIR;
  if (configuredDir && path.isAbsolute(configuredDir)) return configuredDir;
  return path.join(/* turbopackIgnore: true */ process.cwd(), "uploaded-assets");
}

export function localAssetPublicUrl(storageKey: string) {
  const base = process.env.LOCAL_ASSET_PUBLIC_BASE_URL || "/api/local-files/assets";
  return `${base.replace(/\/$/, "")}/${storageKey
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function isLocalAssetStorageKey(storageKey?: string | null) {
  return Boolean(storageKey?.startsWith("local-asset:"));
}

export function isLocalAssetUrl(url?: string | null) {
  return Boolean(url?.startsWith("/api/local-files/assets/"));
}

export function localAssetKeyFromStorageKey(storageKey: string) {
  return storageKey.replace(/^local-asset:/, "");
}

export function localAssetPath(storageKey: string) {
  const localKey = localAssetKeyFromStorageKey(storageKey);
  const root = localAssetRoot();
  const filePath = path.resolve(root, ...localKey.split("/"));
  if (!filePath.startsWith(root + path.sep)) {
    throw new Error("本地素材路径无效");
  }
  return filePath;
}

export function contentTypeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".wav") return "audio/wav";
  return "application/octet-stream";
}

export async function saveAssetFile(input: SaveAssetInput) {
  const explicitExtension = path.extname(input.fileName);
  const extension = explicitExtension || extensionForMime(input.mimeType);
  const baseName = explicitExtension
    ? path.basename(input.fileName, explicitExtension)
    : input.fileName;
  const safeName = cleanFileName(baseName) || "asset";
  const day = new Date().toISOString().slice(0, 10);
  const fileName = `${randomUUID()}-${safeName}${extension}`;
  const storageKey = `${day}/${fileName}`;
  const outputDir = path.join(localAssetRoot(), day);

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, fileName), input.buffer);

  return {
    size: input.buffer.byteLength,
    storageKey: `local-asset:${storageKey}`,
    publicUrl: localAssetPublicUrl(storageKey)
  };
}

export async function saveRemoteAssetFile(
  url: string,
  fileName: string,
  mimeType: string,
  baseUrl?: string
) {
  const fetchUrl = url.startsWith("/") && baseUrl ? new URL(url, baseUrl).toString() : url;
  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`下载素材失败：${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return saveAssetFile({
    buffer: Buffer.from(arrayBuffer),
    fileName,
    mimeType
  });
}

export async function localAssetStats(storageKey: string) {
  return stat(localAssetPath(storageKey));
}

export function streamLocalAsset(storageKey: string, start: number, end: number) {
  return Readable.toWeb(createReadStream(localAssetPath(storageKey), { start, end })) as BodyInit;
}
