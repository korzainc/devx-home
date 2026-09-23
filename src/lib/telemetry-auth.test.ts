import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  validCallback,
  consentToken,
  verifyConsent,
  exchangeCode,
  issueCode,
  tokenHash,
} from "./telemetry-auth";

const callback = "http://127.0.0.1:49152/callback";
const verifier = "v".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const params = {
  redirect_uri: callback,
  state: "s".repeat(43),
  code_challenge: challenge,
};

describe("callback policy", () => {
  it("accepts only a literal loopback callback with an explicit valid port", () => {
    expect(validCallback(callback)).toBe(true);
    for (const value of [
      "http://localhost:12/callback",
      "https://127.0.0.1:12/callback",
      "http://127.1:12/callback",
      "http://127.0.0.1/callback",
      "http://127.0.0.1:0/callback",
      "http://127.0.0.1:12/callback?x=1",
      "http://127.0.0.1:12/callback#x",
      "http://user@127.0.0.1:12/callback",
      "http://127.0.0.1:12/other",
      "http://127.0.0.1:65536/callback",
      "http://127.0.0.1:12/a/../callback",
    ])
      expect(validCallback(value), value).toBe(false);
  });
});
it("binds CSRF to session, callback, challenge, state and expiration", () => {
  const token = consentToken(params, "session-a", "secret", 1000);
  expect(verifyConsent(token, params, "session-a", "secret", 1001)).toBe(true);
  expect(verifyConsent(token, params, "session-b", "secret", 1001)).toBe(false);
  expect(
    verifyConsent(
      token,
      { ...params, state: "b".repeat(43) },
      "session-a",
      "secret",
      1001,
    ),
  ).toBe(false);
  expect(
    verifyConsent(
      token,
      { ...params, redirect_uri: "http://127.0.0.1:49200/callback" },
      "session-a",
      "secret",
      1001,
    ),
  ).toBe(false);
  expect(
    verifyConsent(
      token,
      { ...params, code_challenge: "a".repeat(43) },
      "session-a",
      "secret",
      1001,
    ),
  ).toBe(false);
  expect(verifyConsent(token, params, "session-a", "secret", 601001)).toBe(
    false,
  );
  expect(verifyConsent(token + "x", params, "session-a", "secret", 1001)).toBe(
    false,
  );
});
it("stores code hashes, never the code, with sixty second expiry", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const code = await issueCode({ query }, "user", params);
  expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const insert = query.mock.calls.find(([sql]) =>
    sql.startsWith("INSERT INTO telemetry_codes"),
  )!;
  expect(insert[1]).toContain(tokenHash(code));
  expect(insert[1]).not.toContain(code);
  expect(insert[0]).toContain("60 seconds");
});
it("atomically consumes a valid bound code and stores only the device token hash", async () => {
  const query = vi.fn().mockImplementation(async (sql: string) => ({
    rows: sql.includes("DELETE FROM telemetry_codes")
      ? [{ user_id: "user" }]
      : [],
  }));
  const release = vi.fn();
  const pool = { connect: async () => ({ query, release }) };
  const result = await exchangeCode(pool, {
    code: "c".repeat(43),
    code_verifier: verifier,
    redirect_uri: callback,
  });
  expect(result?.token).toMatch(/^korza_[A-Za-z0-9_-]{43}$/);
  expect(
    query.mock.calls.find(([sql]) =>
      sql.includes("DELETE FROM telemetry_codes"),
    )?.[1],
  ).toEqual([tokenHash("c".repeat(43)), challenge, callback]);
  expect(JSON.stringify(query.mock.calls)).not.toContain(result?.token);
  expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  expect(release).toHaveBeenCalledOnce();
});
it("creates no credential when the atomic SQL match rejects a code", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const pool = { connect: async () => ({ query, release: vi.fn() }) };
  expect(
    await exchangeCode(pool, {
      code: "c".repeat(43),
      code_verifier: verifier,
      redirect_uri: callback,
    }),
  ).toBeNull();
  expect(
    query.mock.calls.some(([sql]) =>
      sql.includes("INSERT INTO telemetry_devices"),
    ),
  ).toBe(false);
  expect(
    query.mock.calls.find(([sql]) =>
      sql.includes("DELETE FROM telemetry_codes"),
    )?.[0],
  ).toContain("expires_at > now()");
});

it("matches the RFC 7636 S256 vector and rejects invalid exchange shapes", async () => {
  const { pkceChallenge } = await import("./telemetry-auth");
  expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
  const connect = vi.fn();
  for (const input of [
    { code: "x", code_verifier: verifier, redirect_uri: callback },
    { code: "c".repeat(43), code_verifier: "bad", redirect_uri: callback },
    {
      code: "c".repeat(43),
      code_verifier: verifier,
      redirect_uri: "https://attacker.example",
    },
    {
      code: "c".repeat(43),
      code_verifier: verifier,
      redirect_uri: callback,
      unexpected: true,
    },
  ])
    expect(await exchangeCode({ connect }, input)).toBeNull();
  expect(connect).not.toHaveBeenCalled();
});
it("rolls back code consumption if storing the credential fails", async () => {
  const query = vi.fn().mockImplementation(async (sql: string) => {
    if (sql.includes("INSERT INTO telemetry_devices"))
      throw Error("unavailable");
    return {
      rows: sql.includes("DELETE FROM telemetry_codes")
        ? [{ user_id: "user" }]
        : [],
    };
  });
  const release = vi.fn();
  await expect(
    exchangeCode(
      { connect: async () => ({ query, release }) },
      { code: "c".repeat(43), code_verifier: verifier, redirect_uri: callback },
    ),
  ).rejects.toThrow("unavailable");
  expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  expect(release).toHaveBeenCalledOnce();
});

it("binds renewal device identity into the consent signature", () => {
  const device = "11111111-1111-4111-8111-111111111111";
  const renewal = { ...params, device_id: device };
  const csrf = consentToken(renewal, "session", "secret");
  expect(verifyConsent(csrf, renewal, "session", "secret")).toBe(true);
  expect(
    verifyConsent(
      csrf,
      { ...renewal, device_id: "22222222-2222-4222-8222-222222222222" },
      "session",
      "secret",
    ),
  ).toBe(false);
  expect(verifyConsent(csrf, params, "session", "secret")).toBe(false);
});
