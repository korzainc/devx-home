/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";

// A real cookie jar, not a mock object per call, so `set` in one action and `get` in the page
// component agree on what's actually stored - the same thing a browser's cookie jar guarantees
// in production.
const { cookieStore } = vi.hoisted(() => ({
  cookieStore: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name)
        ? { name, value: cookieStore.get(name)! }
        : undefined,
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (arg: string | { name: string }) => {
      cookieStore.delete(typeof arg === "string" ? arg : arg.name);
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
  deviceVerify: vi.fn(),
  deviceApprove: vi.fn(),
  deviceDeny: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api }) }));

const { approveDeviceLogin, claimDeviceCode, denyDeviceLogin } =
  await import("./actions");

function formWith(userCode: string) {
  const data = new FormData();
  data.set("userCode", userCode);
  return data;
}

beforeEach(() => {
  cookieStore.clear();
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

    expect(cookieStore.get("device_claim")).toBe("WDJB-MJHT");
    expect(api.deviceVerify).toHaveBeenCalledWith({
      query: { user_code: "WDJB-MJHT" },
      headers: expect.any(Headers),
    });
  });

  // This is the case the vulnerability relied on: a code already claimed by someone else, or
  // already approved/denied, doesn't make `deviceVerify` throw - it returns normally with no
  // `client_id` (not this session's to review) or a `status` other than "pending". Either must
  // land on the error state, never set the claim cookie.
  it("does not set the claim cookie for a code this session cannot review", async () => {
    api.deviceVerify.mockResolvedValue({ status: "pending" }); // no client_id: someone else's

    await expect(claimDeviceCode(formWith("WDJB-MJHT"))).rejects.toMatchObject({
      url: "/device?error=1",
    });

    expect(cookieStore.has("device_claim")).toBe(false);
  });

  it("does not set the claim cookie for a code that's already been approved or denied", async () => {
    api.deviceVerify.mockResolvedValue({
      status: "approved",
      client_id: "korza-cli",
    });

    await expect(claimDeviceCode(formWith("WDJB-MJHT"))).rejects.toMatchObject({
      url: "/device?error=1",
    });

    expect(cookieStore.has("device_claim")).toBe(false);
  });

  it("redirects to the error state on a wrong or expired code without setting a cookie", async () => {
    api.deviceVerify.mockRejectedValue(
      new APIError("BAD_REQUEST", { message: "invalid code" }),
    );

    await expect(claimDeviceCode(formWith("WRONG"))).rejects.toMatchObject({
      url: "/device?error=1",
    });

    expect(cookieStore.has("device_claim")).toBe(false);
  });

  it("does nothing for an empty submission", async () => {
    await claimDeviceCode(formWith(""));

    expect(api.deviceVerify).not.toHaveBeenCalled();
    expect(cookieStore.has("device_claim")).toBe(false);
  });
});

describe("approveDeviceLogin", () => {
  it("clears the claim cookie and redirects to the approved done state", async () => {
    cookieStore.set("device_claim", "WDJB-MJHT");
    api.deviceApprove.mockResolvedValue({ success: true });

    await expect(
      approveDeviceLogin(formWith("WDJB-MJHT")),
    ).rejects.toMatchObject({ url: "/device/done?outcome=approved" });

    expect(cookieStore.has("device_claim")).toBe(false);
  });

  // A code that expired while the confirm screen sat open, or was already resolved elsewhere,
  // surfaces as an APIError from deviceApprove - this must land on a sensible error state
  // instead of crashing to Next's generic error page.
  it("catches an APIError from an already-resolved or expired code and redirects to the error state", async () => {
    cookieStore.set("device_claim", "WDJB-MJHT");
    api.deviceApprove.mockRejectedValue(
      new APIError("BAD_REQUEST", { message: "device_code_already_processed" }),
    );

    await expect(
      approveDeviceLogin(formWith("WDJB-MJHT")),
    ).rejects.toMatchObject({ url: "/device?error=1" });

    expect(cookieStore.has("device_claim")).toBe(false);
  });

  it("does not swallow a non-APIError thrown by deviceApprove", async () => {
    api.deviceApprove.mockRejectedValue(new Error("boom"));

    await expect(approveDeviceLogin(formWith("WDJB-MJHT"))).rejects.toThrow(
      "boom",
    );
  });
});

describe("denyDeviceLogin", () => {
  it("clears the claim cookie and redirects to the denied done state", async () => {
    cookieStore.set("device_claim", "WDJB-MJHT");
    api.deviceDeny.mockResolvedValue({ success: true });

    await expect(denyDeviceLogin(formWith("WDJB-MJHT"))).rejects.toMatchObject({
      url: "/device/done?outcome=denied",
    });

    expect(cookieStore.has("device_claim")).toBe(false);
  });

  it("catches an APIError from deviceDeny and redirects to the error state", async () => {
    cookieStore.set("device_claim", "WDJB-MJHT");
    api.deviceDeny.mockRejectedValue(
      new APIError("BAD_REQUEST", { message: "device_code_already_processed" }),
    );

    await expect(denyDeviceLogin(formWith("WDJB-MJHT"))).rejects.toMatchObject({
      url: "/device?error=1",
    });
  });
});
