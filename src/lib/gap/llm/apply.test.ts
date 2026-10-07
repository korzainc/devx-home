import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyLlmPass, cacheKey } from "./apply";
import { buildPrompt } from "./schema";
import { analyze } from "../analyze";
import { ciSignals } from "../detect";
import { getBaseline, tools as realTools } from "@/lib/catalogue";
import { scenario, tool } from "@/test/gap-fixtures";
import type { Scenario } from "@/test/gap-fixtures";
import type { LlmConfig, LlmResponse, Verdict } from "./types";
import type { Analysis, BuildStepKind, RepoSnapshot } from "../types";

const SEMGREP = "semgrep --config p/golang .";
const NPM = "npm ci --frozen-lockfile";
const TRIVY = "trivy fs . --severity HIGH,CRITICAL";

/** sast is a gap the rules missed (semgrep is only seen by the model), sca is satisfied by trivy. */
const base = () =>
  scenario({ shell: [SEMGREP, NPM, TRIVY], deterministic: [TRIVY] });

type VerdictSpec = {
  pair: string;
  verdict: Verdict;
  quote: string;
  reason?: string;
  /** Substring that finds the cited entry; defaults to the quote. */
  in?: string;
  /** Overrides the lookup, for wrong or unknown ids. */
  signalId?: string;
};
type DetectSpec = Pick<VerdictSpec, "quote" | "in" | "signalId"> & {
  kind: BuildStepKind;
};

const provides = (
  pair: string,
  quote: string,
  extra: Partial<VerdictSpec> = {},
): VerdictSpec => ({ pair, verdict: "provides", quote, ...extra });
const denies = (
  pair: string,
  quote: string,
  reason = "does not cover it",
  extra: Partial<VerdictSpec> = {},
): VerdictSpec => ({
  pair,
  verdict: "does-not-provide",
  quote,
  reason,
  ...extra,
});
const found = (
  kind: BuildStepKind,
  quote: string,
  extra: Partial<DetectSpec> = {},
): DetectSpec => ({ kind, quote, ...extra });

/** The signal id a real `buildPrompt` assigned, so tests never hardcode id order. */
function idOf(sc: Scenario, needle: string): string {
  const { signals } = buildPrompt(sc.analysis, sc.signals, sc.catalogue);
  const entry =
    signals.find((e) => e.text === needle) ??
    signals.find((e) => e.text.includes(needle));
  if (!entry) throw new Error(`no signal entry contains "${needle}"`);
  return entry.id;
}

function llm(response: LlmResponse, costUsd = 0.0042): LlmConfig {
  return {
    enabled: true,
    client: {
      complete: vi.fn().mockResolvedValue({
        ok: true,
        text: JSON.stringify(response),
        inputTokens: 100,
        outputTokens: 50,
        costUsd,
      }),
    },
    model: "claude-sonnet-5-5",
    effort: "low",
    readCache: vi.fn().mockResolvedValue(null),
    writeCache: vi.fn().mockResolvedValue(undefined),
    underDailySpendCap: vi.fn().mockResolvedValue(true),
    recordSpend: vi.fn().mockResolvedValue(undefined),
  };
}

function responseFor(
  sc: Scenario,
  verdicts: VerdictSpec[],
  detect: DetectSpec[],
): LlmResponse {
  return {
    verdicts: verdicts.map((spec) => ({
      pair: spec.pair,
      verdict: spec.verdict,
      quote: spec.quote,
      reason: spec.reason ?? "",
      signalId: spec.signalId ?? idOf(sc, spec.in ?? spec.quote),
    })),
    detectFindings: detect.map((spec) => ({
      kind: spec.kind,
      quote: spec.quote,
      signalId: spec.signalId ?? idOf(sc, spec.in ?? spec.quote),
    })),
  };
}

async function run(
  sc: Scenario,
  verdicts: VerdictSpec[] = [],
  detect: DetectSpec[] = [],
  tweak: (config: LlmConfig) => void = () => {},
) {
  const config = llm(responseFor(sc, verdicts, detect));
  tweak(config);
  const result = await applyLlmPass(
    sc.analysis,
    sc.signals,
    sc.catalogue,
    config,
  );
  return { result, config };
}

