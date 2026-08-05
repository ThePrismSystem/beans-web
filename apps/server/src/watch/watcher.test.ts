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
    const parent = { ...fakeProject("mono"), path: "/root/mono", dataPath: "/root/mono/.beans" };
    const child = {
      ...fakeProject("sub"),
      path: "/root/mono/sub",
      dataPath: "/root/mono/sub/.beans",
    };
    const watcher = new BeansWatcher([parent, child], () => fake);
    const events: unknown[] = [];
    watcher.on("event", (e) => events.push(e));

    fake.emit("change", "/root/mono/sub/.beans/x-1--foo.md");

    expect(events).toEqual([{ project: "sub", kind: "change" }]);
  });

  // A project can set beans.path in .beans.yml to a directory other than the
  // default .beans - including, via a symlink or an ancestor-relative path
  // like "../shared", one that resolves entirely outside project.path - in
  // which case discovery resolves and caches it on project.dataPath (see
  // discovery/scan.ts). The watcher must subscribe to that resolved
  // directory, not a hardcoded join(project.path, ".beans"), AND attribute
  // events under it back to the right project. dataPath here is deliberately
  // NOT nested under project.path ("/elsewhere/real-data" vs "/root/custom"),
  // the case that broke silently: matching on project.path alone (as
  // projectFor used to) cannot match an event path that never contains
  // project.path as a prefix at all.
  it("fires an SSE event for a change under a dataPath that is not nested under project.path", () => {
    const fake = new FakeWatch();
    const project = { ...fakeProject("custom"), dataPath: "/elsewhere/real-data" };
    let watchedPaths: string[] = [];
    const watcher = new BeansWatcher([project], (paths) => {
      watchedPaths = paths;
      return fake;
    });
    const events: unknown[] = [];
    watcher.on("event", (e) => events.push(e));

    expect(watchedPaths).toEqual(["/elsewhere/real-data"]);

    fake.emit("change", "/elsewhere/real-data/x-1--foo.md");
    expect(events).toEqual([{ project: "custom", kind: "change" }]);

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
