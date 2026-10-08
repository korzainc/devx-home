/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";
import { CLAIM_COOKIE, CLAIM_COOKIE_MAX_AGE_SECONDS } from "./claim-cookie";

// A real cookie jar, not a mock object per call, so `set` in one action and `get` in the page
// agree on what's actually stored, the same guarantee a browser's cookie jar gives in
// production. `cookieOptions` records what `set()` was called with, so a test can assert
// the security properties (httpOnly, sameSite, path, maxAge) the fixes rely on.
const { cookieStore, cookieOptions } = vi.hoisted(() => ({
  cookieStore: new Map<string, string>(),
  cookieOptions: new Map<string, Record<string, unknown>>(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name)
        ? { name, value: cookieStore.get(name)! }
        : undefined,
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      cookieStore.set(name, value);
      cookieOptions.set(name, options ?? {});
    },
    delete: (arg: string | { name: string }) => {
      const name = typeof arg === "string" ? arg : arg.name;
      cookieStore.delete(name);
      cookieOptions.delete(name);
    },
  }),
}));

// Next's real `redirect()` throws a special, digest-carrying error that a test has no reason to
// reconstruct - a distinct marker class proves the same thing: the function threw instead of
// returning, and carries the URL it was given.
class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  deviceVerify: vi.fn(),
  deviceApprove: vi.fn(),
  deviceDeny: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api }) }));

// Stands in for the `deviceClaimAttempt` rate-limit table. The default implementation below
// answers the select-count query with 0, the insert with a fake id, and everything else
// (cleanup, the reject-time delete) with an empty result, so most tests never need to touch
// this directly.
const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => db }));

const {
  approveDeviceLogin,
  claimDeviceCode,
  denyDeviceLogin,
  discardDeviceClaim,
} = await import("./actions");

function formWith(userCode: string) {
  const data = new FormData();
  data.set("userCode", userCode);
  return data;
}

// `count` is the total after this attempt's own insert lands (the code inserts before it
// counts), so 5 means this is the 5th attempt and still allowed; 6 means it's the 6th and
// gets rejected.
function mockAttemptCount(count: number) {
  db.query.mockImplementation(async (sql: string) =>
    sql.includes("count(*)")
      ? { rows: [{ count }] }
      : sql.includes("returning")
        ? { rows: [{ id: "attempt-id" }], rowCount: 1 }
        : { rows: [], rowCount: 1 },
  );
}

