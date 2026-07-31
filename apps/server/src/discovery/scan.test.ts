import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertWithinRoot, discoverProjects, findProjectDirs } from "./scan.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();

  return {
    ...actual,
    readdir: vi.fn(async (dir: string, options?: any) => {
      // For the ordering test root, return mocked directory entries in non-alphabetical order
      // Check if this is the root directory by seeing if it ends with the temp dir prefix
      if (
        typeof dir === "string" &&
        dir.includes("scan-ordering-") &&
        !dir.endsWith("/zeta") &&
        !dir.endsWith("/mid") &&
        !dir.endsWith("/alpha") &&
        options?.withFileTypes
      ) {
        return [
          {
            name: "zeta",
            isDirectory: () => true,
            isFile: () => false,
            isSymbolicLink: () => false,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isFIFO: () => false,
            isSocket: () => false,
          },
          {
            name: "mid",
            isDirectory: () => true,
            isFile: () => false,
            isSymbolicLink: () => false,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isFIFO: () => false,
            isSocket: () => false,
          },
          {
            name: "alpha",
            isDirectory: () => true,
            isFile: () => false,
            isSymbolicLink: () => false,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isFIFO: () => false,
            isSocket: () => false,
          },
        ] as any;
      }
      // For subdirectories in the ordering test (zeta/, mid/, alpha/), return .beans.yml
      if (
        typeof dir === "string" &&
        dir.includes("scan-ordering-") &&
        (dir.endsWith("/zeta") || dir.endsWith("/mid") || dir.endsWith("/alpha")) &&
        options?.withFileTypes
      ) {
        return [
          {
            name: ".beans.yml",
            isDirectory: () => false,
            isFile: () => true,
            isSymbolicLink: () => false,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isFIFO: () => false,
            isSocket: () => false,
          },
        ] as any;
      }
      // For all other calls, use the real readdir
      return actual.readdir(dir, options);
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
});
