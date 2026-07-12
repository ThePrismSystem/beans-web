import { EventEmitter } from "node:events";
import { join, sep } from "node:path";
import chokidar from "chokidar";
import type { Project, ServerEvent } from "@beans-frontend/shared";

export interface WatchLike extends EventEmitter {
  add(paths: string | string[]): unknown;
  unwatch(paths: string | string[]): unknown;
  close(): Promise<void>;
}
export type WatchFactory = (paths: string[]) => WatchLike;

const defaultFactory: WatchFactory = (paths) =>
  chokidar.watch(paths, { ignoreInitial: true, depth: 0 });

function beansDir(project: Project): string {
  return join(project.path, ".beans");
}

export class BeansWatcher extends EventEmitter {
  private readonly watch: WatchLike;
  private projects: Project[];

  constructor(projects: Project[], factory: WatchFactory = defaultFactory) {
    super();
    // SSE clients each attach a listener; without an unbounded cap the 11th
    // concurrent client would trip the default MaxListeners warning.
    this.setMaxListeners(0);
    this.projects = projects;
    this.watch = factory(projects.map(beansDir));
    for (const kind of ["add", "change", "unlink"] as const) {
      this.watch.on(kind, (path: string) => {
        const project = this.projectFor(path);
        if (project) this.emit("event", { project, kind } satisfies ServerEvent);
      });
    }
  }

  /** Reconciles the watched project set, adding/removing `.beans` paths as needed. */
  setProjects(next: Project[]): void {
    const nextPaths = new Set(next.map(beansDir));
    const currentPaths = new Set(this.projects.map(beansDir));
    const toAdd = [...nextPaths].filter((p) => !currentPaths.has(p));
    const toRemove = [...currentPaths].filter((p) => !nextPaths.has(p));
    if (toAdd.length > 0) this.watch.add(toAdd);
    if (toRemove.length > 0) void this.watch.unwatch(toRemove);
    this.projects = next;
  }

  private projectFor(path: string): string | undefined {
    // Longest matching project path wins so events under a nested project
    // are not wrongly attributed to an ancestor project.
    let best: string | undefined;
    let bestLength = -1;
    for (const p of this.projects) {
      if (path.startsWith(p.path + sep) && p.path.length > bestLength) {
        best = p.name;
        bestLength = p.path.length;
      }
    }
    return best;
  }

  async close(): Promise<void> {
    await this.watch.close();
  }
}
