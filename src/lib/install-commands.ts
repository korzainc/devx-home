/** The raw shape the synced catalogue uses. Every field past `type` is optional because the
 *  types disagree about which they carry, and `script` alone carries three different pairs. */
export type RawInstall = {
  type: string;
  package?: string;
  version?: string;
  formula?: string;
  image?: string;
  tag?: string;
  url?: string;
  action?: string;
  coordinate?: string;
};

export type InstallMethod = {
  /** Unique within a tool, so a tab row can key on it. Two docker entries differ by image. */
  id: string;
  label: string;
  /** `docs` carries no command, only `href`: see the `script` branch below. A `snippet` is
   *  pasted into the file named by `target`; a `shell` command is run as it stands. */
  kind: "shell" | "snippet" | "docs";
  command: string;
  /** The file a snippet is pasted into. Always set on a `snippet`: a Maven block is inert until
   *  it is inside a pom, and the payload alone does not say so. */
  target?: string;
  /** The action's ref, set on a `github-action` method so the panel can look up its inputs. */
  action?: string;
  href?: string;
  note?: string;
};

/** Korza's own CI image. A tool that names it is already wrapped by `ci-base-checks`, so the
 *  reader's pipeline may well be running it without installing anything. */
const KORZA_IMAGE = "korzacitools.azurecr.io/ci-common";

// Friendliest first, so a variant that promotes one method promotes the one a reader can run
// without reading further. Ecosystem installers beat a curl pipe, which beats pulling an image.
const ORDER = [
  "Homebrew",
  "npm",
  "pip",
  "Script",
  "Download",
  "Maven",
  "GitHub Actions",
  "Docker",
  "Korza CI image",
];

function basename(url: string): string {
  return url.split("/").pop() || "download";
}

function fromScript(entry: RawInstall, index: number): InstallMethod | null {
  const { package: pkg, url, version } = entry;
  if (pkg) {
    return {
      id: `script-${pkg}`,
      label: "pip",
      kind: "shell",
      command: `pip install ${pkg}${version ? `==${version}` : ""}`,
    };
  }
  if (!url) return null;
  // No version pins a `script` entry to a release artefact, so an unversioned one is not an
  // artefact at all: dependabot points at GitHub's configuration guide and go-test at the Go
  // download page. Emitting `curl | sh` against either would be nonsense.
  if (!version) {
    return {
      id: `docs-${index}`,
      label: "Setup guide",
      kind: "docs",
      command: "",
      href: url,
    };
  }
  if (url.endsWith(".sh")) {
    return {
      id: `script-${index}`,
      label: "Script",
      kind: "shell",
      command: `curl -sSfL ${url} | sh`,
    };
  }
  if (url.endsWith(".tgz") || url.endsWith(".tar.gz")) {
    return {
      id: `script-${index}`,
      label: "Download",
      kind: "shell",
      command: `curl -sSfL ${url} | tar -xz`,
    };
  }
  const file = basename(url);
  return {
    id: `script-${index}`,
    label: "Download",
    kind: "shell",
    command: `curl -sSfL -o ${file} ${url} && chmod +x ${file}`,
  };
}

// Every branch checks the fields it interpolates. The catalogue is synced from another repo, so
// a renamed field is a live possibility, and `brew install undefined` is worse than no tab: the
// seam test in install-commands.test.ts counts rendered methods, so dropping one fails the sync
// rather than shipping a command that cannot work.
function toMethod(entry: RawInstall, index: number): InstallMethod | null {
  switch (entry.type) {
    case "npm":
      if (!entry.package || !entry.version) return null;
      return {
        id: `npm-${entry.package}`,
        label: "npm",
        kind: "shell",
        command: `npm install --save-dev ${entry.package}@${entry.version}`,
      };
    case "brew":
      if (!entry.formula) return null;
      return {
        id: `brew-${entry.formula}`,
        label: "Homebrew",
        kind: "shell",
        command: `brew install ${entry.formula}`,
      };
    case "docker": {
      if (!entry.image || !entry.tag) return null;
      // Trivy carries two docker entries. Labelling both "Docker" would put two identical tabs
      // next to each other, so Korza's own image is named for what it is.
      const korza = entry.image === KORZA_IMAGE;
      return {
        id: `docker-${entry.image}`,
        label: korza ? "Korza CI image" : "Docker",
        kind: "shell",
        command: `docker pull ${entry.image}:${entry.tag}`,
        note: korza
          ? "Korza's CI image, which already bundles this check."
          : undefined,
      };
    }
    case "jar":
      if (!entry.url) return null;
      return {
        id: `jar-${index}`,
        label: "Download",
        kind: "shell",
        command: `curl -sSfL -O ${entry.url}`,
      };
    case "github-action":
      if (!entry.action || !entry.version) return null;
      return {
        id: `action-${entry.action}`,
        label: "GitHub Actions",
        kind: "snippet",
        command: `- uses: ${entry.action}@${entry.version}`,
        target: ".github/workflows/ci.yml",
        action: entry.action,
      };
    case "build-plugin": {
      const [groupId, artifactId] = (entry.coordinate ?? "").split(":");
      if (!groupId || !artifactId) return null;
      return {
        id: `maven-${entry.coordinate}`,
        label: "Maven",
        kind: "snippet",
        target: "pom.xml",
        // Wrapped in build/plugins rather than emitted bare: a `<plugin>` at the root of a pom
        // is not valid, so a bare block is something the reader has to know how to place.
        command: [
          "<build>",
          "  <plugins>",
          "    <plugin>",
          `      <groupId>${groupId}</groupId>`,
          `      <artifactId>${artifactId}</artifactId>`,
          `      <version>${entry.version}</version>`,
          "    </plugin>",
          "  </plugins>",
          "</build>",
        ].join("\n"),
      };
    }
    case "script":
      return fromScript(entry, index);
    default:
      // A resynced catalogue inventing a type renders nothing rather than a half-built command.
      // `install-commands.test.ts` fails on the same condition, so it cannot pass unnoticed.
      return null;
  }
}

/** Anything ORDER does not name sorts last, which is where "Setup guide" belongs: it is the
 *  fallback for a tool with no runnable command, not a method competing with the others. */
function rank(method: InstallMethod): number {
  const at = ORDER.indexOf(method.label);
  return at === -1 ? ORDER.length : at;
}

export function installMethods(install: RawInstall[] = []): InstallMethod[] {
  return install
    .map(toMethod)
    .filter((method): method is InstallMethod => method !== null)
    .sort((a, b) => rank(a) - rank(b));
}
