import { afterEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  deviceDeny: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api }) }));

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => db }));

const { cancelPendingDeviceCode } = await import("./actions");

afterEach(() => {
  vi.clearAllMocks();
});

describe("cancelPendingDeviceCode", () => {
  it("denies every pending code for the re-checked session and redirects with confirmation", async () => {
    api.getSession.mockResolvedValue({ user: { id: "user-1" } });
    db.query.mockResolvedValue({
      rows: [{ userCode: "WDJB-MJHT" }, { userCode: "XYZQ-PRST" }],
    });
    api.deviceDeny.mockResolvedValue({ success: true });

    await expect(cancelPendingDeviceCode()).rejects.toMatchObject({
      url: "/no-access?cancelled=1",
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/^select "userCode"/);
    expect(sql).not.toMatch(/limit/i);
    expect(params).toEqual(["user-1"]);
    expect(api.deviceDeny).toHaveBeenCalledTimes(2);
    expect(api.deviceDeny).toHaveBeenCalledWith({
      body: { userCode: "WDJB-MJHT" },
      headers: expect.any(Headers),
    });
    expect(api.deviceDeny).toHaveBeenCalledWith({
      body: { userCode: "XYZQ-PRST" },
      headers: expect.any(Headers),
    });
  });

  it("still redirects with confirmation when a code was already denied or expired", async () => {
    api.getSession.mockResolvedValue({ user: { id: "user-1" } });
    db.query.mockResolvedValue({ rows: [{ userCode: "WDJB-MJHT" }] });
    api.deviceDeny.mockRejectedValue(
      new APIError("BAD_REQUEST", { message: "device_code_already_processed" }),
    );

    await expect(cancelPendingDeviceCode()).rejects.toMatchObject({
      url: "/no-access?cancelled=1",
    });
  });

  it("does not swallow a genuine failure as a false confirmation", async () => {
    api.getSession.mockResolvedValue({ user: { id: "user-1" } });
    db.query.mockResolvedValue({ rows: [{ userCode: "WDJB-MJHT" }] });
    api.deviceDeny.mockRejectedValue(new Error("boom"));

    await expect(cancelPendingDeviceCode()).rejects.toThrow("boom");
  });

  it("redirects without a false confirmation when nothing was pending", async () => {
    api.getSession.mockResolvedValue({ user: { id: "user-1" } });
    db.query.mockResolvedValue({ rows: [] });

    await expect(cancelPendingDeviceCode()).rejects.toMatchObject({
      url: "/no-access",
    });

    expect(api.deviceDeny).not.toHaveBeenCalled();
  });

  it("redirects without querying when the session can't be re-confirmed", async () => {
    api.getSession.mockResolvedValue(null);

    await expect(cancelPendingDeviceCode()).rejects.toMatchObject({
      url: "/no-access",
    });

    expect(db.query).not.toHaveBeenCalled();
  });
});
