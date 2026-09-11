import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapCommand } from "./bootstrap-command";

function runBootstrap({
  fetchStatus = 0,
  installerStatus = 0,
  url = "https://preview.example/setup",
  body = `#!/bin/sh\nprintf 'installer ran\\n'\nexit ${installerStatus}\n`,
  input,
}: {
  fetchStatus?: number;
  installerStatus?: number;
  url?: string;
  body?: string;
  input?: string;
} = {}) {
  // Keep fixtures in the ignored workspace. No network, installer or cleanup runs.
  const root = join(process.cwd(), ".claude", "bootstrap-tests");
  mkdirSync(root, { recursive: true });
  const fixture = mkdtempSync(join(root, "run-"));
  writeFileSync(
    join(fixture, "curl"),
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$FIXTURE/arguments"\n/bin/cat "$FIXTURE/body"\nexit "$FETCH_STATUS"\n',
    { mode: 0o755 },
  );
  writeFileSync(join(fixture, "body"), body);
  const result = spawnSync("/bin/sh", ["-c", bootstrapCommand(url)], {
    cwd: fixture,
    env: {
      NODE_ENV: "test",
      PATH: `${fixture}:/usr/bin:/bin`,
      FIXTURE: fixture,
      FETCH_STATUS: String(fetchStatus),
    },
    input,
    encoding: "utf8",
    timeout: 5000,
  });
  expect(result.error).toBeUndefined();
  return { ...result, args: readFileSync(join(fixture, "arguments"), "utf8") };
}

describe("bootstrap command", () => {
  it.each([18, 22, 47])(
    "does not execute a response when curl exits %i",
    (status) => {
      const result = runBootstrap({ fetchStatus: status });
      expect(result.status).toBe(status);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    },
  );

  it.each([0, 7])(
    "runs a complete response once and returns installer status %i",
    (status) => {
      const result = runBootstrap({ installerStatus: status });
      expect(result.status).toBe(status);
      expect(result.stdout).toBe("installer ran\n");
      expect(result.stderr).toBe("");
    },
  );

  it("passes a URL with an apostrophe to curl as one unchanged argument", () => {
    const url = "https://preview.example/it's-a-preview/setup";
    const result = runBootstrap({ url });
    expect(result.status).toBe(0);
    expect(result.args).toBe(`-fsSL\n${url}\n`);
  });

  it.each(["http://localhost:3000/setup", "https://preview.example/setup"])(
    "rejects HTML from %s before evaluating shell substitutions",
    (url) => {
      const body = `<!doctype html>
<html><head><title>Authentication Required</title></head>
<body><p>Sign in to access this preview.</p>
<p>$(printf 'html sentinel\\n' >&2)</p></body></html>`;
      const result = runBootstrap({ body, url });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("korza: unexpected installer response\n");
    },
  );

  it.each([
    ["empty body", ""],
    ["partial shebang", "#!/bin/s"],
    ["shebang without a body", "#!/bin/sh\n"],
    ["missing shebang", "printf 'unexpected execution\\n'\n"],
    ["shebang prefix", "#!/bin/sh-extra\nprintf 'unexpected execution\\n'\n"],
    ["shebang options", "#!/bin/sh -e\nprintf 'unexpected execution\\n'\n"],
    ["trailing space", "#!/bin/sh \nprintf 'unexpected execution\\n'\n"],
    ["trailing tab", "#!/bin/sh\t\nprintf 'unexpected execution\\n'\n"],
    ["carriage return", "#!/bin/sh\r\nprintf 'unexpected execution\\n'\n"],
    ["leading newline", "\n#!/bin/sh\nprintf 'unexpected execution\\n'\n"],
  ])("rejects a successful response with %s", (_description, body) => {
    const result = runBootstrap({ body });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("korza: unexpected installer response\n");
  });

  it("preserves curl's failure status for a partial response", () => {
    const result = runBootstrap({
      fetchStatus: 18,
      body: "#!/bin/sh\nprintf 'partial installer",
    });
    expect(result.status).toBe(18);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("leaves caller stdin available to the valid response", () => {
    const input = "caller input with 'quotes' and \\slashes\nsecond line\n";
    const result = runBootstrap({ body: "#!/bin/sh\n/bin/cat\n", input });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(input);
    expect(result.stderr).toBe("");
  });

  it("produces one pasteable command line", () => {
    expect(bootstrapCommand("https://preview.example/setup")).not.toMatch(
      /[\r\n]/,
    );
  });
});
