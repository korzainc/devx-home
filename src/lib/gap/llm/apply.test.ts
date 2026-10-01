import { afterEach, describe, expect, it, vi } from "vitest";
import { applyLlmPass, cacheKey } from "./apply";
import type {
  AuditFinding,
  LlmConfig,
  LlmResponse,
  RescueFinding,
} from "./types";
import type { Analysis, AnalysisTool, Baseline } from "../types";
import type { CiSignals } from "../detect";

const baseline: Baseline = {
  categories: ["Security"],
  capabilities: {
    sast: { label: "SAST", category: "Security" },
    sca: { label: "Dependency scanning", category: "Security" },
  },
  universal: [],
  stacks: [
    {
      id: "any",
      label: "Any",
      markers: [],
      expects: {
        sast: { recommended: "semgrep", acceptable: [] },
        sca: { recommended: "trivy", acceptable: [] },
      },
    },
  ],
};

const tools: AnalysisTool[] = [
  {
    id: "trivy",
    name: "Trivy",
    capabilities: ["sca", "iac-config", "image-scan"],
    stacks: ["any"],
    detect: {},
  },
  {
    id: "semgrep",
    name: "Semgrep",
    capabilities: ["sast"],
    stacks: ["any"],
    detect: {},
  },
];

function baseAnalysis(): Analysis {
  return {
    repo: "korza/example",
    defaultBranch: "main",
    stacks: [
      {
        id: "any",
        label: "Any",
        markers: [],
        expects: baseline.stacks[0].expects,
      },
    ],
    filesRead: [],
    categories: [
      {
        category: "Security",
        capabilities: [
          {
            id: "sast",
            label: "SAST",
            satisfied: false,
            present: [],
            recommended: [
              { id: "semgrep", name: "Semgrep", stackLabels: ["Any"] },
            ],
          },
          {
            id: "sca",
            label: "Dependency scanning",
            satisfied: true,
            // Realistic shape: `detect.ts`'s `evidenceFor` always synthesizes a label like this
            // one, never raw CI text. `applyAudit` must select the tool to demote by `toolId`,
            // not by matching a model's quote against this string - the two are never the same
            // text, which is exactly the bug this fixture exists to keep visible.
            present: [
              {
                id: "trivy",
                name: "Trivy",
                evidence: "runs trivy in .github/workflows/ci.yml",
                stackLabels: [],
              },
            ],
            recommended: [],
          },
        ],
      },
    ],
    satisfiedCount: 1,
    partialCount: 0,
    gapCount: 1,
    buildSteps: [],
  };
}

const signals: CiSignals = {
  uses: [],
  shell: [
    { text: "semgrep --config p/golang .", source: ".github/workflows/ci.yml" },
    { text: "npm ci --frozen-lockfile", source: ".github/workflows/ci.yml" },
    {
      text: "trivy fs . --severity HIGH,CRITICAL",
      source: ".github/workflows/ci.yml",
    },
  ],
};

function configWith(response: LlmResponse): LlmConfig {
  return {
    enabled: true,
    // LlmClient is a plain, one-method interface, so a real fake satisfies it directly -
    // no cast needed, and nothing here knows or cares which provider a real LlmClient would wrap.
    client: {
      complete: vi.fn().mockResolvedValue({
        ok: true,
        text: JSON.stringify(response),
        inputTokens: 100,
        outputTokens: 50,
      }),
    },
    model: "claude-sonnet-5",
    effort: "low",
    readCache: vi.fn().mockResolvedValue(null),
    writeCache: vi.fn().mockResolvedValue(undefined),
    underDailySpendCap: vi.fn().mockResolvedValue(true),
    recordSpend: vi.fn().mockResolvedValue(undefined),
  };
}

describe("cacheKey", () => {
  it("is stable for the same model, effort, system, and user text", () => {
    expect(
      cacheKey("claude-sonnet-5", "low", "same system", "same prompt"),
    ).toBe(cacheKey("claude-sonnet-5", "low", "same system", "same prompt"));
  });

  it("changes when the user prompt text changes", () => {
    expect(cacheKey("claude-sonnet-5", "low", "system", "prompt a")).not.toBe(
      cacheKey("claude-sonnet-5", "low", "system", "prompt b"),
    );
  });

  it("changes when the system prompt text changes", () => {
    expect(cacheKey("claude-sonnet-5", "low", "system a", "prompt")).not.toBe(
      cacheKey("claude-sonnet-5", "low", "system b", "prompt"),
    );
  });

  it("changes when effort changes", () => {
    expect(
      cacheKey("claude-sonnet-5", "low", "system", "same prompt"),
    ).not.toBe(cacheKey("claude-sonnet-5", "medium", "system", "same prompt"));
  });

  it("changes when the model changes", () => {
    expect(cacheKey("model-a", "low", "system", "user")).not.toBe(
      cacheKey("model-b", "low", "system", "user"),
    );
  });
});

