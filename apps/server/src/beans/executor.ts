import { spawn } from "node:child_process";

import { env } from "../env.js";
import { withBeansSlot } from "../util/concurrency.js";
import { assertDataPathStillContained } from "../util/containment.js";

/**
 * Hard ceiling on a single `beans` invocation. Without it a child that blocks
 * (e.g. one left waiting on stdin) would never be reaped, tying up a process
 * slot indefinitely; on timeout the child is killed and the call rejects.
 */
export const BEANS_EXEC_TIMEOUT_MS = 15_000;

/**
 * Hard ceiling on a single `beans` invocation's combined stdout/stderr size,
 * enforced by `spawnBeans` below. Exported so its test asserts the real bound
 * rather than a second copy of the number.
 */
export const MAX_BEANS_OUTPUT_BYTES = 33_554_432; // 32 MiB

export class BeansError extends Error {
  constructor(
    message: string,
    readonly messages: string[] = [message],
  ) {
    super(message);
    this.name = "BeansError";
  }
}

export interface RunOpts {
  configPath: string;
  /**
   * The project's configured root. Not passed to the CLI itself - used only
   * to re-validate `beansPath`'s containment immediately before this call
   * spawns a `beans` child (see `assertDataPathStillContained` in
   * `util/containment.ts`).
   */
  root: string;
  /**
   * The project's data directory, already resolved and contained by the
   * caller (see `resolveContainedDataPath` in `discovery/scan.ts`). Passed as
   * `--beans-path`, which the CLI honours over whatever `beans.path` says in
   * the config at `configPath` — so a hostile or unparseable `beans.path` in
   * that file can no longer redirect where this call actually reads or
   * writes, regardless of what the config file says at the moment the CLI
   * runs. Required, not optional: every call site must supply an
   * already-validated value rather than let the CLI fall back to consulting
   * the config itself.
   */
  beansPath: string;
  query: string;
  variables?: Record<string, unknown>;
  binPath?: string;
  /**
   * Abandons the call if it is still queued for a slot when this aborts. It is
   * deliberately not forwarded to the child process: a `beans` mutation killed
   * mid-write could leave a bean file truncated, and a client hanging up is not
   * a reason to risk that.
   */
  signal?: AbortSignal;
}

/**
 * The child's argv. The query is deliberately absent: `spawnBeans` writes it
 * to the child's stdin instead, so it never appears in `/proc/<pid>/cmdline`
 * for any local account to read while the request is in flight (SEC-06).
 *
 * That also retires the `--` separator this list used to end with. `--` was
 * there so a flag-shaped query (`--beans-path=/etc`) stayed a positional and
 * could not be reinterpreted as a beans flag; with no positional left at all,
 * there is nothing for the CLI to reinterpret. The remaining client-controlled
 * value is `-v`'s, which is `JSON.stringify` output and is consumed as that
 * flag's argument regardless of its contents.
 *
 * `opts.variables` stays on argv because `beans graphql` v0.4.2 offers no way
 * to pass it anywhere else — `-v` takes a literal JSON string and its decoder
 * rejects `-`, `@file` and a bare path alike. See `docs/SECURITY.md` for what
 * that leaves exposed.
 */
export function buildBeansArgs(opts: RunOpts): string[] {
  const args = ["graphql", "--json", "--config", opts.configPath, "--beans-path", opts.beansPath];
  if (opts.variables) args.push("-v", JSON.stringify(opts.variables));
  return args;
}

/**
 * Runs one `beans` child with `query` on its stdin and resolves its stdout.
 *
 * This was `promisify(execFile)`, which supplied a timeout and an output cap
 * for free. `spawn` is used instead because it is the only way to give the
 * child a stdin, and it supplies neither, so both are reimplemented here.
 */
