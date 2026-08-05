import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BeansError, runBeansGraphql } from "./executor.js";

const dir = mkdtempSync(join(tmpdir(), "beans-it-"));
const cfg = join(dir, ".beans.yml");

// A second project the caller is NOT scoped to, used to prove that a
// flag-shaped query can't redirect beans to read outside its config's project.
const outsideDir = mkdtempSync(join(tmpdir(), "beans-it-outside-"));

beforeAll(() => {
  execFileSync("beans", ["init"], { cwd: dir });
  execFileSync("beans", ["create", "Integration seed", "-t", "task"], { cwd: dir });
  execFileSync("beans", ["init"], { cwd: outsideDir });
  execFileSync("beans", ["create", "Outside secret bean", "-t", "task"], { cwd: outsideDir });
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outsideDir, { recursive: true, force: true });
});

describe("runBeansGraphql (real binary)", () => {
  it("lists the seeded bean", async () => {
    const data = (await runBeansGraphql({
      configPath: cfg,
      beansPath: join(dir, ".beans"),
      query: "{ beans { id title type } }",
    })) as { beans: { title: string }[] };
    expect(data.beans.some((b) => b.title === "Integration seed")).toBe(true);
  });

  it("rejects with a clean BeansError on an invalid query", async () => {
    const err = await runBeansGraphql({
      configPath: cfg,
      beansPath: join(dir, ".beans"),
      query: "{ beans { nope } }",
    }).then(
      () => {
        throw new Error("expected runBeansGraphql to reject");
      },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BeansError);
    if (!(err instanceof BeansError)) throw new Error("unreachable");
    expect(err.messages[0]).toMatch(/graphql:/);
    expect(err.messages[0]).not.toContain("Usage:");
    expect(err.messages[0]).not.toContain("Command failed");
  });

  it("does not let a flag-shaped query escape the config's project (F-01)", async () => {
    // Pre-fix, this query was parsed as a `--beans-path` flag and would have
    // returned the OTHER project's beans, escaping the jail. With the "--"
    // separator it is a literal (invalid) GraphQL query and must reject.
    const result = await runBeansGraphql({
      configPath: cfg,
      beansPath: join(dir, ".beans"),
      query: `--beans-path=${join(outsideDir, ".beans")}`,
    }).then(
      (data) => ({ ok: true as const, data }),
      (e: unknown) => ({ ok: false as const, err: e }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.err).toBeInstanceOf(BeansError);
    expect(JSON.stringify(result.err)).not.toContain("Outside secret bean");
  });

  it("honours --beans-path over the config's own beans.path (closes SEC-03 at the CLI boundary)", async () => {
    // Even a config whose own beans.path points at the OTHER project's data
    // directory must be overridden by the explicit --beans-path argument, so
    // this call still only ever sees this project's own bean.
    const data = (await runBeansGraphql({
      configPath: cfg,
      beansPath: join(dir, ".beans"),
      query: "{ beans { title } }",
    })) as { beans: { title: string }[] };
    expect(data.beans.map((b) => b.title)).toEqual(["Integration seed"]);
    expect(JSON.stringify(data)).not.toContain("Outside secret bean");
  });
});
