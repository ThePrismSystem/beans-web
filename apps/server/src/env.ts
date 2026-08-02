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
      )
      .refine((roots) => roots.length > 0, {
        message: "GIT_ROOT must contain at least one path",
      }),
    SCAN_DEPTH: z.coerce.number().int().min(1).max(8).default(1),
    PORT: z.coerce.number().int().default(4780),
    HOST: z.string().default("127.0.0.1"),
    BEANS_BIN: z.string().default("beans"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // Opt-in: only an operator who knows a proxy is the only way in may let
    // `X-Forwarded-*` decide the origin the cross-origin guard compares against.
    // Enumerated rather than coerced so a typo fails at boot instead of silently
    // leaving every write behind a proxy rejected.
    TRUST_PROXY: z
      .enum(["true", "false", "1", "0"])
      .default("false")
      .transform((value) => value === "true" || value === "1"),
  },
  runtimeEnv: process.env,
});
