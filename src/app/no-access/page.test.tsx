/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import NoAccessPage from "@/app/no-access/page";
import { renderStream } from "@/test-utils/render-stream";

const FAKE_SESSION = {
  user: { id: "user-1", name: "Test User", email: "user@example.com" },
};

const { sessionMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(async (): Promise<typeof FAKE_SESSION | null> => null),
}));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => db }));

afterEach(() => {
  vi.clearAllMocks();
});

async function renderPage(searchParams: Record<string, string> = {}) {
  return renderStream(
    <NoAccessPage searchParams={Promise.resolve(searchParams)} />,
    { ready: "all" },
  );
}

describe("NoAccessPage", () => {
  // The page must stay read-only on a GET - it can only check whether a code is pending,
  // never deny one. Denying happens only through cancelPendingDeviceCode, an explicit
  // button/POST (see actions.test.ts).
  it("never calls a mutation while rendering, regardless of what's pending", async () => {
    sessionMock.mockResolvedValue(FAKE_SESSION);
    db.query.mockResolvedValue({ rows: [{}] });

    await renderPage();

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toMatch(/^select 1 from/);
  });

  it("shows a cancel button when a code is pending", async () => {
    sessionMock.mockResolvedValue(FAKE_SESSION);
    db.query.mockResolvedValue({ rows: [{}] });

    const html = await renderPage();

    expect(html).toContain("Cancel the pending CLI sign-in");
    expect(html).toContain("tied to this account");
    expect(html).not.toContain("has been cancelled");
  });

  it("hints at Ctrl-C instead when nothing is pending", async () => {
    sessionMock.mockResolvedValue(FAKE_SESSION);
    db.query.mockResolvedValue({ rows: [] });

    const html = await renderPage();

    expect(html).not.toContain("Cancel the pending CLI sign-in");
    expect(html).not.toContain("tied to this account");
    expect(html).toContain("press Ctrl-C there to stop it");
  });

  it("doesn't query for a pending code at all when there's no session", async () => {
    sessionMock.mockResolvedValue(null);

    const html = await renderPage();

    expect(db.query).not.toHaveBeenCalled();
    expect(html).not.toContain("Cancel the pending CLI sign-in");
  });

  it("shows the cancelled confirmation after a successful cancel, without re-querying", async () => {
    sessionMock.mockResolvedValue(FAKE_SESSION);

    const html = await renderPage({ cancelled: "1" });

    expect(db.query).not.toHaveBeenCalled();
    expect(html).toContain("has been cancelled");
    expect(html).not.toContain("Cancel the pending CLI sign-in");
  });
});
