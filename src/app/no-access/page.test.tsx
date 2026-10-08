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

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const api = vi.hoisted(() => ({ deviceDeny: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api }) }));

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => db }));

afterEach(() => {
  vi.clearAllMocks();
});

async function renderPage() {
  return renderStream(<NoAccessPage />, { ready: "all" });
}

describe("NoAccessPage", () => {
  it("denies a pending device code claimed by this account, and says so", async () => {
    sessionMock.mockResolvedValue(FAKE_SESSION);
    db.query.mockResolvedValue({ rows: [{ userCode: "WDJB-MJHT" }] });
    api.deviceDeny.mockResolvedValue({ success: true });

    const html = await renderPage();

    expect(api.deviceDeny).toHaveBeenCalledWith({
      body: { userCode: "WDJB-MJHT" },
      headers: expect.any(Headers),
    });
    expect(html).toContain(
      "Korza CLI sign-in waiting on this account has been cancelled",
    );
  });

  it("hints at Ctrl-C instead when there's no pending device code to cancel", async () => {
    sessionMock.mockResolvedValue(FAKE_SESSION);
    db.query.mockResolvedValue({ rows: [] });

    const html = await renderPage();

    expect(api.deviceDeny).not.toHaveBeenCalled();
    expect(html).not.toContain("has been cancelled");
    expect(html).toContain("press Ctrl-C there to stop it");
  });

  it("doesn't query for a device code at all when there's no session", async () => {
    sessionMock.mockResolvedValue(null);

    const html = await renderPage();

    expect(db.query).not.toHaveBeenCalled();
    expect(html).not.toContain("has been cancelled");
  });

  it("hints at Ctrl-C if denying the code fails", async () => {
    sessionMock.mockResolvedValue(FAKE_SESSION);
    db.query.mockResolvedValue({ rows: [{ userCode: "WDJB-MJHT" }] });
    api.deviceDeny.mockRejectedValue(new Error("already processed"));

    const html = await renderPage();

    expect(html).toContain("cannot open Dev");
    expect(html).not.toContain("has been cancelled");
    expect(html).toContain("press Ctrl-C there to stop it");
  });
});
