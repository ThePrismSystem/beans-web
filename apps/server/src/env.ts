import { homedir } from "node:os";
import { resolve } from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    GIT_ROOT: z
      .string()
      .default(resolve(homedir(), "git"))
      .transform((value) =>
        value
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
          .map((p) => resolve(p)),
      ),
    SCAN_DEPTH: z.coerce.number().int().min(1).max(8).default(1),
    PORT: z.coerce.number().int().default(4780),
    HOST: z.string().default("127.0.0.1"),
    BEANS_BIN: z.string().default("beans"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
});
