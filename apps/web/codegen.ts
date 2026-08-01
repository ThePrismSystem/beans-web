import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./beans.schema.graphql",
  documents: ["../../packages/shared/src/graphql/operations.ts", "src/**/*.{ts,tsx}"],
  ignoreNoDocuments: true,
  generates: {
    "src/api/generated.ts": {
      plugins: ["typescript-operations"],
      config: { scalars: { Time: "string", ID: "string" }, avoidOptionals: true },
    },
  },
};
export default config;
