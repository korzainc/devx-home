import { afterEach, describe, expect, it, vi } from "vitest";
import { recordAnalysisRun, readAnalysisUsage } from "./analysis-usage";
const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
afterEach(() => {
  vi.restoreAllMocks();
  query.mockReset();
});
const run = "12345678-1234-1234-1234-123456789abc";
describe("analysis usage", () => {
  it("records only valid run and repository identities with bound parameters", async () => {
    query.mockResolvedValue({ rows: [] });
    await recordAnalysisRun(run, 42);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [run, 42],
        text: expect.stringContaining("on conflict (run_id) do nothing"),
      }),
    );
    query.mockClear();
    await recordAnalysisRun("bad", 42);
    await recordAnalysisRun(run, undefined);
    await recordAnalysisRun(run, -1);
    expect(query).not.toHaveBeenCalled();
  });
  it("does not fail an analysis when monitoring storage fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    query.mockRejectedValue(new Error("database unavailable"));
    await expect(recordAnalysisRun(run, 42)).resolves.toBeUndefined();
  });
  it("reads run and distinct repository counts", async () => {
    query.mockResolvedValue({ rows: [{ runs: 3, repositories: 2 }] });
    await expect(readAnalysisUsage()).resolves.toEqual({
      runs: 3,
      repositories: 2,
    });
  });
});
