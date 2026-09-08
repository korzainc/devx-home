/**
 * Config-file installs, authored here rather than synced.
 *
 * Some checks are not installed by running anything: you commit a file and the platform picks it
 * up on the next push. `catalogue.json`'s install schema has no way to say that, so for those
 * tools it falls back to a bare docs URL. The tool page already links the docs in its own Docs
 * row, so that URL renders as a second copy of a link the reader has just seen. This overlay
 * replaces it with the file itself.
 *
 * Beside the catalogue rather than in it for the same reason as `tool-card-summaries.ts`: the
 * next `chore: update catalogue from shared-workflows` commit overwrites anything written
 * upstream. `install-configs.test.ts` fails if an id here stops naming a real tool, or if a tool
 * whose only install method is a docs link stops having an entry.
 */
export type InstallConfig = {
  label: string;
  /** The path the file goes at. Load-bearing: the content is inert anywhere else. */
  target: string;
  content: string;
  note?: string;
};

export const installConfigs: Record<string, InstallConfig> = {
  dependabot: {
    label: "Config file",
    target: ".github/dependabot.yml",
    content: [
      "version: 2",
      "updates:",
      "  - package-ecosystem: npm",
      "    directory: /",
      "    schedule:",
      "      interval: weekly",
    ].join("\n"),
    // Worth stating outright because the obvious guess is wrong: Dependabot moved GitHub-native
    // in 2021 and github.com/apps/dependabot now redirects to the docs page.
    note: "There is no app to install. GitHub reads this file on push, once Dependabot is enabled under Settings, Code security.",
  },
};
