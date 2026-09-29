import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  token: vi.fn(),
  member: vi.fn(),
  store: vi.fn(),
}));
vi.mock("./db", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("./auth", () => ({
  getAuth: () => ({ api: { getAccessToken: mocks.token } }),
}));
vi.mock("./org", () => ({ fetchOrgMembership: mocks.member }));
vi.mock("./membership", () => ({ storeMembership: mocks.store }));
import {
  telemetryMembership,
  TELEMETRY_MEMBERSHIP_MS,
  TELEMETRY_MEMBERSHIP_TIMEOUT_MS,
} from "./telemetry-membership";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValueOnce({
    rows: [
      {
        orgMember: true,
        orgCheckedAt: new Date(Date.now() - TELEMETRY_MEMBERSHIP_MS - 1),
      },
    ],
  });
  mocks.query.mockResolvedValueOnce({ rows: [{ id: "owned-github-account" }] });
  mocks.query.mockResolvedValue({ rows: [{ id: "owner" }] });
  mocks.token.mockResolvedValue({ accessToken: "server-only-test-token" });
  mocks.member.mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());

it("refreshes through the account owner without forwarding bearer request headers", async () => {
  expect(await telemetryMembership("owner")).toBe(true);
  expect(mocks.token).toHaveBeenCalledWith({
    body: { accountId: "owned-github-account", userId: "owner" },
  });
  expect(mocks.member).toHaveBeenCalledWith("server-only-test-token");
  expect(mocks.query.mock.calls[1][1]).toEqual(["owner"]);
});

it("uses only a positive membership verdict within five minutes", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
  mocks.query.mockReset().mockResolvedValue({
    rows: [
      {
        orgMember: true,
        orgCheckedAt: new Date(Date.now() - TELEMETRY_MEMBERSHIP_MS + 1),
        fresh: true,
      },
    ],
  });
  expect(await telemetryMembership("owner")).toBe(true);
  expect(mocks.token).not.toHaveBeenCalled();
  mocks.query.mockResolvedValue({
    rows: [{ orgMember: false, orgCheckedAt: new Date() }],
  });
  expect(await telemetryMembership("owner")).toBe(false);
});

it("does not fall back to an old yes when provider lookup or refresh fails", async () => {
  mocks.member.mockRejectedValue(new Error("provider timeout"));
  await expect(telemetryMembership("owner")).rejects.toThrow(
    "provider timeout",
  );
  expect(mocks.store).not.toHaveBeenCalled();
  mocks.query
    .mockReset()
    .mockResolvedValueOnce({ rows: [{ orgMember: true, orgCheckedAt: null }] })
    .mockResolvedValue({ rows: [{ id: "owned-github-account" }] });
  mocks.token.mockRejectedValue(new Error("refresh unavailable"));
  await expect(telemetryMembership("owner")).rejects.toThrow(
    "refresh unavailable",
  );
  expect(mocks.store).not.toHaveBeenCalled();
});

it("persists confirmed removal so all existing credentials are revoked", async () => {
  mocks.member.mockResolvedValue(false);
  expect(await telemetryMembership("owner")).toBe(false);
  expect(mocks.store).toHaveBeenCalledWith("owner", false);
});

it("cannot overwrite a removal that races an older positive recheck", async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  expect(await telemetryMembership("owner")).toBe(false);
  expect(mocks.query.mock.calls[2][0]).toContain(
    '"orgMember"=true AND "orgCheckedAt" IS NOT DISTINCT FROM',
  );
});

