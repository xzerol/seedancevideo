import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import path from "path";

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

export async function uploadAssetFile(input: UploadInput) {
  const bucket = storageBucket();
  const extension = path.extname(input.fileName);
  const safeName = cleanFileName(path.basename(input.fileName, extension));
  const storageKey = `seedance-assets/${new Date()
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

  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
  if (publicBaseUrl) {
    return {
      storageKey,
      publicUrl: `${publicBaseUrl.replace(/\/$/, "")}/${storageKey}`
    };
  }

  const ttl = Number(process.env.ASSET_URL_TTL_SECONDS || 86400);
  const publicUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
    { expiresIn: ttl }
  );

  return { storageKey, publicUrl };
}

export async function uploadRemoteFile(url: string, fileName: string, mimeType: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载生成结果失败：${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return uploadAssetFile({
    buffer: Buffer.from(arrayBuffer),
    fileName,
    mimeType
  });
}
