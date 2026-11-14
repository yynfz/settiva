import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include:
      process.env.SETTIVA_TEST_ASSET === "test-token"
        ? ["tests/fallback.http.test.ts"]
        : ["tests/*.test.ts"],
    exclude:
      process.env.SETTIVA_TEST_ASSET === "test-token"
        ? []
        : ["tests/fallback.http.test.ts", "**/node_modules/**", "**/.git/**"],
    globalSetup: ["./tests/support/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
