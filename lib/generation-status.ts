export type TaskLike = {
  status?: string | null;
  videoUrl?: string | null;
  errorMessage?: string | null;
};

export function generationStatusLabel(status?: string | null) {
  const normalized = String(status || "queued").toLowerCase();
  const labels: Record<string, string> = {
    queued: "排队中",
    running: "生成中",
    completed: "已完成",
    failed: "生成失败",
    canceled: "已取消"
  };
  return labels[normalized] || normalized;
}

export function generationProgress(status?: string | null, tasks: TaskLike[] = []) {
  const normalized = String(status || "queued").toLowerCase();
  if (normalized === "completed") return 100;
  if (normalized === "failed" || normalized === "canceled") return 100;

  if (tasks.length === 0) return normalized === "running" ? 30 : 12;

  const score = tasks.reduce((sum, task) => {
    if (task.videoUrl || task.status === "completed") return sum + 1;
    if (task.status === "running") return sum + 0.55;
    if (task.status === "queued") return sum + 0.2;
    if (task.status === "failed" || task.errorMessage) return sum + 1;
    return sum + 0.1;
  }, 0);

  return Math.max(8, Math.min(96, Math.round((score / tasks.length) * 100)));
}

export function generationStatusMessage(status?: string | null, tasks: TaskLike[] = []) {
  const normalized = String(status || "queued").toLowerCase();
  const total = tasks.length;
  const done = tasks.filter((task) => task.videoUrl || task.status === "completed").length;
  const failed = tasks.filter((task) => task.errorMessage || task.status === "failed").length;

  if (normalized === "completed") return total ? `已完成 ${done}/${total}` : "生成完成";
  if (normalized === "failed") return failed ? `${failed} 条失败` : "生成失败";
  if (normalized === "canceled") return "任务已取消";
  if (normalized === "running") {
    return total ? `生成中 ${done}/${total}，正在轮询结果` : "生成中，正在轮询结果";
  }
  return total ? `排队中 0/${total}` : "已提交，等待上游排队";
}