it("refuses missing or ambiguous provider identities and empty tokens", async () => {
  for (const accounts of [[], [{ id: "a" }, { id: "b" }]]) {
    mocks.query
      .mockReset()
      .mockResolvedValueOnce({
        rows: [{ orgMember: true, orgCheckedAt: null }],
      })
      .mockResolvedValue({ rows: accounts });
    expect(await telemetryMembership("owner")).toBe(false);
  }
  expect(mocks.token).not.toHaveBeenCalled();
  mocks.query
    .mockReset()
    .mockResolvedValueOnce({ rows: [{ orgMember: true, orgCheckedAt: null }] })
    .mockResolvedValue({ rows: [{ id: "a" }] });
  mocks.token.mockResolvedValue({ accessToken: null });
  expect(await telemetryMembership("owner")).toBe(false);
  expect(mocks.member).not.toHaveBeenCalled();
});

it("shares a concurrent recheck so one process does not race a single-use refresh token", async () => {
  const provider = Promise.withResolvers<boolean>();
  mocks.member.mockReturnValue(provider.promise);
  const first = telemetryMembership("owner");
  await vi.waitFor(() => expect(mocks.member).toHaveBeenCalledOnce());
  mocks.query.mockResolvedValueOnce({
    rows: [{ orgMember: true, orgCheckedAt: null }],
  });
  const second = telemetryMembership("owner");
  provider.resolve(true);
  expect(await Promise.all([first, second])).toEqual([true, true]);
  expect(mocks.token).toHaveBeenCalledOnce();
});

it("does not pause when another successful recheck advances the cache", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
    rows: [{ orgMember: true, orgCheckedAt: new Date(), fresh: true }],
  });
  expect(await telemetryMembership("owner")).toBe(true);
});

it("bounds hung token refresh without releasing single-flight or writing a late verdict", async () => {
  vi.useFakeTimers();
  mocks.query.mockReset().mockImplementation(async (sql: string) => ({
    rows: sql.startsWith('SELECT "orgMember"')
      ? [{ orgMember: true, orgCheckedAt: null }]
      : [{ id: "owned-github-account" }],
  }));
  const refresh = Promise.withResolvers<{ accessToken: string }>();
  mocks.token.mockReturnValue(refresh.promise);
  const first = telemetryMembership("timeout-owner");
  const rejected = expect(first).rejects.toThrow(
    "Membership provider unavailable",
  );
  await vi.advanceTimersByTimeAsync(TELEMETRY_MEMBERSHIP_TIMEOUT_MS);
  await rejected;
  const second = telemetryMembership("timeout-owner");
  const again = expect(second).rejects.toThrow(
    "Membership provider unavailable",
  );
  await vi.advanceTimersByTimeAsync(TELEMETRY_MEMBERSHIP_TIMEOUT_MS);
  await again;
  expect(mocks.token).toHaveBeenCalledOnce();
  refresh.resolve({ accessToken: "late-token" });
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.store).not.toHaveBeenCalled();
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(
    false,
  );
});

it("refreshes when the database says stale even if the application clock says fresh", async () => {
  mocks.query
    .mockReset()
    .mockResolvedValueOnce({
      rows: [{ orgMember: true, orgCheckedAt: new Date(), fresh: false }],
    })
    .mockResolvedValueOnce({ rows: [{ id: "owned-github-account" }] })
    .mockResolvedValueOnce({ rows: [{ id: "owner" }] });
  expect(await telemetryMembership("owner")).toBe(true);
  expect(mocks.member).toHaveBeenCalledOnce();
});

it("trusts database freshness when its timestamp is ahead of the application clock", async () => {
  mocks.query.mockReset().mockResolvedValueOnce({
    rows: [
      {
        orgMember: true,
        orgCheckedAt: new Date(Date.now() + 600000),
        fresh: true,
      },
    ],
  });
  expect(await telemetryMembership("owner")).toBe(true);
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.store).not.toHaveBeenCalled();
});

it("retries an expired concurrent refresh instead of treating it as a denial", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
    rows: [{ orgMember: true, orgCheckedAt: null, fresh: false }],
  });
  await expect(telemetryMembership("owner")).rejects.toThrow(
    "Membership cache needs rechecking",
  );
  expect(mocks.store).not.toHaveBeenCalled();
});
