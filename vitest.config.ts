import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";

// Shared across unit and integration configs — import from here to avoid drift.
export const sharedTest = {
  globals: true,
  environment: "node" as const,
  setupFiles: ["./vitest.setup.ts"],
};

export const sharedResolve = {
  alias: { "@": path.resolve(__dirname, "./src") },
};

export default defineConfig({
  test: {
    ...sharedTest,
    // One config for the whole deterministic suite. src/ is the app's own unit
    // tests; tests/eval/ is the exposure harness's mode-1 ladder; and
    // scripts/corpus/ is the corpus ingest and validation tooling. All three
    // are offline and deterministic. The harness's mode 2 calls the model and
    // is never collected here.
    include: [
      "src/**/__tests__/**/*.test.{ts,tsx}",
      "tests/eval/**/*.test.ts",
      "scripts/corpus/__tests__/**/*.test.ts",
    ],
    // Spread configDefaults.exclude so node_modules stays excluded, then add
    // the integration pattern so `vitest run` (the CI/build gate) is deterministic.
    exclude: [...configDefaults.exclude, "src/**/__tests__/**/*.integration.test.{ts,tsx}"],
  },
  resolve: sharedResolve,
});
