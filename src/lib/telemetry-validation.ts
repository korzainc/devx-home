import { createHash } from "node:crypto";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid telemetry object");
  return value as Record<string, unknown>;
}

export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw Error("Invalid telemetry array");
  return value;
}

export const telemetryName = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value);

export const identityText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200;

export const telemetryHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export type Attribute = Record<string, unknown> & {
  key: string;
  value: Record<string, unknown>;
};
export function attributes(value: unknown): Attribute[] {
  const keys = new Set<string>();
  return array(value).map((raw) => {
    const entry = object(raw);
    if (!identityText(entry.key) || keys.has(entry.key))
      throw Error("Invalid telemetry attribute");
    keys.add(entry.key);
    object(entry.value);
    return entry as Attribute;
  });
}

// Date.parse alone normalizes impossible dates such as February 30. Validate each
// calendar/time field before accepting RFC3339 precision from either native exporter.
export function timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return false;
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] =
    match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days[month - 1] &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    (!match[7] || (offsetHour <= 23 && offsetMinute <= 59)) &&
    Number.isFinite(Date.parse(value))
  );
}
