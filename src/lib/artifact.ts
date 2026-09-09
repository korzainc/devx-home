// Import-free on purpose: next.config.ts reads this to build its legacy redirects, and it is
// loaded before the `@/` path alias resolves, so it cannot reach the setup script's imports.

/** Bump alongside the files committed under public/korza/. */
const BUNDLED_ARTIFACT_VERSION = "0.1.0";

export const BUNDLED_ARCHIVE_NAME = `korza-${BUNDLED_ARTIFACT_VERSION}-macos.tar.gz`;
