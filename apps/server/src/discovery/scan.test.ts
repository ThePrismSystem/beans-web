import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertWithinRoot, discoverProjects, findProjectDirs, parseDataPath } from "./scan.js";

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
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

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
  it("names the violated root in the error message", () => {
    expect(() => assertWithinRoot(root, join(root, "../etc"))).toThrow(
      new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });
  it("accepts a directory whose name literally starts with ..", () => {
    expect(assertWithinRoot(root, join(root, "..hidden-backup"))).toBe(
      join(root, "..hidden-backup"),
    );
  });
});

describe("parseDataPath", () => {
  it("defaults to .beans when the key is absent", () => {
    expect(parseDataPath("beans:\n  prefix: bf-\n")).toBe(".beans");
  });

  it("defaults to .beans when the key is present but blank", () => {
    expect(parseDataPath("beans:\n  path:\n  prefix: bf-\n")).toBe(".beans");
  });

  it("parses an ordinary relative value", () => {
    expect(parseDataPath("beans:\n  path: .beans\n")).toBe(".beans");
  });

  it("parses a traversal value", () => {
    expect(parseDataPath("beans:\n  path: ../../outside\n")).toBe("../../outside");
  });

  it("parses an absolute value as-is", () => {
    expect(parseDataPath("beans:\n  path: /etc/evil\n")).toBe("/etc/evil");
  });

  it("parses a double-quoted value", () => {
    expect(parseDataPath('beans:\n  path: "../evil"\n')).toBe("../evil");
  });

  it("parses a single-quoted value", () => {
    expect(parseDataPath("beans:\n  path: '../evil'\n")).toBe("../evil");
  });

  it("strips a trailing comment on an unquoted value", () => {
    expect(parseDataPath("beans:\n  path: ../evil # do not look here\n")).toBe("../evil");
  });

  it("strips a trailing comment on a quoted value", () => {
    expect(parseDataPath('beans:\n  path: "../evil"   # do not look here\n')).toBe("../evil");
  });

  it("tolerates extra whitespace around the value", () => {
    expect(parseDataPath("beans:\n  path:    ../evil   \n")).toBe("../evil");
  });

  it("ignores a path: mention inside a full-line comment and still finds the default", () => {
    expect(parseDataPath("beans:\n  # path: ../evil (disabled)\n  prefix: bf-\n")).toBe(".beans");
  });

  it("defaults to .beans when the value is nothing but a trailing comment", () => {
    expect(parseDataPath("beans:\n  path: # comment only, no value\n  prefix: bf-\n")).toBe(
      ".beans",
    );
  });

  it("rejects flow-style mappings the CLI honours but this parser cannot see as a line key", () => {
    expect(parseDataPath('beans: {path: "../evil", prefix: "bf-"}\n')).toBeNull();
  });

  it("rejects an unterminated quote", () => {
    expect(parseDataPath('beans:\n  path: "../evil\n')).toBeNull();
  });

  it("rejects trailing junk after a closing quote that isn't a comment", () => {
    expect(parseDataPath('beans:\n  path: "../evil" extra\n')).toBeNull();
  });

  it("rejects a stray quote in an unquoted value", () => {
    expect(parseDataPath('beans:\n  path: ../ev"il\n')).toBeNull();
  });

  it("rejects a duplicate path key rather than guessing which one the CLI would use", () => {
    expect(parseDataPath("beans:\n  path: .beans\n  path: ../evil\n")).toBeNull();
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

      const projects = await discoverProjects([testRoot], 2);
      const names = projects.map((p) => p.name);

      // Verify the exact sorted order - even though readdir was mocked to return zeta, mid, alpha
      // the output should be sorted as alpha, mid, zeta (proving the sort() call works)
      expect(names).toEqual(["alpha", "mid", "zeta"]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

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
      const byName = new Map(projects.map((p) => [p.name, p.path.replace(testRoot + "/", "")]));

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
});

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

  it("disambiguates a renamed project that would otherwise collide with an untouched project's original name", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const parent = mkdtempSync(join(tmpdir(), "scan-collide2-"));
    const rootWork = join(parent, "work");
    const rootPersonal = join(parent, "personal");
    mkdirSync(rootWork, { recursive: true });
    mkdirSync(rootPersonal, { recursive: true });
    try {
      mkdirSync(join(rootWork, "api"), { recursive: true });
      writeFileSync(join(rootWork, "api", ".beans.yml"), "beans:\n  prefix: x-\n");
      mkdirSync(join(rootPersonal, "api"), { recursive: true });
      writeFileSync(join(rootPersonal, "api", ".beans.yml"), "beans:\n  prefix: y-\n");
      mkdirSync(join(rootPersonal, "work-api"), { recursive: true });
      writeFileSync(join(rootPersonal, "work-api", ".beans.yml"), "beans:\n  prefix: z-\n");

      const projects = await discoverProjects([rootWork, rootPersonal], 2);
      const names = projects.map((p) => p.name);

      // All three names must be distinct — in particular, the "api" project
      // under rootWork must not silently collide with the untouched
      // "work-api" project once qualified with rootWork's basename ("work").
      expect(new Set(names).size).toBe(3);
      expect(names).toContain("work-api");
    } finally {
      rmSync(parent, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

  it("falls back to a numeric suffix for two distinct roots that share an identical basename", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    // Two different physical roots both happen to be named "src" — the
    // root-basename qualifier alone ("src-shared") can't tell them apart,
    // so this must fall through to the numeric-suffix tier.
    const parentA = mkdtempSync(join(tmpdir(), "scan-samebase-a-"));
    const parentB = mkdtempSync(join(tmpdir(), "scan-samebase-b-"));
    const rootA = join(parentA, "src");
    const rootB = join(parentB, "src");
    mkdirSync(rootA, { recursive: true });
    mkdirSync(rootB, { recursive: true });
    try {
      mkdirSync(join(rootA, "shared"), { recursive: true });
      writeFileSync(join(rootA, "shared", ".beans.yml"), "beans:\n  prefix: x-\n");
      mkdirSync(join(rootB, "shared"), { recursive: true });
      writeFileSync(join(rootB, "shared", ".beans.yml"), "beans:\n  prefix: y-\n");

      const projects = await discoverProjects([rootA, rootB], 2);
      const names = projects.map((p) => p.name).sort();
      const paths = new Set(projects.map((p) => p.path));

      expect(names).toEqual(["src-shared", "src-shared-2"]);
      expect(paths).toEqual(new Set([join(rootA, "shared"), join(rootB, "shared")]));
    } finally {
      rmSync(parentA, { recursive: true, force: true });
      rmSync(parentB, { recursive: true, force: true });
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
      const projects = await discoverProjects([root], 4);
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

describe("discoverProjects path containment (SEC-03)", () => {
  it("excludes a project whose beans.path traverses outside the root, keeping its sibling", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-escape-rel-"));
    try {
      mkdirSync(join(testRoot, "evil"), { recursive: true });
      writeFileSync(
        join(testRoot, "evil", ".beans.yml"),
        "beans:\n  path: ../../outside\n  prefix: x-\n",
      );
      mkdirSync(join(testRoot, "good"), { recursive: true });
      writeFileSync(join(testRoot, "good", ".beans.yml"), "beans:\n  prefix: y-\n");

      const projects = await discoverProjects([testRoot], 2);

      expect(projects.map((p) => p.name)).toEqual(["good"]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

  it("excludes a project whose beans.path is an absolute path outside the root", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-escape-abs-"));
    const outside = mkdtempSync(join(tmpdir(), "scan-escape-abs-target-"));
    try {
      mkdirSync(join(testRoot, "evil"), { recursive: true });
      writeFileSync(
        join(testRoot, "evil", ".beans.yml"),
        `beans:\n  path: ${outside}\n  prefix: x-\n`,
      );

      const projects = await discoverProjects([testRoot], 2);

      expect(projects.map((p) => p.name)).toEqual([]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

  it("excludes a project whose beans.path is a quoted traversal, proving parsing wires into containment", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-escape-quoted-"));
    try {
      mkdirSync(join(testRoot, "evil-double"), { recursive: true });
      writeFileSync(
        join(testRoot, "evil-double", ".beans.yml"),
        'beans:\n  path: "../../outside"\n  prefix: x-\n',
      );
      mkdirSync(join(testRoot, "evil-single"), { recursive: true });
      writeFileSync(
        join(testRoot, "evil-single", ".beans.yml"),
        "beans:\n  path: '../../outside'\n  prefix: x-\n",
      );

      const projects = await discoverProjects([testRoot], 2);

      expect(projects.map((p) => p.name)).toEqual([]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

  it("includes a normal project whose beans.path is the default (key absent) or explicit .beans", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-normal-"));
    try {
      mkdirSync(join(testRoot, "implicit"), { recursive: true });
      writeFileSync(join(testRoot, "implicit", ".beans.yml"), "beans:\n  prefix: x-\n");
      mkdirSync(join(testRoot, "explicit"), { recursive: true });
      writeFileSync(
        join(testRoot, "explicit", ".beans.yml"),
        "beans:\n  path: .beans\n  prefix: y-\n",
      );

      const projects = await discoverProjects([testRoot], 2);

      expect(projects.map((p) => p.name).sort()).toEqual(["explicit", "implicit"]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

  it("excludes a project whose beans.path is unparseable (flow-style), keeping its sibling", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-escape-flow-"));
    try {
      mkdirSync(join(testRoot, "evil"), { recursive: true });
      writeFileSync(
        join(testRoot, "evil", ".beans.yml"),
        'beans: {path: "../evil", prefix: "x-"}\n',
      );
      mkdirSync(join(testRoot, "good"), { recursive: true });
      writeFileSync(join(testRoot, "good", ".beans.yml"), "beans:\n  prefix: y-\n");

      const projects = await discoverProjects([testRoot], 2);

      expect(projects.map((p) => p.name)).toEqual(["good"]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

  it("excludes a project whose default .beans directory is a symlink pointing outside the root", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-symlink-out-"));
    const outside = mkdtempSync(join(tmpdir(), "scan-symlink-out-target-"));
    try {
      mkdirSync(join(testRoot, "evil"), { recursive: true });
      writeFileSync(join(testRoot, "evil", ".beans.yml"), "beans:\n  prefix: x-\n");
      // .beans is a symlink escaping the root - passes a lexical check
      // (the literal path is still "<root>/evil/.beans") but must be
      // rejected once symlinks are resolved.
      symlinkSync(outside, join(testRoot, "evil", ".beans"));

      const projects = await discoverProjects([testRoot], 2);

      expect(projects.map((p) => p.name)).toEqual([]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

  it("includes a project whose .beans directory is a symlink that stays inside the root", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-symlink-in-"));
    try {
      mkdirSync(join(testRoot, "real-data"), { recursive: true });
      mkdirSync(join(testRoot, "proj"), { recursive: true });
      writeFileSync(join(testRoot, "proj", ".beans.yml"), "beans:\n  prefix: x-\n");
      symlinkSync(join(testRoot, "real-data"), join(testRoot, "proj", ".beans"));

      const projects = await discoverProjects([testRoot], 2);

      expect(projects.map((p) => p.name)).toEqual(["proj"]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

  it("excludes a project via a symlinked ancestor directory even when the data dir leaf doesn't exist yet", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-symlink-ancestor-"));
    const outside = mkdtempSync(join(tmpdir(), "scan-symlink-ancestor-target-"));
    try {
      mkdirSync(join(testRoot, "evil"), { recursive: true });
      writeFileSync(
        join(testRoot, "evil", ".beans.yml"),
        "beans:\n  path: sub/.beans\n  prefix: x-\n",
      );
      // "sub" is a symlink escaping the root; "sub/.beans" itself does not
      // exist anywhere, inside the escape target or otherwise.
      symlinkSync(outside, join(testRoot, "evil", "sub"));

      const projects = await discoverProjects([testRoot], 2);

      expect(projects.map((p) => p.name)).toEqual([]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

  it("excludes a project (without crashing discovery) when its data directory is an unresolvable symlink loop", async () => {
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-symlink-eloop-"));
    try {
      mkdirSync(join(testRoot, "evil"), { recursive: true });
      writeFileSync(join(testRoot, "evil", ".beans.yml"), "beans:\n  prefix: x-\n");
      mkdirSync(join(testRoot, "good"), { recursive: true });
      writeFileSync(join(testRoot, "good", ".beans.yml"), "beans:\n  prefix: y-\n");
      // ".beans" and ".beans-loop" symlink to each other, so resolving
      // either raises ELOOP rather than ENOENT. resolveContainedDataPath
      // must treat this the same as any other containment it cannot confirm -
      // reject the one project, not throw out of discoverProjects.
      symlinkSync(join(testRoot, "evil", ".beans-loop"), join(testRoot, "evil", ".beans"));
      symlinkSync(join(testRoot, "evil", ".beans"), join(testRoot, "evil", ".beans-loop"));

      const projects = await discoverProjects([testRoot], 2);

      expect(projects.map((p) => p.name)).toEqual(["good"]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });
});
