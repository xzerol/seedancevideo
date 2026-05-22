import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function defaultNodes() {
  return [
    {
      nodeId: "seedream-1",
      type: "seedream-image",
      positionX: 340,
      positionY: 120,
      dataJson: JSON.stringify({
        title: "Seedream 5.0 生图",
        prompt: "",
        ratio: "智能",
        size: "2K",
        count: 1,
        optimizePrompt: true,
        watermark: false,
        inputAssetIds: []
      })
    },
    {
      nodeId: "seedance-1",
      type: "seedance-video",
      positionX: 760,
      positionY: 120,
      dataJson: JSON.stringify({
        title: "Seedance 2.0 视频",
        prompt: "",
        mode: "reference",
        ratio: "智能",
        resolution: "720p",
        duration: 5,
        count: 1,
        generateAudio: true,
        inputAssetIds: []
      })
    }
  ];
}

type ProjectWithSummaryData = Awaited<ReturnType<typeof loadProjects>>[number];

function firstProjectThumbnail(project: ProjectWithSummaryData) {
  const assets = project.assets.map((item) => item.asset);
  const image = assets.find((asset) => asset.kind === "image");
  if (image) return { thumbnailUrl: image.publicUrl, thumbnailKind: "image" };

  const videoAsset = assets.find((asset) => asset.kind === "video");
  if (videoAsset) return { thumbnailUrl: videoAsset.publicUrl, thumbnailKind: "video" };

  const videoTask = project.batches
    .flatMap((batch) => batch.tasks)
    .find((task) => task.videoUrl);
  if (videoTask?.videoUrl) {
    return { thumbnailUrl: videoTask.videoUrl, thumbnailKind: "video" };
  }

  const resultJob = project.jobs.find((job) => job.resultUrl);
  if (resultJob?.resultUrl) {
    return {
      thumbnailUrl: resultJob.resultUrl,
      thumbnailKind:
        resultJob.type === "seedream-image" || resultJob.resultUrl.includes("image")
          ? "image"
          : "video"
    };
  }

  return { thumbnailUrl: null, thumbnailKind: null };
}

function projectSummary(project: ProjectWithSummaryData) {
  const thumbnail = firstProjectThumbnail(project);
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    thumbnailUrl: thumbnail.thumbnailUrl,
    thumbnailKind: thumbnail.thumbnailKind,
    assetCount: project.assets.length,
    generationCount: project.batches.reduce(
      (sum, batch) => sum + batch.tasks.length,
      project.jobs.length
    )
  };
}

function loadProjects(skip = 0, take = 10) {
  return prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    skip,
    take,
    include: {
      assets: {
        include: { asset: true },
        orderBy: { createdAt: "asc" }
      },
      jobs: {
        where: { resultUrl: { not: null } },
        orderBy: { createdAt: "asc" },
        take: 1
      },
      batches: {
        include: {
          tasks: {
            where: { videoUrl: { not: null } },
            orderBy: { createdAt: "asc" },
            take: 1
          }
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });
}

function loadProject(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assets: {
        include: { asset: true },
        orderBy: { createdAt: "asc" }
      },
      jobs: {
        where: { resultUrl: { not: null } },
        orderBy: { createdAt: "asc" },
        take: 1
      },
      batches: {
        include: {
          tasks: {
            where: { videoUrl: { not: null } },
            orderBy: { createdAt: "asc" },
            take: 1
          }
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });
}

export async function GET(request: NextRequest) {
  const page = Math.max(Number(request.nextUrl.searchParams.get("page") || 1), 1);
  const pageSize = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("pageSize") || 10), 1),
    50
  );
  const skip = (page - 1) * pageSize;

  let total = await prisma.project.count();
  let projects = await loadProjects(skip, pageSize);

  if (projects.length === 0) {
    const project = await prisma.project.create({
      data: {
        name: "未命名项目",
        nodes: { create: defaultNodes() }
      }
    });
    total = 1;
    projects = await loadProjects(0, pageSize);
  }

  return NextResponse.json({
    projects: projects.map(projectSummary),
    page,
    pageSize,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1)
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const project = await prisma.project.create({
    data: {
      name: String(body.name || "未命名项目"),
      nodes: { create: defaultNodes() }
    }
  });

  const projectWithSummary = await loadProject(project.id);

  return NextResponse.json({
    project: projectSummary(
      projectWithSummary || ({ ...project, assets: [], jobs: [], batches: [] } as ProjectWithSummaryData)
    )
  });
}
