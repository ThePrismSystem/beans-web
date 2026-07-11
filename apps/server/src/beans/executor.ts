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
  errors?: { message: string }[];
}

export function parseBeansResult(stdout: string): unknown {
  const parsed = JSON.parse(stdout) as GraphqlResponse;
  if (parsed.errors?.length) {
    const messages = parsed.errors.map((e) => e.message);
    throw new BeansError(messages.join("; "), messages);
  }
  // The real `beans graphql --json` binary prints the query result directly
  // (no `{"data": ...}` envelope) on success. Support both shapes.
  return "data" in parsed ? parsed.data : parsed;
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
    const message = err instanceof Error ? err.message : String(err);
    throw new BeansError(`beans invocation failed: ${message}`);
  }
}
