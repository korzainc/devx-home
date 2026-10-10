import { expect, it, vi } from "vitest";
import { revokeCredentials } from "./telemetry-auth";

it("rolls back revocation when updating the device fails", async () => {
  const query = vi.fn().mockImplementation(async (sql: string) => {
    if (sql.startsWith("UPDATE telemetry_devices")) throw Error("unavailable");
    return {
      rows: sql.startsWith("SELECT device_id") ? [{ device_id: "device" }] : [],
    };
  });
  const release = vi.fn();
  await expect(
    revokeCredentials({ connect: async () => ({ query, release }) }, "hash"),
  ).rejects.toThrow("unavailable");
  expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  expect(query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
  expect(release).toHaveBeenCalledOnce();
});
