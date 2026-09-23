import { expect, it } from "vitest";
import { parseBatch } from "./telemetry-events";
const event = {
  id: "a".repeat(64),
  kind: "skill_activated",
  client: "claude",
  source: "native_otel",
  occurredAt: "2026-09-23T00:00:00.000Z",
  plugin: "humanizer",
  skill: "humanizer",
};
const metric = {
  id: "b".repeat(64),
  value: 2,
  temporality: 2,
  plugin: "codezen",
  skill: "brainstorm",
  invokeType: "explicit",
};
it("accepts normalized approved records only", () => {
  expect(parseBatch({ events: [event], metrics: [metric] })).toEqual({
    events: [event],
    metrics: [metric],
  });
});
it("rejects arbitrary content, invalid client/source combinations and unapproved names", () => {
  for (const e of [
    { ...event, prompt: "secret" },
    { ...event, client: "codex" },
    { ...event, source: "korza_cli" },
    { ...event, skill: "/private/file" },
    { ...event, plugin: "other" },
    { ...event, id: "session-name" },
    { ...event, occurredAt: "yesterday" },
    { ...event, kind: "plugin_installed" },
  ])
    expect(() => parseBatch({ events: [e], metrics: [] })).toThrow();
  for (const m of [
    { ...metric, prompt: "secret" },
    { ...metric, value: -1 },
    { ...metric, value: 0.2 },
    { ...metric, value: Number.MAX_SAFE_INTEGER + 1 },
    { ...metric, temporality: 0 },
    { ...metric, plugin: "other" },
    { ...metric, skill: "someone@example.com" },
  ])
    expect(() => parseBatch({ events: [], metrics: [m] })).toThrow();
  expect(() =>
    parseBatch({ events: [], metrics: [], private: "secret" }),
  ).toThrow();
});
it("enforces total batch limit and both arrays", () => {
  expect(() =>
    parseBatch({ events: Array(1001).fill(event), metrics: [] }),
  ).toThrow();
  expect(() =>
    parseBatch({ events: Array(1000).fill(event), metrics: [metric] }),
  ).toThrow();
  expect(() => parseBatch({ events: [] })).toThrow();
});
it("accepts only verified CLI install shape for Codex", () => {
  expect(
    parseBatch({
      events: [
        {
          ...event,
          client: "codex",
          source: "korza_cli",
          kind: "plugin_installed",
          skill: null,
        },
      ],
      metrics: [],
    }).events,
  ).toHaveLength(1);
});

it("accepts RFC3339 timestamp precision and offsets but rejects invalid calendars", () => {
  for (const occurredAt of [
    "2026-09-23T10:20:30Z",
    "2026-09-23T10:20:30.123456789Z",
    "2026-09-23T10:20:30.1+05:30",
    "2024-02-29T00:00:00Z",
  ])
    expect(() =>
      parseBatch({ events: [{ ...event, occurredAt }], metrics: [] }),
    ).not.toThrow();
  for (const occurredAt of [
    "2026-02-29T00:00:00Z",
    "2026-02-30T00:00:00Z",
    "2026-09-23T24:00:00Z",
    "2026-09-23T00:00:00+25:00",
    "2026-09-23",
    "0000-01-01T00:00:00Z",
  ])
    expect(() =>
      parseBatch({ events: [{ ...event, occurredAt }], metrics: [] }),
    ).toThrow();
});
