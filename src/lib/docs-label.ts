// A bare hostname is a fine label for eslint.org or biomejs.dev, but every GitHub-hosted
// entry would otherwise collapse to the same contentless "github.com" or "docs.github.com".
// The two hosts need different segment-picking: github.com/<owner>/<repo> puts the
// distinguishing part first, docs.github.com puts it last.
export function docsLabel(url: string): string {
  const { hostname, pathname } = new URL(url);
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return hostname;

  if (hostname === "github.com") {
    return `${hostname}/${segments.slice(0, 2).join("/")}`;
  }
  if (hostname === "docs.github.com") {
    return `${hostname}/${segments[segments.length - 1]}`;
  }
  return hostname;
}
