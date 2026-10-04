import { describe, expect, it, vi } from "vitest";
import { runAnalysis } from "./run";
import { RepoReadError } from "./types";
import type { AnalysisTool, Baseline } from "./types";
import type { LlmConfig } from "./llm/types";

const snapshot = {
  ref: { provider: "github" as const, owner: "korzainc", repo: "example" },
  defaultBranch: "main",
  paths: ["package.json"],
  files: {},
};

// Hoisted so the mock factory below can close over it, since vitest lifts vi.mock above the
// imports and a plain const declared here would not exist yet when the factory runs.
const loadSnapshot = vi.hoisted(() => vi.fn());

// vitest hoists vi.mock calls above the imports above, regardless of where they're written -
// runAnalysis (imported above) sees this mocked module, never a real network call.
vi.mock("./github", () => ({
  githubReader: {
    parseRef: (input: string) =>
      input === "korzainc/example"
        ? { provider: "github" as const, owner: "korzainc", repo: "example" }
        : null,
    loadSnapshot,
  },
}));

// Mocked so tests can check whether `runAnalysis` calls `applyLlmPass` at all; side effects inside
// it can't tell that apart from its own `enabled` check.
const applyLlmPass = vi.hoisted(() => vi.fn());

vi.mock("./llm/apply", () => ({ applyLlmPass }));

function noopLlmConfig(overrides: Partial<LlmConfig> = {}): LlmConfig {
  return {
    enabled: true,
    client: { complete: vi.fn() },
    model: "claude-sonnet-5-5",
    effort: "low",
    readCache: vi.fn().mockResolvedValue(null),
    writeCache: vi.fn().mockResolvedValue(undefined),
    underDailySpendCap: vi.fn().mockResolvedValue(true),
    recordSpend: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const emptyBaseline: Baseline = {
  categories: [],
  capabilities: {},
  universal: [],
  stacks: [],
};

describe("runAnalysis", () => {
  it("maps a CatalogueDataError to a clean ok:false result instead of throwing", async () => {
    loadSnapshot.mockResolvedValue(snapshot);

    // A minimal baseline/tools pair that will make analyze() throw: a stack recommends a tool
    // id absent from `tools`.
    const baseline: Baseline = {
      categories: ["Linting"],
      capabilities: { orphan: { label: "Orphan", category: "Linting" } },
      universal: [],
      stacks: [
        {
          id: "javascript",
          label: "JavaScript",
          markers: ["package.json"],
          expects: { orphan: { recommended: "no-such-tool", acceptable: [] } },
        },
      ],
    };
    const tools: AnalysisTool[] = [];

    const result = await runAnalysis("korzainc/example", "token", {
      tools,
      baseline,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(result.error).toContain("no-such-tool");
    }
  });

  it.each([
    { name: "there is no token", token: null, llm: noopLlmConfig() },
    {
      name: "llm.enabled is false",
      token: "a-token",
      llm: noopLlmConfig({ enabled: false }),
    },
    { name: "there is no llm config", token: "a-token", llm: undefined },
  ])("does not invoke the LLM pass when $name", async ({ token, llm }) => {
    loadSnapshot.mockResolvedValue(snapshot);

    const result = await runAnalysis(
      "korzainc/example",
      token,
      { tools: [], baseline: emptyBaseline },
      llm,
    );

    expect(result.ok).toBe(true);
    expect(applyLlmPass).not.toHaveBeenCalled();
  });

  it("invokes the LLM pass exactly once when llm.enabled is true and a token is present", async () => {
    loadSnapshot.mockResolvedValue(snapshot);
    const rescuedAnalysis = { rescued: true };
    applyLlmPass.mockResolvedValue(rescuedAnalysis);
    const llm = noopLlmConfig();

    const result = await runAnalysis(
      "korzainc/example",
      "a-token",
      { tools: [], baseline: emptyBaseline },
      llm,
    );

    expect(applyLlmPass).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, analysis: rescuedAnalysis });
  });

  it("falls back to the deterministic analysis instead of throwing when applyLlmPass throws unexpectedly", async () => {
    // apply.ts shouldn't throw, but runAnalysis must fall back even if it does.
    loadSnapshot.mockResolvedValue(snapshot);
    applyLlmPass.mockRejectedValue(new Error("unexpected"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const llm = noopLlmConfig();

    const result = await runAnalysis(
      "korzainc/example",
      "a-token",
      { tools: [], baseline: emptyBaseline },
      llm,
    );

    expect(result.ok).toBe(true);
    errorSpy.mockRestore();
  });
});

// The page decides whether to offer a login from this status alone, so what a reader's error maps
// to here is the whole contract between them. 403 used to be folded in with 429, which handed the
// page a rate limit for every refusal GitHub answers with a 403, and it offered a login for all
// of them. Only a reader that has established a spent quota may say 429.
describe("statusFor, through runAnalysis", () => {
  const baseline: Baseline = {
    categories: [],
    capabilities: {},
    universal: [],
    stacks: [],
  };

  async function statusOf(error: RepoReadError) {
    loadSnapshot.mockRejectedValueOnce(error);
    const result = await runAnalysis("korzainc/example", null, {
      tools: [] as AnalysisTool[],
      baseline,
    });
    if (result.ok) throw new Error("expected runAnalysis to fail");
    return result.status;
  }

  it("passes a rate limit through as 429", async () => {
    expect(await statusOf(new RepoReadError(429, "spent"))).toBe(429);
  });

  it("does not turn a 403 into a rate limit", async () => {
    expect(await statusOf(new RepoReadError(403, "declined"))).not.toBe(429);
  });

  it("keeps 404 and 401 distinct, and sends anything else upstream as 502", async () => {
    expect(await statusOf(new RepoReadError(404, "missing"))).toBe(404);
    expect(await statusOf(new RepoReadError(401, "rejected"))).toBe(401);
    expect(await statusOf(new RepoReadError(502, "declined"))).toBe(502);
    expect(await statusOf(new RepoReadError(418, "odd"))).toBe(502);
  });
});
