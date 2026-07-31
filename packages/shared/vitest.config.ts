import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    passWithNoTests: true,
    globals: false,
    restoreMocks: true,
    testTimeout: 5000,
    hookTimeout: 10000,
    reporters: ["default", "junit"],
    outputFile: { junit: "./test-report.junit.xml" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.integration.test.ts",
        "**/*.integration.spec.ts",
        "**/__tests__/**",
        "**/*.d.ts",
      ],
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
