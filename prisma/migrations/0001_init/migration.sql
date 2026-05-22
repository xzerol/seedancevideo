-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "libraryType" TEXT NOT NULL DEFAULT 'asset',
    "source" TEXT NOT NULL DEFAULT 'uploaded',
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GenerationBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "prompt" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "ratio" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "generateAudio" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GenerationBatchAsset" (
    "batchId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    PRIMARY KEY ("batchId", "assetId"),
    CONSTRAINT "GenerationBatchAsset_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "GenerationBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GenerationBatchAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "providerTaskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "videoUrl" TEXT,
    "errorMessage" TEXT,
    "rawResponse" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GenerationTask_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "GenerationBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