beforeEach(() => {
  cookieStore.clear();
  cookieOptions.clear();
  api.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mockAttemptCount(0);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("claimDeviceCode", () => {
  it("claims a pending, reviewable code into a cookie and redirects with no query param", async () => {
    api.deviceVerify.mockResolvedValue({
      status: "pending",
      client_id: "korza-cli",
    });

    await expect(claimDeviceCode(formWith("WDJB-MJHT"))).rejects.toMatchObject({
      url: "/device",
    });

    expect(cookieStore.get(CLAIM_COOKIE)).toBe("WDJB-MJHT");
    expect(api.deviceVerify).toHaveBeenCalledWith({
      query: { user_code: "WDJB-MJHT" },
      headers: expect.any(Headers),
    });
  });

  it("sets the claim cookie httpOnly, sameSite=strict, and scoped to /device", async () => {
    api.deviceVerify.mockResolvedValue({
      status: "pending",
      client_id: "korza-cli",
    });

    await expect(claimDeviceCode(formWith("WDJB-MJHT"))).rejects.toMatchObject({
      url: "/device",
    });

    expect(cookieOptions.get(CLAIM_COOKIE)).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/device",
      maxAge: CLAIM_COOKIE_MAX_AGE_SECONDS,
    });
  });

  // A code already claimed by someone else, or already approved/denied, doesn't make
  // `deviceVerify` throw - it returns normally with no `client_id` (not this session's to
  // review) or a `status` other than "pending". Either must land on the error state, never
  // set the claim cookie.
  it("does not set the claim cookie for a code this session cannot review", async () => {
    api.deviceVerify.mockResolvedValue({ status: "pending" }); // no client_id: someone else's

    await expect(claimDeviceCode(formWith("WDJB-MJHT"))).rejects.toMatchObject({
      url: "/device?error=1",
    });

    expect(cookieStore.has(CLAIM_COOKIE)).toBe(false);
  });

  it("does not set the claim cookie for a code that's already been approved or denied", async () => {
    api.deviceVerify.mockResolvedValue({
      status: "approved",
      client_id: "korza-cli",
    });

    await expect(claimDeviceCode(formWith("WDJB-MJHT"))).rejects.toMatchObject({
      url: "/device?error=1",
    });

    expect(cookieStore.has(CLAIM_COOKIE)).toBe(false);
  });

  it("redirects to the error state on a wrong or expired code without setting a cookie", async () => {
    api.deviceVerify.mockRejectedValue(
      new APIError("BAD_REQUEST", { message: "invalid code" }),
    );

    await expect(claimDeviceCode(formWith("WRONG"))).rejects.toMatchObject({
      url: "/device?error=1",
    });

    expect(cookieStore.has(CLAIM_COOKIE)).toBe(false);
  });

  it("does nothing for an empty or whitespace-only submission", async () => {
    await claimDeviceCode(formWith("   "));

    expect(api.deviceVerify).not.toHaveBeenCalled();
    expect(cookieStore.has(CLAIM_COOKIE)).toBe(false);
  });

  it("trims and uppercases a pasted code before verifying and storing it", async () => {
    api.deviceVerify.mockResolvedValue({
      status: "pending",
      client_id: "korza-cli",
    });

    await expect(
      claimDeviceCode(formWith(" wdjb-mjht ")),
    ).rejects.toMatchObject({ url: "/device" });

    expect(api.deviceVerify).toHaveBeenCalledWith({
      query: { user_code: "WDJB-MJHT" },
      headers: expect.any(Headers),
    });
    expect(cookieStore.get(CLAIM_COOKIE)).toBe("WDJB-MJHT");
  });

  it("redirects to the error state with no session, without calling deviceVerify", async () => {
    api.getSession.mockResolvedValue(null);

    await expect(claimDeviceCode(formWith("WDJB-MJHT"))).rejects.toMatchObject({
      url: "/device?error=1",
    });

    expect(api.deviceVerify).not.toHaveBeenCalled();
  });

  // Better Auth's own device rate limiter is attached to the plugin's disabled HTTP route,
  // so it never runs for this server action - this per-user counter is what's left.
  describe("rate limiting", () => {
    it("rejects a 6th attempt within the window without calling deviceVerify", async () => {
      mockAttemptCount(6);

      await expect(
        claimDeviceCode(formWith("WDJB-MJHT")),
      ).rejects.toMatchObject({ url: "/device?error=1" });

      expect(api.deviceVerify).not.toHaveBeenCalled();
    });

    it("records this attempt before counting, so the count always includes it", async () => {
      mockAttemptCount(5);
      api.deviceVerify.mockResolvedValue({
        status: "pending",
        client_id: "korza-cli",
      });

      await expect(
        claimDeviceCode(formWith("WDJB-MJHT")),
      ).rejects.toMatchObject({ url: "/device" });

      const sqlCalls = db.query.mock.calls.map(([sql]) => sql as string);
      const insertIndex = sqlCalls.findIndex((sql) =>
        sql.includes("insert into"),
      );
      const countIndex = sqlCalls.findIndex((sql) => sql.includes("count(*)"));
      expect(insertIndex).toBeGreaterThanOrEqual(0);
      expect(insertIndex).toBeLessThan(countIndex);
    });

    it("removes a rejected attempt's own row so retrying doesn't extend the lockout", async () => {
      mockAttemptCount(6);

      await expect(
        claimDeviceCode(formWith("WDJB-MJHT")),
      ).rejects.toMatchObject({ url: "/device?error=1" });

      expect(db.query).toHaveBeenCalledWith(
        `delete from "deviceClaimAttempt" where "id" = $1`,
        ["attempt-id"],
      );
    });

    it("allows the 5th attempt, exactly at the limit, and keeps its own row", async () => {
      mockAttemptCount(5);
      api.deviceVerify.mockResolvedValue({
        status: "pending",
        client_id: "korza-cli",
      });

      await expect(
        claimDeviceCode(formWith("WDJB-MJHT")),
      ).rejects.toMatchObject({ url: "/device" });

      expect(api.deviceVerify).toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalledWith(
        expect.stringContaining(`delete from "deviceClaimAttempt" where "id"`),
        expect.anything(),
      );
    });

    it("opportunistically cleans up stale claim-attempt rows on every attempt", async () => {
      mockAttemptCount(1);
      api.deviceVerify.mockResolvedValue({
        status: "pending",
        client_id: "korza-cli",
      });

      await expect(
        claimDeviceCode(formWith("WDJB-MJHT")),
      ).rejects.toMatchObject({ url: "/device" });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining(
          `delete from "deviceClaimAttempt" where "createdAt" < now() - interval '1 hour'`,
        ),
      );
    });
  });
});

