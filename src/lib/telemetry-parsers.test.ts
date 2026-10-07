import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { plugins } from "@/lib/catalogue";
import { filterLogs } from "./telemetry-logs";
import { filterMetrics } from "./telemetry-metrics";
import { parseBatch } from "./telemetry-events";
const attrs = (values: Record<string, string>) =>
  Object.entries(values).map(([key, stringValue]) => ({
    key,
    value: { stringValue },
  }));
function logs(plugin = "codezen", changes: Record<string, string> = {}) {
  return {
    resourceLogs: [
      {
        scopeLogs: [
          {
            logRecords: [
              {
                attributes: attrs({
                  "event.name": "skill_activated",
                  "marketplace.name": "korza-marketplace",
                  "plugin.name": plugin,
                  "skill.name": "review",
                  "event.timestamp": "2026-09-28T00:00:00Z",
                  "session.id": "s",
                  "event.sequence": "1",
                  ...changes,
                }),
              },
            ],
          },
        ],
      },
    ],
  };
}
function metrics(plugin = "codezen") {
  const point = {
    asInt: "2",
    startTimeUnixNano: "1",
    timeUnixNano: "2",
    attributes: attrs({
      status: "ok",
      plugin_id: `${plugin}_korza-marketplace`,
      skill: `${plugin}_review`,
      invoke_type: "explicit",
      prompt: "private data",
    }),
  };
  const sum = {
    aggregationTemporality: 2,
    isMonotonic: true,
    dataPoints: [point],
  };
  const body = {
    resourceMetrics: [
      { scopeMetrics: [{ metrics: [{ name: "codex.skill.injected", sum }] }] },
    ],
  };
  return { body, point, sum };
}
it("derives client allowlists from the catalogue across pilot and normalized input", () => {
  for (const plugin of plugins) {
    expect(filterLogs(logs(plugin.id), "device")).toHaveLength(
      plugin.agents.includes("Claude Code") ? 1 : 0,
    );
    const rows = filterMetrics(metrics(plugin.id).body, "device");
    expect(rows).toHaveLength(plugin.agents.includes("Codex CLI") ? 1 : 0);
    if (rows.length)
      expect(parseBatch({ events: [], metrics: rows }).metrics[0].plugin).toBe(
        plugin.id,
      );
  }
  expect(filterLogs(logs("foreign"), "device")).toEqual([]);
  expect(
    filterLogs(logs("codezen", { "marketplace.name": "foreign" }), "device"),
  ).toEqual([]);
  expect(filterMetrics(metrics("foreign").body, "device")).toEqual([]);
});
it.each(["explicit", "implicit"])(
  "counts only successful %s skill loads",
  (invokeType) => {
    for (const status of ["ok", "error", "unknown", undefined]) {
      const { body, point } = metrics();
      point.attributes = attrs({
        ...(status === undefined ? {} : { status }),
        plugin_id: "codezen_korza-marketplace",
        skill: "codezen_review",
        invoke_type: invokeType,
      });
      expect(filterMetrics(body, "device")).toHaveLength(
        status === "ok" ? 1 : 0,
      );
    }
  },
);
it("ignores malformed failed-load points without dropping successful loads", () => {
  const { body, point, sum } = metrics();
  sum.dataPoints.unshift({
    ...point,
    asInt: "invalid",
    attributes: point.attributes.map((attribute) =>
      attribute.key === "status"
        ? { key: "status", value: { stringValue: "error" } }
        : attribute,
    ),
  });
  expect(filterMetrics(body, "device")).toMatchObject([{ value: 2 }]);
});
it("validates calendar dates consistently and excludes unsafe skill names", () => {
  expect(() =>
    filterLogs(
      logs("codezen", { "event.timestamp": "2026-02-30T00:00:00Z" }),
      "device",
    ),
  ).toThrow();
  for (const skill of [
    "/private/file",
    "somebody@example.com",
    "third-party",
    "custom_skill",
  ])
    expect(
      filterLogs(logs("codezen", { "skill.name": skill }), "device"),
    ).toEqual([]);
});
it("keeps valid existing pilot identities stable while adding explicit plugin attribution", () => {
  const { body, point } = metrics();
  const expected = createHash("sha256")
    .update(
      JSON.stringify([
        "device",
        [],
        {},
        "codex.skill.injected",
        [...point.attributes].sort((a, b) => a.key.localeCompare(b.key)),
        "1",
      ]),
    )
    .digest("hex");
  const row = filterMetrics(body, "device")[0];
  expect(row).toEqual({
    id: expected,
    value: 2,
    temporality: 2,
    plugin: "codezen",
    skill: "codezen_review",
    invokeType: "explicit",
  });
  expect(JSON.stringify(row)).not.toContain("private data");
});
it("retains cumulative identity and gives separate delta intervals separate identities", () => {
  const { body, point, sum } = metrics();
  const first = filterMetrics(body, "device")[0].id;
  point.timeUnixNano = "3";
  expect(filterMetrics(body, "device")[0].id).toBe(first);
  sum.aggregationTemporality = 1;
  const delta = filterMetrics(body, "device")[0].id;
  point.timeUnixNano = "4";
  expect(filterMetrics(body, "device")[0].id).not.toBe(delta);
});
it("rejects malformed nested shapes and ambiguous duplicate attributes", () => {
  for (const body of [
    null,
    [],
    {},
    { resourceMetrics: {} },
    { resourceMetrics: [null] },
    { resourceMetrics: [{ scopeMetrics: "bad" }] },
  ])
    expect(() => filterMetrics(body, "device")).toThrow();
  for (const body of [
    null,
    [],
    {},
    { resourceLogs: {} },
    { resourceLogs: [{ scopeLogs: [null] }] },
  ])
    expect(() => filterLogs(body, "device")).toThrow();
  const metric = metrics();
  metric.point.attributes.push(metric.point.attributes[0]);
  expect(() => filterMetrics(metric.body, "device")).toThrow();
  const log = logs();
  const a = log.resourceLogs[0].scopeLogs[0].logRecords[0].attributes;
  a.push(a[0]);
  expect(() => filterLogs(log, "device")).toThrow();
});
it("rejects coerced, unsafe and unsupported metric values before SQL", () => {
  for (const value of [
    null,
    true,
    "",
    " 2",
    "0x10",
    "-1",
    "1.5",
    "9007199254740992",
  ]) {
    const { body, point } = metrics();
    Object.assign(point, { asInt: value });
    expect(() => filterMetrics(body, "device")).toThrow();
  }
  const { body, point, sum } = metrics();
  point.startTimeUnixNano = "18446744073709551616";
  expect(() => filterMetrics(body, "device")).toThrow();
  point.startTimeUnixNano = "1";
  sum.aggregationTemporality = 0;
  expect(() => filterMetrics(body, "device")).toThrow();
});