const cap = (analysis: Analysis, id: string) =>
  analysis.categories
    .flatMap((category) => category.capabilities)
    .find((capability) => capability.id === id)!;

const counts = ({ satisfiedCount, partialCount, gapCount }: Analysis) => ({
  satisfiedCount,
  partialCount,
  gapCount,
});

const cached = (response: unknown) => ({
  model: "claude-sonnet-5-5",
  response,
  inputTokens: 10,
  outputTokens: 10,
});

beforeEach(() => {
  for (const level of ["info", "warn", "error"] as const)
    vi.spyOn(console, level).mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cacheKey", () => {
  it("is stable, and changes with the model, effort or prompt text", () => {
    const key = cacheKey("m", "low", "s", "u");
    expect(key).toBe(cacheKey("m", "low", "s", "u"));
    for (const other of [
      cacheKey("m2", "low", "s", "u"),
      cacheKey("m", "medium", "s", "u"),
      cacheKey("m", "low", "s2", "u"),
      cacheKey("m", "low", "s", "u2"),
    ])
      expect(other).not.toBe(key);
  });
});

describe("applyLlmPass: rescue and audit", () => {
  it("rescues a gap on a verified `provides` verdict and recomputes the counts", async () => {
    const { result } = await run(base(), [provides("sast:semgrep", SEMGREP)]);
    const sast = cap(result, "sast");
    expect(sast).toMatchObject({
      satisfied: true,
      present: [{ id: "semgrep", evidence: SEMGREP }],
    });
    expect(sast.llmNote).toContain("semgrep");
    expect(counts(result)).toEqual({
      satisfiedCount: 2,
      partialCount: 0,
      gapCount: 0,
    });
  });

  it("demotes a present multi-capability tool on a verified `does-not-provide` verdict", async () => {
    const reason = "only scans the filesystem for CVEs";
    const { result } = await run(base(), [denies("sca:trivy", TRIVY, reason)]);
    expect(cap(result, "sca")).toMatchObject({
      satisfied: false,
      present: [],
      llmNote: reason,
      recommended: [{ id: "trivy", name: "trivy", stackLabels: ["Any"] }],
    });
    expect(counts(result)).toEqual({
      satisfiedCount: 0,
      partialCount: 0,
      gapCount: 2,
    });
  });

  const poly = (shell: string[], deterministic: string[]) =>
    scenario({
      tools: [
        tool("trivy", ["sca", "iac-config"], { stacks: ["go"] }),
        tool("npm-audit", ["sca"], {
          name: "npm audit",
          stacks: ["javascript"],
          commands: ["npm audit"],
        }),
      ],
      stacks: [
        { id: "go", label: "Go", expects: { sca: "trivy" } },
        {
          id: "javascript",
          label: "JavaScript",
          expects: { sca: "npm-audit" },
        },
      ],
      shell,
      deterministic,
    });
  const GO = "trivy fs ./go-service --severity HIGH";
  const JS = "npm audit --production";

  it("recomputes stack coverage: a partial rescue stays unsatisfied, the last one satisfies, a demotion reopens the stack", async () => {
    const partial = await run(poly([GO], []), [provides("sca:trivy", GO)]);
    expect(cap(partial.result, "sca")).toMatchObject({
      satisfied: false,
      present: [{ id: "trivy", evidence: GO, stackLabels: ["Go"] }],
      recommended: [
        { id: "npm-audit", name: "npm audit", stackLabels: ["JavaScript"] },
      ],
    });
    expect(counts(partial.result)).toEqual({
      satisfiedCount: 0,
      partialCount: 1,
      gapCount: 1,
    });

    const rescued = await run(poly([GO, JS], [GO]), [
      provides("sca:npm-audit", JS),
    ]);
    expect(cap(rescued.result, "sca").satisfied).toBe(true);
    expect(cap(rescued.result, "sca").present.map((p) => p.id)).toEqual([
      "trivy",
      "npm-audit",
    ]);

    const demoted = await run(poly([GO, JS], [GO, JS]), [
      denies("sca:trivy", GO, "only scans the Go module"),
    ]);
    expect(cap(demoted.result, "sca")).toMatchObject({
      satisfied: false,
      present: [{ id: "npm-audit", stackLabels: ["JavaScript"] }],
      recommended: [{ id: "trivy", name: "trivy", stackLabels: ["Go"] }],
    });
    expect(counts(demoted.result)).toEqual({
      satisfiedCount: 0,
      partialCount: 1,
      gapCount: 1,
    });
  });

  it("stays satisfied after a demotion when another present tool still covers the stack", async () => {
    const sc = scenario({
      tools: [
        tool("trivy", ["sca", "iac-config"]),
        tool("snyk", ["sca", "sast"]),
      ],
      stacks: [{ id: "any", label: "Any", expects: { sca: "trivy" } }],
      shell: [TRIVY, "snyk test"],
      deterministic: [TRIVY, "snyk test"],
    });
    const { result } = await run(sc, [denies("sca:trivy", TRIVY)]);
    expect(cap(result, "sca").satisfied).toBe(true);
    expect(cap(result, "sca").present.map((p) => p.id)).toEqual(["snyk"]);
  });

  it("applies several rescues of one capability in candidate order, whatever order the response lists them", async () => {
    const BANDIT = "bandit -r src --severity-level high";
    const sc = scenario({
      tools: [tool("semgrep", ["sast"]), tool("bandit", ["sast"])],
      stacks: [{ id: "any", label: "Any", expects: { sast: "semgrep" } }],
      shell: [SEMGREP, BANDIT],
    });
    const semgrep = provides("sast:semgrep", SEMGREP);
    const bandit = provides("sast:bandit", BANDIT);
    const [a, b] = await Promise.all([
      run(sc, [semgrep, bandit]),
      run(sc, [bandit, semgrep]),
    ]);
    expect(a.result).toEqual(b.result);
    expect(cap(a.result, "sast").satisfied).toBe(true);
    expect(cap(a.result, "sast").present.map((p) => p.id)).toEqual(["semgrep"]);
  });
});

