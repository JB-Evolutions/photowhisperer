import { defineConfig, configDefaults } from "vitest/config";
import { sharedTest, sharedResolve } from "./vitest.config";

// Runs only LLM-variance integration tests. Not the CI/build gate — expected
// to be flaky due to model output variance. Run via `pnpm test:integration`.
export default defineConfig({
  test: {
    ...sharedTest,
    include: ["src/**/__tests__/**/*.integration.test.ts"],
    // Only standard excludes — no integration exclusion — so these files are collected.
    exclude: [...configDefaults.exclude],
  },
  resolve: sharedResolve,
});