function spawnBeans(bin: string, args: string[], query: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let bytes = 0;

    // Kills the child and settles. The pipes are destroyed, not merely
    // detached, and that distinction is the whole point: SIGKILL closes the
    // child's own ends, but a descendant it left behind (beans links
    // os/exec) inherits them, so the write ends can outlive the child.
    // Dropping our `data` listeners would stop this process accumulating the
    // output but would leave the read ends open and ref'd, and the event loop
    // would then never drain - `execFile`'s own kill path called `destroy()`
    // for exactly this reason. Destroying releases the handles and stops
    // delivery, so it covers both the leak and the heap. Also idempotent, so
    // a second call is a no-op rather than a second signal at a corpse.
    function abort(reason: Error): void {
      clearTimeout(timer);
      child.stdout.destroy();
      child.stderr.destroy();
      child.kill("SIGKILL");
      reject(reason);
    }

    const timer = setTimeout(() => {
      abort(new Error(`beans timed out after ${String(BEANS_EXEC_TIMEOUT_MS)}ms`));
    }, BEANS_EXEC_TIMEOUT_MS);

    const collect =
      (into: Buffer[]) =>
      (chunk: Buffer): void => {
        bytes += chunk.length;
        if (bytes > MAX_BEANS_OUTPUT_BYTES) {
          abort(new Error(`beans output exceeded ${String(MAX_BEANS_OUTPUT_BYTES)} bytes`));
          return;
        }
        into.push(chunk);
      };
    // Byte counting, not character counting: the cap is a memory bound, and a
    // decoded chunk's `length` is UTF-16 units. Decoding is deferred to the
    // end for the same reason it is left to Buffer.concat — a multi-byte rune
    // split across two chunks would otherwise decode to replacement
    // characters.
    child.stdout.on("data", collect(outChunks));
    child.stderr.on("data", collect(errChunks));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(outChunks).toString("utf8"));
        return;
      }
      // extractBeansErrorMessage prefers an "Error:" line in stderr and falls
      // back to `message`, so both are populated here. Deliberately not
      // execFile's "Command failed: <argv>\n<stderr>": that put the whole
      // command line, `-v` argument included, into an error a client is shown.
      const stderr = Buffer.concat(errChunks).toString("utf8");
      const trimmed = stderr.trim();
      const message =
        trimmed === "" ? `beans exited (code ${String(code)}, signal ${String(signal)})` : trimmed;
      reject(Object.assign(new Error(message), { stderr }));
    });

    // A child that exits before draining its stdin makes this pipe emit
    // EPIPE. Its own exit code and stderr are the failure worth reporting, so
    // that is swallowed rather than left to become an 'error' event on a
    // stream with no listener, which would crash the process.
    child.stdin.on("error", () => {
      // deliberately ignored; see above
    });
    child.stdin.end(query);
  });
}

interface GraphqlResponse {
  data?: unknown;
}

export function parseBeansResult(stdout: string): unknown {
  const parsed = JSON.parse(stdout) as GraphqlResponse;
  // The real `beans graphql --json` binary prints the query result directly
  // (no `{"data": ...}` envelope) on success. Unwrap defensively if present.
  return "data" in parsed ? parsed.data : parsed;
}

const ERROR_LINE = /^Error:\s*(.*)$/m;

/**
 * A `/`-rooted run of non-space, non-colon characters, anchored so a match
 * can begin at the start of the message, after whitespace, after an opening
 * quote or bracket (`"`, `'`, `(`, `[`, `{`), or after a colon. The colon
 * case needs its own guard: `(?!\/\/[^/\s])` rules out starting a match at
 * the first `/` of a `scheme://host` URL — exactly two slashes followed by a
 * non-slash host character — so `http://host/a/b` stays intact, while still
 * letting `error:/local/path` (one slash) and `file:///local/path` (three
 * slashes, the empty-authority form) redact. Excluding `:` from the content
 * class also stops a match before the delimiter in `…/broken.md: parsing
 * front matter`. The trailing `+` (not `*`) requires at least one content
 * character after the leading `/`, so a bare slash in prose (`true / false`,
 * `cannot write to /`) never matches — the old `*` let it capture zero
 * characters and get deleted.
 */