describe("applyLlmPass: verdicts that change nothing", () => {
  const credited = () =>
    scenario({
      tools: [
        tool("semgrep", ["sast"]),
        tool("trivy", ["sca", "iac-config"], { configFiles: ["trivy.yaml"] }),
      ],
      shell: [TRIVY],
      paths: ["trivy.yaml"],
    });
  const cutRelated = () =>
    scenario({
      shell: [
        [`trivy ${"x".repeat(4100)}`, "a.yml"],
        [TRIVY, "b.yml"],
      ],
      deterministic: [TRIVY],
    });
  const multiLine = (text: string) => () =>
    scenario({ shell: [text], deterministic: [] });
  const both = [
    denies("sca:trivy", TRIVY, "only dependencies"),
    provides("sca:trivy", TRIVY),
  ];

  const rows: {
    name: string;
    sc: () => Scenario;
    verdicts: VerdictSpec[];
    warns?: string;
  }[] = [
    {
      name: "omitted pairs, `provides` on a present pair, `does-not-provide` on an absent one",
      sc: base,
      verdicts: [provides("sca:trivy", TRIVY), denies("sast:semgrep", SEMGREP)],
    },
    {
      name: "a pair that is not a candidate",
      sc: base,
      verdicts: [provides("sast:trivy", TRIVY)],
      warns: "pair is not a candidate",
    },
    {
      name: "an empty quote",
      sc: base,
      verdicts: [provides("sast:semgrep", "", { in: "semgrep" })],
      warns: "quote did not verify",
    },
    {
      name: "a quote found nowhere",
      sc: base,
      verdicts: [
        provides("sast:semgrep", "docker build --pull .", { in: "semgrep" }),
      ],
      warns: "quote did not verify",
    },
    {
      name: "a quote found only in another entry than the cited one",
      sc: base,
      verdicts: [provides("sast:semgrep", SEMGREP, { in: "npm ci" })],
      warns: "quote did not verify",
    },
    {
      name: "a short fragment of a longer entry",
      sc: base,
      verdicts: [
        provides("sast:semgrep", "semgrep --config p", { in: "semgrep" }),
      ],
      warns: "quote did not verify",
    },
    {
      name: "an unknown signal id, without substituting another entry",
      sc: base,
      verdicts: [provides("sast:semgrep", SEMGREP, { signalId: "s999" })],
      warns: "signalId is not in this analysis",
    },
    {
      name: "a verifying quote that is about another tool",
      sc: base,
      verdicts: [provides("sast:semgrep", NPM)],
      warns: "quote does not relate to the tool",
    },
    {
      name: "relevance is judged on the quote, not the cited entry",
      sc: multiLine(
        "semgrep --config p/java .\nnpm run lint -- --max-warnings 0",
      ),
      verdicts: [
        provides("sast:semgrep", "npm run lint -- --max-warnings 0", {
          in: "semgrep",
        }),
      ],
      warns: "quote does not relate to the tool",
    },
    {
      name: "a tool named only in a shell comment line",
      sc: multiLine("# semgrep covers this\nnpm test -- --coverage"),
      verdicts: [
        provides(
          "sast:semgrep",
          "# semgrep covers this⏎npm test -- --coverage",
          { in: "npm test" },
        ),
      ],
      warns: "quote did not verify",
    },
    {
      name: "a quote inside a trailing shell comment",
      sc: multiLine("npm test # semgrep --config p/java ."),
      verdicts: [
        provides("sast:semgrep", "semgrep --config p/java .", {
          in: "npm test",
        }),
      ],
      warns: "quote did not verify",
    },
    {
      name: "conflicting verdicts on one pair",
      sc: base,
      verdicts: both,
      warns: "conflicting verdicts",
    },
    {
      name: "conflicting verdicts in the opposite order",
      sc: base,
      verdicts: [...both].reverse(),
      warns: "conflicting verdicts",
    },
    {
      name: "`provides` on an audit pair of a partial capability",
      sc: () =>
        scenario({
          tools: [
            tool("trivy", ["sca", "iac-config"], { stacks: ["go"] }),
            tool("npm-audit", ["sca"], { stacks: ["javascript"] }),
          ],
          stacks: [
            { id: "go", label: "Go", expects: { sca: "trivy" } },
            { id: "javascript", label: "JS", expects: { sca: "npm-audit" } },
          ],
          shell: [TRIVY],
          deterministic: [TRIVY],
        }),
      verdicts: [provides("sca:trivy", TRIVY)],
    },
    {
      name: "a demotion of a tool a config file also credits",
      sc: credited,
      verdicts: [denies("sca:trivy", TRIVY)],
      warns: "also credited by a config file or dependency",
    },
    {
      name: "a demotion when another entry about the tool was truncated",
      sc: cutRelated,
      verdicts: [denies("sca:trivy", TRIVY)],
      warns: "truncated or omitted",
    },
  ];

  it.each(rows)("$name", async ({ sc: build, verdicts, warns }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sc = build();
    const { result } = await run(sc, verdicts);
    expect(result).toEqual(sc.analysis);
    const messages = warn.mock.calls.map((call) => String(call[0]));
    if (warns) expect(messages.join("\n")).toContain(warns);
    else expect(messages).toEqual([]);
  });
});

