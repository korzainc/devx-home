// Import-free on purpose: next.config.ts reads this to build its legacy redirects, and it is
// loaded before the `@/` path alias resolves, so it cannot reach the setup script's imports.

/** Bump alongside the files committed under public/korza/. */
const BUNDLED_ARTIFACT_VERSION = "0.1.0";

// A digest-named URL gives each bundle a distinct address, so retaining the previous archive
// lets a saved installer script keep downloading the bytes its pin expects.
// setup-script.test.ts fails if the suffix stops matching the committed archive.
const BUNDLED_ARTIFACT_DIGEST = "9e6d2d5c763e";

export const BUNDLED_ARCHIVE_NAME = `korza-${BUNDLED_ARTIFACT_VERSION}-macos-${BUNDLED_ARTIFACT_DIGEST}.tar.gz`;

// The archive the previous production release served. Keeping it committed lets an installer
// script saved from that release finish instead of failing its checksum, and the unsuffixed
// legacy URL redirects to it. Update this at a published refresh, not for a branch-local rebuild:
// an intermediate that never reached main has no saved scripts pinning it.
const PREVIOUS_PUBLISHED_DIGEST = "9f4b57099c56";

export const RETAINED_ARCHIVE_NAMES: readonly string[] = [
  `korza-${BUNDLED_ARTIFACT_VERSION}-macos-${PREVIOUS_PUBLISHED_DIGEST}.tar.gz`,
];
