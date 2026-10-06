import { createHash } from "node:crypto";

export type Queryable = {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};
export type TransactionPool = {
  connect(): Promise<Queryable & { release(): void }>;
};

export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function revokeCredentials(pool: TransactionPool, hash: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '3s'");
    const { rows } = await client.query(
      "SELECT device_id FROM telemetry_devices WHERE token_hash=$1 FOR UPDATE",
      [hash],
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      "UPDATE telemetry_devices SET revoked_at = COALESCE(revoked_at, now()) WHERE device_id=$1",
      [rows[0].device_id],
    );
    // Retain the token identity and device history for idempotent self-revocation.
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
export function bearerHash(request: Request) {
  const bearer = request.headers.get("authorization");
  return bearer && /^Bearer korza_[A-Za-z0-9_-]{43}$/.test(bearer)
    ? tokenHash(bearer.slice(7))
    : null;
}
