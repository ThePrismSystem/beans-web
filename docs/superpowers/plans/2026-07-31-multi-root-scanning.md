# Multi-Root Directory Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `beans-frontend` scan multiple independent root directories (e.g. `~/work` and `~/personal`) instead of just one, and resolve project-name collisions deterministically wherever they occur.

**Architecture:** Widen `GIT_ROOT` to a comma-separated list, parsed into `string[]`. `discoverProjects` runs the existing per-root walk against every root, merges results, dedupes by resolved path (protects against overlapping/nested roots), then resolves name collisions by qualifying with the owning root's basename (falling back to a numeric suffix for same-root collisions). Every discovered `Project` carries the specific `root` it came from, and every `assertWithinRoot` call site validates against that project's own root instead of a single global one.

**Tech Stack:** TypeScript, Hono, Vitest, `@t3-oss/env-core` + `zod`, Node `node:fs/promises`/`node:path`.

## Global Constraints

- `GIT_ROOT` env var name is unchanged — only its accepted value format widens (comma-separated list). No new env var.
- Default behavior for existing single-root deployments must not change: unset `GIT_ROOT` still defaults to a 1-element array of `resolve(homedir(), "git")`.
- `SCAN_DEPTH` stays a single value shared across every root — no per-root depth.
- `assertWithinRoot(root, candidate)`'s signature and internal logic are unchanged; only what callers pass as `root` changes (each project's own `root`, not a single global one).
- Name-collision resolution: group by name; for any group with >1 entries, rename each to `` `${basename(owningRoot)}-${name}` ``; if that still collides (colliding projects share the same owning root), append a numeric suffix (`-2`, `-3`, …) in stable `(path)` order.
- Final `discoverProjects` output stays sorted by `name`, then `path` (unchanged).
- 90% coverage threshold (all `vitest.config.ts` files) holds — no change to the bar.
- No `apps/web` changes — it has no root-path assumptions.
- No `watcher.ts` changes — it already matches by project-path prefix, independent of root count.
- Gates before any task is done: `pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell`.

---

### Task 1: Add `root` field to the shared `Project` type

**Files:**
- Modify: `packages/shared/src/types.ts:41-46`
- Modify: `apps/server/src/testing/fixtures.ts:15-22`

**Interfaces:**
- Produces: `Project.root: string` — the specific configured root this project was discovered under. Every later task relies on this field existing.

- [ ] **Step 1: Add the field to the `Project` interface**

In `packages/shared/src/types.ts`, change:

```typescript
export interface Project {
  name: string;
  path: string;
  prefix: string;
  counts: ProjectCounts;
}
```

to:

```typescript
export interface Project {
  name: string;
  path: string;
  root: string;
  prefix: string;
  counts: ProjectCounts;
}
```

- [ ] **Step 2: Update the `fakeProject` test fixture**

In `apps/server/src/testing/fixtures.ts`, change:

```typescript
export function fakeProject(name: string): Project {
  return {
    name,
    path: `/root/${name}`,
    prefix: "x-",
    counts: fakeCounts(),
  };
}
```

to:

```typescript
export function fakeProject(name: string): Project {
  return {
    name,
    path: `/root/${name}`,
    root: "/root",
    prefix: "x-",
    counts: fakeCounts(),
  };
}
```

This matches the existing `path: /root/${name}` convention and the `root: "/root"` value already hardcoded in every route test's local `deps()` helper (Task 4 updates those).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL — `apps/server/src/discovery/scan.ts`'s `discoverProjects` return object is missing `root` (it doesn't produce one yet; that's Task 3). This is expected at this point — the field is additive and required, so nothing else breaks except the one construction site that hasn't been updated yet.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types.ts apps/server/src/testing/fixtures.ts
git commit -m "feat(shared): add root field to Project type"
```

---

### Task 2: Widen `GIT_ROOT` to a comma-separated list

**Files:**
- Modify: `apps/server/src/env.ts`
- Modify: `apps/server/src/env.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `env.GIT_ROOT: string[]` (was `string`) — Tasks 3 and 4 read this.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `apps/server/src/env.test.ts` with:

