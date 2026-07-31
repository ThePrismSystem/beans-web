import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
    passWithNoTests: true,
    globals: false,
    restoreMocks: true,
    testTimeout: 5000,
    hookTimeout: 10000,
    reporters: ["default", "junit"],
    outputFile: { junit: "./test-report.junit.xml" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "**/__tests__/**",
        "**/*.d.ts",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/test-setup.ts",
        "src/router.tsx", // route tree + lazy-load wiring, exercised at runtime, not unit-testable
      ],
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
