import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../env.js";

const execFileAsync = promisify(execFile);

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
  args.push(opts.query);
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

function extractBeansErrorMessage(err: unknown): string {
  const e = err as { stderr?: unknown; message?: unknown };
  const stderr = typeof e.stderr === "string" ? e.stderr : "";
  const match = ERROR_LINE.exec(stderr);
  if (match?.[1]) return match[1];
  if (typeof e.message === "string") return e.message;
  return String(err);
}

export async function runBeansGraphql(opts: RunOpts): Promise<unknown> {
  const bin = opts.binPath ?? env.BEANS_BIN;
  try {
    const { stdout } = await execFileAsync(bin, buildBeansArgs(opts), {
      maxBuffer: 32 * 1024 * 1024,
    });
    return parseBeansResult(stdout);
  } catch (err) {
    if (err instanceof BeansError) throw err;
    throw new BeansError(extractBeansErrorMessage(err));
  }
}
