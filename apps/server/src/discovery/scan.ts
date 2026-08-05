import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { BEAN_STATUSES, BEAN_TYPES, OPEN_STATUSES, zeroCounts } from "@beans-frontend/shared";

import { runBeansGraphql } from "../beans/executor.js";
import { BEANS_CONCURRENCY, mapWithConcurrency, QueueFullError } from "../util/concurrency.js";
import { assertWithinRoot, realpathContained } from "../util/containment.js";

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
  /**
   * The project's data directory, resolved and contained by discovery once
   * (see `resolveContainedDataPath`) and reused for every later request
   * against this project — never recomputed from a possibly-since-edited
   * `.beans.yml`. Every `runBeansGraphql` call for this project must pass
   * this as `--beans-path`, so the CLI never consults `beans.path` in the
   * config file directly, no matter what that file says by the time the
   * call actually runs.
   */
  dataPath: string;
}

/**
 * Walks one depth level at a time, bounding each level with
 * `mapWithConcurrency`, instead of recursing with a `Promise.all` per
 * directory.
 *
 * The recursive shape put an entire level of the tree in flight at once - 6561
 * simultaneous `readdir` calls on a 3-way tree at the supported `SCAN_DEPTH=8`
 * - and simply wrapping that recursion in `mapWithConcurrency` would not have
 * fixed it: each recursive call would get its own bound, and N of them run
 * concurrently, so the total stays proportional to the tree. Here exactly one
 * `mapWithConcurrency` is live at any moment, so `BEANS_CONCURRENCY` is the
 * peak for the whole walk rather than for one directory's fan-out. Note that
 * `discoverProjects` runs one walk per configured root concurrently, so the
 * process-wide peak is (number of GIT_ROOT entries) x this bound.
 *
 * The bound is deliberately the same number that caps `beans` children: both
 * exist to stop one discovery pass from consuming the host's I/O capacity, and
 * a second knob for the cheaper of the two operations would be one more thing
 * to tune without a reason to tune it.
 *
 * `maxDepth` is assumed to be zero or greater, which `SCAN_DEPTH` (1 to 8)
 * guarantees for the only non-test caller. A negative value reads nothing at
 * all here, where the old recursion would still have read `root` itself.
 */
export async function findProjectDirs(root: string, maxDepth: number): Promise<string[]> {
  const found: string[] = [];
  let frontier = [resolve(root)];
  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth++) {
    const children = await mapWithConcurrency(frontier, BEANS_CONCURRENCY, async (dir) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return [];
      }
      if (entries.some((e) => e.isFile() && e.name === ".beans.yml")) found.push(dir);
      if (depth >= maxDepth) return [];
      return entries
        .filter((e) => e.isDirectory() && !IGNORED.has(e.name) && !e.name.startsWith("."))
        .map((e) => join(dir, e.name));
    });
    frontier = children.flat();
  }
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

