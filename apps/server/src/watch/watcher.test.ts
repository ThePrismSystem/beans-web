import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { fakeProject } from "../testing/fixtures.js";

import { BeansWatcher } from "./watcher.js";

import type { WatchLike } from "./watcher.js";

class FakeWatch extends EventEmitter implements WatchLike {
  added: string[] = [];
  removed: string[] = [];
  add = vi.fn((paths: string | string[]) => {
    this.added.push(...(Array.isArray(paths) ? paths : [paths]));
  });
  unwatch = vi.fn((paths: string | string[]) => {
    this.removed.push(...(Array.isArray(paths) ? paths : [paths]));
  });
  close = vi.fn(() => Promise.resolve(undefined));
}

describe("BeansWatcher", () => {
  it("maps a changed file under a project's .beans dir to a ServerEvent", () => {
    const fake = new FakeWatch();
    const watcher = new BeansWatcher([fakeProject("a")], () => fake);
    const events: unknown[] = [];
    watcher.on("event", (e) => events.push(e));

    fake.emit("change", "/root/a/.beans/x-1--foo.md");

    expect(events).toEqual([{ project: "a", kind: "change" }]);
  });

  it("maps add and unlink events under a project's .beans dir", () => {
    const fake = new FakeWatch();
    const watcher = new BeansWatcher([fakeProject("a")], () => fake);
    const events: unknown[] = [];
    watcher.on("event", (e) => events.push(e));

    fake.emit("add", "/root/a/.beans/x-2--bar.md");
    fake.emit("unlink", "/root/a/.beans/x-1--foo.md");

    expect(events).toEqual([
      { project: "a", kind: "add" },
      { project: "a", kind: "unlink" },
    ]);
  });

  it("ignores a path that is not under any project", () => {
    const fake = new FakeWatch();
    const watcher = new BeansWatcher([fakeProject("a")], () => fake);
    const events: unknown[] = [];
    watcher.on("event", (e) => events.push(e));

    fake.emit("change", "/root/other-project/.beans/x-1--foo.md");

    expect(events).toEqual([]);
  });

  it("attributes a nested project's file to the deepest matching project", () => {
    const fake = new FakeWatch();
    const parent = { ...fakeProject("mono"), path: "/root/mono" };
    const child = { ...fakeProject("sub"), path: "/root/mono/sub" };
    const watcher = new BeansWatcher([parent, child], () => fake);
    const events: unknown[] = [];
    watcher.on("event", (e) => events.push(e));

    fake.emit("change", "/root/mono/sub/.beans/x-1--foo.md");

    expect(events).toEqual([{ project: "sub", kind: "change" }]);
  });

  // A project can set beans.path in .beans.yml to a directory other than the
  // default .beans, in which case discovery resolves and caches it on
  // project.dataPath (see discovery/scan.ts). The watcher must subscribe to
  // that resolved directory, not a hardcoded join(project.path, ".beans"), or
  // SSE silently never fires for such a project.
  it("subscribes to project.dataPath rather than a hardcoded .beans, so a custom beans.path fires SSE", () => {
    const fake = new FakeWatch();
    const project = { ...fakeProject("custom"), dataPath: "/root/custom/data" };
    let watchedPaths: string[] = [];
    const watcher = new BeansWatcher([project], (paths) => {
      watchedPaths = paths;
      return fake;
    });

    expect(watchedPaths).toEqual(["/root/custom/data"]);

    watcher.setProjects([project, fakeProject("other")]);
    expect(fake.added).toEqual(["/root/other/.beans"]);
  });

  it("reconciles watched paths on setProjects()", () => {
    const fake = new FakeWatch();
    const watcher = new BeansWatcher([fakeProject("a")], () => fake);

    watcher.setProjects([fakeProject("a"), fakeProject("b")]);
    expect(fake.added).toEqual(["/root/b/.beans"]);
    expect(fake.removed).toEqual([]);

    watcher.setProjects([fakeProject("b")]);
    expect(fake.removed).toEqual(["/root/a/.beans"]);

    const events: unknown[] = [];
    watcher.on("event", (e) => events.push(e));
    fake.emit("change", "/root/b/.beans/x-1--foo.md");
    expect(events).toEqual([{ project: "b", kind: "change" }]);
  });

  it("closes the underlying watcher on close()", async () => {
    const fake = new FakeWatch();
    const watcher = new BeansWatcher([fakeProject("a")], () => fake);

    await watcher.close();

    expect(fake.close).toHaveBeenCalledTimes(1);
  });
});
