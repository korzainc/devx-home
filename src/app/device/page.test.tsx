/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import DevicePage from "@/app/device/page";
import { renderStream } from "@/test-utils/render-stream";
import { CLAIM_COOKIE } from "./claim-cookie";

const FAKE_SESSION = {
  user: { id: "user-1", name: "Test User", email: "user@example.com" },
};

const { sessionMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(async (): Promise<typeof FAKE_SESSION | null> => null),
}));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));

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
  it("shows a log in prompt, not the code-entry form, when signed out", async () => {
    sessionMock.mockResolvedValue(null);

    const html = await renderPage();

    expect(html).toContain("Log in with GitHub");
    expect(html).not.toContain("Enter the code your terminal showed");
  });

  it("shows the code-entry form, not the confirm screen, with no claim cookie set", async () => {
    sessionMock.mockResolvedValue(FAKE_SESSION);

    const html = await renderPage();

    expect(html).toContain("Enter the code your terminal showed");
    expect(html).not.toContain("Only approve this if you just ran");
  });

  it("shows the confirm screen with the claimed code only once the claim cookie this app's own action set is present", async () => {
    sessionMock.mockResolvedValue(FAKE_SESSION);
    cookieStore.set(CLAIM_COOKIE, "WDJB-MJHT");

    const html = await renderPage();

    expect(html).toContain("Only approve this if you just ran a Korza CLI");
    expect(html).toContain("Approve sign-in for code");
    expect(html).toContain("WDJB-MJHT");
  });

  // The confirm screen must never be driven by a code value from the query string - that's
  // exactly what would let an attacker's link show it for a code the victim never typed.
  // Forcing the type with a cast (the real prop type doesn't declare this field) confirms
  // passing it has zero effect.
  it("ignores a claimed value smuggled in through the query string", async () => {
    sessionMock.mockResolvedValue(FAKE_SESSION);

    const html = await renderPage({
      claimed: "ATTACKER-CODE",
    } as unknown as Record<string, string>);

    expect(html).not.toContain("ATTACKER-CODE");
    expect(html).toContain("Enter the code your terminal showed");
  });
});
