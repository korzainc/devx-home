import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shellQuote } from "./shell-quote";

type Scenario = {
  env?: Record<string, string>;
  checksum?: "missing" | "mismatch";
  expectedDigest?: string;
  signature?: "unsigned" | "invalid" | "sign-fails";
  versionFails?: boolean;
  destination?: "directory" | "directory-link";
  fresh?: boolean;
  path?: "installed" | "shadowed";
};

// A shebang cannot quote its interpreter, and this machine's Node path contains a space, so each
// fixture command is a wrapper that execs one shared script and names itself in the environment.
function commandWrapper(name: string, interpreter: string, script: string) {
  return [
    "#!/bin/sh",
    `FIXTURE_COMMAND=${name}`,
    "export FIXTURE_COMMAND",
    `exec ${shellQuote(interpreter)} ${shellQuote(script)} "$@"`,
    "",
  ].join("\n");
}

const ARCHIVE_PAYLOAD = "inert archive fixture";
const ARCHIVE_DIGEST = createHash("sha256")
  .update(ARCHIVE_PAYLOAD)
  .digest("hex");

// Run only installer control flow, never the bundled binary or a network client.
// PATH contains fixtures and a small explicit utility allowlist. HOME and all
// inherited environment variables are omitted. rm is a no-op: retain fixtures
// under .claude/installer-tests for inspection, including after failed tests.
function install(scenario: Scenario = {}) {
  const parent = join(process.cwd(), ".claude", "installer-tests");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "case-"));
  const bin = join(root, "commands");
  const stage = join(root, "stage");
  const destination = join(
    root,
    scenario.fresh ? "new tools' bin" : "destination",
  );
  for (const path of [bin, stage, destination]) mkdirSync(path);
  const target = join(destination, "korza");
  const directory = join(root, "existing-directory");
  if (scenario.destination) {
    mkdirSync(directory);
    writeFileSync(join(directory, "keep"), "existing contents");
    if (scenario.destination === "directory-link") {
      symlinkSync(directory, target, "dir");
    } else {
      mkdirSync(target);
      writeFileSync(join(target, "keep"), "existing contents");
    }
  } else if (!scenario.fresh) {
    writeFileSync(target, "previous installation");
  }
  const fixture = `#!/bin/sh
if [ "$1" = "setup" ]; then
  printf 'setup reached\\n'
  exit 0
fi
printf 'probe\n' >> "$FIXTURE_ROOT/events"
[ "$1" = "--version" ] || exit 91
[ -f "$FIXTURE_ROOT/signed" ] || exit 92
exit ${scenario.versionFails ? 7 : 0}
`;
  writeFileSync(join(root, "fixture"), fixture);
  writeFileSync(join(root, "events"), "");
  writeFileSync(join(root, "downloads"), "");

  const stub = String.raw`const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = process.env.FIXTURE_ROOT;
const stage = path.join(root, "stage");
const args = process.argv.slice(2);
const name = process.env.FIXTURE_COMMAND;
const scenario = ${JSON.stringify(scenario)};
const event = value => fs.appendFileSync(path.join(root, "events"), value + "\n");
const check = condition => { if (!condition) throw new Error("Unexpected fixture command: " + name); };
switch (name) {
  case "uname": process.stdout.write("Darwin\n"); break;
  case "mktemp": check(args.join(" ") === "-d"); process.stdout.write(stage + "\n"); break;
  case "rm": event("cleanup-retained"); break;
  case "curl": {
    if (args[1] === "-o") {
      check(args.length === 6 && args[0] === "-fsSL" && args[2] === path.join(stage, "release.json") && args[3] === "-w" && args[4] === "%{http_code}");
      check(args[5] === "https://api.github.com/repos/korzainc/korza-cli/releases/latest");
      fs.appendFileSync(path.join(root, "downloads"), args[5] + "\n");
      fs.writeFileSync(args[2], JSON.stringify({assets:[{browser_download_url:"https://fixture.invalid/korza-macos.tar.gz"}]}));
      process.stdout.write("200");
      break;
    }
    check(args.length === 4 && args[0] === "-fsSL" && args[2] === "-o");
    const checksum = args[1] === "https://fixture.invalid/korza.sha256" || args[1] === "https://fixture.invalid/korza-macos.tar.gz.sha256";
    check(checksum || args[1] === "https://fixture.invalid/korza-macos.tar.gz" || args[1] === "https://fixture.invalid/korza" || args[1] === "https://fixture.invalid/korza-new");
    check(args[3] === path.join(stage, checksum ? "korza.sha256" : "korza.tar.gz"));
    fs.appendFileSync(path.join(root, "downloads"), args[1] + "\n");
    if (checksum && scenario.checksum === "missing") process.exit(22);
    const payload = ${JSON.stringify(ARCHIVE_PAYLOAD)};
    const digest = scenario.checksum === "mismatch" ? "0".repeat(64) : crypto.createHash("sha256").update(payload).digest("hex");
    fs.writeFileSync(args[3], checksum ? digest + "  korza.tar.gz\n" : payload);
    break;
  }
  case "shasum":
    check(args.join(" ") === "-a 256 " + path.join(stage, "korza.tar.gz"));
    process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(args[2])).digest("hex") + "  archive\n");
    break;
  case "tar":
    check(args[1] === path.join(stage, "korza.tar.gz"));
    if (args[0] === "-tzf") break;
    check(args[0] === "-xzf" && args[2] === "-C" && args[3] === stage);
    event("extract");
    fs.copyFileSync(path.join(root, "fixture"), path.join(stage, "korza"));
    break;
  case "codesign":
    check(args.at(-1) === path.join(stage, "korza"));
    if (args[0] === "--verify") {
      if (scenario.signature) process.exit(1);
      fs.writeFileSync(path.join(root, "signed"), "valid fixture signature");
    } else if (args[0] === "-dvv") {
      if (scenario.signature === "invalid") process.stdout.write("Authority=Developer ID\n");
    } else {
      check(args.slice(0, 3).join(" ") === "--force --sign -");
      event("sign");
      if (scenario.signature === "sign-fails") process.exit(1);
      fs.writeFileSync(path.join(root, "signed"), "ad-hoc fixture signature");
    }
    break;
  default: throw new Error("Unknown fixture command");
}
`;
  const stubPath = join(root, "fixture-command.cjs");
  writeFileSync(stubPath, stub);
  for (const name of [
    "uname",
    "mktemp",
    "rm",
    "curl",
    "shasum",
    "tar",
    "codesign",
  ]) {
    writeFileSync(
      join(bin, name),
      commandWrapper(name, process.execPath, stubPath),
      { mode: 0o755 },
    );
  }
  for (const [name, systemPath] of Object.entries({
    chmod: "/bin/chmod",
    ln: "/bin/ln",
    mkdir: "/bin/mkdir",
    mv: "/bin/mv",
    cut: "/usr/bin/cut",
    grep: "/usr/bin/grep",
    tr: "/usr/bin/tr",
    head: "/usr/bin/head",
    sed: "/usr/bin/sed",
  })) {
    symlinkSync(systemPath, join(bin, name));
  }
  if (scenario.path === "shadowed") {
    writeFileSync(join(bin, "korza"), "#!/bin/sh\nprintf 'wrong binary\\n'\n", {
      mode: 0o755,
    });
  }
  const commandPath =
    scenario.path === "installed"
      ? `${destination}:${bin}`
      : scenario.path === "shadowed"
        ? `${bin}:${destination}`
        : bin;
  const result = spawnSync(
    "/bin/sh",
    [join(process.cwd(), "public/korza/install.sh")],
    {
      cwd: root,
      env: {
        NODE_ENV: "test",
        PATH: commandPath,
        TMPDIR: stage,
        KORZA_BIN_DIR: destination,
        KORZA_DIST_URL: "https://fixture.invalid/korza",
        ...(scenario.expectedDigest !== undefined
          ? { KORZA_DIST_SHA256: scenario.expectedDigest }
          : {}),
        FIXTURE_ROOT: root,
        ...scenario.env,
      },
      encoding: "utf8",
      timeout: 15_000,
      input: "",
    },
  );
  if (result.error) throw result.error;
  return {
    ...result,
    root,
    commandPath,
    target,
    fixture,
    events: readFileSync(join(root, "events"), "utf8").trim().split("\n"),
    downloads: readFileSync(join(root, "downloads"), "utf8").trim().split("\n"),
  };
}