```typescript
import { homedir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("env SCAN_DEPTH", () => {
  it("defaults SCAN_DEPTH to 1 when unset", async () => {
    const before = process.env.SCAN_DEPTH;
    delete process.env.SCAN_DEPTH;
    vi.resetModules();
    const { env } = await import("./env.js");
    expect(env.SCAN_DEPTH).toBe(1);
    if (before !== undefined) process.env.SCAN_DEPTH = before;
  });
});

describe("env GIT_ROOT", () => {
  it("defaults to a single-element array of ~/git when unset", async () => {
    const before = process.env.GIT_ROOT;
    delete process.env.GIT_ROOT;
    vi.resetModules();
    const { env } = await import("./env.js");
    expect(env.GIT_ROOT).toEqual([resolve(homedir(), "git")]);
    if (before !== undefined) process.env.GIT_ROOT = before;
  });

  it("parses a comma-separated value into a list of resolved absolute paths", async () => {
    const before = process.env.GIT_ROOT;
    process.env.GIT_ROOT = "/tmp/a, /tmp/b";
    vi.resetModules();
    const { env } = await import("./env.js");
    expect(env.GIT_ROOT).toEqual([resolve("/tmp/a"), resolve("/tmp/b")]);
    if (before === undefined) delete process.env.GIT_ROOT;
    else process.env.GIT_ROOT = before;
  });

  it("drops empty entries from trailing or doubled commas", async () => {
    const before = process.env.GIT_ROOT;
    process.env.GIT_ROOT = "/tmp/a,,/tmp/b,";
    vi.resetModules();
    const { env } = await import("./env.js");
    expect(env.GIT_ROOT).toEqual([resolve("/tmp/a"), resolve("/tmp/b")]);
    if (before === undefined) delete process.env.GIT_ROOT;
    else process.env.GIT_ROOT = before;
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter @beans-frontend/server test env.test.ts`
Expected: the two new `GIT_ROOT` parsing tests FAIL (current `env.GIT_ROOT` is a single string, not an array); the SCAN_DEPTH and "defaults to a single-element array" tests may pass or fail depending on current typing — proceed regardless.

- [ ] **Step 3: Implement the parsing change**

In `apps/server/src/env.ts`, change:

```typescript
GIT_ROOT: z
  .string()
  .default(resolve(homedir(), "git"))
  .transform((p) => resolve(p)),
```

to:

```typescript
GIT_ROOT: z
  .string()
  .default(resolve(homedir(), "git"))
  .transform((value) =>
    value
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => resolve(p)),
  ),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @beans-frontend/server test env.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL — same pre-existing failure as Task 1 Step 3 (`scan.ts`'s `discoverProjects` still takes a single `root: string`, so `index.ts`'s `discoverProjects(env.GIT_ROOT, ...)` now mismatches). Expected until Task 3/4 land.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/env.ts apps/server/src/env.test.ts
git commit -m "feat(server): parse GIT_ROOT as a comma-separated list"
```

---

### Task 3: Multi-root discovery, path dedup, and name disambiguation in `scan.ts`

**Files:**
- Modify: `apps/server/src/discovery/scan.ts`
- Modify: `apps/server/src/discovery/scan.test.ts`

**Interfaces:**
- Consumes: `Project.root: string` (Task 1).
- Produces: `discoverProjects(roots: string[], maxDepth: number): Promise<Project[]>` (was `discoverProjects(root: string, maxDepth: number)`) — Task 4's `index.ts` call site depends on this new signature. `assertWithinRoot`, `findProjectDirs` signatures are unchanged.

- [ ] **Step 1: Write the failing tests**

In `apps/server/src/discovery/scan.test.ts`, three existing calls to `discoverProjects` need to pass an array instead of a single root. Update:

```typescript
      const projects = await discoverProjects(testRoot, 2);
```

(in the `"returns projects sorted by name..."` test) to:

```typescript
      const projects = await discoverProjects([testRoot], 2);
```

Update the `"tiebreaks by path when two projects share the same basename"` test — its full body — from:

```typescript
  it("tiebreaks by path when two projects share the same basename", async () => {
    // Mock runBeansGraphql to avoid needing beans CLI
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-tiebreak-"));
    try {
      const mk = (rel: string) => {
        mkdirSync(join(testRoot, rel), { recursive: true });
        writeFileSync(join(testRoot, rel, ".beans.yml"), "beans:\n  prefix: x-\n");
      };
      // Both projects are named "shared"; the mocked readdir above resolves
      // "parent-two/shared" before "parent-one/shared", so discovery order
      // alone is non-alphabetical. Only the `path` tiebreak can make the
      // output deterministic.
      mk("parent-one/shared");
      mk("parent-two/shared");

      const projects = await discoverProjects(testRoot, 2);
      const paths = projects.map((p) => p.path.replace(testRoot + "/", ""));

      expect(paths).toEqual(["parent-one/shared", "parent-two/shared"]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });
```

