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

type Scenario = {
  checksum?: "missing" | "mismatch";
  expectedDigest?: string;
  signature?: "unsigned" | "invalid" | "sign-fails";
  versionFails?: boolean;
  destination?: "directory" | "directory-link";
  fresh?: boolean;
  path?: "installed" | "shadowed";
};

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
  const target = join(destination, "devx");
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

  const stub = String.raw`#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = process.env.FIXTURE_ROOT;
const stage = path.join(root, "stage");
const args = process.argv.slice(2);
const name = path.basename(process.argv[1]);
const scenario = ${JSON.stringify(scenario)};
const event = value => fs.appendFileSync(path.join(root, "events"), value + "\n");
const check = condition => { if (!condition) throw new Error("Unexpected fixture command: " + name); };
switch (name) {
  case "uname": process.stdout.write("Darwin\n"); break;
  case "mktemp": check(args.join(" ") === "-d"); process.stdout.write(stage + "\n"); break;
  case "rm": event("cleanup-retained"); break;
  case "curl": {
    check(args.length === 4 && args[0] === "-fsSL" && args[2] === "-o");
    const checksum = args[1] === "https://fixture.invalid/devx.sha256";
    check(checksum || args[1] === "https://fixture.invalid/devx");
    check(args[3] === path.join(stage, checksum ? "devx.sha256" : "devx.tar.gz"));
    fs.appendFileSync(path.join(root, "downloads"), args[1] + "\n");
    if (checksum && scenario.checksum === "missing") process.exit(22);
    const payload = ${JSON.stringify(ARCHIVE_PAYLOAD)};
    const digest = scenario.checksum === "mismatch" ? "0".repeat(64) : crypto.createHash("sha256").update(payload).digest("hex");
    fs.writeFileSync(args[3], checksum ? digest + "  devx.tar.gz\n" : payload);
    break;
  }
  case "shasum":
    check(args.join(" ") === "-a 256 " + path.join(stage, "devx.tar.gz"));
    process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(args[2])).digest("hex") + "  archive\n");
    break;
  case "tar":
    check(args[1] === path.join(stage, "devx.tar.gz"));
    if (args[0] === "-tzf") break;
    check(args[0] === "-xzf" && args[2] === "-C" && args[3] === stage);
    event("extract");
    fs.copyFileSync(path.join(root, "fixture"), path.join(stage, "devx"));
    break;
  case "codesign":
    check(args.at(-1) === path.join(stage, "devx"));
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
  for (const name of [
    "uname",
    "mktemp",
    "rm",
    "curl",
    "shasum",
    "tar",
    "codesign",
  ]) {
    writeFileSync(join(bin, name), stub, { mode: 0o755 });
  }
  for (const [name, systemPath] of Object.entries({
    chmod: "/bin/chmod",
    mkdir: "/bin/mkdir",
    mv: "/bin/mv",
    cut: "/usr/bin/cut",
    grep: "/usr/bin/grep",
    tr: "/usr/bin/tr",
  })) {
    symlinkSync(systemPath, join(bin, name));
  }
  if (scenario.path === "shadowed") {
    writeFileSync(join(bin, "devx"), "#!/bin/sh\nprintf 'wrong binary\\n'\n", {
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
    [join(process.cwd(), "public/devx/install.sh")],
    {
      cwd: root,
      env: {
        NODE_ENV: "test",
        PATH: commandPath,
        TMPDIR: stage,
        DEVX_BIN_DIR: destination,
        DEVX_DIST_URL: "https://fixture.invalid/devx",
        ...(scenario.expectedDigest !== undefined
          ? { DEVX_DIST_SHA256: scenario.expectedDigest }
          : {}),
        FIXTURE_ROOT: root,
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

describe(
  "the vendored installer with inert local fixtures",
  { timeout: 20_000 },
  () => {
    it.each([ARCHIVE_DIGEST, ARCHIVE_DIGEST.toUpperCase()])(
      "installs against the supplied digest %s without fetching a sidecar",
      (expectedDigest) => {
        const result = install({ expectedDigest, checksum: "missing" });
        expect(result.status, result.stderr).toBe(0);
        expect(result.downloads).toEqual(["https://fixture.invalid/devx"]);
        expect(readFileSync(result.target, "utf8")).toBe(result.fixture);
      },
    );

    it("rejects a mismatched pin even when the hosted sidecar would match", () => {
      const result = install({ expectedDigest: "0".repeat(64) });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("does not match");
      expect(result.downloads).toEqual(["https://fixture.invalid/devx"]);
      expect(result.events).toEqual(["cleanup-retained"]);
      expect(readFileSync(result.target, "utf8")).toBe("previous installation");
    });

    it.each(["", "0".repeat(63), "0".repeat(65), "g".repeat(64)])(
      "fails closed for malformed supplied digest %j",
      (expectedDigest) => {
        const result = install({ expectedDigest });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("exactly 64 hexadecimal characters");
        expect(result.downloads).toEqual(["https://fixture.invalid/devx"]);
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
        "https://fixture.invalid/devx",
        "https://fixture.invalid/devx.sha256",
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
          expect(command).toBe("devx setup");
          expect(result.stdout).toContain("    devx --help\n");
        } else {
          expect(command).not.toBe("devx setup");
          expect(result.stdout).not.toContain("    devx --help\n");
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
        expect(existsSync(join(result.target, "devx"))).toBe(false);
      },
    );
  },
);
