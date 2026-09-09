import type { NextConfig } from "next";
import { BUNDLED_ARCHIVE_NAME } from "./src/lib/artifact";
import { getSetupOrigin } from "./src/lib/setup-origin";

const setupOrigin = getSetupOrigin();

const nextConfig: NextConfig = {
  cacheComponents: true,
  async redirects() {
    return [
      // Configured here rather than as a page, so the route walk in `site-footer.test.tsx` does
      // not read the old path as a page owing the footer a second link to the same report.
      {
        source: "/gap-analysis",
        destination: "/ci-coverage",
        permanent: true,
      },
      // The roadmap entry moved with it: its slug is its filename, so renaming the file to match
      // the feature changed a URL that shipped in August.
      {
        source: "/roadmap/gap-analysis",
        destination: "/roadmap/ci-coverage",
        permanent: true,
      },
      {
        source: "/devx/install.sh",
        destination: "/setup",
        permanent: false,
      },
      // The sources are the versioned URLs DevX actually published, so they stay literal.
      // The destinations track the shipped bundle so an old link still resolves rather than
      // 404s once the artifact moves.
      {
        source: "/devx/devx-0.1.0-macos.tar.gz",
        destination: `/korza/${BUNDLED_ARCHIVE_NAME}`,
        permanent: false,
      },
      {
        source: "/devx/devx-0.1.0-macos.tar.gz.sha256",
        destination: `/korza/${BUNDLED_ARCHIVE_NAME}.sha256`,
        permanent: false,
      },
      // The unsuffixed name served several different payloads before the URL was content
      // addressed. Redirecting rather than dropping it keeps the URL resolving, so checksum
      // verification passes when a saved pin matches the current archive and fails when it
      // does not.
      {
        source: "/korza/korza-0.1.0-macos.tar.gz",
        destination: `/korza/${BUNDLED_ARCHIVE_NAME}`,
        permanent: false,
      },
      {
        source: "/korza/korza-0.1.0-macos.tar.gz.sha256",
        destination: `/korza/${BUNDLED_ARCHIVE_NAME}.sha256`,
        permanent: false,
      },
    ];
  },
  // Permit the explicitly configured development origin, including a local tunnel.
  allowedDevOrigins: setupOrigin ? [new URL(setupOrigin).hostname] : [],
};

export default nextConfig;
