import { defineConfig } from "vitest/config"

/** Live integration tests (real 0G / Arkiv). Each suite skips itself when its credentials are absent. */
export default defineConfig({
  test: { include: ["tests/integration/**/*.test.ts"], environment: "node", testTimeout: 300_000 },
})
