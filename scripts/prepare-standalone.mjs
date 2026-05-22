import fs from "node:fs/promises";
import path from "node:path";

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyFresh(from, to) {
  if (!(await exists(from))) return;
  await fs.rm(to, { recursive: true, force: true });
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true });
}

await copyFresh(".next/static", ".next/standalone/.next/static");
await copyFresh("public", ".next/standalone/public");

console.log("Standalone static assets are ready.");
