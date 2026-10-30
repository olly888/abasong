import { defineConfig } from "vitest/config";
// Build output must never be rediscovered as a second CommonJS test suite.
export default defineConfig({
  test: {
    include: [
      "apps/**/src/**/*.test.{ts,tsx}",
      "packages/**/src/**/*.test.{ts,tsx}",
      "scripts/**/*.test.ts",
    ],
  },
});
