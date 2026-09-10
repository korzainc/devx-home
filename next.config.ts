import type { NextConfig } from "next";

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
      {
        source: "/devx/devx-0.1.0-macos.tar.gz",
        destination: "/korza/korza-0.1.0-macos.tar.gz",
        permanent: false,
      },
      {
        source: "/devx/devx-0.1.0-macos.tar.gz.sha256",
        destination: "/korza/korza-0.1.0-macos.tar.gz.sha256",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