describe("applyLlmPass: quotes", () => {
  it("accepts a leaked rendered prefix or a `#` inside quotes, and reports the clean text", async () => {
    const sc = scenario({
      shell: [SEMGREP],
      uses: [{ value: "docker/build-push-action", source: "ci.yml" }],
    });
    const { result } = await run(
      sc,
      [provides("sast:semgrep", `run: ${SEMGREP}`, { in: "semgrep" })],
      [
        found("image-build", "[s2] uses: docker/build-push-action", {
          in: "docker/build",
        }),
      ],
    );
    expect(cap(result, "sast").present[0].evidence).toBe(SEMGREP);
    expect(result.buildSteps).toEqual([
      {
        kind: "image-build",
        evidence: "docker/build-push-action",
        source: "ci.yml",
      },
    ]);

    const quoted = scenario({
      shell: ['echo "a # b"; semgrep --config p/java .'],
    });
    const { result: rescued } = await run(quoted, [
      provides("sast:semgrep", "semgrep --config p/java .", { in: "semgrep" }),
    ]);
    expect(cap(rescued, "sast").satisfied).toBe(true);
  });

  it("enforces the 400-character quote and 300-character reason caps", async () => {
    for (const [length, kept] of [
      [401, false],
      [400, true],
    ] as const) {
      const command = `semgrep --config ${"p".repeat(length - 17)}`;
      const { result } = await run(
        scenario({ shell: [command] }),
        [provides("sast:semgrep", command)],
        [found("build", command)],
      );
      expect(cap(result, "sast").satisfied).toBe(kept);
      expect(result.buildSteps).toHaveLength(kept ? 1 : 0);
    }

    for (const [length, note] of [
      [301, `${"é".repeat(300)}…`],
      [300, "é".repeat(300)],
    ] as const) {
      const { result } = await run(base(), [
        denies("sca:trivy", TRIVY, "é".repeat(length)),
      ]);
      expect(cap(result, "sca").llmNote).toBe(note);
    }
  });

  it("restores real newlines in reports and keeps the raw source path, while the prompt stays escaped", async () => {
    const sc = scenario({
      shell: [
        ["semgrep --config p/java .\nsemgrep ci", "dir<<<x/ci.yml"],
        [`echo ${"x".repeat(2000)}`, "long.yml"],
        [TRIVY, "ci.yml"],
      ],
      deterministic: [TRIVY],
    });
    const truncated = buildPrompt(
      sc.analysis,
      sc.signals,
      sc.catalogue,
    ).signals.find((entry) => entry.truncated)!;
    expect(truncated.text.endsWith("…")).toBe(true);
    const tail = truncated.text.slice(-30);
    const { result, config } = await run(
      sc,
      [
        provides("sast:semgrep", "semgrep --config p/java .⏎semgrep ci", {
          in: "semgrep --config",
        }),
        denies("sca:trivy", TRIVY, "line one⏎line two"),
      ],
      [
        found("build", "semgrep ci", { in: "semgrep --config" }),
        found("install", tail, { signalId: truncated.id }),
      ],
    );
    const evidence = "semgrep --config p/java .\nsemgrep ci";
    expect(cap(result, "sast").present[0].evidence).toBe(evidence);
    expect(cap(result, "sast").llmNote).toContain(`via "${evidence}"`);
    expect(cap(result, "sca").llmNote).toBe("line one\nline two");
    expect(result.buildSteps).toEqual([
      { kind: "build", evidence: "semgrep ci", source: "dir<<<x/ci.yml" },
      { kind: "install", evidence: tail.replace("…", ""), source: "long.yml" },
    ]);
    const prompt = vi.mocked(config.client.complete).mock.calls[0][0].user;
    expect(prompt).toContain("dir‹‹‹x/ci.yml");
    expect(prompt).not.toContain("dir<<<x");
  });
});