describe("the fixture command wrapper", () => {
  // This machine's Node path happens to contain a space; a CI runner's may not, which would let
  // the quoting regress unnoticed and prevent the cases below from exercising their command
  // paths.
  it("executes when the interpreter path contains a space", () => {
    const parent = join(process.cwd(), ".claude", "installer-tests");
    mkdirSync(parent, { recursive: true });
    const root = mkdtempSync(join(parent, "interpreter-"));
    const nested = join(root, "node dir");
    mkdirSync(nested);
    const interpreter = join(nested, "node");
    symlinkSync(process.execPath, interpreter);
    const script = join(root, "report.cjs");
    writeFileSync(
      script,
      'process.stdout.write([process.env.FIXTURE_COMMAND, ...process.argv.slice(2)].join("|"));',
    );
    const command = join(root, "uname");
    writeFileSync(command, commandWrapper("uname", interpreter, script), {
      mode: 0o755,
    });

    const result = spawnSync(command, ["-s", "an argument"], {
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("uname|-s|an argument");
  });
});

describe(
  "the vendored installer with inert local fixtures",
  { timeout: 20_000 },
  () => {
    it("discovers releases from the renamed Korza CLI repository", () => {
      const result = install({ env: { KORZA_DIST_URL: "" } });
      expect(result.status, result.stderr).toBe(0);
      expect(result.downloads).toEqual([
        "https://api.github.com/repos/korzainc/korza-cli/releases/latest",
        "https://fixture.invalid/korza-macos.tar.gz",
        "https://fixture.invalid/korza-macos.tar.gz.sha256",
      ]);
      expect(readFileSync(result.target, "utf8")).toBe(result.fixture);
    });

    it.each([ARCHIVE_DIGEST, ARCHIVE_DIGEST.toUpperCase()])(
      "installs against the supplied digest %s without fetching a sidecar",
      (expectedDigest) => {
        const result = install({ expectedDigest, checksum: "missing" });
        expect(result.status, result.stderr).toBe(0);
        expect(result.downloads).toEqual(["https://fixture.invalid/korza"]);
        expect(readFileSync(result.target, "utf8")).toBe(result.fixture);
      },
    );

    it("prefers Korza overrides and keeps an empty pin fail-closed", () => {
      const result = install({
        expectedDigest: ARCHIVE_DIGEST,
        env: {
          KORZA_DIST_SHA256: "",
          KORZA_DIST_URL: "https://fixture.invalid/korza-new",
        },
      });
      expect(result.status).toBe(1);
      expect(result.downloads).toEqual(["https://fixture.invalid/korza-new"]);
      expect(result.events).toEqual(["cleanup-retained"]);
      expect(readFileSync(result.target, "utf8")).toBe("previous installation");
    });

    it("accepts Korza URL, digest and bin-directory settings", () => {
      const result = install({
        checksum: "missing",
        env: {
          KORZA_DIST_SHA256: ARCHIVE_DIGEST,
          KORZA_DIST_URL: "https://fixture.invalid/korza-new",
        },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.downloads).toEqual(["https://fixture.invalid/korza-new"]);
      expect(readFileSync(result.target, "utf8")).toBe(result.fixture);
    });

    it("ignores a retired DevX checksum override", () => {
      const result = install({ env: { DEVX_DIST_SHA256: "invalid" } });
      expect(result.status, result.stderr).toBe(0);
      expect(result.downloads).toEqual([
        "https://fixture.invalid/korza",
        "https://fixture.invalid/korza.sha256",
      ]);
      expect(readFileSync(result.target, "utf8")).toBe(result.fixture);
    });

    it("rejects a mismatched pin even when the hosted sidecar would match", () => {
      const result = install({ expectedDigest: "0".repeat(64) });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("does not match");
      expect(result.downloads).toEqual(["https://fixture.invalid/korza"]);
      expect(result.events).toEqual(["cleanup-retained"]);
      expect(readFileSync(result.target, "utf8")).toBe("previous installation");
    });

    it.each(["", "0".repeat(63), "0".repeat(65), "g".repeat(64)])(
      "fails closed for malformed supplied digest %j",
      (expectedDigest) => {
        const result = install({ expectedDigest });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("exactly 64 hexadecimal characters");
        expect(result.downloads).toEqual(["https://fixture.invalid/korza"]);
        expect(result.events).toEqual(["cleanup-retained"]);
        expect(readFileSync(result.target, "utf8")).toBe(
          "previous installation",
        );
      },
    );

    it("uses the published sidecar when no expected digest is supplied", () => {
      const result = install();
      expect(result.status, result.stderr).toBe(0);
      expect(result.downloads).toEqual([
        "https://fixture.invalid/korza",
        "https://fixture.invalid/korza.sha256",
      ]);
    });

    it.each(["missing", "mismatch"] as const)(
      "preserves the old install when the checksum is %s",
      (checksum) => {
        const result = install({ checksum });
        expect(result.status).toBe(1);
        expect(readFileSync(result.target, "utf8")).toBe(
          "previous installation",
        );
        expect(result.events).toEqual(["cleanup-retained"]);
      },
    );

    it("signs an unsigned executable before probing and replacing the old install", () => {
      const result = install({ signature: "unsigned" });
      expect(result.status, result.stderr).toBe(0);
      expect(result.events).toEqual([
        "extract",
        "sign",
        "probe",
        "cleanup-retained",
      ]);
      expect(readFileSync(result.target, "utf8")).toBe(result.fixture);
      expect(result.stdout).toContain(`'${result.target}' setup`);
    });

    it.each(["installed", "shadowed"] as const)(
      "prints commands that select the new binary when PATH is %s",
      (path) => {
        const result = install({ fresh: true, path });
        expect(result.status, result.stderr).toBe(0);
        const command = result.stdout.match(/Start setup:\n {4}([^\n]+)/)?.[1];
        expect(command).toBeDefined();
        if (path === "installed") {
          expect(command).toBe("korza setup");
          expect(result.stdout).toContain("    korza --help\n");
        } else {
          expect(command).not.toBe("korza setup");
          expect(result.stdout).not.toContain("    korza --help\n");
        }
        const setup = spawnSync("/bin/sh", ["-c", command!], {
          cwd: result.root,
          env: { NODE_ENV: "test", PATH: result.commandPath },
          encoding: "utf8",
          timeout: 5000,
        });
        expect(setup.error).toBeUndefined();
        expect(setup.status, setup.stderr).toBe(0);
        expect(setup.stdout).toBe("setup reached\n");
      },
    );

    it("prints a working first-setup command before the install directory is on PATH", () => {
      const result = install({ fresh: true });
      expect(result.status, result.stderr).toBe(0);
      const command = result.stdout.match(/Start setup:\n {4}([^\n]+)/)?.[1];
      expect(command).toBeDefined();
      // Execute only the inert fixture, using the exact command a new user copies.
      const setup = spawnSync("/bin/sh", ["-c", command!], {
        cwd: result.root,
        env: { NODE_ENV: "test", PATH: result.commandPath },
        encoding: "utf8",
        timeout: 5000,
      });
      expect(setup.error).toBeUndefined();
      expect(setup.status, setup.stderr).toBe(0);
      expect(setup.stdout).toBe("setup reached\n");
    });

    it.each(["invalid", "sign-fails"] as const)(
      "does not probe or replace an executable when signing is %s",
      (signature) => {
        const result = install({ signature });
        expect(result.status).toBe(1);
        expect(readFileSync(result.target, "utf8")).toBe(
          "previous installation",
        );
        expect(result.events).not.toContain("probe");
        if (signature === "invalid")
          expect(result.events).not.toContain("sign");
      },
    );

    it("preserves the old install if the signed executable cannot report its version", () => {
      const result = install({ versionFails: true });
      expect(result.status).toBe(1);
      expect(result.events).toContain("probe");
      expect(readFileSync(result.target, "utf8")).toBe("previous installation");
    });

    it.each(["directory", "directory-link"] as const)(
      "rejects a %s destination without nesting the executable inside it",
      (destination) => {
        const result = install({ destination });
        expect(result.status).toBe(1);
        expect(readFileSync(join(result.target, "keep"), "utf8")).toBe(
          "existing contents",
        );
        expect(existsSync(join(result.target, "korza"))).toBe(false);
      },
    );
  },
);
