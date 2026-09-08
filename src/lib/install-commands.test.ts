import { describe, expect, it } from "vitest";
import catalogue from "@/data/catalogue.json";
import { installMethods, type RawInstall } from "./install-commands";

const rawTools: Record<string, { install?: RawInstall[] }> = {
  ...catalogue.tools,
  ...catalogue.bundles,
};

function only(entry: RawInstall) {
  const [method] = installMethods([entry]);
  return method;
}

describe("install commands", () => {
  describe("the shapes the catalogue actually uses", () => {
    it("turns an npm entry into a dev dependency install", () => {
      expect(
        only({ type: "npm", package: "@biomejs/biome", version: "^2" }),
      ).toMatchObject({
        label: "npm",
        kind: "shell",
        command: "npm install --save-dev @biomejs/biome@^2",
      });
    });

    it("turns a brew entry into a formula install", () => {
      expect(only({ type: "brew", formula: "trivy" })).toMatchObject({
        label: "Homebrew",
        command: "brew install trivy",
      });
    });

    it("turns a docker entry into a tagged pull", () => {
      expect(
        only({ type: "docker", image: "aquasec/trivy", tag: "0.52.0" }),
      ).toMatchObject({
        label: "Docker",
        command: "docker pull aquasec/trivy:0.52.0",
      });
    });

    it("names Korza's own image rather than calling it a second Docker", () => {
      // Trivy carries both. Two tabs reading "Docker" are indistinguishable to a reader.
      const methods = installMethods([
        { type: "docker", image: "aquasec/trivy", tag: "0.52.0" },
        {
          type: "docker",
          image: "korzacitools.azurecr.io/ci-common",
          tag: "0.1.0",
        },
      ]);
      expect(methods.map((method) => method.label)).toEqual([
        "Docker",
        "Korza CI image",
      ]);
      expect(methods[1].note).toContain("already bundles");
    });

    it("puts a Maven plugin inside build/plugins, which is where a pom accepts it", () => {
      const method = only({
        type: "build-plugin",
        coordinate: "org.jacoco:jacoco-maven-plugin",
        version: "0.8.13",
      });
      expect(method.target).toBe("pom.xml");
      expect(method.command).toContain("<build>");
      expect(method.command).toContain("<groupId>org.jacoco</groupId>");
      expect(method.command).toContain(
        "<artifactId>jacoco-maven-plugin</artifactId>",
      );
    });

    it("gives a workflow step the file it goes in and the action it names", () => {
      const method = only({
        type: "github-action",
        action: "github/codeql-action/analyze",
        version: "v4",
      });
      expect(method).toMatchObject({
        kind: "snippet",
        command: "- uses: github/codeql-action/analyze@v4",
        target: ".github/workflows/ci.yml",
        action: "github/codeql-action/analyze",
      });
    });
  });

  // `script` is the overloaded one: the same type carries a pip package, a shell installer, a
  // tarball, a bare binary and a documentation link, told apart only by which fields are set.
  describe("the four things a script entry can be", () => {
    it("reads a package as pip, pinned when a version is given", () => {
      expect(
        only({ type: "script", package: "ruff", version: "0.16.5" }),
      ).toMatchObject({ label: "pip", command: "pip install ruff==0.16.5" });
      expect(only({ type: "script", package: "ruff" }).command).toBe(
        "pip install ruff",
      );
    });

    it("pipes a versioned .sh through sh", () => {
      expect(
        only({
          type: "script",
          url: "https://golangci-lint.run/install.sh",
          version: "2.13.2",
        }).command,
      ).toBe("curl -sSfL https://golangci-lint.run/install.sh | sh");
    });

    it("untars a versioned archive instead of running it", () => {
      expect(
        only({ type: "script", url: "https://x.test/k.tgz", version: "1" })
          .command,
      ).toBe("curl -sSfL https://x.test/k.tgz | tar -xz");
      expect(
        only({ type: "script", url: "https://x.test/k.tar.gz", version: "1" })
          .command,
      ).toBe("curl -sSfL https://x.test/k.tar.gz | tar -xz");
    });

    it("downloads and chmods a versioned bare binary", () => {
      expect(
        only({
          type: "script",
          url: "https://x.test/hadolint-linux-x86_64",
          version: "2.15.0",
        }).command,
      ).toBe(
        "curl -sSfL -o hadolint-linux-x86_64 https://x.test/hadolint-linux-x86_64 && chmod +x hadolint-linux-x86_64",
      );
    });

    it("treats an unversioned url as documentation, not something to pipe into a shell", () => {
      // Nothing pins it to a release artefact, so it is not one: dependabot's entry is GitHub's
      // configuration guide. `curl | sh` against an HTML page would be nonsense.
      const method = only({
        type: "script",
        url: "https://docs.github.com/en/code-security/dependabot",
      });
      expect(method).toMatchObject({
        kind: "docs",
        command: "",
        href: "https://docs.github.com/en/code-security/dependabot",
      });
    });
  });

  describe("ordering", () => {
    it("leads with the method a reader can run without reading further", () => {
      const methods = installMethods([
        { type: "docker", image: "x/y", tag: "1" },
        { type: "github-action", action: "a/b", version: "v1" },
        { type: "brew", formula: "y" },
      ]);
      expect(methods.map((method) => method.label)).toEqual([
        "Homebrew",
        "GitHub Actions",
        "Docker",
      ]);
    });

    it("sorts a docs fallback last, behind anything runnable", () => {
      // ORDER does not name "Setup guide", and indexOf returning -1 would otherwise promote it
      // to first: it is the fallback for a tool with no command, not a competing method.
      const methods = installMethods([
        { type: "script", url: "https://x.test/guide" },
        { type: "brew", formula: "y" },
      ]);
      expect(methods.map((method) => method.label)).toEqual([
        "Homebrew",
        "Setup guide",
      ]);
    });
  });

  describe("input it should refuse rather than half-render", () => {
    it("returns nothing for no install data at all", () => {
      expect(installMethods()).toEqual([]);
      expect(installMethods([])).toEqual([]);
    });

    it("drops a type it does not know instead of guessing a command", () => {
      expect(installMethods([{ type: "cargo", package: "x" }])).toEqual([]);
    });

    it("drops a build-plugin whose coordinate is not group:artifact", () => {
      expect(installMethods([{ type: "build-plugin", version: "1" }])).toEqual(
        [],
      );
      expect(
        installMethods([{ type: "build-plugin", coordinate: "org.jacoco" }]),
      ).toEqual([]);
    });

    it("drops a script entry carrying neither a package nor a url", () => {
      expect(installMethods([{ type: "script", version: "1" }])).toEqual([]);
    });

    it("drops an entry missing a field it would have interpolated", () => {
      // A resync renaming a field would otherwise ship `brew install undefined`, which reads as
      // a real command and fails only when someone runs it. Dropped, the count check above fails
      // on the sync instead.
      expect(installMethods([{ type: "brew" }])).toEqual([]);
      expect(installMethods([{ type: "npm", package: "x" }])).toEqual([]);
      expect(installMethods([{ type: "docker", image: "x/y" }])).toEqual([]);
      expect(installMethods([{ type: "jar", version: "1" }])).toEqual([]);
      expect(installMethods([{ type: "github-action", version: "v1" }])).toEqual(
        [],
      );
    });

    it("keeps one bad entry from taking the good ones with it", () => {
      const methods = installMethods([
        { type: "cargo", package: "x" },
        { type: "brew", formula: "y" },
      ]);
      expect(methods.map((method) => method.label)).toEqual(["Homebrew"]);
    });
  });

  // The catalogue is synced from shared-workflows, so these fail on the resync rather than in
  // production: a new install type renders nothing, and `toMethod`'s default branch is silent.
  describe("against the real catalogue", () => {
    it("renders every install entry of every tool", () => {
      for (const [id, tool] of Object.entries(rawTools)) {
        const raw = tool.install ?? [];
        expect(
          installMethods(raw).length,
          `${id} has ${raw.length} install entries but renders ${installMethods(raw).length}; an unhandled type in install-commands.ts`,
        ).toBe(raw.length);
      }
    });

    it("gives every tool's methods ids a tab row can key on", () => {
      for (const [id, tool] of Object.entries(rawTools)) {
        const ids = installMethods(tool.install).map((method) => method.id);
        expect(new Set(ids).size, `${id} has a duplicate method id`).toBe(
          ids.length,
        );
      }
    });

    it("tells the reader where every snippet goes", () => {
      for (const [id, tool] of Object.entries(rawTools)) {
        for (const method of installMethods(tool.install)) {
          if (method.kind !== "snippet") continue;
          expect(
            method.target,
            `${id}'s ${method.label} snippet has no target file`,
          ).toBeTruthy();
        }
      }
    });

    it("never emits an empty command for something it calls runnable", () => {
      for (const [id, tool] of Object.entries(rawTools)) {
        for (const method of installMethods(tool.install)) {
          if (method.kind === "docs") continue;
          expect(
            method.command.trim().length,
            `${id}'s ${method.label} is empty`,
          ).toBeGreaterThan(0);
        }
      }
    });
  });
});