describe("approveDeviceLogin", () => {
  it("clears the claim cookie and redirects to the approved done state", async () => {
    cookieStore.set(CLAIM_COOKIE, "WDJB-MJHT");
    api.deviceApprove.mockResolvedValue({ success: true });

    await expect(approveDeviceLogin()).rejects.toMatchObject({
      url: "/device/done?outcome=approved",
    });

    expect(cookieStore.has(CLAIM_COOKIE)).toBe(false);
    expect(api.deviceApprove).toHaveBeenCalledWith({
      body: { userCode: "WDJB-MJHT" },
      headers: expect.any(Headers),
    });
  });

  it("redirects to the error state with no claim cookie, without calling deviceApprove", async () => {
    await expect(approveDeviceLogin()).rejects.toMatchObject({
      url: "/device?error=1",
    });

    expect(api.deviceApprove).not.toHaveBeenCalled();
  });

  // A code that expired while the confirm screen sat open, or was already resolved elsewhere,
  // surfaces as an APIError from deviceApprove - this must land on a sensible error state
  // instead of crashing to Next's generic error page.
  it("catches an APIError from an already-resolved or expired code and redirects to the error state", async () => {
    cookieStore.set(CLAIM_COOKIE, "WDJB-MJHT");
    api.deviceApprove.mockRejectedValue(
      new APIError("BAD_REQUEST", { message: "device_code_already_processed" }),
    );

    await expect(approveDeviceLogin()).rejects.toMatchObject({
      url: "/device?error=1",
    });

    expect(cookieStore.has(CLAIM_COOKIE)).toBe(false);
  });

  it("does not swallow a non-APIError thrown by deviceApprove", async () => {
    cookieStore.set(CLAIM_COOKIE, "WDJB-MJHT");
    api.deviceApprove.mockRejectedValue(new Error("boom"));

    await expect(approveDeviceLogin()).rejects.toThrow("boom");
  });
});

describe("denyDeviceLogin", () => {
  it("clears the claim cookie and redirects to the denied done state", async () => {
    cookieStore.set(CLAIM_COOKIE, "WDJB-MJHT");
    api.deviceDeny.mockResolvedValue({ success: true });

    await expect(denyDeviceLogin()).rejects.toMatchObject({
      url: "/device/done?outcome=denied",
    });

    expect(cookieStore.has(CLAIM_COOKIE)).toBe(false);
  });

  it("redirects to the error state with no claim cookie, without calling deviceDeny", async () => {
    await expect(denyDeviceLogin()).rejects.toMatchObject({
      url: "/device?error=1",
    });

    expect(api.deviceDeny).not.toHaveBeenCalled();
  });

  it("catches an APIError from deviceDeny and redirects to the error state", async () => {
    cookieStore.set(CLAIM_COOKIE, "WDJB-MJHT");
    api.deviceDeny.mockRejectedValue(
      new APIError("BAD_REQUEST", { message: "device_code_already_processed" }),
    );

    await expect(denyDeviceLogin()).rejects.toMatchObject({
      url: "/device?error=1",
    });
  });
});

describe("discardDeviceClaim", () => {
  it("clears the claim cookie and returns to the code-entry form", async () => {
    cookieStore.set(CLAIM_COOKIE, "WDJB-MJHT");

    await expect(discardDeviceClaim()).rejects.toMatchObject({
      url: "/device",
    });

    expect(cookieStore.has(CLAIM_COOKIE)).toBe(false);
  });
});
