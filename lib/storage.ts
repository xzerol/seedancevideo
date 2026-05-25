import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Asset } from "@prisma/client";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import {
  isLocalAssetStorageKey,
  localAssetKeyFromStorageKey,
  localAssetPath
} from "./local-asset";
import { localVideoRoot } from "./local-video";

type UploadInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function storageRegion() {
  return envValue("S3_REGION", "TOS_REGION") || "cn-beijing";
}

function storageEndpoint() {
  return (
    envValue("S3_ENDPOINT", "TOS_ENDPOINT") ||
    `https://tos-s3-${storageRegion()}.volces.com`
  );
}

function storageBucket() {
  const bucket = envValue("S3_BUCKET", "TOS_BUCKET", "TOS_BUCKET_NAME");
  if (!bucket) throw new Error("缺少对象存储配置：S3_BUCKET 或 TOS_BUCKET");
  return bucket;
}

function storageAccessKeyId() {
  const key = envValue("S3_ACCESS_KEY_ID", "TOS_ACCESS_KEY_ID", "TOS_ACCESS_KEY");
  if (!key) throw new Error("缺少对象存储配置：S3_ACCESS_KEY_ID 或 TOS_ACCESS_KEY_ID");
  return key;
}

function storageSecretAccessKey() {
  const key = envValue(
    "S3_SECRET_ACCESS_KEY",
    "TOS_SECRET_ACCESS_KEY",
    "TOS_SECRET_KEY"
  );
  if (!key) {
    throw new Error("缺少对象存储配置：S3_SECRET_ACCESS_KEY 或 TOS_SECRET_ACCESS_KEY");
  }
  return key;
}

function client() {
  return new S3Client({
    region: storageRegion(),
    endpoint: storageEndpoint(),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: storageAccessKeyId(),
      secretAccessKey: storageSecretAccessKey()
    }
  });
}

function cleanFileName(fileName: string) {
  return fileName
    .replace(/[^\w.\-\u4e00-\u9fa5]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 96);
}

async function publicUrlForStorageKey(
  s3: S3Client,
  bucket: string,
  storageKey: string
) {
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, "")}/${storageKey}`;
  }

  const ttl = Number(process.env.ASSET_URL_TTL_SECONDS || 86400);
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
    { expiresIn: ttl }
  );
}

export async function uploadFileToBucket(input: UploadInput) {
  const bucket = storageBucket();
  const extension = path.extname(input.fileName);
  const safeName = cleanFileName(path.basename(input.fileName, extension));
  const storageKey = `seedance-runtime-assets/${new Date()
    .toISOString()
    .slice(0, 10)}/${randomUUID()}-${safeName}${extension}`;

  const s3 = client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: input.buffer,
      ContentType: input.mimeType
    })
  );

  const publicUrl = await publicUrlForStorageKey(s3, bucket, storageKey);
  return { storageKey, publicUrl };
}

export async function uploadRemoteFile(url: string, fileName: string, mimeType: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载生成结果失败：${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return uploadFileToBucket({
    buffer: Buffer.from(arrayBuffer),
    fileName,
    mimeType
  });
}

async function legacyBucketAssetUrl(storageKey: string) {
  const bucket = storageBucket();
  const s3 = client();
  return publicUrlForStorageKey(s3, bucket, storageKey);
}

function localVideoPath(storageKey: string) {
  const localKey = storageKey.replace(/^local-video:/, "");
  return path.resolve(localVideoRoot(), ...localKey.split("/"));
}

function localPathFromPublicUrl(url: string) {
  const pathname = new URL(url, "http://local").pathname;
  const assetPrefix = "/api/local-files/assets/";
  const videoPrefix = "/api/local-files/videos/";

  if (pathname.startsWith(assetPrefix)) {
    const localKey = decodeURIComponent(pathname.slice(assetPrefix.length));
    return localAssetPath(`local-asset:${localKey}`);
  }

  if (pathname.startsWith(videoPrefix)) {
    const localKey = decodeURIComponent(pathname.slice(videoPrefix.length));
    return path.resolve(localVideoRoot(), ...localKey.split("/"));
  }

  return null;
}

async function uploadLocalAssetForProvider(asset: Asset) {
  if (isLocalAssetStorageKey(asset.storageKey)) {
    const localKey = localAssetKeyFromStorageKey(asset.storageKey);
    return uploadFileToBucket({
      buffer: await readFile(localAssetPath(asset.storageKey)),
      fileName: path.basename(localKey),
      mimeType: asset.mimeType
    });
  }

  if (asset.storageKey.startsWith("local-video:")) {
    return uploadFileToBucket({
      buffer: await readFile(localVideoPath(asset.storageKey)),
      fileName: path.basename(asset.storageKey.replace(/^local-video:/, "")),
      mimeType: asset.mimeType
    });
  }

  if (asset.publicUrl.startsWith("/api/local-files/")) {
    const filePath = localPathFromPublicUrl(asset.publicUrl);
    if (!filePath) throw new Error("本地素材地址无效，无法上传给模型调用");
    return uploadFileToBucket({
      buffer: await readFile(filePath),
      fileName: path.basename(filePath),
      mimeType: asset.mimeType
    });
  }

  if (asset.storageKey.startsWith("generated:")) {
    return uploadRemoteFile(asset.publicUrl, asset.name, asset.mimeType);
  }

  if (asset.storageKey) {
    return {
      storageKey: asset.storageKey,
      publicUrl: await legacyBucketAssetUrl(asset.storageKey)
    };
  }

  if (asset.publicUrl.startsWith("http")) {
    return uploadRemoteFile(asset.publicUrl, asset.name, asset.mimeType);
  }

  return {
    storageKey: asset.storageKey,
    publicUrl: asset.publicUrl
  };
}

export async function prepareAssetsForProvider(assets: Asset[]) {
  return Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      publicUrl: (await uploadLocalAssetForProvider(asset)).publicUrl
    }))
  );
}

export async function assetForClient<T extends Asset>(asset: T): Promise<T> {
  if (
    isLocalAssetStorageKey(asset.storageKey) ||
    asset.storageKey.startsWith("local-video:") ||
    asset.storageKey.startsWith("generated:") ||
    asset.publicUrl.startsWith("/api/local-files/")
  ) {
    return asset;
  }

  try {
    return {
      ...asset,
      publicUrl: await legacyBucketAssetUrl(asset.storageKey)
    };
  } catch {
    return asset;
  }
}

export async function assetsForClient<T extends Asset>(assets: T[]): Promise<T[]> {
  return Promise.all(assets.map((asset) => assetForClient(asset)));
}