to:

```typescript
  it("disambiguates same-name, same-root projects with a numeric suffix, deterministically", async () => {
    // Mock runBeansGraphql to avoid needing beans CLI
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-tiebreak-"));
    try {
      const mk = (rel: string) => {
        mkdirSync(join(testRoot, rel), { recursive: true });
        writeFileSync(join(testRoot, rel, ".beans.yml"), "beans:\n  prefix: x-\n");
      };
      // Both projects are named "shared" under the same root, so the
      // root-basename prefix is identical for both and cannot disambiguate
      // them on its own — this exercises the numeric-suffix fallback. The
      // mocked readdir above resolves "parent-two/shared" before
      // "parent-one/shared", so discovery order alone is non-alphabetical;
      // only a path-based tiebreak inside the fallback keeps the numbering
      // deterministic.
      mk("parent-one/shared");
      mk("parent-two/shared");

      const projects = await discoverProjects([testRoot], 2);
      const rootName = basename(testRoot);
      const byName = new Map(
        projects.map((p) => [p.name, p.path.replace(testRoot + "/", "")]),
      );

      expect(projects.map((p) => p.name).sort()).toEqual([
        `${rootName}-shared`,
        `${rootName}-shared-2`,
      ]);
      expect(byName.get(`${rootName}-shared`)).toBe("parent-one/shared");
      expect(byName.get(`${rootName}-shared-2`)).toBe("parent-two/shared");
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });
```

Update the import at the top of the file from:

```typescript
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
```

to:

```typescript
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
```

(`basename` is used by the rewritten tiebreak test above; `resolve` is used by the new multi-root tests appended below.)

Update the `"discoverProjects counts"` test's call from:

```typescript
      const projects = await discoverProjects(root, 4);
```

to:

```typescript
      const projects = await discoverProjects([root], 4);
```

Then append four new tests, right after the closing of the `describe("discoverProjects ordering", ...)` block and before `describe("discoverProjects counts", ...)`:

```typescript
describe("discoverProjects multi-root", () => {
  it("discovers projects across two independent roots, tagging each with its owning root", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const rootA = mkdtempSync(join(tmpdir(), "scan-multi-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "scan-multi-b-"));
    try {
      mkdirSync(join(rootA, "proj-a"), { recursive: true });
      writeFileSync(join(rootA, "proj-a", ".beans.yml"), "beans:\n  prefix: x-\n");
      mkdirSync(join(rootB, "proj-b"), { recursive: true });
      writeFileSync(join(rootB, "proj-b", ".beans.yml"), "beans:\n  prefix: y-\n");

      const projects = await discoverProjects([rootA, rootB], 2);
      const byName = new Map(projects.map((p) => [p.name, p]));

      expect(byName.get("proj-a")?.root).toBe(resolve(rootA));
      expect(byName.get("proj-b")?.root).toBe(resolve(rootB));
    } finally {
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

  it("disambiguates same-name projects discovered under different roots", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const rootA = mkdtempSync(join(tmpdir(), "scan-collide-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "scan-collide-b-"));
    try {
      mkdirSync(join(rootA, "frontend"), { recursive: true });
      writeFileSync(join(rootA, "frontend", ".beans.yml"), "beans:\n  prefix: x-\n");
      mkdirSync(join(rootB, "frontend"), { recursive: true });
      writeFileSync(join(rootB, "frontend", ".beans.yml"), "beans:\n  prefix: y-\n");

      const projects = await discoverProjects([rootA, rootB], 2);
      const names = projects.map((p) => p.name).sort();

      expect(names).toEqual([`${basename(rootA)}-frontend`, `${basename(rootB)}-frontend`]);
    } finally {
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

  it("dedupes a project found via two overlapping root entries", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const projects = await discoverProjects([root, root], 4);

    expect(projects.map((p) => p.name).sort()).toEqual(["proj-a", "sub-b"]);
    graphqlMock.mockRestore();
  });

  it("dedupes a project found via a root nested inside another configured root", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const projects = await discoverProjects([root, join(root, "mono")], 4);

    expect(projects.map((p) => p.name).sort()).toEqual(["proj-a", "sub-b"]);
    graphqlMock.mockRestore();
  });
});
```