describe("applyLlmPass: detect", () => {
  it("keeps verified findings attributed to the cited entry's file, one per kind per file", async () => {
    const INSTALL = "npm install --no-audit --prefer-offline";
    const YARN = "yarn install --frozen-lockfile";
    const DOCKER = "docker build -t app .";
    const sc = scenario({
      shell: [
        [NPM, "a.yml"],
        [INSTALL, "a.yml"],
        [YARN, "b.yml"],
        ["mkdir -p out\ngo build ./...\necho done", "c.yml"],
        [DOCKER, "d.yml"],
        ["npm ci", "e.yml"],
      ],
    });
    const { result } = await run(
      sc,
      [],
      [
        found("install", NPM),
        found("install", NPM),
        found("install", INSTALL),
        found("install", YARN),
        found("install", "go build ./...", { in: NPM }),
        found("build", "a quote found nowhere", { in: "yarn" }),
        found("build", "go build ./...", { signalId: "s999" }),
        { kind: "deploy" as never, quote: DOCKER },
        found("image-build", DOCKER),
        found("build", "go build .", { in: "go build" }),
        found("build", "go build ./...", { in: "go build" }),
        found("build", "npm ci --froze", { in: NPM }),
        found("install", "npm ci"),
      ],
    );
    expect(result.buildSteps).toEqual([
      { kind: "install", evidence: NPM, source: "a.yml" },
      { kind: "install", evidence: YARN, source: "b.yml" },
      { kind: "image-build", evidence: DOCKER, source: "d.yml" },
      { kind: "build", evidence: "go build ./...", source: "c.yml" },
      { kind: "install", evidence: "npm ci", source: "e.yml" },
    ]);
  });

  it("caps the findings kept at 20", async () => {
    const shell = Array.from({ length: 25 }, (_, i): [string, string] => [
      `npm run build-${i}`,
      `f${i}.yml`,
    ]);
    const { result } = await run(
      scenario({ shell }),
      [],
      shell.map(([text]) => found("build", text)),
    );
    expect(result.buildSteps).toHaveLength(20);
  });
});

