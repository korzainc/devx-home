/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import DevicePage from "@/app/device/page";
import { renderStream } from "@/test-utils/render-stream";

vi.mock("@/lib/session", () => ({ getSession: async () => null }));

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: new Map<string, string>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name)
        ? { name, value: cookieStore.get(name)! }
        : undefined,
  }),
}));

afterEach(() => {
  cookieStore.clear();
  vi.clearAllMocks();
});

async function renderPage(searchParams: Record<string, string> = {}) {
  return renderStream(
    <DevicePage searchParams={Promise.resolve(searchParams)} />,
    { ready: "all" },
  );
}

describe("DevicePage", () => {
  it("shows the code-entry form, not the confirm screen, with no claim cookie set", async () => {
    const html = await renderPage();

    expect(html).toContain("Enter the code your terminal showed");
    expect(html).not.toContain("Only approve this if you just ran");
  });

  it("shows the confirm screen only once the claim cookie this app's own action set is present", async () => {
    cookieStore.set("device_claim", "WDJB-MJHT");
    const html = await renderPage();

    expect(html).toContain("Only approve this if you just ran a Korza CLI");
    expect(html).toContain('value="WDJB-MJHT"');
  });

  // The core of the fix: the confirm screen used to be driven by `?claimed=<code>` in the URL,
  // which is exactly what let an attacker's link show it for a code the victim never typed.
  // The page no longer reads that field at all, so passing it (even forcing the type with a
  // cast, since the real prop type no longer declares it) must have zero effect.
  it("ignores a claimed value smuggled in through the query string", async () => {
    const html = await renderPage({
      claimed: "ATTACKER-CODE",
    } as unknown as Record<string, string>);

    expect(html).not.toContain("ATTACKER-CODE");
    expect(html).toContain("Enter the code your terminal showed");
  });
});
