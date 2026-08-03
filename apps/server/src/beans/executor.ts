import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { env } from "../env.js";
import { withBeansSlot } from "../util/concurrency.js";

const execFileAsync = promisify(execFile);

/**
 * Hard ceiling on a single `beans` invocation. Without it a child that blocks
 * (e.g. one left waiting on stdin) would never be reaped, tying up a process
 * slot indefinitely; on timeout the child is killed and the call rejects.
 */
export const BEANS_EXEC_TIMEOUT_MS = 15_000;

/** Hard ceiling on a single `beans` invocation's combined stdout/stderr size. */
const MAX_STDOUT_BYTES = 33_554_432; // 32 MiB

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
  query: string;
  variables?: Record<string, unknown>;
  binPath?: string;
}

export function buildBeansArgs(opts: RunOpts): string[] {
  const args = ["graphql", "--json", "--config", opts.configPath];
  if (opts.variables) args.push("-v", JSON.stringify(opts.variables));
  // "--" ends beans' option parsing: everything after it is a positional, so a
  // query that starts with "-" (e.g. "--beans-path=/etc") can never be
  // reinterpreted as a beans flag and used to escape the configured jail.
  args.push("--", opts.query);
  return args;
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
  const bin = opts.binPath ?? env.BEANS_BIN;
  // Every caller — the graphql route, search, analytics, discovery — reaches a
  // `beans` child through here, so gating at this one point bounds the whole
  // server. Doing it at the call sites would leave the graphql route unbounded.
  return withBeansSlot(async () => {
    try {
      const { stdout } = await execFileAsync(bin, buildBeansArgs(opts), {
        maxBuffer: MAX_STDOUT_BYTES,
        timeout: BEANS_EXEC_TIMEOUT_MS,
        killSignal: "SIGKILL",
      });
      return parseBeansResult(stdout);
    } catch (err) {
      if (err instanceof BeansError) throw err;
      throw new BeansError(extractBeansErrorMessage(err));
    }
  });
}