These four tests use the top-level `root` fixture (built in the file's `beforeEach`, containing `proj-a` and the nested `mono/sub-b`) for the dedup cases, and fresh `mkdtempSync` roots for the cross-root cases — both styles match the file's existing conventions. The `node:path` import updated earlier in this step already includes both `basename` and `resolve`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @beans-frontend/server test scan.test.ts`
Expected: FAIL — `discoverProjects` still takes a single `root: string`, so passing arrays is a type error at minimum, and the disambiguation/dedup tests fail outright since that logic doesn't exist yet.

- [ ] **Step 3: Implement `dedupeByPath`, `disambiguateNames`, and the multi-root `discoverProjects`**

In `apps/server/src/discovery/scan.ts`, insert two new module-private functions after `emptyCounts` and before `discoverProjects`:

```typescript
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
// with its owning root's basename, then — only when that still collides,
// which happens when the colliding projects share the same owning root —
// appending a numeric suffix in stable path order.
function disambiguateNames(projects: Project[]): Project[] {
  const byName = new Map<string, Project[]>();
  for (const project of projects) {
    const group = byName.get(project.name);
    if (group) group.push(project);
    else byName.set(project.name, [project]);
  }

  const renamed = new Map<Project, string>();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const byPrefixed = new Map<string, Project[]>();
    for (const project of group) {
      const prefixed = `${basename(project.root)}-${project.name}`;
      const subgroup = byPrefixed.get(prefixed);
      if (subgroup) subgroup.push(project);
      else byPrefixed.set(prefixed, [project]);
    }
    for (const [prefixed, subgroup] of byPrefixed) {
      if (subgroup.length === 1) {
        renamed.set(subgroup[0]!, prefixed);
        continue;
      }
      const ordered = [...subgroup].sort((a, b) => a.path.localeCompare(b.path));
      ordered.forEach((project, i) => {
        renamed.set(project, i === 0 ? prefixed : `${prefixed}-${i + 1}`);
      });
    }
  }

  return projects.map((project) => {
    const name = renamed.get(project);
    return name === undefined ? project : { ...project, name };
  });
}
```

Replace the existing `discoverProjects` function:

```typescript
export async function discoverProjects(root: string, maxDepth: number): Promise<Project[]> {
  const dirs = await findProjectDirs(root, maxDepth);
  const projects = await mapWithConcurrency(dirs, BEANS_CONCURRENCY, async (dir) => {
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
    return { name: basename(dir), path: dir, prefix: parsePrefix(yml), counts };
  });
  // Stable, name-ordered output: the Overview ledger renders this list directly
  // and is invalidated on every file change, so walk order would reshuffle it.
  // The path tiebreak keeps same-named projects in different directories
  // deterministic too, instead of falling back to walk/resolution order.
  return projects.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}
