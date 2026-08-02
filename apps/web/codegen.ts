import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * `@graphql-codegen/cli` 7's ESM build passes the bare package name straight to
 * `import()`, so Node resolves it against the CLI's own file inside pnpm's store
 * instead of this workspace. The plugin is not a dependency of the CLI, so every
 * candidate name throws `ERR_MODULE_NOT_FOUND` — the one error code the loader
 * swallows — and codegen reports the plugin as missing while it is installed and
 * importable from here. Upstream marks that branch with its own FIXME.
 *
 * Resolving to an absolute path first and importing that keeps resolution
 * anchored to the project, which is what the CLI's CommonJS branch already does.
 */
const requireFromProject = createRequire(join(process.cwd(), "codegen-resolve-base.cjs"));
const pluginLoader = (name: string) => import(pathToFileURL(requireFromProject.resolve(name)).href);

const config: CodegenConfig = {
  schema: "./beans.schema.graphql",
  documents: ["../../packages/shared/src/graphql/operations.ts", "src/**/*.{ts,tsx}"],
  ignoreNoDocuments: true,
  pluginLoader,
  generates: {
    "src/api/generated.ts": {
      plugins: ["typescript-operations"],
      config: { scalars: { Time: "string", ID: "string" }, avoidOptionals: true },
    },
  },
};
export default config;