describe("applyLlmPass", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rescues a gap when the model returns a verified finding", async () => {
    const config = configWith({
      rescueFindings: [
        {
          capabilityId: "sast",
          quote: "semgrep --config p/golang .",
          toolId: "semgrep",
        },
      ],
      auditFindings: [],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    const sast = result.categories[0].capabilities.find(
      (c) => c.id === "sast",
    )!;
    expect(sast.satisfied).toBe(true);
    expect(sast.present[0].evidence).toBe("semgrep --config p/golang .");
  });

  it("sets llmNote on a rescued capability, matching the provenance applyAudit already records for a demotion", async () => {
    const config = configWith({
      rescueFindings: [
        {
          capabilityId: "sast",
          quote: "semgrep --config p/golang .",
          toolId: "semgrep",
        },
      ],
      auditFindings: [],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    const sast = result.categories[0].capabilities.find(
      (c) => c.id === "sast",
    )!;
    expect(sast.llmNote).toBeTruthy();
    expect(sast.llmNote).toContain("semgrep");
  });

  it("drops a rescue finding whose toolId is a real catalogue tool but not among this capability's own recommended tools", async () => {
    const config = configWith({
      rescueFindings: [
        {
          capabilityId: "sast",
          quote: "semgrep --config p/golang .",
          // "trivy" is a real catalogue tool (see `tools` above), but it covers `sca`, not
          // `sast` - it never appears in sast's own `recommended` list, so naming it must not
          // rescue sast even though it passes the schema's global toolId enum, which spans every
          // gap's recommendations across the whole analysis.
          toolId: "trivy",
        },
      ],
      auditFindings: [],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    const sast = result.categories[0].capabilities.find(
      (c) => c.id === "sast",
    )!;
    expect(sast.satisfied).toBe(false);
    expect(sast.present).toHaveLength(0);
  });

  it("drops a rescue finding whose quote does not appear in the signals", async () => {
    const config = configWith({
      rescueFindings: [
        {
          capabilityId: "sast",
          quote: "docker build .",
          toolId: "semgrep",
        },
      ],
      auditFindings: [],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    const sast = result.categories[0].capabilities.find(
      (c) => c.id === "sast",
    )!;
    expect(sast.satisfied).toBe(false);
  });

  it("flips a satisfied capability to a gap on a verified audit finding", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [
        {
          capabilityId: "sca",
          toolId: "trivy",
          quote: "trivy fs . --severity HIGH,CRITICAL",
          reason: "only runs the filesystem scan",
        },
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    const sca = result.categories[0].capabilities.find((c) => c.id === "sca")!;
    expect(sca.satisfied).toBe(false);
    expect(sca.present).toHaveLength(0);
    expect(sca.llmNote).toBe("only runs the filesystem scan");
  });

  it("gives a demoted single-tool capability a real recommendation instead of leaving it empty", async () => {
    // `gap-report.tsx`'s empty-`recommended` branch renders as "the catalogue has no tool for
    // this capability" - false here, since trivy was just demoted FROM this exact capability.
    const config = configWith({
      rescueFindings: [],
      auditFindings: [
        {
          capabilityId: "sca",
          toolId: "trivy",
          quote: "trivy fs . --severity HIGH,CRITICAL",
          reason: "only runs the filesystem scan",
        },
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    const sca = result.categories[0].capabilities.find((c) => c.id === "sca")!;
    expect(sca.satisfied).toBe(false);
    expect(sca.recommended).toEqual([
      { id: "trivy", name: "Trivy", stackLabels: ["Any"] },
    ]);
  });

  it("leaves an audit finding's target alone when its toolId does not match any present tool", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [
        {
          capabilityId: "sca",
          toolId: "no-such-tool",
          quote: "trivy fs . --severity HIGH,CRITICAL",
          reason: "n/a",
        },
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    const sca = result.categories[0].capabilities.find((c) => c.id === "sca")!;
    expect(sca.satisfied).toBe(true);
    expect(sca.present).toHaveLength(1);
    expect(sca.llmNote).toBeUndefined();
  });

  it("drops an audit finding whose quote is not verbatim present in any signal", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [
        {
          capabilityId: "sca",
          toolId: "trivy",
          quote: "this text does not appear anywhere in the CI signals",
          reason: "n/a",
        },
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    const sca = result.categories[0].capabilities.find((c) => c.id === "sca")!;
    expect(sca.satisfied).toBe(true);
    expect(sca.present).toHaveLength(1);
    expect(sca.llmNote).toBeUndefined();
  });

  describe("a polyglot monorepo capability satisfied by two tools covering different stacks", () => {
    const polyglotTools: AnalysisTool[] = [
      {
        id: "trivy",
        name: "Trivy",
        capabilities: ["sca", "iac-config", "image-scan"],
        stacks: ["go"],
        detect: {},
      },
      {
        id: "npm-audit",
        name: "npm audit",
        capabilities: ["sca"],
        stacks: ["javascript"],
        detect: {},
      },
    ];
    const polyglotBaseline: Baseline = {
      categories: ["Security"],
      capabilities: {
        sca: { label: "Dependency scanning", category: "Security" },
      },
      universal: [],
      stacks: [
        {
          id: "go",
          label: "Go",
          markers: [],
          expects: { sca: { recommended: "trivy", acceptable: [] } },
        },
        {
          id: "javascript",
          label: "JavaScript",
          markers: [],
          expects: { sca: { recommended: "npm-audit", acceptable: [] } },
        },
      ],
    };

    function polyglotAnalysis(): Analysis {
      return {
        repo: "korza/example",
        defaultBranch: "main",
        stacks: polyglotBaseline.stacks,
        filesRead: [],
        categories: [
          {
            category: "Security",
            capabilities: [
              {
                id: "sca",
                label: "Dependency scanning",
                satisfied: true,
                present: [
                  {
                    id: "trivy",
                    name: "Trivy",
                    evidence: "runs trivy in .github/workflows/ci.yml",
                    stackLabels: ["Go"],
                  },
                  {
                    id: "npm-audit",
                    name: "npm audit",
                    evidence: "runs npm audit in .github/workflows/ci.yml",
                    stackLabels: ["JavaScript"],
                  },
                ],
                recommended: [],
              },
            ],
          },
        ],
        satisfiedCount: 1,
        partialCount: 0,
        gapCount: 0,
        buildSteps: [],
      };
    }

    const polyglotSignals: CiSignals = {
      uses: [],
      shell: [
        {
          text: "trivy fs . --severity HIGH,CRITICAL",
          source: ".github/workflows/ci.yml",
        },
      ],
    };

    it("drops to unsatisfied when demoting the tool that alone covered the other stack, instead of staying satisfied by mere presence", async () => {
      const config = configWith({
        rescueFindings: [],
        auditFindings: [
          {
            capabilityId: "sca",
            toolId: "trivy",
            quote: "trivy fs . --severity HIGH,CRITICAL",
            reason: "only scans the Go module, not the whole tree",
          },
        ],
        detectFindings: [],
      });

      const result = await applyLlmPass(
        polyglotAnalysis(),
        polyglotSignals,
        { tools: polyglotTools, baseline: polyglotBaseline },
        config,
      );
      const sca = result.categories[0].capabilities.find(
        (c) => c.id === "sca",
      )!;
      // npm-audit alone only covers JavaScript - Go is now uncovered, so this must not stay
      // satisfied just because `remaining.length > 0`.
      expect(sca.satisfied).toBe(false);
      expect(sca.present).toEqual([
        {
          id: "npm-audit",
          name: "npm audit",
          evidence: "runs npm audit in .github/workflows/ci.yml",
          stackLabels: ["JavaScript"],
        },
      ]);
      expect(sca.recommended).toEqual([
        { id: "trivy", name: "Trivy", stackLabels: ["Go"] },
      ]);
    });
  });

  describe("a polyglot monorepo capability rescued for only one of its required stacks", () => {
    const polyglotUnitTestTools: AnalysisTool[] = [
      {
        id: "go-test",
        name: "go test",
        capabilities: ["unit-tests"],
        stacks: ["go"],
        detect: {},
      },
      {
        id: "jest",
        name: "Jest",
        capabilities: ["unit-tests"],
        stacks: ["javascript"],
        detect: {},
      },
    ];
    const polyglotUnitTestBaseline: Baseline = {
      categories: ["Testing"],
      capabilities: {
        "unit-tests": { label: "Unit tests", category: "Testing" },
      },
      universal: [],
      stacks: [
        {
          id: "go",
          label: "Go",
          markers: [],
          expects: { "unit-tests": { recommended: "go-test", acceptable: [] } },
        },
        {
          id: "javascript",
          label: "JavaScript",
          markers: [],
          expects: { "unit-tests": { recommended: "jest", acceptable: [] } },
        },
      ],
    };

    // unit-tests is a full gap - no test runner detected for either language - exactly the
    // reachable shape the investigation identified: no universal tool exists for this capability,
    // so a rescue quote can only ever prove coverage for one of the two required stacks.
    function polyglotUnitTestAnalysis(): Analysis {
      return {
        repo: "korza/example",
        defaultBranch: "main",
        stacks: polyglotUnitTestBaseline.stacks,
        filesRead: [],
        categories: [
          {
            category: "Testing",
            capabilities: [
              {
                id: "unit-tests",
                label: "Unit tests",
                satisfied: false,
                present: [],
                recommended: [
                  { id: "go-test", name: "go test", stackLabels: ["Go"] },
                  { id: "jest", name: "Jest", stackLabels: ["JavaScript"] },
                ],
              },
            ],
          },
        ],
        satisfiedCount: 0,
        partialCount: 0,
        gapCount: 1,
        buildSteps: [],
      };
    }

    const polyglotUnitTestSignals: CiSignals = {
      uses: [],
      shell: [
        {
          text: "go test ./... -v -race -count=1",
          source: ".github/workflows/ci.yml",
        },
      ],
    };

    it("stays unsatisfied, with the other stack's tool still recommended, instead of crediting the whole capability off one stack's quote", async () => {
      const config = configWith({
        rescueFindings: [
          {
            capabilityId: "unit-tests",
            quote: "go test ./... -v -race -count=1",
            toolId: "go-test",
          },
        ],
        auditFindings: [],
        detectFindings: [],
      });

      const result = await applyLlmPass(
        polyglotUnitTestAnalysis(),
        polyglotUnitTestSignals,
        { tools: polyglotUnitTestTools, baseline: polyglotUnitTestBaseline },
        config,
      );
      const unitTests = result.categories[0].capabilities.find(
        (c) => c.id === "unit-tests",
      )!;
      // Go is now covered by the rescued go-test finding, but JavaScript still has zero coverage -
      // this must stay a gap, not silently claim full coverage off one stack's quote.
      expect(unitTests.satisfied).toBe(false);
      expect(unitTests.present).toEqual([
        {
          id: "go-test",
          name: "go test",
          evidence: "go test ./... -v -race -count=1",
          stackLabels: ["Go"],
        },
      ]);
      expect(unitTests.recommended).toEqual([
        { id: "jest", name: "Jest", stackLabels: ["JavaScript"] },
      ]);
    });
  });

  it("does not apply a rescue finding to a partial capability", async () => {
    const analysis = baseAnalysis();
    analysis.categories[0].capabilities.push({
      id: "sbom",
      label: "SBOM",
      satisfied: false,
      present: [
        {
          id: "syft",
          name: "Syft",
          evidence: "runs syft in .github/workflows/ci.yml",
          stackLabels: [],
        },
      ],
      recommended: [],
    });

    const config = configWith({
      rescueFindings: [
        {
          capabilityId: "sbom",
          quote: "trivy fs . --severity HIGH,CRITICAL",
          toolId: "trivy",
        },
      ],
      auditFindings: [],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      analysis,
      signals,
      { tools, baseline },
      config,
    );
    const sbom = result.categories[0].capabilities.find(
      (c) => c.id === "sbom",
    )!;
    expect(sbom).toEqual(
      analysis.categories[0].capabilities.find((c) => c.id === "sbom"),
    );
  });

  it("recomputes satisfiedCount, partialCount, and gapCount after a rescue, an audit demotion, and a detect finding together", async () => {
    const analysis = baseAnalysis();
    analysis.categories[0].capabilities.push({
      id: "sbom",
      label: "SBOM",
      satisfied: false,
      present: [
        {
          id: "syft",
          name: "Syft",
          evidence: "runs syft in .github/workflows/ci.yml",
          stackLabels: [],
        },
      ],
      recommended: [],
    });

    const config = configWith({
      rescueFindings: [
        {
          capabilityId: "sast",
          quote: "semgrep --config p/golang .",
          toolId: "semgrep",
        },
      ],
      auditFindings: [
        {
          capabilityId: "sca",
          toolId: "trivy",
          quote: "trivy fs . --severity HIGH,CRITICAL",
          reason: "only runs the filesystem scan",
        },
      ],
      detectFindings: [{ kind: "install", quote: "npm ci --frozen-lockfile" }],
    });

    const result = await applyLlmPass(
      analysis,
      signals,
      { tools, baseline },
      config,
    );

    // sast rescued (satisfied), sca demoted to a full gap, sbom untouched (partial).
    expect(result.satisfiedCount).toBe(1);
    expect(result.partialCount).toBe(1);
    expect(result.gapCount).toBe(2);
  });

  it("populates buildSteps from verified detect findings", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [{ kind: "install", quote: "npm ci --frozen-lockfile" }],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    expect(result.buildSteps).toEqual([
      {
        kind: "install",
        evidence: "npm ci --frozen-lockfile",
        source: ".github/workflows/ci.yml",
      },
    ]);
  });

  it("populates buildSteps with both an install and a build finding when both verify", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [
        { kind: "install", quote: "npm ci --frozen-lockfile" },
        { kind: "build", quote: "trivy fs . --severity HIGH,CRITICAL" },
      ],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    expect(result.buildSteps).toHaveLength(2);
    expect(result.buildSteps).toEqual(
      expect.arrayContaining([
        {
          kind: "install",
          evidence: "npm ci --frozen-lockfile",
          source: ".github/workflows/ci.yml",
        },
        {
          kind: "build",
          evidence: "trivy fs . --severity HIGH,CRITICAL",
          source: ".github/workflows/ci.yml",
        },
      ]),
    );
  });

  it("returns the analysis unchanged and never calls recordSpend when the client throws with no usage data", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    vi.mocked(config.client.complete).mockRejectedValue(
      new Error("network error"),
    );

    const analysis = baseAnalysis();
    const result = await applyLlmPass(
      analysis,
      signals,
      { tools, baseline },
      config,
    );
    expect(result).toEqual(analysis);
    // The call threw before any response - including usage - ever existed, so there is nothing
    // real to bill: a thrown error must never fabricate a cost.
    expect(config.recordSpend).not.toHaveBeenCalled();
  });

  it("discards the findings but still records the real cost of a truncated response against the spend cap", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    vi.mocked(config.client.complete).mockResolvedValue({
      ok: false,
      reason: "truncated",
      inputTokens: 100,
      outputTokens: 8000,
    });

    const analysis = baseAnalysis();
    const result = await applyLlmPass(
      analysis,
      signals,
      { tools, baseline },
      config,
    );
    // A misconfigured effort level that reliably truncates is billed for every one of those
    // full-length generations - it must never look free to the daily spend cap just because the
    // response was unusable.
    expect(result).toEqual(analysis);
    expect(config.recordSpend).toHaveBeenCalledTimes(1);
    expect(config.recordSpend).toHaveBeenCalledWith(
      (100 / 1_000_000) * 2 + (8000 / 1_000_000) * 10,
    );
  });

  it("returns the analysis unchanged and never calls recordSpend when the client reports an error with no usage data", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    vi.mocked(config.client.complete).mockResolvedValue({
      ok: false,
      reason: "error",
    });

    const analysis = baseAnalysis();
    const result = await applyLlmPass(
      analysis,
      signals,
      { tools, baseline },
      config,
    );
    expect(result).toEqual(analysis);
    expect(config.recordSpend).not.toHaveBeenCalled();
  });

  it("returns a cached response without calling the client again", async () => {
    const cached = {
      model: "claude-sonnet-5",
      response: {
        rescueFindings: [
          {
            capabilityId: "sast",
            quote: "semgrep --config p/golang .",
            toolId: "semgrep",
          },
        ],
        auditFindings: [],
        detectFindings: [],
      },
      inputTokens: 10,
      outputTokens: 10,
    };
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    config.readCache = vi.fn().mockResolvedValue(cached);

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    expect(config.client.complete).not.toHaveBeenCalled();
    const sast = result.categories[0].capabilities.find(
      (c) => c.id === "sast",
    )!;
    expect(sast.satisfied).toBe(true);
  });

  it("skips the call entirely and returns the analysis unchanged when disabled", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    config.enabled = false;

    const analysis = baseAnalysis();
    const result = await applyLlmPass(
      analysis,
      signals,
      { tools, baseline },
      config,
    );
    expect(result).toEqual(analysis);
    expect(config.client.complete).not.toHaveBeenCalled();
  });

  it("skips the call entirely and returns the analysis unchanged when over the daily spend cap", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    config.underDailySpendCap = vi.fn().mockResolvedValue(false);

    const analysis = baseAnalysis();
    const result = await applyLlmPass(
      analysis,
      signals,
      { tools, baseline },
      config,
    );
    expect(result).toEqual(analysis);
    expect(config.client.complete).not.toHaveBeenCalled();
  });

  it("calls recordSpend exactly once with the computed cost on a cache miss, and not at all on a cache hit", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });

    await applyLlmPass(baseAnalysis(), signals, { tools, baseline }, config);
    expect(config.recordSpend).toHaveBeenCalledTimes(1);
    expect(config.recordSpend).toHaveBeenCalledWith(
      (100 / 1_000_000) * 2 + (50 / 1_000_000) * 10,
    );

    const cachedConfig = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    cachedConfig.readCache = vi.fn().mockResolvedValue({
      model: "claude-sonnet-5",
      response: { rescueFindings: [], auditFindings: [], detectFindings: [] },
      inputTokens: 10,
      outputTokens: 10,
    });
    await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      cachedConfig,
    );
    expect(cachedConfig.recordSpend).not.toHaveBeenCalled();
  });

  it("calls writeCache once with the model, response, and token counts on a cache miss", async () => {
    const response: LlmResponse = {
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    };
    const config = configWith(response);

    await applyLlmPass(baseAnalysis(), signals, { tools, baseline }, config);
    expect(config.writeCache).toHaveBeenCalledTimes(1);
    const [key, entry] = vi.mocked(config.writeCache).mock.calls[0];
    expect(typeof key).toBe("string");
    expect(entry).toEqual({
      model: "claude-sonnet-5",
      response,
      inputTokens: 100,
      outputTokens: 50,
    });
  });

  it("returns the analysis unchanged when a fresh response fails shape validation (missing detectFindings)", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    vi.mocked(config.client.complete).mockResolvedValue({
      ok: true,
      text: JSON.stringify({ rescueFindings: [], auditFindings: [] }),
      inputTokens: 100,
      outputTokens: 50,
    });

    const analysis = baseAnalysis();
    const result = await applyLlmPass(
      analysis,
      signals,
      { tools, baseline },
      config,
    );
    expect(result).toEqual(analysis);
  });

  it("returns the analysis unchanged when a fresh response's audit finding is missing quote", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    vi.mocked(config.client.complete).mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        rescueFindings: [],
        auditFindings: [
          { capabilityId: "sca", toolId: "trivy", reason: "n/a" },
        ],
        detectFindings: [],
      }),
      inputTokens: 100,
      outputTokens: 50,
    });

    const analysis = baseAnalysis();
    const result = await applyLlmPass(
      analysis,
      signals,
      { tools, baseline },
      config,
    );
    expect(result).toEqual(analysis);
  });

  it("falls through to a fresh call and applies its findings when a cached response fails shape validation", async () => {
    const config = configWith({
      rescueFindings: [
        {
          capabilityId: "sast",
          quote: "semgrep --config p/golang .",
          toolId: "semgrep",
        },
      ],
      auditFindings: [],
      detectFindings: [],
    });
    config.readCache = vi.fn().mockResolvedValue({
      model: "claude-sonnet-5",
      response: null,
      inputTokens: 10,
      outputTokens: 10,
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    expect(config.client.complete).toHaveBeenCalledTimes(1);
    const sast = result.categories[0].capabilities.find(
      (c) => c.id === "sast",
    )!;
    expect(sast.satisfied).toBe(true);
    expect(sast.present[0].evidence).toBe("semgrep --config p/golang .");
  });

  it("drops a detect finding with a kind outside the closed union without discarding a valid finding in the same response, on both the cached and fresh paths", async () => {
    const freshConfig = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    vi.mocked(freshConfig.client.complete).mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        rescueFindings: [
          {
            capabilityId: "sast",
            quote: "semgrep --config p/golang .",
            toolId: "semgrep",
          },
        ],
        auditFindings: [],
        detectFindings: [
          { kind: "totally-bogus-kind", quote: "npm ci --frozen-lockfile" },
        ],
      }),
      inputTokens: 100,
      outputTokens: 50,
    });
    const freshResult = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      freshConfig,
    );
    expect(
      freshResult.categories[0].capabilities.find((c) => c.id === "sast")
        ?.satisfied,
    ).toBe(true);
    expect(freshResult.buildSteps).toEqual([]);

    const cachedConfig = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    cachedConfig.readCache = vi.fn().mockResolvedValue({
      model: "claude-sonnet-5",
      response: {
        rescueFindings: [
          {
            capabilityId: "sast",
            quote: "semgrep --config p/golang .",
            toolId: "semgrep",
          },
        ],
        auditFindings: [],
        detectFindings: [
          { kind: "totally-bogus-kind", quote: "npm ci --frozen-lockfile" },
        ],
      },
      inputTokens: 10,
      outputTokens: 10,
    });
    const cachedResult = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      cachedConfig,
    );
    // Shape-valid overall (all three fields are arrays), so the cached row is used as-is, with
    // only the individually malformed detect finding filtered out - unlike the pre-fix behavior,
    // where this cached row would fail whole-response validation and force a fresh call.
    expect(cachedConfig.client.complete).not.toHaveBeenCalled();
    expect(
      cachedResult.categories[0].capabilities.find((c) => c.id === "sast")
        ?.satisfied,
    ).toBe(true);
    expect(cachedResult.buildSteps).toEqual([]);
  });

  it("warns once per distinct unrecognized model id, not once per process", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const configA = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    configA.model = "totally-unknown-model-a";
    await applyLlmPass(baseAnalysis(), signals, { tools, baseline }, configA);

    const configB = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    configB.model = "totally-unknown-model-b";
    await applyLlmPass(baseAnalysis(), signals, { tools, baseline }, configB);

    const pricingWarnings = warnSpy.mock.calls.filter((call) =>
      String(call[0]).includes("unrecognized model"),
    );
    expect(pricingWarnings).toHaveLength(2);
    expect(String(pricingWarnings[0][0])).toContain("totally-unknown-model-a");
    expect(String(pricingWarnings[1][0])).toContain("totally-unknown-model-b");
  });

  it("returns the analysis unchanged and never calls the client when underDailySpendCap rejects", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    config.underDailySpendCap = vi
      .fn()
      .mockRejectedValue(new Error("spend-cap store unavailable"));

    const analysis = baseAnalysis();
    const result = await applyLlmPass(
      analysis,
      signals,
      { tools, baseline },
      config,
    );
    expect(result).toEqual(analysis);
    expect(config.client.complete).not.toHaveBeenCalled();
  });

  it("returns the analysis unchanged and never calls the client when readCache rejects", async () => {
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });
    config.readCache = vi.fn().mockRejectedValue(new Error("db down"));

    const analysis = baseAnalysis();
    const result = await applyLlmPass(
      analysis,
      signals,
      { tools, baseline },
      config,
    );
    expect(result).toEqual(analysis);
    expect(config.client.complete).not.toHaveBeenCalled();
  });

  it("still applies a good finding when recordSpend rejects", async () => {
    const config = configWith({
      rescueFindings: [
        {
          capabilityId: "sast",
          quote: "semgrep --config p/golang .",
          toolId: "semgrep",
        },
      ],
      auditFindings: [],
      detectFindings: [],
    });
    config.recordSpend = vi.fn().mockRejectedValue(new Error("db down"));

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    const sast = result.categories[0].capabilities.find(
      (c) => c.id === "sast",
    )!;
    expect(sast.satisfied).toBe(true);
  });

  it("still applies a good finding when writeCache rejects", async () => {
    const config = configWith({
      rescueFindings: [
        {
          capabilityId: "sast",
          quote: "semgrep --config p/golang .",
          toolId: "semgrep",
        },
      ],
      auditFindings: [],
      detectFindings: [],
    });
    config.writeCache = vi.fn().mockRejectedValue(new Error("db down"));

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    const sast = result.categories[0].capabilities.find(
      (c) => c.id === "sast",
    )!;
    expect(sast.satisfied).toBe(true);
  });

  it("rescues the real korza-cli/semgrep case: a bare --config invocation", async () => {
    const realSignals: CiSignals = {
      uses: [],
      shell: [
        {
          text: "semgrep --config p/golang --config p/security-audit --error .",
          source: ".github/workflows/ci.yml",
        },
      ],
    };
    const config = configWith({
      rescueFindings: [
        {
          capabilityId: "sast",
          quote:
            "semgrep --config p/golang --config p/security-audit --error .",
          toolId: "semgrep",
        },
      ],
      auditFindings: [],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      realSignals,
      { tools, baseline },
      config,
    );
    const sast = result.categories[0].capabilities.find(
      (c) => c.id === "sast",
    )!;
    expect(sast.satisfied).toBe(true);
    expect(sast.present[0].evidence).toBe(
      "semgrep --config p/golang --config p/security-audit --error .",
    );
  });

  it("keeps a quote near the start of a raw-file-fallback entry verifiable, but drops one buried past the truncation cap", async () => {
    // `detect.ts`'s YAML-parse-failure fallback pushes an entire file's content into one shell
    // entry, and `capSignals` truncates each entry to its first 400 characters before
    // it reaches the model. A quote near the start of a 4,000-character file still verifies; one
    // 2,000 characters in does not - a real, known tradeoff this test documents rather than hides.
    const paddingLine = "# this line is here only to pad the file out\n";
    const hugeFile = `${paddingLine.repeat(200)}npm ci --frozen-lockfile\n${paddingLine.repeat(200)}`;
    const messySignals: CiSignals = {
      uses: [],
      shell: [{ text: hugeFile, source: "ci.yml" }],
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [
        {
          kind: "install",
          quote: "# this line is here only to pad the file out",
        },
        { kind: "build", quote: "npm ci --frozen-lockfile" },
      ],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      messySignals,
      { tools, baseline },
      config,
    );

    expect(result.buildSteps).toEqual([
      {
        kind: "install",
        evidence: "# this line is here only to pad the file out",
        source: "ci.yml",
      },
    ]);
    const droppedWarnings = warnSpy.mock.calls.filter(
      (call) =>
        String(call[0]).includes("dropped a detect finding") &&
        (call[1] as { kind?: string } | undefined)?.kind === "build",
    );
    expect(droppedWarnings).toHaveLength(1);
  });

  it("applies a valid rescue finding even when the response's auditFindings array also contains a malformed entry", async () => {
    const config = configWith({
      rescueFindings: [
        {
          capabilityId: "sast",
          quote: "semgrep --config p/golang .",
          toolId: "semgrep",
        },
      ],
      // Missing `quote` - a real model could never emit this against the schema, but a
      // malformed entry anywhere in this array must never poison the valid rescue finding above.
      auditFindings: [
        {
          capabilityId: "sca",
          toolId: "trivy",
          reason: "n/a",
        } as unknown as AuditFinding,
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    const sast = result.categories[0].capabilities.find(
      (c) => c.id === "sast",
    )!;
    expect(sast.satisfied).toBe(true);
    const sca = result.categories[0].capabilities.find((c) => c.id === "sca")!;
    expect(sca.satisfied).toBe(true);
    expect(sca.present).toHaveLength(1);
  });

  it("keeps a well-formed finding sitting beside a malformed one in the SAME findings array", async () => {
    // Per-entry, not per-array: dropping the whole `rescueFindings` array because one entry in it
    // is malformed would discard a paid-for, verified finding for a reason that has nothing to do
    // with it.
    const config = configWith({
      rescueFindings: [
        { capabilityId: "sast", toolId: "semgrep" } as unknown as RescueFinding,
        {
          capabilityId: "sast",
          quote: "semgrep --config p/golang .",
          toolId: "semgrep",
        },
      ],
      auditFindings: [
        { capabilityId: "sca", quote: "trivy fs ." } as unknown as AuditFinding,
        {
          capabilityId: "sca",
          quote: "trivy fs . --severity HIGH,CRITICAL",
          toolId: "trivy",
          reason: "Only scans the filesystem, not dependencies.",
        },
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );

    const sast = result.categories[0].capabilities.find(
      (c) => c.id === "sast",
    )!;
    expect(sast.satisfied).toBe(true);
    expect(sast.present.map((t) => t.name)).toEqual(["Semgrep"]);

    const sca = result.categories[0].capabilities.find((c) => c.id === "sca")!;
    expect(sca.present).toHaveLength(0);
    expect(sca.llmNote).toBe("Only scans the filesystem, not dependencies.");
  });

  describe("a catalogue with no audit candidates (empty toolIds)", () => {
    const singleCapTools: AnalysisTool[] = [
      {
        id: "eslint",
        name: "ESLint",
        capabilities: ["lint"],
        stacks: ["any"],
        detect: {},
      },
    ];
    const singleCapBaseline: Baseline = {
      categories: ["Linting"],
      capabilities: {
        lint: { label: "Linting", category: "Linting" },
        sast: { label: "SAST", category: "Linting" },
      },
      // A universal capability, so a gap exists (and hasCandidates is true) without adding a
      // second stack - keeps this fixture focused on the empty-toolIds audit path alone.
      universal: ["sast"],
      stacks: [
        {
          id: "any",
          label: "Any",
          markers: [],
          expects: { lint: { recommended: "eslint", acceptable: [] } },
        },
      ],
    };

    function singleCapAnalysis(): Analysis {
      return {
        repo: "korza/example",
        defaultBranch: "main",
        stacks: [
          {
            id: "any",
            label: "Any",
            markers: [],
            expects: singleCapBaseline.stacks[0].expects,
          },
        ],
        filesRead: [],
        categories: [
          {
            category: "Linting",
            capabilities: [
              {
                id: "lint",
                label: "Linting",
                satisfied: true,
                present: [
                  {
                    id: "eslint",
                    name: "ESLint",
                    evidence: "runs eslint in .github/workflows/ci.yml",
                    stackLabels: [],
                  },
                ],
                recommended: [],
              },
              {
                id: "sast",
                label: "SAST",
                satisfied: false,
                present: [],
                recommended: [],
              },
            ],
          },
        ],
        satisfiedCount: 1,
        partialCount: 0,
        gapCount: 1,
        buildSteps: [],
      };
    }

    it("treats auditFindings:[{}] as trivially droppable rather than a validation error, and does not crash", async () => {
      // eslint has only one capability, so it is never an audit candidate - buildPrompt's
      // toolIds ends up empty, and schema.ts's empty-toolIds workaround forces the model to emit
      // exactly this `{}` shape for every audit finding.
      const config = configWith({
        rescueFindings: [],
        auditFindings: [{} as unknown as AuditFinding],
        detectFindings: [],
      });

      const analysis = singleCapAnalysis();
      const result = await applyLlmPass(
        analysis,
        signals,
        { tools: singleCapTools, baseline: singleCapBaseline },
        config,
      );
      const lint = result.categories[0].capabilities.find(
        (c) => c.id === "lint",
      )!;
      expect(lint.satisfied).toBe(true);
      expect(lint.present).toHaveLength(1);
    });
  });

  it("returns the analysis unchanged, without calling the client or checking the spend cap, when there is nothing to rescue or audit", async () => {
    const noCandidateTools: AnalysisTool[] = [
      {
        id: "eslint",
        name: "ESLint",
        capabilities: ["lint"],
        stacks: ["any"],
        detect: {},
      },
    ];
    const noCandidateBaseline: Baseline = {
      categories: ["Linting"],
      capabilities: { lint: { label: "Linting", category: "Linting" } },
      universal: [],
      stacks: [
        {
          id: "any",
          label: "Any",
          markers: [],
          expects: { lint: { recommended: "eslint", acceptable: [] } },
        },
      ],
    };
    const analysis: Analysis = {
      repo: "korza/example",
      defaultBranch: "main",
      stacks: [
        {
          id: "any",
          label: "Any",
          markers: [],
          expects: noCandidateBaseline.stacks[0].expects,
        },
      ],
      filesRead: [],
      categories: [
        {
          category: "Linting",
          capabilities: [
            {
              id: "lint",
              label: "Linting",
              satisfied: true,
              present: [
                {
                  id: "eslint",
                  name: "ESLint",
                  evidence: "runs eslint in .github/workflows/ci.yml",
                  stackLabels: [],
                },
              ],
              recommended: [],
            },
          ],
        },
      ],
      satisfiedCount: 1,
      partialCount: 0,
      gapCount: 0,
      buildSteps: [],
    };
    const config = configWith({
      rescueFindings: [],
      auditFindings: [],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      analysis,
      signals,
      { tools: noCandidateTools, baseline: noCandidateBaseline },
      config,
    );
    expect(result).toEqual(analysis);
    expect(config.client.complete).not.toHaveBeenCalled();
    expect(config.underDailySpendCap).not.toHaveBeenCalled();
  });
});
