import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { discoverProjects, findProjectDirs, parseDataPath } from "./scan.js";

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

describe("parseDataPath", () => {
  it("defaults to .beans when the key is absent", () => {
    expect(parseDataPath("beans:\n  prefix: bf-\n")).toEqual({
      value: ".beans",
      confident: true,
    });
  });

  it("defaults to .beans when the key is present but blank", () => {
    expect(parseDataPath("beans:\n  path:\n  prefix: bf-\n")).toEqual({
      value: ".beans",
      confident: true,
    });
  });

  it("parses an ordinary relative value", () => {
    expect(parseDataPath("beans:\n  path: .beans\n")).toEqual({
      value: ".beans",
      confident: true,
    });
  });

  it("parses a traversal value", () => {
    expect(parseDataPath("beans:\n  path: ../../outside\n")).toEqual({
      value: "../../outside",
      confident: true,
    });
  });

  it("parses an absolute value as-is", () => {
    expect(parseDataPath("beans:\n  path: /etc/evil\n")).toEqual({
      value: "/etc/evil",
      confident: true,
    });
  });

  it("parses a double-quoted value", () => {
    expect(parseDataPath('beans:\n  path: "../evil"\n')).toEqual({
      value: "../evil",
      confident: true,
    });
  });

  it("parses a single-quoted value", () => {
    expect(parseDataPath("beans:\n  path: '../evil'\n")).toEqual({
      value: "../evil",
      confident: true,
    });
  });

  it("strips a trailing comment on an unquoted value", () => {
    expect(parseDataPath("beans:\n  path: ../evil # do not look here\n")).toEqual({
      value: "../evil",
      confident: true,
    });
  });

  it("strips a trailing comment on a quoted value", () => {
    expect(parseDataPath('beans:\n  path: "../evil"   # do not look here\n')).toEqual({
      value: "../evil",
      confident: true,
    });
  });

  it("tolerates extra whitespace around the value", () => {
    expect(parseDataPath("beans:\n  path:    ../evil   \n")).toEqual({
      value: "../evil",
      confident: true,
    });
  });

  it("ignores a path: mention inside a full-line comment and still finds the default", () => {
    expect(parseDataPath("beans:\n  # path: ../evil (disabled)\n  prefix: bf-\n")).toEqual({
      value: ".beans",
      confident: true,
    });
  });

  it("ignores a path: key that belongs to an unrelated top-level section", () => {
    // Only beans.path matters. A path: key nested under some other top-level
    // key is not beans.path at all and must not be flagged, let alone reduce
    // confidence - the CLI ignores it too.
    const result = parseDataPath("other:\n  path: ../evil\nbeans:\n  prefix: bf-\n");
    expect(result).toEqual({ value: ".beans", confident: true });
  });

  it("defaults to .beans when the value is nothing but a trailing comment", () => {
    expect(parseDataPath("beans:\n  path: # comment only, no value\n  prefix: bf-\n")).toEqual({
      value: ".beans",
      confident: true,
    });
  });

  it("is not confident about a flow-style mapping, which the CLI honours but this parser cannot see as a line key", () => {
    const result = parseDataPath('beans: {path: "../evil", prefix: "bf-"}\n');
    expect(result.confident).toBe(false);
    expect(result.value).toBe(".beans");
  });

  it("is not confident about an unterminated quote", () => {
    const result = parseDataPath('beans:\n  path: "../evil\n');
    expect(result.confident).toBe(false);
    expect(result.value).toBe(".beans");
  });

  it("is not confident about trailing junk after a closing quote that isn't a comment", () => {
    const result = parseDataPath('beans:\n  path: "../evil" extra\n');
    expect(result.confident).toBe(false);
    expect(result.value).toBe(".beans");
  });

  it("is not confident about a stray quote in an unquoted value", () => {
    const result = parseDataPath('beans:\n  path: ../ev"il\n');
    expect(result.confident).toBe(false);
    expect(result.value).toBe(".beans");
  });

  it("is not confident about a duplicate path key rather than guessing which one the CLI would use", () => {
    const result = parseDataPath("beans:\n  path: .beans\n  path: ../evil\n");
    expect(result.confident).toBe(false);
    expect(result.value).toBe(".beans");
  });

  it("is not confident when a comment-only path: line is followed by a more-indented continuation", () => {
    // Distinct from the plain "path:\n    value" case above: here the
    // same-line content isn't literally empty, it's a comment, and the
    // "blank after stripping the comment" branch must still check the
    // following line for a continuation rather than assuming the default.
    const result = parseDataPath("beans:\n  path: # see below\n    ../OUTSIDE\n  prefix: x-\n");
    expect(result.confident).toBe(false);
    expect(result.value).toBe(".beans");
  });

  // Regression lock for the five parser bypasses found in round 1: each of
  // these was accepted as ".beans"/the literal indicator text by the old
  // line-only parser while the real CLI resolved beans.path to ../OUTSIDE -
  // an escape that never triggered the containment check. Confirmed against
  // the real binary (see the C4 report). None of these should be confident.
  describe("bypass regression lock", () => {
    it("is not confident about an unquoted value on a following, more-indented line", () => {
      const result = parseDataPath("beans:\n  path:\n    ../OUTSIDE\n  prefix: bf-\n");
      expect(result.confident).toBe(false);
      expect(result.value).toBe(".beans");
    });

    it("is not confident about a quoted value on a following, more-indented line", () => {
      const result = parseDataPath('beans:\n  path:\n    "../OUTSIDE"\n  prefix: bf-\n');
      expect(result.confident).toBe(false);
      expect(result.value).toBe(".beans");
    });

    it("is not confident about a folded block scalar (>-)", () => {
      const result = parseDataPath("beans:\n  path: >-\n    ../OUTSIDE\n  prefix: bf-\n");
      expect(result.confident).toBe(false);
      expect(result.value).toBe(".beans");
    });

    it("is not confident about a literal block scalar (|-)", () => {
      const result = parseDataPath("beans:\n  path: |-\n    ../OUTSIDE\n  prefix: bf-\n");
      expect(result.confident).toBe(false);
      expect(result.value).toBe(".beans");
    });

    it("is not confident about a YAML alias referencing an anchor", () => {
      const result = parseDataPath("beans:\n  x: &a ../OUTSIDE\n  path: *a\n  prefix: bf-\n");
      expect(result.confident).toBe(false);
      expect(result.value).toBe(".beans");
    });
  });

  it("is not confident about a double-quoted value containing an escape sequence", () => {
    // YAML double-quoted scalars decode backslash escapes (/ is "/"),
    // so the real CLI resolves this to "../OUTSIDE" - a literal string
    // extraction that doesn't decode escapes would silently keep it inside
    // the project directory instead.
    const result = parseDataPath('beans:\n  path: "..\\u002fOUTSIDE"\n  prefix: bf-\n');
    expect(result.confident).toBe(false);
    expect(result.value).toBe(".beans");
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
      // The .beans leaf doesn't exist in either fixture, so realpathContained
      // reconstructs it from the nearest existing ancestor plus a literal
      // tail - this must land back on exactly the lexical path when nothing
      // in the chain is a symlink.
      const byName = new Map(projects.map((p) => [p.name, p]));
      expect(byName.get("implicit")?.dataPath).toBe(join(testRoot, "implicit", ".beans"));
      expect(byName.get("explicit")?.dataPath).toBe(join(testRoot, "explicit", ".beans"));
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });

  it("keeps a project with a flow-style beans.path, but forces --beans-path to the safe default", async () => {
    // Round 1 dropped this project outright. Round 2: parsing failure alone
    // no longer drops anything - the project stays discovered, but every
    // runBeansGraphql call for it is forced onto the validated default via
    // --beans-path, so the config's own (unreadable) declared value never
    // reaches the CLI regardless of what it says.
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

    const testRoot = mkdtempSync(join(tmpdir(), "scan-flow-default-"));
    try {
      mkdirSync(join(testRoot, "evil"), { recursive: true });
      writeFileSync(
        join(testRoot, "evil", ".beans.yml"),
        'beans: {path: "../evil", prefix: "x-"}\n',
      );

      const projects = await discoverProjects([testRoot], 2);

      expect(projects.map((p) => p.name)).toEqual(["evil"]);
      const call = graphqlMock.mock.calls.find(
        ([opts]) =>
          (opts as { configPath: string }).configPath === join(testRoot, "evil", ".beans.yml"),
      );
      expect((call?.[0] as { beansPath?: string; root?: string } | undefined)?.beansPath).toBe(
        join(testRoot, "evil", ".beans"),
      );
      // root is threaded through so executor.ts's own live containment
      // re-check (assertDataPathStillContained) can run inside the
      // concurrency slot for this call too, the same as every other
      // runBeansGraphql caller.
      expect((call?.[0] as { root?: string } | undefined)?.root).toBe(testRoot);
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

  it("includes a project whose .beans directory is a symlink that stays inside the root, storing the resolved real path", async () => {
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
      // dataPath must be the *resolved* real-data directory, not the lexical
      // "proj/.beans" symlink path: caching the unresolved candidate here
      // would mean a later change to what "proj/.beans" points to redirects
      // every subsequent use of the cached dataPath, whereas the resolved
      // value keeps naming real-data regardless of what the symlink is
      // later repointed to.
      expect(projects[0]?.dataPath).toBe(join(testRoot, "real-data"));
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

  describe("bypass regression lock (round 1 parser bypasses)", () => {
    // Each config here was accepted by the round-1 parser as ".beans" (or,
    // for the block-scalar cases, as the literal indicator text) while the
    // real CLI actually resolved beans.path to ../OUTSIDE - confirmed
    // against the real binary (see the C4 report). Discovery must not be
    // fooled into treating these as safe defaults on faith: it must still
    // keep the project (parsing failure alone doesn't drop it) but force
    // every runBeansGraphql call for it onto the validated default via
    // --beans-path, never the config's own unreadable value.
    async function expectKeptWithDefaultBeansPath(
      testRootPrefix: string,
      configContent: string,
    ): Promise<void> {
      const executor = await import("../beans/executor.js");
      const graphqlMock = vi.spyOn(executor, "runBeansGraphql").mockResolvedValue({ beans: [] });

      const testRoot = mkdtempSync(join(tmpdir(), testRootPrefix));
      try {
        mkdirSync(join(testRoot, "evil"), { recursive: true });
        writeFileSync(join(testRoot, "evil", ".beans.yml"), configContent);

        const projects = await discoverProjects([testRoot], 2);

        expect(projects.map((p) => p.name)).toEqual(["evil"]);
        const call = graphqlMock.mock.calls.find(
          ([opts]) =>
            (opts as { configPath: string }).configPath === join(testRoot, "evil", ".beans.yml"),
        );
        expect((call?.[0] as { beansPath?: string } | undefined)?.beansPath).toBe(
          join(testRoot, "evil", ".beans"),
        );
      } finally {
        rmSync(testRoot, { recursive: true, force: true });
        graphqlMock.mockRestore();
      }
    }

    it("forces the default for an unquoted value on a following, more-indented line", async () => {
      await expectKeptWithDefaultBeansPath(
        "scan-bypass-multiline-",
        "beans:\n  path:\n    ../OUTSIDE\n  prefix: x-\n",
      );
    });

    it("forces the default for a quoted value on a following, more-indented line", async () => {
      await expectKeptWithDefaultBeansPath(
        "scan-bypass-multiline-quoted-",
        'beans:\n  path:\n    "../OUTSIDE"\n  prefix: x-\n',
      );
    });

    it("forces the default for a folded block scalar (>-)", async () => {
      await expectKeptWithDefaultBeansPath(
        "scan-bypass-folded-",
        "beans:\n  path: >-\n    ../OUTSIDE\n  prefix: x-\n",
      );
    });

    it("forces the default for a literal block scalar (|-)", async () => {
      await expectKeptWithDefaultBeansPath(
        "scan-bypass-literal-",
        "beans:\n  path: |-\n    ../OUTSIDE\n  prefix: x-\n",
      );
    });

    it("forces the default for a YAML alias referencing an anchor", async () => {
      await expectKeptWithDefaultBeansPath(
        "scan-bypass-alias-",
        "beans:\n  x: &a ../OUTSIDE\n  path: *a\n  prefix: x-\n",
      );
    });

    it("forces the default for a double-quoted value containing an escape sequence", async () => {
      await expectKeptWithDefaultBeansPath(
        "scan-bypass-escape-",
        'beans:\n  path: "..\\u002fOUTSIDE"\n  prefix: x-\n',
      );
    });
  });
});
