// Import-free on purpose: next.config.ts reads this to build its legacy redirects, and it is
// loaded before the `@/` path alias resolves, so it cannot reach the setup script's imports.

/** Bump alongside the files committed under public/korza/. */
const BUNDLED_ARTIFACT_VERSION = "0.1.0";

// A digest-named URL gives each bundle a distinct address, so retaining the previous archive
// lets a saved installer script keep downloading the bytes its pin expects.
// setup-script.test.ts fails if the suffix stops matching the committed archive.
const BUNDLED_ARTIFACT_DIGEST = "9e6d2d5c763e";

export const BUNDLED_ARCHIVE_NAME = `korza-${BUNDLED_ARTIFACT_VERSION}-macos-${BUNDLED_ARTIFACT_DIGEST}.tar.gz`;

/**
 * Superseded archives still committed so a saved installer script pinning one keeps resolving.
 * On a refresh, add the outgoing name and drop the one before it. Listing a name without
 * committing its files fails setup-script.test.ts.
 */
export const RETAINED_ARCHIVE_NAMES: readonly string[] = [
  "korza-0.1.0-macos-0b4f0cb34097.tar.gz",
];
