import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import type { BeanStatus, BeanType, Project, ProjectCounts } from "@beans-frontend/shared";
import { BEAN_STATUSES, BEAN_TYPES, OPEN_STATUSES } from "@beans-frontend/shared";
import { runBeansGraphql } from "../beans/executor.js";

const IGNORED = new Set(["node_modules", ".git", ".beans", "dist", ".next", "coverage"]);

export function assertWithinRoot(root: string, candidate: string): string {
  const r = resolve(root);
  const c = resolve(candidate);
  const rel = relative(r, c);
  if (rel === "") return c;
  if (rel.startsWith("..") || rel.split(sep)[0] === "..") {
    throw new Error(`path is outside GIT_ROOT: ${candidate}`);
  }
  return c;
}

export async function findProjectDirs(root: string, maxDepth: number): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && e.name === ".beans.yml")) found.push(dir);
    if (depth >= maxDepth) return;
    await Promise.all(
      entries
        .filter((e) => e.isDirectory() && !IGNORED.has(e.name) && !e.name.startsWith("."))
        .map((e) => walk(join(dir, e.name), depth + 1)),
    );
  }
  await walk(resolve(root), 0);
  return found;
}

function parsePrefix(yml: string): string {
  const m = /prefix:\s*(\S+)/.exec(yml);
  return m?.[1] ?? "";
}

function emptyCounts(): ProjectCounts {
  const byType = Object.fromEntries(BEAN_TYPES.map((t) => [t, 0])) as Record<BeanType, number>;
  const byStatus = Object.fromEntries(BEAN_STATUSES.map((s) => [s, 0])) as Record<
    BeanStatus,
    number
  >;
  return { total: 0, open: 0, byType, byStatus };
}

export async function discoverProjects(root: string, maxDepth: number): Promise<Project[]> {
  const dirs = await findProjectDirs(root, maxDepth);
  return Promise.all(
    dirs.map(async (dir) => {
      const yml = await readFile(join(dir, ".beans.yml"), "utf8");
      const counts = emptyCounts();
      try {
        const data = (await runBeansGraphql({
          configPath: join(dir, ".beans.yml"),
          query: "{ beans { type status } }",
        })) as { beans: { type: BeanType; status: BeanStatus }[] };
        for (const b of data.beans) {
          counts.total += 1;
          counts.byType[b.type] += 1;
          counts.byStatus[b.status] += 1;
          if (OPEN_STATUSES.includes(b.status)) counts.open += 1;
        }
      } catch {
        // leave zeroed counts if beans query fails for this project
      }
      return { name: basename(dir), path: dir, prefix: parsePrefix(yml), counts };
    }),
  );
}
