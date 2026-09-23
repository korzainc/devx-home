import { beforeEach, describe, expect, it, vi } from "vitest";
import { isFresh, RECHECK_AFTER_MS, RETRY_DENIED_AFTER_MS } from "./membership";

/**
 * Two things are worth pinning here, and they are the two that decide whether this gate is any
 * good: when a stored verdict stops being trusted, and what happens when GitHub cannot be asked.
 * Both are judgement calls rather than derivable, so they are written down as assertions.
 */

describe("isFresh", () => {
  const now = Date.UTC(2026, 8, 18, 12, 0, 0);
  const fresh = (at: Date | string | null) =>
    isFresh(at, RECHECK_AFTER_MS, now);

  it("treats a never-checked row as stale", () => {
    // Every row that existed before the column did, which is what re-checks them all once.
    expect(fresh(null)).toBe(false);
  });

  it("trusts a check from a moment ago", () => {
    expect(fresh(new Date(now - 60_000))).toBe(true);
  });

  it("stops trusting one past the window", () => {
    expect(fresh(new Date(now - RECHECK_AFTER_MS - 1))).toBe(false);
    expect(fresh(new Date(now - RECHECK_AFTER_MS + 1))).toBe(true);
  });

  it("measures against the window it is given", () => {
    // The same timestamp is fresh for a yes and stale for a no, which is the whole reason the
    // window is a parameter.
    const at = new Date(now - RETRY_DENIED_AFTER_MS - 1);
    expect(isFresh(at, RECHECK_AFTER_MS, now)).toBe(true);
    expect(isFresh(at, RETRY_DENIED_AFTER_MS, now)).toBe(false);
  });

  it("accepts a string, because that is what the driver may hand back", () => {
    expect(fresh(new Date(now - 60_000).toISOString())).toBe(true);
  });

  it("treats an unparseable timestamp as stale rather than as fresh", () => {
    expect(fresh("not a date")).toBe(false);
  });

  it("tolerates a timestamp slightly in the future", () => {
    // Clock skew between the app and Postgres, which writes the value with its own now(). The
    // alternative reading is "impossible, so re-check", which would re-check every request for
    // as long as the skew lasted.
    expect(fresh(new Date(now + 5_000))).toBe(true);
  });
});

