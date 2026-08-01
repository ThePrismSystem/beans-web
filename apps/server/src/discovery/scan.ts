import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import type { BeanStatus, BeanType, Project, ProjectCounts } from "@beans-frontend/shared";
import { BEAN_STATUSES, BEAN_TYPES, OPEN_STATUSES, zeroCounts } from "@beans-frontend/shared";
import { runBeansGraphql } from "../beans/executor.js";
import { BEANS_CONCURRENCY, mapWithConcurrency } from "../util/concurrency.js";

const IGNORED = new Set(["node_modules", ".git", ".beans", "dist", ".next", "coverage"]);

export function assertWithinRoot(root: string, candidate: string): string {
  const r = resolve(root);
  const c = resolve(candidate);
  const rel = relative(r, c);
  if (rel === "") return c;
  if (rel.split(sep)[0] === "..") {
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
  return {
    total: 0,
    open: 0,
    byType: zeroCounts(BEAN_TYPES),
    byStatus: zeroCounts(BEAN_STATUSES),
    openByType: zeroCounts(BEAN_TYPES),
    error: false,
  };
}

// Drops duplicate project directories that overlapping or nested configured
// roots would otherwise discover twice. First occurrence (in root order) wins.
function dedupeByPath(projects: Project[]): Project[] {
  const seen = new Set<string>();
  const result: Project[] = [];
  for (const project of projects) {
    const resolved = resolve(project.path);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(project);
  }
  return result;
}

// Resolves same-name collisions by qualifying each colliding project's name
// with its owning root's basename, then appending a numeric suffix if that
// candidate is already taken — whether by another colliding project or by an
// unrelated project whose original name happens to equal the candidate.
// Every project ends up with a name unique across the whole result, so the
// final sort below no longer needs a path-based tiebreak.
function disambiguateNames(projects: Project[]): Project[] {
  const byName = new Map<string, Project[]>();
  for (const project of projects) {
    const group = byName.get(project.name);
    if (group) group.push(project);
    else byName.set(project.name, [project]);
  }

  const taken = new Set<string>();
  const colliding: Project[] = [];
  for (const [name, group] of byName) {
    if (group.length === 1) taken.add(name);
    else colliding.push(...group);
  }
  colliding.sort((a, b) => a.path.localeCompare(b.path));

  const renamed = new Map<Project, string>();
  for (const project of colliding) {
    const base = `${basename(project.root)}-${project.name}`;
    let candidate = base;
    let suffix = 2;
    while (taken.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    taken.add(candidate);
    renamed.set(project, candidate);
  }

  return projects.map((project) => {
    const name = renamed.get(project);
    return name === undefined ? project : { ...project, name };
  });
}

export async function discoverProjects(roots: string[], maxDepth: number): Promise<Project[]> {
  const perRoot = await Promise.all(
    roots.map(async (root) => {
      const resolvedRoot = resolve(root);
      const dirs = await findProjectDirs(resolvedRoot, maxDepth);
      return mapWithConcurrency(dirs, BEANS_CONCURRENCY, async (dir) => {
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
            if (OPEN_STATUSES.includes(b.status)) {
              counts.open += 1;
              counts.openByType[b.type] += 1;
            }
          }
        } catch (err) {
          // Zeroed counts stay, but flag the failure so callers/UI can tell an
          // errored project apart from a genuinely empty one.
          counts.error = true;
          console.error(`beans discovery failed for ${dir}:`, err);
        }
        return {
          name: basename(dir),
          path: dir,
          root: resolvedRoot,
          prefix: parsePrefix(yml),
          counts,
        };
      });
    }),
  );

  const deduped = dedupeByPath(perRoot.flat());
  const disambiguated = disambiguateNames(deduped);
  // disambiguateNames guarantees every project's name is unique, so a
  // name-only sort is sufficient and deterministic — no path tiebreak needed.
  return disambiguated.sort((a, b) => a.name.localeCompare(b.name));
}