describe("applyLlmPass: cache, spend cap and cost", () => {
  it("makes no call when disabled or when there is no signal text", async () => {
    const cases: [Scenario, (config: LlmConfig) => void][] = [
      [base(), (config) => void (config.enabled = false)],
      [scenario({ shell: [] }), () => {}],
    ];
    for (const [sc, tweak] of cases) {
      const { result, config } = await run(sc, [], [], tweak);
      expect(result).toEqual(sc.analysis);
      expect(config.client.complete).not.toHaveBeenCalled();
      expect(config.readCache).not.toHaveBeenCalled();
    }
  });

  it("serves a cache hit without checking the spend cap, calling the model or recording spend", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const sc = base();
    const { result, config } = await run(sc, [], [], (c) => {
      c.underDailySpendCap = vi.fn().mockResolvedValue(false);
      c.readCache = vi
        .fn()
        .mockResolvedValue(
          cached(responseFor(sc, [provides("sast:semgrep", SEMGREP)], [])),
        );
    });
    expect(cap(result, "sast").satisfied).toBe(true);
    expect(config.underDailySpendCap).not.toHaveBeenCalled();
    expect(config.client.complete).not.toHaveBeenCalled();
    expect(config.recordSpend).not.toHaveBeenCalled();
    expect(config.writeCache).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("gap LLM pass: served from cache", {
      repo: "korza/example",
      verdictsApplied: 1,
      verdictsNoop: 0,
      verdictsDropped: 0,
      detectFindingsKept: 0,
    });
  });

  it("on a miss: skips over the daily cap, otherwise records the cost, caches the response and logs a summary", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const sc = base();
    const capped = await run(sc, [], [], (c) => {
      c.underDailySpendCap = vi.fn().mockResolvedValue(false);
    });
    expect(capped.result).toEqual(sc.analysis);
    expect(capped.config.client.complete).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      "gap LLM pass: skipped, daily spend cap reached",
      { repo: "korza/example" },
    );

    const verdicts = [provides("sast:semgrep", SEMGREP)];
    const { config } = await run(sc, verdicts, [], (c) => {
      c.client.complete = vi.fn().mockResolvedValue({
        ok: true,
        text: JSON.stringify(responseFor(sc, verdicts, [])),
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.00071,
      });
    });
    expect(config.recordSpend).toHaveBeenCalledWith(0.00071);
    expect(config.writeCache).toHaveBeenCalledTimes(1);
    expect(vi.mocked(config.writeCache).mock.calls[0][1]).toEqual({
      model: "claude-sonnet-5-5",
      response: responseFor(sc, verdicts, []),
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(info).toHaveBeenLastCalledWith("gap LLM pass: completed", {
      repo: "korza/example",
      model: "claude-sonnet-5-5",
      latencyMs: expect.any(Number),
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.00071,
      verdictsApplied: 1,
      verdictsNoop: 0,
      verdictsDropped: 0,
      detectFindingsKept: 0,
    });
  });

  it.each([
    {
      name: "a truncated call is still billed",
      failure: {
        ok: false,
        reason: "truncated",
        inputTokens: 100,
        outputTokens: 8000,
        costUsd: 0.082,
      },
      spend: 0.082,
      detail: undefined,
    },
    {
      name: "an error without a cost is not billed",
      failure: {
        ok: false,
        reason: "error",
        detail: { status: 429, type: "rate_limit_error", requestId: "req_1" },
      },
      spend: undefined,
      detail: { status: 429, type: "rate_limit_error", requestId: "req_1" },
    },
  ])(
    "falls back on a failed call: $name",
    async ({ failure, spend, detail }) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const sc = base();
      const { result, config } = await run(sc, [], [], (c) => {
        c.client.complete = vi.fn().mockResolvedValue(failure);
      });
      expect(result).toEqual(sc.analysis);
      if (spend === undefined)
        expect(config.recordSpend).not.toHaveBeenCalled();
      else expect(config.recordSpend).toHaveBeenCalledWith(spend);
      expect(config.writeCache).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        `gap LLM pass: call did not succeed (${failure.reason})`,
        { repo: "korza/example", detail },
      );
    },
  );

  it.each([
    {
      name: "the cache read",
      tweak: (c: LlmConfig) => {
        c.readCache = vi.fn().mockRejectedValue(new Error("db down"));
      },
      spend: false,
    },
    {
      name: "the spend cap check",
      tweak: (c: LlmConfig) => {
        c.underDailySpendCap = vi.fn().mockRejectedValue(new Error("db down"));
      },
      spend: false,
    },
    {
      name: "the client",
      tweak: (c: LlmConfig) => {
        c.client.complete = vi.fn().mockRejectedValue(new Error("network"));
      },
      spend: false,
    },
    {
      name: "unparsable output, after the call was billed",
      tweak: (c: LlmConfig) => {
        c.client.complete = vi.fn().mockResolvedValue({
          ok: true,
          text: "{not json",
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0.5,
        });
      },
      spend: true,
    },
  ])(
    "throws for runAnalysis to handle when $name fails",
    async ({ tweak, spend }) => {
      const sc = base();
      const config = llm({ verdicts: [], detectFindings: [] });
      tweak(config);
      await expect(
        applyLlmPass(sc.analysis, sc.signals, sc.catalogue, config),
      ).rejects.toThrow();
      expect(vi.mocked(config.recordSpend).mock.calls.length).toBe(
        spend ? 1 : 0,
      );
    },
  );

  it("treats a bad cached row as a miss, and survives malformed items and store failures", async () => {
    const sc = base();
    const refetched = await run(
      sc,
      [provides("sast:semgrep", SEMGREP)],
      [],
      (c) => {
        c.readCache = vi
          .fn()
          .mockResolvedValue(
            cached({ verdicts: "not an array", detectFindings: [] }),
          );
      },
    );
    expect(refetched.config.client.complete).toHaveBeenCalledTimes(1);
    expect(cap(refetched.result, "sast").satisfied).toBe(true);

    const missingFindings = await run(sc, [], [], (c) => {
      c.client.complete = vi.fn().mockResolvedValue({
        ok: true,
        text: JSON.stringify({ verdicts: [] }),
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0.001,
      });
    });
    expect(missingFindings.result).toEqual(sc.analysis);

    const good = provides("sast:semgrep", SEMGREP);
    const mixed = responseFor(sc, [good], []);
    const { result } = await run(sc, [], [], (c) => {
      c.client.complete = vi.fn().mockResolvedValue({
        ok: true,
        text: JSON.stringify({
          verdicts: [
            { ...mixed.verdicts[0], reason: undefined },
            mixed.verdicts[0],
            {},
          ],
          detectFindings: [{}, { kind: "build" }],
        }),
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0,
      });
      c.recordSpend = vi.fn().mockRejectedValue(new Error("db down"));
      c.writeCache = vi.fn().mockRejectedValue(new Error("db down"));
    });
    expect(cap(result, "sast").satisfied).toBe(true);
    expect(result.buildSteps).toEqual([]);
  });
});

