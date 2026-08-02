import eslintCommentsPlugin from "@eslint-community/eslint-plugin-eslint-comments/configs";
import eslintConfigPrettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import-x";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import reactRefreshPlugin from "eslint-plugin-react-refresh";
import unicornPlugin from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

// apps/server + packages/shared use the typescript-node ruleset;
// apps/web uses the typescript-react ruleset.
const NODE_FILES = ["apps/server/**/*.ts", "packages/shared/**/*.ts"];
const REACT_FILES = ["apps/web/**/*.{ts,tsx}"];

const NODE_TEST_FILES = [
  "apps/server/**/*.test.ts",
  "apps/server/**/*.spec.ts",
  "apps/server/**/*.integration.test.ts",
  "apps/server/**/*.integration.spec.ts",
  "apps/server/**/__tests__/**/*.ts",
  "packages/shared/**/*.test.ts",
  "packages/shared/**/*.spec.ts",
  "packages/shared/**/__tests__/**/*.ts",
];
const REACT_TEST_FILES = [
  "apps/web/**/*.test.{ts,tsx}",
  "apps/web/**/*.spec.{ts,tsx}",
  "apps/web/**/__tests__/**/*.{ts,tsx}",
];

const MAGIC_NUMBERS_OFF = { "@typescript-eslint/no-magic-numbers": "off" };
const RELAXED_TEST_RULES = {
  "@typescript-eslint/no-unsafe-assignment": "off",
  "@typescript-eslint/no-unsafe-member-access": "off",
  "@typescript-eslint/ban-ts-comment": [
    "error",
    {
      "ts-ignore": true,
      "ts-expect-error": "allow-with-description",
      minimumDescriptionLength: 10,
    },
  ],
};

const sharedRules = {
  // Ban all eslint-disable comments — fix the violation, don't suppress it
  "@eslint-community/eslint-comments/no-use": "error",

  // No `as any`
  "@typescript-eslint/no-explicit-any": "error",

  // No `as unknown as T`
  "no-restricted-syntax": [
    "error",
    {
      selector: "TSAsExpression > TSAsExpression[typeAnnotation.type='TSUnknownKeyword']",
      message:
        "Force-casting via 'as unknown as Type' is forbidden. Fix the underlying type mismatch instead.",
    },
    {
      selector: "TSTypeAssertion > TSTypeAssertion[typeAnnotation.type='TSUnknownKeyword']",
      message:
        "Force-casting via '<Type><unknown>' is forbidden. Fix the underlying type mismatch instead.",
    },
  ],

  // No @ts-ignore or @ts-expect-error
  "@typescript-eslint/ban-ts-comment": [
    "error",
    {
      "ts-ignore": true,
      "ts-expect-error": true,
    },
  ],

  // No non-null assertion
  "@typescript-eslint/no-non-null-assertion": "error",

  // No var
  "no-var": "error",

  // No floating promises
  "@typescript-eslint/no-floating-promises": "error",

  // No swallowed errors
  "no-empty": "error",

  // No console.log in production
  "no-console": ["error", { allow: ["info", "warn", "error"] }],

  // Exhaustive switch
  "@typescript-eslint/switch-exhaustiveness-check": "error",

  // Import organization
  "import-x/order": [
    "error",
    {
      groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
      "newlines-between": "always",
      alphabetize: { order: "asc", caseInsensitive: true },
    },
  ],

  // No unnecessary conditions
  "@typescript-eslint/no-unnecessary-condition": "error",

  // Prefer nullish coalescing
  "@typescript-eslint/prefer-nullish-coalescing": "error",

  // Prefer optional chain
  "@typescript-eslint/prefer-optional-chain": "error",

  // No misused promises
  "@typescript-eslint/no-misused-promises": "error",

  // Require await
  "@typescript-eslint/require-await": "error",

  // Strict equality
  eqeqeq: "error",

  // Curly braces required
  curly: "error",
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/vitest.config.ts",
      "**/vite.config.ts",
      "**/test-setup.ts",
    ],
  },

  // --- apps/server + packages/shared (typescript-node ruleset) ---
  {
    files: NODE_FILES,
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      "import-x": importPlugin,
      unicorn: unicornPlugin,
    },
    rules: {
      ...sharedRules,
      // Explicit return types on exports
      "@typescript-eslint/explicit-module-boundary-types": "error",

      // No magic numbers
      "@typescript-eslint/no-magic-numbers": [
        "warn",
        {
          ignore: [0, 1, 2, -1],
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],
    },
  },
  {
    files: NODE_TEST_FILES,
    rules: { ...MAGIC_NUMBERS_OFF, ...RELAXED_TEST_RULES },
  },
  {
    files: ["apps/server/**/*.constants.ts", "packages/shared/**/*.constants.ts"],
    rules: MAGIC_NUMBERS_OFF,
  },

  // --- apps/web (typescript-react ruleset) ---
  {
    files: REACT_FILES,
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ["./apps/web/tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "import-x": importPlugin,
      unicorn: unicornPlugin,
      "react-hooks": reactHooksPlugin,
      "react-refresh": reactRefreshPlugin,
    },
    rules: {
      ...sharedRules,
      // Disabled for React — impractical for JSX components
      "@typescript-eslint/explicit-module-boundary-types": "off",

      // Disabled for React — too noisy in UI code
      "@typescript-eslint/no-magic-numbers": "off",

      // React hooks rules
      ...reactHooksPlugin.configs.recommended.rules,

      // React refresh — only export components
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: REACT_TEST_FILES,
    rules: RELAXED_TEST_RULES,
  },

  // --- non-typed files (config scripts, declaration files) ---
  {
    files: ["**/*.js", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
  {
    files: ["**/*.d.ts"],
    ...tseslint.configs.disableTypeChecked,
  },

  eslintCommentsPlugin.recommended,
  eslintConfigPrettier,
);
