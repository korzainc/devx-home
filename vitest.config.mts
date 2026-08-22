import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest does not read tsconfig paths, so the `@/` alias has to be repeated here. Only what the
// tests import is aliased, which is the same root tsconfig.json points at.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
