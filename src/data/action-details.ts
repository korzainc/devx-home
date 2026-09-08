/**
 * What a GitHub Action step takes, authored here rather than synced.
 *
 * The catalogue records an action as a ref and a version and nothing else, which is enough to
 * emit a `uses:` line but not enough to say what belongs under `with:`. The inputs live in the
 * action's own `action.yml` in its repository, so the alternative to this file is fetching a
 * third-party YAML file during the build. That would put every page render behind someone
 * else's repository being up, to save transcribing one table.
 *
 * Curated, not exhaustive: `github/codeql-action/analyze` declares fifteen inputs, several of
 * them deprecated or only meaningful to the action's own internals. `action-details.test.ts`
 * fails if a key here stops matching an action in the catalogue.
 */
export type ActionInput = {
  name: string;
  description: string;
  fallback?: string;
};

export type ActionDetails = {
  /** Rendered above the inputs. For a step that does not stand alone, say so here. */
  note?: string;
  inputs: ActionInput[];
};

export const actionDetails: Record<string, ActionDetails> = {
  "github/codeql-action/analyze": {
    note: "Runs last in a job. It finalizes the database that github/codeql-action/init created earlier in the same job, so this step alone does nothing.",
    inputs: [
      {
        name: "category",
        description:
          "Distinguishes this analysis from others on the same commit, so results are matched to the right run.",
      },
      {
        name: "upload",
        description:
          "Whether to send the SARIF to code scanning. One of always, failure-only, never.",
        fallback: "always",
      },
      {
        name: "output",
        description: "Directory the CodeQL CLI writes its SARIF results into.",
        fallback: "../results",
      },
      {
        name: "checkout_path",
        description:
          "Where the repository was checked out, used to turn absolute paths in the SARIF into relative ones.",
        fallback: "${{ github.workspace }}",
      },
      {
        name: "ram",
        description:
          "Memory in MB for finalization and query execution. Inherited from init when unset.",
      },
      {
        name: "threads",
        description:
          "Threads for finalization and query execution. Inherited from init when unset.",
      },
    ],
  },
};
