import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { fakeProject } from "../testing/fixtures.js";
import { BeansWatcher } from "./watcher.js";
import type { WatchLike } from "./watcher.js";

class FakeWatch extends EventEmitter implements WatchLike {
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

  it("closes the underlying watcher on close()", async () => {
    const fake = new FakeWatch();
    const watcher = new BeansWatcher([fakeProject("a")], () => fake);

    await watcher.close();

    expect(fake.close).toHaveBeenCalledTimes(1);
  });
});