```

with:

```typescript
export async function discoverProjects(roots: string[], maxDepth: number): Promise<Project[]> {
  const perRoot = await Promise.all(
    roots.map(async (root) => {
      const dirs = await findProjectDirs(root, maxDepth);
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
        return { name: basename(dir), path: dir, root, prefix: parsePrefix(yml), counts };
      });
    }),
  );

  const deduped = dedupeByPath(perRoot.flat());
  const disambiguated = disambiguateNames(deduped);
  // Stable, name-ordered output: the Overview ledger renders this list directly
  // and is invalidated on every file change, so walk order would reshuffle it.
  // The path tiebreak keeps same-named projects in different directories
  // deterministic too, instead of falling back to walk/resolution order.
  return disambiguated.sort(
    (a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path),
  );
}
```

Note each root is passed to `findProjectDirs` (and therefore into `dedupeByPath`/`disambiguateNames` via each project's `path`/`root`) without pre-resolving — `findProjectDirs` already calls `resolve(root)` internally via `walk(resolve(root), 0)`, but the `root` value captured in each project's `root` field is the *unresolved* value from the input array. Resolve it before use so `basename(project.root)` and downstream `assertWithinRoot(project.root, ...)` calls (Task 4) see a consistent absolute path: change `roots.map(async (root) => {` to `roots.map(async (root) => { const resolvedRoot = resolve(root);` and use `resolvedRoot` for both the `findProjectDirs` call and the returned project's `root` field:

```typescript
    roots.map(async (root) => {
      const resolvedRoot = resolve(root);
      const dirs = await findProjectDirs(resolvedRoot, maxDepth);
      return mapWithConcurrency(dirs, BEANS_CONCURRENCY, async (dir) => {
        // ...unchanged body...
        return { name: basename(dir), path: dir, root: resolvedRoot, prefix: parsePrefix(yml), counts };
      });
    }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @beans-frontend/server test scan.test.ts`
Expected: PASS (all tests, including the 4 new ones and the rewritten tiebreak test)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/discovery/scan.ts apps/server/src/discovery/scan.test.ts
git commit -m "feat(server): discover projects across multiple roots"
```

---

### Task 4: Wire `roots[]` through `AppDeps`, `index.ts`, and `routes/graphql.ts`

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/routes/graphql.ts`
- Modify: `apps/server/src/routes/graphql.test.ts`
- Modify: `apps/server/src/routes/projects.test.ts`
- Modify: `apps/server/src/routes/events.test.ts`
- Modify: `apps/server/src/routes/analytics.test.ts`
- Modify: `apps/server/src/routes/search.test.ts`
- Modify: `apps/server/src/index.integration.test.ts`
- Modify: `apps/server/src/discovery/scan.integration.test.ts`

**Interfaces:**
- Consumes: `discoverProjects(roots: string[], maxDepth: number)` (Task 3), `env.GIT_ROOT: string[]` (Task 2), `Project.root: string` (Task 1).
- Produces: `AppDeps.roots: string[]` (was `AppDeps.root: string`) — this is `AppDeps`'s public shape from here on; nothing later in this plan changes it further.

- [ ] **Step 1: Update `AppDeps`**

In `apps/server/src/app.ts`, change:

```typescript
export interface AppDeps {
  root: string;
  scanDepth: number;
```

to:

```typescript
export interface AppDeps {
  roots: string[];
  scanDepth: number;
```

- [ ] **Step 2: Update the `routes/graphql.ts` validation call site**

In `apps/server/src/routes/graphql.ts`, change:

```typescript
    const configPath = join(assertWithinRoot(deps.root, project.path), ".beans.yml");
```

to:

```typescript
    const configPath = join(assertWithinRoot(project.root, project.path), ".beans.yml");
```

- [ ] **Step 3: Update `index.ts`'s three call sites**

In `apps/server/src/index.ts`, change:

```typescript
const discover = () => discoverProjects(env.GIT_ROOT, env.SCAN_DEPTH);
```

to (unchanged — `env.GIT_ROOT` is now already `string[]`, and `discoverProjects` now accepts `string[]` as its first argument, so this line's text is identical; no edit needed here).

Change:

```typescript
const app = createApp({
  root: env.GIT_ROOT,
  scanDepth: env.SCAN_DEPTH,
```

to:

```typescript
const app = createApp({
  roots: env.GIT_ROOT,
  scanDepth: env.SCAN_DEPTH,
```

Change:

```typescript
// touch assertWithinRoot so the jail is exercised at startup for each project
for (const p of projects) assertWithinRoot(env.GIT_ROOT, p.path);
```

to:

```typescript
// touch assertWithinRoot so the jail is exercised at startup for each project
for (const p of projects) assertWithinRoot(p.root, p.path);
```

- [ ] **Step 4: Update the five route test files' local `deps()` helpers**

In each of `apps/server/src/routes/graphql.test.ts`, `apps/server/src/routes/projects.test.ts`, `apps/server/src/routes/events.test.ts`, `apps/server/src/routes/analytics.test.ts`, and `apps/server/src/routes/search.test.ts`, change the `root: "/root",` line inside that file's `deps()` helper to `roots: ["/root"],`.

- [ ] **Step 5: Update `index.integration.test.ts`**

In `apps/server/src/index.integration.test.ts`, change:

```typescript
  const listProjects = () => discoverProjects(root, 4);
```

to:

```typescript
  const listProjects = () => discoverProjects([root], 4);
```

Change both occurrences of:

```typescript
    const app = createApp({
      root,
      scanDepth: 4,
```

to:

```typescript
    const app = createApp({
      roots: [root],
      scanDepth: 4,
```

- [ ] **Step 6: Update `scan.integration.test.ts`**

`apps/server/src/discovery/scan.integration.test.ts` has two direct calls to `discoverProjects` still using the old single-string signature (this file is separate from `scan.test.ts`, which Task 3 already updated). Change both occurrences of:

```typescript
    const projects = await discoverProjects(root, 4);
```

to:

```typescript
    const projects = await discoverProjects([root], 4);
```

- [ ] **Step 7: Run the server test suite**

Run: `pnpm --filter @beans-frontend/server test`
Expected: PASS (all tests, including `graphql.test.ts`'s existing assertion that `runGraphql` is called with `/root/proj-a/.beans.yml` — `fakeProject`'s `root: "/root"` from Task 1 makes `assertWithinRoot(project.root, project.path)` resolve the same path as before). This includes the `beans`-binary-backed integration tests in `index.integration.test.ts` and `scan.integration.test.ts` — both require the `beans` CLI on `PATH`.

- [ ] **Step 8: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/index.ts apps/server/src/routes/graphql.ts \
  apps/server/src/routes/graphql.test.ts apps/server/src/routes/projects.test.ts \
  apps/server/src/routes/events.test.ts apps/server/src/routes/analytics.test.ts \
  apps/server/src/routes/search.test.ts apps/server/src/index.integration.test.ts \
  apps/server/src/discovery/scan.integration.test.ts
git commit -m "feat(server): validate project paths against their own root"
```

---

### Task 5: Fix apps/web test fixtures, update docs, run the full gate suite

**Files:**
- Modify: `apps/web/src/components/AppShell.test.tsx`
- Modify: `apps/web/src/components/Sidebar.test.tsx`
- Modify: `apps/web/src/hooks/useProjects.test.tsx`
- Modify: `apps/web/src/routes/overview.test.tsx`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `Project.root: string` (Task 1) — this task's first step closes a gap Task 1 exposed but couldn't see: `pnpm -r typecheck` stops at the first failing package, so `apps/web` errors from the new required field only surface once Task 4 makes `apps/server` typecheck clean.

- [ ] **Step 0: Add the required `root` field to four `apps/web` test fixtures**

Task 1 added `root: string` as a **required** field to the shared `Project` type. Four `apps/web` test files construct `Project` literals inline (not via a shared fixture) and are now missing that field — invisible until Task 4 made every `apps/server` type error disappear, since `pnpm -r typecheck` runs packages in dependency order and stops at the first failure. All four literals share the same shape (`path: "/g/handbellhub"`); add `root: "/g",` immediately after the `path` line in each.

In `apps/web/src/components/AppShell.test.tsx`, change:

```typescript
const project: Project = {
  name: "handbellhub",
  path: "/g/handbellhub",
  prefix: "hh-",
```

to:

```typescript
const project: Project = {
  name: "handbellhub",
  path: "/g/handbellhub",
  root: "/g",
  prefix: "hh-",
```

In `apps/web/src/components/Sidebar.test.tsx`, change:

```typescript
  {
    name: "handbellhub",
    path: "/g/handbellhub",
    prefix: "hh-",
```

to:

```typescript
  {
    name: "handbellhub",
    path: "/g/handbellhub",
    root: "/g",
    prefix: "hh-",
```

In `apps/web/src/hooks/useProjects.test.tsx`, change:

```typescript
const project: Project = {
  name: "handbellhub",
  path: "/g/handbellhub",
  prefix: "hh-",
```

to:

```typescript
const project: Project = {
  name: "handbellhub",
  path: "/g/handbellhub",
  root: "/g",
  prefix: "hh-",
```

In `apps/web/src/routes/overview.test.tsx`, change:

```typescript
const project: Project = {
  name: "handbellhub",
  path: "/g/handbellhub",
  prefix: "hh-",
```

to:

```typescript
const project: Project = {
  name: "handbellhub",
  path: "/g/handbellhub",
  root: "/g",
  prefix: "hh-",
```

Run: `pnpm --filter @beans-frontend/web typecheck && pnpm --filter @beans-frontend/web test`
Expected: PASS (the four `TS2741: Property 'root' is missing` errors are gone; existing web tests are otherwise unaffected — this field isn't rendered or asserted on anywhere in `apps/web`)

Commit this fix on its own, separate from the docs commit below:

```bash
git add apps/web/src/components/AppShell.test.tsx apps/web/src/components/Sidebar.test.tsx \
  apps/web/src/hooks/useProjects.test.tsx apps/web/src/routes/overview.test.tsx
git commit -m "test(web): add root field to Project test fixtures"
```

- [ ] **Step 1: Update `.env.example`**

In `.env.example`, change:

```
# Root folder to scan for beans projects (each subdirectory containing a
# .beans.yml, up to SCAN_DEPTH levels deep, is treated as a project)
GIT_ROOT=/home/youruser/git

# Max recursion depth for project discovery under GIT_ROOT
SCAN_DEPTH=4
```

to:

```
# Comma-separated list of root folders to scan for beans projects (each
# subdirectory containing a .beans.yml, up to SCAN_DEPTH levels deep under
# each root, is treated as a project)
GIT_ROOT=/home/youruser/git

# Max recursion depth for project discovery under each GIT_ROOT entry
SCAN_DEPTH=4
```

- [ ] **Step 2: Update `README.md`**

In `README.md`, change the config table row:

```
| `GIT_ROOT`   | `~/git`     | Root directory scanned for `beans` projects (any dir with a `.beans.yml`).    |
| `SCAN_DEPTH` | `1`         | Max recursion depth (1–8) when scanning `GIT_ROOT` for projects.              |
```

to:

```
| `GIT_ROOT`   | `~/git`     | Comma-separated root directories scanned for `beans` projects (any dir with a `.beans.yml`). |
| `SCAN_DEPTH` | `1`         | Max recursion depth (1–8) when scanning each `GIT_ROOT` entry for projects.   |
```

Change:

```
The server never reads or writes outside `GIT_ROOT` — every resolved project path is checked
against it before use (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#the-git_root-path-jail)).
```

to:

```
The server never reads or writes outside a project's own configured root — every resolved
project path is checked against the specific root it was discovered under before use (see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#the-git_root-path-jail)).
```

Change:

```
GIT_ROOT=/path/to/your/git/projects PORT=4780 pnpm start
```

to:

```
GIT_ROOT=/path/to/your/git/projects,/path/to/other/projects PORT=4780 pnpm start
```

- [ ] **Step 3: Update `docs/ARCHITECTURE.md`**

Change:

```
The server holds no bean data itself. On startup and on each `/api/projects` request, it walks
`GIT_ROOT` (`apps/server/src/discovery/scan.ts`) up to `SCAN_DEPTH` levels looking for
directories containing a `.beans.yml`; each one becomes a `Project` (name, path, prefix, and
counts by type/status, read via `beans`).
```

to:

```
The server holds no bean data itself. On startup and on each `/api/projects` request, it walks
every configured `GIT_ROOT` entry (`apps/server/src/discovery/scan.ts`) up to `SCAN_DEPTH`
levels looking for directories containing a `.beans.yml`; each one becomes a `Project` (name,
path, the specific root it was found under, prefix, and counts by type/status, read via
`beans`). Projects found under different roots (or nested/overlapping roots) are deduped by
resolved path; same-name collisions are resolved by qualifying the name with the owning root's
basename, falling back to a numeric suffix if that still collides.
```

Change the `## The GIT_ROOT path jail` section:

```
`GIT_ROOT` is the only directory tree the server is allowed to touch. Every project path used to
build a `--config` argument or serve a file is passed through `assertWithinRoot(root, candidate)`
(`apps/server/src/discovery/scan.ts`), which resolves both paths and rejects anything whose
relative path from `root` starts with `..` — i.e. anything outside `GIT_ROOT`, including via
symlink traversal or a crafted `:name` route param. This keeps the server unable to read or
execute `beans` against arbitrary filesystem paths even if a project name or path were attacker
controlled.
```

to:

```
The configured `GIT_ROOT` directories are the only trees the server is allowed to touch. Every
project path used to build a `--config` argument or serve a file is passed through
`assertWithinRoot(root, candidate)` (`apps/server/src/discovery/scan.ts`), which resolves both
paths and rejects anything whose relative path from `root` starts with `..` — i.e. anything
outside that root, including via symlink traversal or a crafted `:name` route param. Each
project validates against the specific root it was discovered under (`Project.root`, set once at
discovery), not against "any configured root" — strictly more precise than a single shared root
check. This keeps the server unable to read or execute `beans` against arbitrary filesystem
paths even if a project name or path were attacker controlled.
```

- [ ] **Step 4: Run the full gate suite**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm -r test:coverage && pnpm knip && pnpm spell`
Expected: PASS on every gate. If `pnpm spell` flags any new words introduced by this task's doc edits (unlikely, but check), add them to `cspell.config.yaml`'s word list.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/ARCHITECTURE.md .env.example
git commit -m "docs: document multi-root GIT_ROOT scanning"
```
