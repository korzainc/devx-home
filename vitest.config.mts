import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest does not read tsconfig paths, so the `@/` alias has to be repeated here. Only what the
// tests import is aliased, which is the same root tsconfig.json points at.
//
// Component tests get jsdom, everything else stays in node. Per-file rather than global because
// a DOM is only needed by the handful of files that render, and booting one for the data and
// logic suites would slow every run for nothing. A file opts in with the docblock pragma
// `@vitest-environment jsdom`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Agent worktrees live under .claude/worktrees and carry their own copy of every test,
    // which vitest otherwise collects alongside a second React and fails on.
    exclude: ["**/node_modules/**", "**/.git/**", "**/.claude/**"],
    environment: "node",
    globals: false,
  },
});
