import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapCommand } from "./bootstrap-command";

function runBootstrap({
  installerStatus = 0,
  url = "https://preview.example/setup",
  body = `#!/bin/sh\nprintf 'installer ran\\n'\nexit ${installerStatus}\n`,
}: {
  installerStatus?: number;
  url?: string;
  body?: string;
} = {}) {
  // Keep fixtures in the ignored workspace. No network, installer or cleanup runs.
  const root = join(process.cwd(), ".claude", "bootstrap-tests");
  mkdirSync(root, { recursive: true });
  const fixture = mkdtempSync(join(root, "run-"));
  writeFileSync(
    join(fixture, "curl"),
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$FIXTURE/arguments"\n/bin/cat "$FIXTURE/body"\nexit 0\n',
    { mode: 0o755 },
  );
  writeFileSync(join(fixture, "body"), body);
  const result = spawnSync("/bin/sh", ["-c", bootstrapCommand(url)], {
    cwd: fixture,
    env: {
      NODE_ENV: "test",
      PATH: `${fixture}:/usr/bin:/bin`,
      FIXTURE: fixture,
    },
    encoding: "utf8",
    timeout: 5000,
  });
  expect(result.error).toBeUndefined();
  return { ...result, args: readFileSync(join(fixture, "arguments"), "utf8") };
}

describe("bootstrap command", () => {
  it.each([
    "http://localhost:3000/setup",
    "https://devx-home.vercel.app/setup",
    "https://preview.example/setup",
  ])("uses a single curl pipeline for %s", (url) => {
    expect(bootstrapCommand(url)).toBe(`curl -fsSL '${url}' | sh`);
  });

  it.each([0, 7])("returns installer exit status %i", (status) => {
    const result = runBootstrap({ installerStatus: status });
    expect(result.status).toBe(status);
    expect(result.stdout).toBe("installer ran\n");
    expect(result.stderr).toBe("");
  });

  it("passes a quoted URL to curl as one unchanged argument", () => {
    const url = "https://preview.example/it's-a-preview/setup";
    const result = runBootstrap({ url });
    expect(result.status).toBe(0);
    expect(result.args).toBe(`-fsSL\n${url}\n`);
  });
});