describe("isOrgMember", () => {
  const user = { id: "u1", orgMember: false, orgCheckedAt: null };
  const headers = new Headers();

  // Mocked rather than reached: this is about the decision around the call, not the call.
  const fetchOrgMembership = vi.fn();
  const listUserAccounts = vi.fn();
  const getAccessToken = vi.fn();
  const query = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("./org", () => ({ fetchOrgMembership }));
    vi.doMock("./auth", () => ({
      getAuth: () => ({ api: { listUserAccounts, getAccessToken } }),
    }));
    vi.doMock("./db", () => ({ getPool: () => ({ query }) }));

    listUserAccounts.mockResolvedValue([{ id: "a1", providerId: "github" }]);
    getAccessToken.mockResolvedValue({ accessToken: "gho_token" });
  });

  async function subject() {
    return (await import("./membership")).isOrgMember;
  }

  it("does not call GitHub when the stored yes is fresh", async () => {
    const isOrgMember = await subject();

    await expect(
      isOrgMember(headers, {
        id: "u1",
        orgMember: true,
        orgCheckedAt: new Date(),
      }),
    ).resolves.toBe(true);
    expect(fetchOrgMembership).not.toHaveBeenCalled();
  });

  it("fresh grant verification ignores even a current cached yes", async () => {
    const isOrgMember = await subject();
    fetchOrgMembership.mockResolvedValue(false);
    await expect(
      isOrgMember(
        headers,
        { id: "u1", orgMember: true, orgCheckedAt: new Date() },
        { fresh: true },
      ),
    ).resolves.toBe(false);
    expect(fetchOrgMembership).toHaveBeenCalledOnce();
  });

  it("fresh grant verification fails closed during an outage", async () => {
    const isOrgMember = await subject();
    fetchOrgMembership.mockRejectedValue(new Error("unavailable"));
    await expect(
      isOrgMember(
        headers,
        { id: "u1", orgMember: true, orgCheckedAt: new Date() },
        { fresh: true },
      ),
    ).resolves.toBe(false);
  });

  it("re-checks a stored yes that has gone stale", async () => {
    // The revocation path. Without this, someone who leaves the organisation keeps access.
    const isOrgMember = await subject();
    fetchOrgMembership.mockResolvedValue(false);

    await expect(
      isOrgMember(headers, {
        id: "u1",
        orgMember: true,
        orgCheckedAt: new Date(Date.now() - RECHECK_AFTER_MS - 1000),
      }),
    ).resolves.toBe(false);
    expect(fetchOrgMembership).toHaveBeenCalledOnce();
  });

  it("re-checks a stored no after a short wait, not the long one", async () => {
    // Somebody refused a minute ago and added to the organisation since should get in now rather
    // than in twelve hours.
    const isOrgMember = await subject();
    fetchOrgMembership.mockResolvedValue(true);

    await expect(
      isOrgMember(headers, {
        id: "u1",
        orgMember: false,
        orgCheckedAt: new Date(Date.now() - RETRY_DENIED_AFTER_MS - 1000),
      }),
    ).resolves.toBe(true);
    expect(fetchOrgMembership).toHaveBeenCalledOnce();
  });

  it("does not call GitHub again for a refusal it just made", async () => {
    // Otherwise every request from a non-member is a GitHub call, and Next's link prefetching
    // turns one page into several.
    const isOrgMember = await subject();

    await expect(
      isOrgMember(headers, {
        id: "u1",
        orgMember: false,
        orgCheckedAt: new Date(),
      }),
    ).resolves.toBe(false);
    expect(fetchOrgMembership).not.toHaveBeenCalled();
  });

  it("writes the verdict it reached", async () => {
    const isOrgMember = await subject();
    fetchOrgMembership.mockResolvedValue(true);

    await isOrgMember(headers, user);

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]![1]).toEqual([true, "u1"]);
  });

  it("returns the fresh verdict even when it cannot be stored", async () => {
    // A failed cache write must not fall back to the stored answer. Otherwise a database blip
    // during the re-check of somebody just removed from the organisation returns their old yes.
    const isOrgMember = await subject();
    fetchOrgMembership.mockResolvedValue(false);
    query.mockRejectedValue(new Error("write failed"));

    await expect(
      isOrgMember(headers, {
        id: "u1",
        orgMember: true,
        orgCheckedAt: new Date(Date.now() - RECHECK_AFTER_MS - 1000),
      }),
    ).resolves.toBe(false);
  });

  it("keeps a confirmed member in when GitHub cannot be reached", async () => {
    // A rate limit or an outage must not evict the company. Nothing is written, so the next
    // request tries again.
    const isOrgMember = await subject();
    fetchOrgMembership.mockRejectedValue(new Error("403"));

    await expect(
      isOrgMember(headers, {
        id: "u1",
        orgMember: true,
        orgCheckedAt: new Date(Date.now() - RECHECK_AFTER_MS - 1000),
      }),
    ).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it("refuses somebody never confirmed when GitHub cannot be reached", async () => {
    // The other half of failing closed. An unreachable GitHub must not be a way in.
    const isOrgMember = await subject();
    fetchOrgMembership.mockRejectedValue(new Error("403"));

    await expect(isOrgMember(headers, user)).resolves.toBe(false);
  });

  it("refuses when there is no GitHub account on the session", async () => {
    const isOrgMember = await subject();
    listUserAccounts.mockResolvedValue([]);

    await expect(isOrgMember(headers, user)).resolves.toBe(false);
    expect(fetchOrgMembership).not.toHaveBeenCalled();
  });

  it("refuses when the token cannot be refreshed", async () => {
    // The 6 month refresh window closing, or a single-use refresh token already spent.
    const isOrgMember = await subject();
    getAccessToken.mockResolvedValue({ accessToken: null });

    await expect(isOrgMember(headers, user)).resolves.toBe(false);
  });
});