// Drops lines that are entirely a comment, so one mentioning "path:"
// (`# path: disabled`) can't be mistaken for a live key.
function stripFullLineComments(yml: string): string {
  return yml
    .split("\n")
    .filter((line) => !/^[ \t]*#/.test(line))
    .join("\n");
}

/**
 * Returns the lines making up the top-level `beans:` mapping's *values*
 * (the key's own line is not included), or `null` if `beans:` isn't a plain
 * block mapping this scanner can bound — most importantly flow style
 * (`beans: {...}`) or a bare scalar, where "the block" isn't a set of lines
 * at all. Blank lines are dropped, so consecutive entries in the returned
 * array are always adjacent in the *logical* structure even when the source
 * has blank lines between them.
 */
function extractBeansBlock(yml: string): string[] | null {
  const lines = yml.split("\n");
  const beansIndex = lines.findIndex((line) => /^beans:[ \t]*(#.*)?$/.test(line));
  if (beansIndex === -1) return null;

  const block: string[] = [];
  for (let i = beansIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue; // blank lines don't end the block
    if (line.length - line.trimStart().length === 0) break; // back at column 0 - a new top-level key
    block.push(line);
  }
  return block;
}

// A `path` key on its own line within the beans: block.
const PATH_LINE = /^([ \t]*)path:[ \t]*(.*)$/;

function countPathKeyLines(block: string[]): number {
  return block.filter((line) => PATH_LINE.test(line)).length;
}

interface PathKeyLine {
  index: number;
  indent: number;
  raw: string;
}

function firstPathKeyLine(block: string[]): PathKeyLine | undefined {
  for (const [index, line] of block.entries()) {
    const match = PATH_LINE.exec(line);
    if (match) return { index, indent: match[1]?.length ?? 0, raw: (match[2] ?? "").trim() };
  }
  return undefined;
}

// A looser net for `path` appearing as a key in a form PATH_LINE can't see —
// e.g. a nested flow-style mapping. Scoped to the already-extracted beans:
// block, so a path: key that genuinely belongs to some other top-level
// section never reaches this check at all (and is correctly ignored, not
// flagged).
const PATH_KEY_ANYWHERE = /(?:^|[\s{,])path\s*:/m;

function blockMentionsPathKey(block: string[]): boolean {
  return PATH_KEY_ANYWHERE.test(block.join("\n"));
}

// A block scalar indicator (`|`, `>`, optionally with a chomping `+`/`-` and
// an explicit indentation digit) starting a value that actually lives on the
// following, more-indented line(s) - not a literal path segment.
const BLOCK_SCALAR_HEADER = /^[|>][+-]?\d*(?:[ \t]|$)/;

export interface ParsedDataPath {
  /** The path to use: either the confidently-parsed declared value, or DEFAULT_DATA_PATH. */
  value: string;
  /**
   * True when `value` is provably what the CLI's own `beans.path` resolution
   * would produce (the key absent/blank, or a value this parser can read
   * outright). False means a `path:` key exists but this regex-based parser
   * could not resolve it with confidence, so `value` is a substituted
   * default rather than an attempt to guess.
   */
  confident: boolean;
  /** Set when `confident` is false, for logging. */
  reason?: string;
}

const CONFIDENT_DEFAULT: ParsedDataPath = { value: DEFAULT_DATA_PATH, confident: true };

function notConfidentDefault(reason: string): ParsedDataPath {
  return { value: DEFAULT_DATA_PATH, confident: false, reason };
}

/**
 * Best-effort parse of `beans.path` from `.beans.yml` content. This is no
 * longer a security boundary: every caller passes the *result* of
 * containing whatever this returns to the CLI via `--beans-path`, which the
 * CLI honours over the config file's own `beans.path` regardless of what
 * that file says. So a wrong guess here can, at worst, use the wrong (but
 * still contained) directory - never an escape.
 *
 * Because of that, this function never rejects a project - it only decides
 * whether it's confident in the value it returns. `confident: false` means
 * "a path: key is present but this parser can't read it safely", covering:
 * flow-style mappings (`beans: {path: x}`); a value that continues on a
 * following, more-indented line (a folded plain scalar); a block scalar
 * (`>-`/`|-`); a YAML anchor or alias (`&name`/`*name`); a duplicate `path:`
 * key; an unterminated quote; trailing content after a closing quote that
 * isn't a comment; a double-quoted value containing a backslash (this parser
 * doesn't attempt YAML escape decoding, so `"../OUTSIDE"` is not
 * reinterpreted as containing a literal `/`); and an unquoted value with a
 * stray `"` or `'`. In every one of these cases the CLI would resolve a real
 * value from the raw text; this parser deliberately doesn't try, and the
 * caller substitutes `DEFAULT_DATA_PATH` instead.
 *
 * Handled confidently: the key absent, or blank with nothing on a
 * more-indented following line (both → `DEFAULT_DATA_PATH`); double- and
 * single-quoted values (without embedded escapes) with or without a
 * trailing `# comment`; surrounding whitespace; and absolute paths.
 */
export function parseDataPath(yml: string): ParsedDataPath {
  const scrubbed = stripFullLineComments(yml);
  const block = extractBeansBlock(scrubbed);
  if (block === null) {
    return notConfidentDefault("beans: is not a plain block mapping this parser can scan");
  }

  const occurrences = countPathKeyLines(block);
  if (occurrences > 1) return notConfidentDefault("duplicate path: key");
  if (occurrences === 0) {
    return blockMentionsPathKey(block)
      ? notConfidentDefault(
          "a path key is present in a form this parser cannot locate on its own line",
        )
      : CONFIDENT_DEFAULT;
  }

  const pathKey = firstPathKeyLine(block);
  if (!pathKey) return CONFIDENT_DEFAULT; // unreachable: occurrences === 1 guarantees a match

  if (pathKey.raw === "") {
    const next = block[pathKey.index + 1];
    const nextIndent = next === undefined ? -1 : next.length - next.trimStart().length;
    if (nextIndent > pathKey.indent) {
      return notConfidentDefault("path: value continues on a following line");
    }
    return CONFIDENT_DEFAULT;
  }

  if (BLOCK_SCALAR_HEADER.test(pathKey.raw)) {
    return notConfidentDefault("path: uses a block scalar (| or >)");
  }
  if (pathKey.raw.startsWith("*") || pathKey.raw.startsWith("&")) {
    return notConfidentDefault("path: uses a YAML anchor or alias");
  }

  const quote = pathKey.raw[0] === '"' || pathKey.raw[0] === "'" ? pathKey.raw[0] : null;
  if (quote) {
    const close = pathKey.raw.indexOf(quote, 1);
    if (close === -1) return notConfidentDefault("unterminated quote");
    const trailing = pathKey.raw.slice(close + 1).trim();
    if (trailing !== "" && !trailing.startsWith("#")) {
      return notConfidentDefault("unexpected content after the closing quote");
    }
    const inner = pathKey.raw.slice(1, close);
    if (quote === '"' && inner.includes("\\")) {
      return notConfidentDefault("double-quoted value uses an escape sequence");
    }
    return { value: inner, confident: true };
  }

  const hash = pathKey.raw.search(/(?:^|\s)#/);
  const value = (hash === -1 ? pathKey.raw : pathKey.raw.slice(0, hash)).trim();
  if (value === "") {
    const next = block[pathKey.index + 1];
    const nextIndent = next === undefined ? -1 : next.length - next.trimStart().length;
    if (nextIndent > pathKey.indent) {
      return notConfidentDefault("path: value continues on a following line");
    }
    return CONFIDENT_DEFAULT;
  }
  if (value.includes('"') || value.includes("'")) {
    return notConfidentDefault("stray quote in an unquoted value");
  }
  return { value, confident: true };
}

interface ContainedDataPath {
  /** Absolute, symlink-resolved, guaranteed within `root` as of the moment this was computed. */
  path: string;
  confident: boolean;
  reason?: string;
}

/**
 * Resolves and contains a project's `beans.path` data directory. Throws
 * (with a message identifying why) if the resolved candidate escapes `root`
 * lexically, or escapes it once symlinks are resolved. `assertWithinRoot`
 * alone is not enough here: it is purely lexical (`resolve` + `relative`),
 * so `path: .beans` where `.beans` is a symlink pointing outside `root`
 * would pass it and still escape once the CLI follows the symlink.
 *
 * Unlike parsing, containment IS still a hard boundary: a project whose
 * resolved data path - confidently parsed or defaulted - escapes `root` is
 * genuinely hostile (or has a broken/malicious data directory) and must be
 * dropped, not merely flagged, because there is no safe value left to hand
 * the CLI via `--beans-path` for it.
 *
 * The returned `path` is the *resolved* value (see `realpathContained` in
 * `util/containment.ts`), not the lexical candidate: this result gets cached
 * on a `ProjectRecord` and reused for the project's whole cache lifetime, so
 * it must be the value that was actually validated, not a path string that
 * still names whatever happens to be there when something later acts on it.
 * This function alone still can't close the gap between validating that and
 * something later acting on it - see `assertDataPathStillContained` in
 * `util/containment.ts`, which `runBeansGraphql` calls immediately before
 * every use.
 */
async function resolveContainedDataPath(
  root: string,
  dir: string,
  yml: string,
): Promise<ContainedDataPath> {
  const parsed = parseDataPath(yml);
  const candidate = assertWithinRoot(root, resolve(dir, parsed.value));
  const real = await realpathContained(candidate);
  assertWithinRoot(root, real);
  return { path: real, confident: parsed.confident, reason: parsed.reason };
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
  // Projects this pass could not count because the shared `beans` pool was
  // saturated, reported once for the pass below rather than per project.
  let queueFull = 0;
  const perRoot = await Promise.all(
    roots.map(async (root) => {
      const resolvedRoot = resolve(root);
      const dirs = await findProjectDirs(resolvedRoot, maxDepth);
      return mapWithConcurrency(
        dirs,
        BEANS_CONCURRENCY,
        async (dir): Promise<ProjectRecord | null> => {
          const yml = await readFile(join(dir, ".beans.yml"), "utf8");

          let resolved: ContainedDataPath;
          try {
            resolved = await resolveContainedDataPath(resolvedRoot, dir, yml);
          } catch (err) {
            // A project whose data directory genuinely escapes root - even
            // after falling back to the default - is hostile (or has a
            // broken symlink) and there is no safe value left to hand the
            // CLI, so it is dropped rather than shown with an error: one
            // hostile project must not break discovery for every other
            // project under this root. This is a server-side operational
            // log, not a client-facing message, so it is not routed through
            // redactPaths: every sibling console.error in this file already
            // logs the full directory path unredacted, and an operator needs
            // it to find the offending .beans.yml.
            console.error(
              `beans discovery rejected ${dir}: its beans.path data directory is not contained within ${resolvedRoot} (${err instanceof Error ? err.message : String(err)})`,
            );
            return null;
          }
          if (!resolved.confident) {
            // Not hostile by itself - only means this parser couldn't read
            // beans.path with confidence, so it substituted the default.
            // --beans-path (below) still enforces that substitution, so this
            // is a display concern (the project may show as empty) rather
            // than a security one; logged so an operator can tell a genuine
            // empty project from a config this parser gave up on.
            console.error(
              `beans discovery could not confidently resolve beans.path for ${dir}, using the default (${resolved.path}): ${resolved.reason ?? "unknown reason"}`,
            );
          }

          const counts = emptyCounts();
          try {
            const data = (await runBeansGraphql({
              configPath: join(dir, ".beans.yml"),
              beansPath: resolved.path,
              root: resolvedRoot,
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
            if (err instanceof QueueFullError) {
              // A saturated queue is a property of the server's momentary load,
              // not of this project. Flagging it here would render every
              // project in the UI as broken because the server was briefly
              // busy, and log a stack trace for each one. Unlike search and
              // analytics - which rethrow so their request answers 503 once -
              // discovery is shared background work with no single client to
              // answer, and it re-runs on the refresh timer, so this pass
              // leaves the counts at zero and lets the next pass fill them in.
              queueFull += 1;
            } else {
              // Zeroed counts stay, but flag the failure so callers/UI can tell an
              // errored project apart from a genuinely empty one.
              counts.error = true;
              console.error(`beans discovery failed for ${dir}:`, err);
            }
          }
          return {
            name: basename(dir),
            path: dir,
            root: resolvedRoot,
            dataPath: resolved.path,
            prefix: parsePrefix(yml),
            counts,
          };
        },
      );
    }),
  );

  if (queueFull > 0) {
    console.error(
      `beans discovery could not count ${String(queueFull)} project(s): the beans queue was full. Their counts stay at zero until a later pass.`,
    );
  }

  const contained = perRoot.flat().filter((project): project is ProjectRecord => project !== null);
  const deduped = dedupeByPath(contained);
  const disambiguated = disambiguateNames(deduped);
  // disambiguateNames guarantees every project's name is unique, so a
  // name-only sort is sufficient and deterministic — no path tiebreak needed.
  return disambiguated.sort((a, b) => a.name.localeCompare(b.name));
}
