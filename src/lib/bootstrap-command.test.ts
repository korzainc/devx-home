import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapCommand } from "./bootstrap-command";

function runBootstrap(
  fetchStatus: number,
  installerStatus = 0,
  url = "https://preview.example/setup",
) {
  // Keep fixtures in the ignored workspace. No network, installer or cleanup runs.
  const root = join(process.cwd(), ".claude", "bootstrap-tests");
  mkdirSync(root, { recursive: true });
  const fixture = mkdtempSync(join(root, "run-"));
  writeFileSync(
    join(fixture, "curl"),
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$FIXTURE/arguments"\n/bin/cat "$FIXTURE/body"\nexit "$FETCH_STATUS"\n',
    { mode: 0o755 },
  );
  writeFileSync(
    join(fixture, "body"),
    `printf 'installer ran\\n'\nexit ${installerStatus}\n`,
  );
  const result = spawnSync("/bin/sh", ["-c", bootstrapCommand(url)], {
    cwd: fixture,
    env: {
      NODE_ENV: "test",
      PATH: `${fixture}:/usr/bin:/bin`,
      FIXTURE: fixture,
      FETCH_STATUS: String(fetchStatus),
    },
    encoding: "utf8",
    timeout: 5000,
  });
  expect(result.error).toBeUndefined();
  return { ...result, args: readFileSync(join(fixture, "arguments"), "utf8") };
}

describe("bootstrap command", () => {
  it.each([18, 22])(
    "does not execute a response when curl exits %i",
    (status) => {
      const result = runBootstrap(status);
      expect(result.status).toBe(status);
      expect(result.stdout).toBe("");
    },
  );

  it.each([0, 7])(
    "runs a complete response once and returns installer status %i",
    (status) => {
      const result = runBootstrap(0, status);
      expect(result.status).toBe(status);
      expect(result.stdout).toBe("installer ran\n");
    },
  );

  it("passes a URL with an apostrophe to curl as one unchanged argument", () => {
    const url = "https://preview.example/it's-a-preview/setup";
    const result = runBootstrap(0, 0, url);
    expect(result.status).toBe(0);
    expect(result.args).toBe(`-fsSL\n${url}\n`);
  });
});
