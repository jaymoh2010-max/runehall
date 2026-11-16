import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Avoid one fork per test file on high-core Windows machines; spawning
    // every file at once can exhaust process resources before tests run.
    maxWorkers: 4,
  },
});
