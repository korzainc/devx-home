/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import DeviceDonePage from "@/app/device/done/page";
import { renderStream } from "@/test-utils/render-stream";

async function renderPage(searchParams: Record<string, string> = {}) {
  return renderStream(
    <DeviceDonePage searchParams={Promise.resolve(searchParams)} />,
    { ready: "all" },
  );
}

describe("DeviceDonePage", () => {
  it("shows the approved state only for outcome=approved", async () => {
    const html = await renderPage({ outcome: "approved" });

    expect(html).toContain("Approved");
    expect(html).toContain("Return to your terminal");
  });

  it("shows the denied state for outcome=denied", async () => {
    const html = await renderPage({ outcome: "denied" });

    expect(html).toContain("Denied");
    expect(html).toContain("run the CLI command again to get a new code");
  });

  // Fix 5: anything that isn't exactly "approved" must not render the approved copy - a missing,
  // misspelled, or forged outcome is a false confirmation otherwise.
  it("shows a neutral state, not the approved copy, for a missing outcome", async () => {
    const html = await renderPage();

    expect(html).not.toContain("Approved");
    expect(html).not.toContain("Return to your terminal");
    expect(html).toContain("Nothing to confirm");
  });

  it("shows a neutral state, not the approved copy, for an unrecognized outcome", async () => {
    const html = await renderPage({ outcome: "bogus" });

    expect(html).not.toContain("Approved");
    expect(html).toContain("Nothing to confirm");
  });
});
