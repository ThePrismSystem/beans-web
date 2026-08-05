import { readFile, readdir, realpath } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { BEAN_STATUSES, BEAN_TYPES, OPEN_STATUSES, zeroCounts } from "@beans-frontend/shared";

import { runBeansGraphql } from "../beans/executor.js";
import { BEANS_CONCURRENCY, mapWithConcurrency } from "../util/concurrency.js";

import type { BeanStatus, BeanType, Project, ProjectCounts } from "@beans-frontend/shared";

const IGNORED = new Set(["node_modules", ".git", ".beans", "dist", ".next", "coverage"]);

/**
 * A discovered project plus the host filesystem details the server needs
 * internally (to resolve each project's `.beans.yml` and enforce the path
 * jail). These fields are stripped before the project reaches any API client;
 * see the wire-facing `Project` type in `@beans-frontend/shared`.
 */
export interface ProjectRecord extends Project {
  path: string;
  root: string;
}

export function assertWithinRoot(root: string, candidate: string): string {
  const r = resolve(root);
  const c = resolve(candidate);
  const rel = relative(r, c);
  if (rel === "") return c;
  if (rel.split(sep)[0] === "..") {
    throw new Error(`path is outside its configured root (${r}): ${candidate}`);
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

/**
 * The CLI's own default when `beans.path` is absent (or blank) from
 * `.beans.yml` — confirmed against the real binary, which resolves it
 * relative to the project directory.
 */
const DEFAULT_DATA_PATH = ".beans";

// A `path` key on its own line, indented under `beans:`. Anchored to the
// start of the line (after only horizontal whitespace) so it can't match
// inside a value that happens to contain the substring "path:".
const PATH_LINE = /^[ \t]*path:[ \t]*(.*?)[ \t]*$/m;

// Same pattern with the `g` flag, used only to count how many `path:` lines
// are present (`matchAll` requires it). Kept separate from PATH_LINE so the
// single-value extraction below can stay a plain, non-stateful `.exec()`.
const PATH_LINE_ALL = /^[ \t]*path:[ \t]*(.*?)[ \t]*$/gm;

// A looser net for `path` appearing as a key in a form PATH_LINE can't see —
// most importantly flow-style mappings (`beans: {path: ../evil}`), which the
// real CLI honours exactly like block style (confirmed against the binary).
// If this matches but PATH_LINE found nothing, the config contains a path
// key this parser cannot confidently evaluate.
const PATH_KEY_ANYWHERE = /(?:^|[\s{,])path\s*:/m;

// Drops lines that are entirely a comment before either regex above runs, so
// a comment mentioning "path:" (`# path: disabled`) can't be mistaken for a
// live key by PATH_KEY_ANYWHERE, and can't be matched by PATH_LINE either.
function stripFullLineComments(yml: string): string {
  return yml
    .split("\n")
    .filter((line) => !/^[ \t]*#/.test(line))
    .join("\n");
}

/**
 * Resolves the raw `beans.path` value from `.beans.yml` content, or `null`
 * if it can't be parsed confidently enough to trust.
 *
 * This parser is the containment boundary for SEC-03: falling back to the
 * default when a `path:` key is actually present — because it's written in
 * a form this regex-based parser doesn't recognize — would let a hostile
 * config escape unnoticed, silently, which is worse than not checking at
 * all. Callers must reject the project on `null` rather than assume the
 * default.
 *
 * Handled: the key absent, or present but blank (both → the CLI default
 * `.beans`); double- and single-quoted values, with or without a trailing
 * `# comment`; surrounding whitespace; and absolute paths (returned as-is —
 * `resolve()` at the call site does the right thing with them).
 *
 * Deliberately rejected: flow-style mappings (`beans: {path: x}` — the real
 * CLI honours these, this parser cannot); a duplicate `path:` key (the CLI
 * itself refuses to load such a config, but this parser doesn't lean on
 * that); an unterminated quote; and an unquoted value that still contains a
 * stray `"` or `'`.
 */
export function parseDataPath(yml: string): string | null {
  const scrubbed = stripFullLineComments(yml);
  const occurrences = [...scrubbed.matchAll(PATH_LINE_ALL)].length;
  if (occurrences === 0) {
    return PATH_KEY_ANYWHERE.test(scrubbed) ? null : DEFAULT_DATA_PATH;
  }
  if (occurrences > 1) return null; // ambiguous - which one does the CLI use?

  const raw = PATH_LINE.exec(scrubbed)?.[1] ?? "";
  if (raw === "") return DEFAULT_DATA_PATH;

  const quote = raw[0] === '"' || raw[0] === "'" ? raw[0] : null;
  if (quote) {
    const close = raw.indexOf(quote, 1);
    if (close === -1) return null; // unterminated quote
    const trailing = raw.slice(close + 1).trim();
    if (trailing !== "" && !trailing.startsWith("#")) return null; // junk after the closing quote
    return raw.slice(1, close);
  }

  const hash = raw.search(/(?:^|\s)#/);
  const value = (hash === -1 ? raw : raw.slice(0, hash)).trim();
  if (value === "") return DEFAULT_DATA_PATH;
  if (value.includes('"') || value.includes("'")) return null; // stray quote in an unquoted scalar
  return value;
}

/**
 * Resolves symlinks in `candidate`, tolerating the fact that it — or any
 * ancestor of it — may not exist yet: a project can be configured before its
 * data directory is created. Walks up to the nearest ancestor that does
 * exist and resolves that instead. If some existing ancestor is itself a
 * symlink pointing outside the root (e.g. a hostile `sub` directory entry
 * that is a symlink, with a not-yet-created `sub/.beans` underneath), the
 * returned path reflects that escape even though the full candidate path
 * does not exist.
 */
async function realpathNearestExisting(candidate: string): Promise<string> {
  let current = candidate;
  for (;;) {
    try {
      return await realpath(current);
    } catch (err) {
      const e = err as { code?: unknown };
      if (e.code !== "ENOENT") throw err;
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

/**
 * Parses, resolves and contains a project's `beans.path` data directory.
 * Throws (with a message identifying why) if the path can't be parsed
 * confidently, escapes `root` lexically, or escapes it once symlinks are
 * resolved. `assertWithinRoot` alone is not enough here: it is purely
 * lexical (`resolve` + `relative`), so `path: .beans` where `.beans` is a
 * symlink pointing outside `root` would pass it and still escape once the
 * CLI follows the symlink.
 */
async function resolveContainedDataPath(root: string, dir: string, yml: string): Promise<string> {
  const parsed = parseDataPath(yml);
  if (parsed === null) {
    throw new Error("beans.path is present but not in a form this parser can confidently resolve");
  }

  const candidate = assertWithinRoot(root, resolve(dir, parsed));
  const real = await realpathNearestExisting(candidate);
  assertWithinRoot(root, real);
  return candidate;
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
function dedupeByPath(projects: ProjectRecord[]): ProjectRecord[] {
  const seen = new Set<string>();
  const result: ProjectRecord[] = [];
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
function disambiguateNames(projects: ProjectRecord[]): ProjectRecord[] {
  const byName = new Map<string, ProjectRecord[]>();
  for (const project of projects) {
    const group = byName.get(project.name);
    if (group) group.push(project);
    else byName.set(project.name, [project]);
  }

  const taken = new Set<string>();
  const colliding: ProjectRecord[] = [];
  for (const [name, group] of byName) {
    if (group.length === 1) taken.add(name);
    else colliding.push(...group);
  }
  colliding.sort((a, b) => a.path.localeCompare(b.path));

  const renamed = new Map<ProjectRecord, string>();
  for (const project of colliding) {
    const base = `${basename(project.root)}-${project.name}`;
    let candidate = base;
    let suffix = 2;
    while (taken.has(candidate)) {
      candidate = `${base}-${String(suffix)}`;
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

export async function discoverProjects(
  roots: string[],
  maxDepth: number,
): Promise<ProjectRecord[]> {
  const perRoot = await Promise.all(
    roots.map(async (root) => {
      const resolvedRoot = resolve(root);
      const dirs = await findProjectDirs(resolvedRoot, maxDepth);
      return mapWithConcurrency(
        dirs,
        BEANS_CONCURRENCY,
        async (dir): Promise<ProjectRecord | null> => {
          const yml = await readFile(join(dir, ".beans.yml"), "utf8");

          try {
            await resolveContainedDataPath(resolvedRoot, dir, yml);
          } catch (err) {
            // One hostile project must not break discovery for every other
            // project under this root - drop it and keep going. This is a
            // server-side operational log, not a client-facing message, so it
            // is not routed through redactPaths: every sibling console.error
            // in this file (below) already logs the full directory path
            // unredacted, and an operator needs it to find the offending
            // .beans.yml.
            console.error(
              `beans discovery rejected ${dir}: its beans.path data directory is not contained within ${resolvedRoot} (${err instanceof Error ? err.message : String(err)})`,
            );
            return null;
          }

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
        },
      );
    }),
  );

  const contained = perRoot.flat().filter((project): project is ProjectRecord => project !== null);
  const deduped = dedupeByPath(contained);
  const disambiguated = disambiguateNames(deduped);
  // disambiguateNames guarantees every project's name is unique, so a
  // name-only sort is sufficient and deterministic — no path tiebreak needed.
  return disambiguated.sort((a, b) => a.name.localeCompare(b.name));
}
