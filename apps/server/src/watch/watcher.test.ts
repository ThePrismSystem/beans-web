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
  close = vi.fn(async () => undefined);
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