const ABSOLUTE_PATH = /(?<=^|[\s"'(\[{:])(?!\/\/[^/\s])\/[^\s:]+/g;

/**
 * Reduces absolute paths in a `beans` error to their basenames. The CLI names
 * the file it failed on by full path, which would hand a client the OS
 * username and the real location of GIT_ROOT — the same disclosure that was
 * removed from `/api/projects`. The basename is kept because, alongside the
 * project name callers already log, it is enough to find the file. Trailing
 * slashes are trimmed before the basename is taken, so `/a/b/` reduces to
 * `b` rather than an empty string. A run of only slashes (`//`, `///`) is
 * punctuation, not a path — trimming trailing slashes from it empties the
 * string, and slicing an empty string would otherwise delete the run from
 * the message, so that case is passed through unchanged instead.
 *
 * A path containing a space is only redacted up to that space: the segment
 * before it is reduced to a basename, but the space itself isn't part of the
 * match, so everything from the space onward — the rest of the username and
 * any remaining directory structure — passes through unredacted
 * (`/home/alice smith/proj/x.md` becomes `alice smith/proj/x.md`, the same
 * disclosure this function exists to prevent, for a macOS-style
 * `/Users/Alice Smith/` home directory). Handling that structurally would
 * mean parsing balanced quoted or escaped segments; `beans` never emits
 * space-containing paths in practice, so this was accepted rather than
 * built for.
 */
export function redactPaths(message: string): string {
  return message.replace(ABSOLUTE_PATH, (path) => {
    const trimmed = path.replace(/\/+$/, "");
    if (trimmed === "") return path;
    return trimmed.slice(trimmed.lastIndexOf("/") + 1);
  });
}

function extractBeansErrorMessage(err: unknown): string {
  const e = err as { stderr?: unknown; message?: unknown };
  const stderr = typeof e.stderr === "string" ? e.stderr : "";
  const match = ERROR_LINE.exec(stderr);
  if (match?.[1]) return redactPaths(match[1]);
  if (typeof e.message === "string") return redactPaths(e.message);
  return redactPaths(String(err));
}

export async function runBeansGraphql(opts: RunOpts): Promise<unknown> {
  // An empty --beans-path is not "no override" - the CLI treats it as absent
  // and falls back to reading beans.path from the config file at configPath,
  // which is exactly the trust this scheme exists to remove. beansPath is
  // documented as required, and every caller currently derives it from
  // resolve(), which never returns "", but that's an invariant this function
  // asserts rather than one callers are trusted to uphold. Checked here,
  // before withBeansSlot is even entered, so it (a) throws a plain Error,
  // not the BeansError the catch below produces - this is a caller bug, not
  // something to show a client as a query error - and (b) never claims a
  // concurrency slot for a call that is guaranteed to fail.
  if (opts.beansPath === "") {
    throw new Error("beansPath must not be empty");
  }
  const bin = opts.binPath ?? env.BEANS_BIN;
  // Every caller — the graphql route, search, analytics, discovery — reaches a
  // `beans` child through here, so gating at this one point bounds the whole
  // server. Doing it at the call sites would leave the graphql route unbounded.
  return withBeansSlot(async () => {
    // Re-validated here, inside the slot, rather than by each caller before
    // queueing for one: with the pool full, this call can wait behind up to
    // BEANS_CONCURRENCY-1 other children - seconds, not milliseconds, under
    // load - so a check made before the queue would leave that whole wait
    // unguarded. See assertDataPathStillContained for what checking here,
    // right before the spawn, narrows the window to.
    await assertDataPathStillContained(opts.root, opts.beansPath);
    try {
      const stdout = await spawnBeans(bin, buildBeansArgs(opts), opts.query);
      return parseBeansResult(stdout);
    } catch (err) {
      if (err instanceof BeansError) throw err;
      throw new BeansError(extractBeansErrorMessage(err));
    }
  }, opts.signal);
}
