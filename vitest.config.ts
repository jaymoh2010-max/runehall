import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Reading and validating the full compendium can take several seconds on
    // slower disks; the old 5s default produced flaky timeouts.
    testTimeout: 20_000,
    // Avoid one fork per test file on high-core Windows machines; spawning
    // every file at once can exhaust process resources before tests run.
    maxWorkers: 4,
  },
});