describe("applyLlmPass: logs", () => {
  it("counts identical repeats as no-ops and drops a pair only when its verdicts differ, clipping logged pairs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const verdict = provides("sast:semgrep", SEMGREP);

    await run(base(), [verdict, { ...verdict }]);
    expect(info).toHaveBeenLastCalledWith(
      "gap LLM pass: completed",
      expect.objectContaining({
        verdictsApplied: 1,
        verdictsNoop: 1,
        verdictsDropped: 0,
      }),
    );

    await run(base(), [
      verdict,
      { ...verdict, verdict: "does-not-provide", reason: "no" },
    ]);
    expect(info).toHaveBeenLastCalledWith(
      "gap LLM pass: completed",
      expect.objectContaining({ verdictsApplied: 0, verdictsDropped: 2 }),
    );

    await run(base(), [provides("x".repeat(500), SEMGREP, { in: "semgrep" })]);
    const logged = warn.mock.calls.find((call) =>
      String(call[0]).includes("pair is not a candidate"),
    )![1] as { pair: string };
    expect(logged.pair).toHaveLength(200);
  });
});

describe("applyLlmPass: real catalogue", () => {
  it("rescues sast via semgrep and demotes trivy on image-scan and iac-config from a real snapshot", async () => {
    const catalogue = { tools: realTools, baseline: getBaseline() };
    const snapshot: RepoSnapshot = {
      ref: { provider: "github", owner: "korza", repo: "gap-analysis-demo" },
      defaultBranch: "main",
      paths: ["pom.xml", "Dockerfile", ".github/workflows/ci.yml"],
      files: {
        "pom.xml": "<project></project>",
        Dockerfile: "FROM eclipse-temurin:21\n",
        ".github/workflows/ci.yml": [
          "jobs:",
          "  scan:",
          "    steps:",
          "      - run: semgrep --config p/java --error gateway-runtime/src",
          "      - run: trivy fs --scanners vuln --exit-code 1 .",
        ].join("\n"),
      },
    };
    const signals = ciSignals(snapshot);
    const analysis = analyze(snapshot, catalogue, signals);
    expect(cap(analysis, "sast").present).toEqual([]);
    for (const id of ["sca", "image-scan"])
      expect(cap(analysis, id).present.map((p) => p.id)).toEqual(["trivy"]);

    const semgrep = "semgrep --config p/java --error gateway-runtime/src";
    const trivy = "trivy fs --scanners vuln --exit-code 1 .";
    const { result } = await run({ analysis, signals, catalogue }, [
      provides("sast:semgrep", semgrep),
      denies("image-scan:trivy", trivy, "scans the filesystem, not an image"),
      denies("iac-config:trivy", trivy, "scans dependencies, not IaC"),
      // Confirming a credited pair changes nothing.
      provides("sca:trivy", trivy, { reason: "scans dependencies" }),
    ]);
    expect(cap(result, "sast")).toMatchObject({
      satisfied: true,
      present: [{ id: "semgrep" }],
    });
    expect(cap(result, "image-scan")).toMatchObject({
      present: [],
      llmNote: "scans the filesystem, not an image",
    });
    expect(cap(result, "iac-config").present).toEqual([]);
    expect(cap(result, "sca")).toMatchObject({
      satisfied: true,
      present: [{ id: "trivy" }],
    });
    expect(cap(result, "sca").llmNote).toBeUndefined();
    expect(counts(analysis)).toEqual({
      satisfiedCount: 3,
      partialCount: 0,
      gapCount: 7,
    });
    expect(counts(result)).toEqual({
      satisfiedCount: 2,
      partialCount: 0,
      gapCount: 8,
    });
  });
});
