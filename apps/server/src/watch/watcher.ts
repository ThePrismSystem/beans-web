import { EventEmitter } from "node:events";
import { join, sep } from "node:path";
import chokidar from "chokidar";
import type { Project, ServerEvent } from "@beans-frontend/shared";

export interface WatchLike extends EventEmitter {
  close(): Promise<void>;
}
export type WatchFactory = (paths: string[]) => WatchLike;

const defaultFactory: WatchFactory = (paths) =>
  chokidar.watch(paths, { ignoreInitial: true, depth: 0 });

export class BeansWatcher extends EventEmitter {
  private readonly watch: WatchLike;

  constructor(
    private readonly projects: Project[],
    factory: WatchFactory = defaultFactory,
  ) {
    super();
    this.watch = factory(projects.map((p) => join(p.path, ".beans")));
    for (const kind of ["add", "change", "unlink"] as const) {
      this.watch.on(kind, (path: string) => {
        const project = this.projectFor(path);
        if (project) this.emit("event", { project, kind } satisfies ServerEvent);
      });
    }
  }

  private projectFor(path: string): string | undefined {
    return this.projects.find((p) => path.startsWith(p.path + sep))?.name;
  }

  async close(): Promise<void> {
    await this.watch.close();
  }
}
