import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertWithinRoot, discoverProjects, findProjectDirs } from "./scan.js";

interface FakeDirEntry {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
}

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();

  return {
    ...actual,
    readdir: vi.fn(async (dir: string, options?: { withFileTypes?: boolean } | string | null) => {
      // Normalize options for checking
      const opts = typeof options === "object" ? options : undefined;

      // For the ordering test root, return mocked directory entries in non-alphabetical order
      // Check if this is the root directory by seeing if it ends with the temp dir prefix
      if (
        typeof dir === "string" &&
        dir.includes("scan-ordering-") &&
        !dir.endsWith("/zeta") &&
        !dir.endsWith("/mid") &&
        !dir.endsWith("/alpha") &&
        opts?.withFileTypes
      ) {
        const entries: FakeDirEntry[] = [
          {
            name: "zeta",
            isDirectory: () => true,
            isFile: () => false,
          },
          {
            name: "mid",
            isDirectory: () => true,
            isFile: () => false,
          },
          {
            name: "alpha",
            isDirectory: () => true,
            isFile: () => false,
          },
        ];
        return entries;
      }
      // For subdirectories in the ordering test (zeta/, mid/, alpha/), return .beans.yml
      if (
        typeof dir === "string" &&
        dir.includes("scan-ordering-") &&
        (dir.endsWith("/zeta") || dir.endsWith("/mid") || dir.endsWith("/alpha")) &&
        opts?.withFileTypes
      ) {
        const entries: FakeDirEntry[] = [
          {
            name: ".beans.yml",
            isDirectory: () => false,
            isFile: () => true,
          },
        ];
        return entries;
      }
      // For the tiebreak test root, list two parent directories that both
      // contain a child named "shared" — a same-basename project pair.
      if (
        typeof dir === "string" &&
        dir.includes("scan-tiebreak-") &&
        !dir.endsWith("/parent-one") &&
        !dir.endsWith("/parent-two") &&
        !dir.endsWith("/parent-one/shared") &&
        !dir.endsWith("/parent-two/shared") &&
        opts?.withFileTypes
      ) {
        const entries: FakeDirEntry[] = [
          { name: "parent-one", isDirectory: () => true, isFile: () => false },
          { name: "parent-two", isDirectory: () => true, isFile: () => false },
        ];
        return entries;
      }
      // "parent-one" is deliberately delayed so "parent-two"'s subtree
      // resolves and is pushed into the discovered-projects list first —
      // reproducing the out-of-alphabetical discovery order that a
      // name-only sort cannot repair for a same-named project pair.
      if (typeof dir === "string" && dir.endsWith("/parent-one") && opts?.withFileTypes) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        const entries: FakeDirEntry[] = [
          { name: "shared", isDirectory: () => true, isFile: () => false },
        ];
        return entries;
      }
      if (typeof dir === "string" && dir.endsWith("/parent-two") && opts?.withFileTypes) {
        const entries: FakeDirEntry[] = [
          { name: "shared", isDirectory: () => true, isFile: () => false },
        ];
        return entries;
      }
      if (
        typeof dir === "string" &&
        (dir.endsWith("/parent-one/shared") || dir.endsWith("/parent-two/shared")) &&
        opts?.withFileTypes
      ) {
        const entries: FakeDirEntry[] = [
          { name: ".beans.yml", isDirectory: () => false, isFile: () => true },
        ];
        return entries;
      }
      // For all other calls, use the real readdir
      return actual.readdir(dir, options as Parameters<typeof actual.readdir>[1]);
    }),
  };
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "scan-"));
  const mk = (rel: string) => {
    mkdirSync(join(root, rel), { recursive: true });
    writeFileSync(join(root, rel, ".beans.yml"), "beans:\n  prefix: x-\n");
  };
  mk("proj-a");
  mk("mono/sub-b"); // nested project
  mkdirSync(join(root, "node_modules/pkg"), { recursive: true });
  writeFileSync(join(root, "node_modules/pkg/.beans.yml"), "beans:\n"); // must be ignored
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("findProjectDirs", () => {
  it("finds top-level and nested projects, ignores node_modules", async () => {
    const dirs = (await findProjectDirs(root, 4)).map((d) => d.replace(root + "/", "")).sort();
    expect(dirs).toEqual(["mono/sub-b", "proj-a"]);
  });

  it("ignores unreadable directories instead of throwing", async () => {
    const dirs = await findProjectDirs(join(root, "does-not-exist"), 4);
    expect(dirs).toEqual([]);
  });

  it("stops descending once maxDepth is reached", async () => {
    const dirs = await findProjectDirs(root, 0);
    expect(dirs).toEqual([]);
  });
});

describe("assertWithinRoot", () => {
  it("accepts a path inside root", () => {
    expect(assertWithinRoot(root, join(root, "proj-a"))).toBe(join(root, "proj-a"));
  });
  it("accepts the root itself", () => {
    expect(assertWithinRoot(root, root)).toBe(root);
  });
  it("throws on traversal outside root", () => {
    expect(() => assertWithinRoot(root, join(root, "../etc"))).toThrow(/outside/i);
  });
});

describe("discoverProjects ordering", () => {
  it("returns projects sorted by name with mocked non-alphabetical readdir", async () => {
    // Mock runBeansGraphql to avoid needing beans CLI
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-ordering-"));
    try {
      const mk = (rel: string) => {
        mkdirSync(join(testRoot, rel), { recursive: true });
        writeFileSync(join(testRoot, rel, ".beans.yml"), "beans:\n  prefix: x-\n");
      };
      // Create directories - readdir will be mocked to return them as: zeta, mid, alpha
      mk("zeta");
      mk("mid");
      mk("alpha");

      const projects = await discoverProjects(testRoot, 2);
      const names = projects.map((p) => p.name);

      // Verify the exact sorted order - even though readdir was mocked to return zeta, mid, alpha
      // the output should be sorted as alpha, mid, zeta (proving the sort() call works)
      expect(names).toEqual(["alpha", "mid", "zeta"]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

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
});

describe("discoverProjects counts", () => {
  it("counts closed-status beans in totals but excludes them from open counts", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({
      beans: [
        { type: "feature", status: "todo" },
        { type: "bug", status: "completed" },
      ],
    });

    try {
      const projects = await discoverProjects(root, 4);
      const projA = projects.find((p) => p.name === "proj-a");
      if (!projA) throw new Error("expected proj-a to be discovered");

      expect(projA.counts.total).toBe(2);
      expect(projA.counts.byStatus.completed).toBe(1);
      expect(projA.counts.byStatus.todo).toBe(1);
      expect(projA.counts.open).toBe(1);
      expect(projA.counts.openByType.feature).toBe(1);
      expect(projA.counts.openByType.bug).toBe(0);
    } finally {
      graphqlMock.mockRestore();
    }
  });
});
