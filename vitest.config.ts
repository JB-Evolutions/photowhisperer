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
    include: ["src/**/__tests__/**/*.test.ts"],
    // Spread configDefaults.exclude so node_modules stays excluded, then add
    // the integration pattern so `vitest run` (the CI/build gate) is deterministic.
    exclude: [...configDefaults.exclude, "src/**/__tests__/**/*.integration.test.ts"],
  },
  resolve: sharedResolve,
});
