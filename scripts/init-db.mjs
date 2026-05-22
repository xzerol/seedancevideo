import fs from "node:fs";

if (fs.existsSync(".env")) {
  const env = fs.readFileSync(".env", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^"|"$/g, "");
  }
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const statements = [
  `CREATE TABLE IF NOT EXISTS "Asset" (
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
  )`,
  `CREATE TABLE IF NOT EXISTS "GenerationBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'ark',
    "model" TEXT,
    "nodeType" TEXT NOT NULL DEFAULT 'seedance-video',
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
  )`,
  `CREATE TABLE IF NOT EXISTS "GenerationBatchAsset" (
    "batchId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    PRIMARY KEY ("batchId", "assetId"),
    CONSTRAINT "GenerationBatchAsset_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "GenerationBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GenerationBatchAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "GenerationTask" (
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
  )`,
  `CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "CanvasNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "positionX" REAL NOT NULL,
    "positionY" REAL NOT NULL,
    "width" REAL,
    "height" REAL,
    "dataJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CanvasNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CanvasNode_projectId_nodeId_key" ON "CanvasNode"("projectId", "nodeId")`,
  `CREATE TABLE IF NOT EXISTS "CanvasEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "edgeId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "sourceHandle" TEXT,
    "targetHandle" TEXT,
    "dataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CanvasEdge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CanvasEdge_projectId_edgeId_key" ON "CanvasEdge"("projectId", "edgeId")`,
  `CREATE TABLE IF NOT EXISTS "ProjectAsset" (
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'reference',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("projectId", "assetId"),
    CONSTRAINT "ProjectAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "nodeId" TEXT,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerTaskId" TEXT,
    "resultUrl" TEXT,
    "errorMessage" TEXT,
    "rawResponse" TEXT,
    "createdAssetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ConversationSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "inputAssetIds" TEXT NOT NULL,
    "paramsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`
];

const alterStatements = [
  `ALTER TABLE "Asset" ADD COLUMN "libraryType" TEXT NOT NULL DEFAULT 'asset'`,
  `ALTER TABLE "Asset" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'uploaded'`,
  `ALTER TABLE "GenerationBatch" ADD COLUMN "projectId" TEXT`,
  `ALTER TABLE "GenerationBatch" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'ark'`,
  `ALTER TABLE "GenerationBatch" ADD COLUMN "model" TEXT`,
  `ALTER TABLE "GenerationBatch" ADD COLUMN "nodeType" TEXT NOT NULL DEFAULT 'seedance-video'`
];

try {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ConversationSnapshot_projectId_nodeId_createdAt_idx" ON "ConversationSnapshot"("projectId", "nodeId", "createdAt")`
  );
  for (const statement of alterStatements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("duplicate column name")) throw error;
    }
  }
  console.log("Database is ready.");
} finally {
  await prisma.$disconnect();
}
