import { describe, expect, it } from "vitest";
import catalogueData from "@/data/catalogue.json";
import { docsLabel } from "./docs-label";

describe("docsLabel", () => {
  it("keeps github.com/<owner>/<repo> for a github.com docs URL", () => {
    expect(docsLabel("https://github.com/hadolint/hadolint")).toBe(
      "github.com/hadolint/hadolint",
    );
  });

  it("uses the last path segment, not the locale/category prefix, for docs.github.com", () => {
    // codeql and dependabot share the "en/code-security" locale+category prefix; only the
    // last segment (the actual topic slug) tells them apart.
    expect(
      docsLabel(
        "https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql",
      ),
    ).toBe("docs.github.com/about-code-scanning-with-codeql");
    expect(
      docsLabel("https://docs.github.com/en/code-security/dependabot"),
    ).toBe("docs.github.com/dependabot");
  });

  it("falls back to the bare hostname when there's no distinguishing path", () => {
    expect(docsLabel("https://eslint.org/docs/latest/")).toBe("eslint.org");
    expect(docsLabel("https://github.com")).toBe("github.com");
  });

  it("gives every real catalogue entry a docsLabel distinct from every other entry", () => {
    // Guards against two catalogue entries producing the same docs label, like codeql and
    // dependabot both collapsing to "docs.github.com/en/code-security".
    const entries = [
      ...Object.values(catalogueData.tools),
      ...Object.values(catalogueData.bundles),
    ];

    const labelsByUrl = new Map<string, string>();
    for (const entry of entries) {
      labelsByUrl.set(entry.docsUrl, docsLabel(entry.docsUrl));
    }
    const uniqueUrls = [...labelsByUrl.keys()];
    const labels = uniqueUrls.map((url) => labelsByUrl.get(url));

    // Grouping by distinct docsUrl first means two entries that genuinely share the same
    // docsUrl (and therefore the same label) don't get flagged as a collision.
    expect(
      new Set(labels).size,
      `expected ${uniqueUrls.length} distinct docsUrls to produce distinct labels, got: ${JSON.stringify(labels)}`,
    ).toBe(uniqueUrls.length);
  });
});
