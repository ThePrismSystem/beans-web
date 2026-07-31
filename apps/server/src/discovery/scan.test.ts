import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertWithinRoot, findProjectDirs } from "./scan.js";

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
  it("returns projects sorted by name", async () => {
    const { discoverProjects } = await import("./scan.js");

    // Mock runBeansGraphql to avoid needing beans CLI
    const executor = await import("../beans/executor.js");
    const graphqlMock = vi
      .spyOn(executor, "runBeansGraphql")
      .mockResolvedValue({ beans: [] } as any);

    const testRoot = mkdtempSync(join(tmpdir(), "scan-ordering-"));
    try {
      const mk = (rel: string) => {
        mkdirSync(join(testRoot, rel), { recursive: true });
        writeFileSync(join(testRoot, rel, ".beans.yml"), "beans:\n  prefix: x-\n");
      };
      // Create in non-alphabetical creation order
      mk("zeta");
      mk("mid");
      mk("alpha");

      const projects = await discoverProjects(testRoot, 2);
      const names = projects.map((p) => p.name);

      // Verify each name is in sorted order relative to the next
      for (let i = 0; i < names.length - 1; i++) {
        expect(names[i]!.localeCompare(names[i + 1]!)).toBeLessThanOrEqual(0);
      }

      // Verify the exact sorted order
      expect(names).toEqual(["alpha", "mid", "zeta"]);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
      graphqlMock.mockRestore();
    }
  });
});
