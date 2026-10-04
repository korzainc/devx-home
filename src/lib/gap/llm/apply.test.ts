import { afterEach, describe, expect, it, vi } from "vitest";
import { applyLlmPass, cacheKey } from "./apply";
import { buildPrompt } from "./schema";
import { analyze } from "../analyze";
import { ciSignals } from "../detect";
import { getBaseline, tools as realTools } from "@/lib/catalogue";
import type { LlmConfig, LlmResponse, LlmVerdict } from "./types";
import type { Analysis, AnalysisTool, Baseline, RepoSnapshot } from "../types";
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
    detect: { commands: ["trivy"] },
  },
  {
    id: "semgrep",
    name: "Semgrep",
    capabilities: ["sast"],
    stacks: ["any"],
    detect: { commands: ["semgrep"] },
  },
];

function baseAnalysis(): Analysis {
  return {
    repo: "korza/example",
    defaultBranch: "main",
    stacks: baseline.stacks,
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
            // one, never raw CI text. `applyAudit` must select the tool to demote by `toolId`, not
            // by matching a model's quote against this string.
            present: [
              {
                id: "trivy",
                name: "Trivy",
                evidence: "runs trivy in ci.yml",
                stackLabels: ["Any"],
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

/** Finds the signal id a real `buildPrompt` call assigned to the entry containing `needle` -
 * matches what a real model sees, so tests never hardcode an id order `budgetSignals` is free to
 * change. */
function signalIdFor(
  analysis: Analysis,
  sigs: CiSignals,
  needle: string,
): string {
  const { signals: sent } = buildPrompt(analysis, sigs, { tools });
  const entry = sent.find((e) => e.text.includes(needle));
  if (!entry) throw new Error(`no signal entry contains "${needle}"`);
  return entry.id;
}

/** Same as `signalIdFor`, for a test that needs its own tool catalogue rather than the module's
 * default `tools`. */
function signalIdForTools(
  toolsForPrompt: AnalysisTool[],
  analysis: Analysis,
  sigs: CiSignals,
  needle: string,
): string {
  const { signals: sent } = buildPrompt(analysis, sigs, {
    tools: toolsForPrompt,
  });
  const entry = sent.find((e) => e.text.includes(needle));
  if (!entry) throw new Error(`no signal entry contains "${needle}"`);
  return entry.id;
}

function verdict(
  overrides: Partial<LlmVerdict> & Pick<LlmVerdict, "pair" | "verdict">,
): LlmVerdict {
  return { signalId: "s1", quote: "", reason: "", ...overrides };
}

function configWith(response: LlmResponse, costUsd = 0.0042): LlmConfig {
  return {
    enabled: true,
    // LlmClient is a plain, one-method interface, so a real fake satisfies it directly - no cast
    // needed, and nothing here knows or cares which provider a real LlmClient would wrap.
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

describe("cacheKey", () => {
  const schema = { type: "object" };

  it("is stable for identical inputs, and changes when the model, effort, prompt text, or schema shape changes", () => {
    expect(cacheKey("m", "low", "s", "u", schema)).toBe(
      cacheKey("m", "low", "s", "u", schema),
    );
    expect(cacheKey("m", "low", "s", "u", schema)).not.toBe(
      cacheKey("m2", "low", "s", "u", schema),
    );
    expect(cacheKey("m", "low", "s", "u", schema)).not.toBe(
      cacheKey("m", "medium", "s", "u", schema),
    );
    expect(cacheKey("m", "low", "s", "u", schema)).not.toBe(
      cacheKey("m", "low", "s2", "u", schema),
    );
    expect(cacheKey("m", "low", "s", "u", schema)).not.toBe(
      cacheKey("m", "low", "s", "u2", schema),
    );
    expect(cacheKey("m", "low", "s", "u", schema)).not.toBe(
      cacheKey("m", "low", "s", "u", { type: "object", extra: true }),
    );
  });
});

describe("applyLlmPass: verdict direction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rescues a gap on a verified `provides` verdict, sets llmNote, and adds the tool as present evidence", async () => {
    const quote = "semgrep --config p/golang .";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: signalIdFor(baseAnalysis(), signals, quote),
          quote,
        }),
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
    expect(sast.present[0]).toMatchObject({ id: "semgrep", evidence: quote });
    expect(sast.llmNote).toContain("semgrep");
  });

  it("demotes a present multi-capability tool on a verified `does-not-provide` verdict, setting llmNote to the given reason", async () => {
    const quote = "trivy fs . --severity HIGH,CRITICAL";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sca:trivy",
          verdict: "does-not-provide",
          signalId: signalIdFor(baseAnalysis(), signals, quote),
          quote,
          reason: "only scans the filesystem for CVEs, not IaC or images",
        }),
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
    expect(sca.present).toEqual([]);
    expect(sca.llmNote).toBe(
      "only scans the filesystem for CVEs, not IaC or images",
    );
    expect(sca.recommended).toEqual([
      { id: "trivy", name: "Trivy", stackLabels: ["Any"] },
    ]);
  });

  it("changes nothing for an omitted pair, for `provides` on a pair already present, or for `does-not-provide` on a pair that was never present", async () => {
    const sastQuote = "semgrep --config p/golang .";
    const scaQuote = "trivy fs . --severity HIGH,CRITICAL";
    const config = configWith({
      // A pair with no evidence is just absent from `verdicts` - there's nothing to assert for
      // that case beyond `result` matching `analysis` below, same as the two no-op verdicts here.
      verdicts: [
        verdict({
          pair: "sca:trivy",
          verdict: "provides",
          signalId: signalIdFor(baseAnalysis(), signals, scaQuote),
          quote: scaQuote,
        }),
        verdict({
          pair: "sast:semgrep",
          verdict: "does-not-provide",
          signalId: signalIdFor(baseAnalysis(), signals, sastQuote),
          quote: sastQuote,
        }),
      ],
      detectFindings: [],
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

  it("drops a verdict whose pair is not a candidate this analysis generated", async () => {
    const quote = "trivy fs . --severity HIGH,CRITICAL";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sast:trivy",
          verdict: "provides",
          signalId: signalIdFor(baseAnalysis(), signals, quote),
          quote,
        }),
      ],
      detectFindings: [],
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

  it("drops a verdict whose quote does not verify - empty, not found at all, or found only in a different entry than the one cited, even when that quote relates to the tool", async () => {
    const analysis = baseAnalysis();
    const semgrepId = signalIdFor(analysis, signals, "semgrep --config");
    const npmId = signalIdFor(analysis, signals, "npm ci");
    const variants = [
      { signalId: semgrepId, quote: "" },
      { signalId: semgrepId, quote: "docker build --pull ." },
      // Real, tool-relevant text, but from the semgrep entry while citing the npm entry.
      { signalId: npmId, quote: "semgrep --config p/golang ." },
    ];

    for (const variant of variants) {
      const config = configWith({
        verdicts: [
          verdict({ pair: "sast:semgrep", verdict: "provides", ...variant }),
        ],
        detectFindings: [],
      });
      const result = await applyLlmPass(
        analysis,
        signals,
        { tools, baseline },
        config,
      );
      expect(result).toEqual(analysis);
    }
  });

  it("drops a verdict whose quote does not relate to the pair's tool, even though it verifies against its cited entry", async () => {
    const npmId = signalIdFor(
      baseAnalysis(),
      signals,
      "npm ci --frozen-lockfile",
    );
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: npmId,
          quote: "npm ci --frozen-lockfile",
        }),
      ],
      detectFindings: [],
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

  it("accepts a short quote that equals its cited entry's entire text, but rejects a short quote that is only a fragment of a longer entry", async () => {
    const shortSignals: CiSignals = {
      uses: [],
      shell: [{ text: "npm ci", source: "ci.yml" }],
    };
    const wholeId = signalIdFor(baseAnalysis(), shortSignals, "npm ci");
    const detectConfig = configWith({
      verdicts: [],
      detectFindings: [{ kind: "install", signalId: wholeId, quote: "npm ci" }],
    });
    const whole = await applyLlmPass(
      baseAnalysis(),
      shortSignals,
      { tools, baseline },
      detectConfig,
    );
    expect(whole.buildSteps).toEqual([
      { kind: "install", evidence: "npm ci", source: "ci.yml" },
    ]);

    const longId = signalIdFor(
      baseAnalysis(),
      signals,
      "npm ci --frozen-lockfile",
    );
    const fragmentConfig = configWith({
      verdicts: [],
      // 14 characters - under the 20-character floor, and only a fragment of the real entry.
      detectFindings: [
        { kind: "install", signalId: longId, quote: "npm ci --froze" },
      ],
    });
    const fragment = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      fragmentConfig,
    );
    expect(fragment.buildSteps).toEqual([]);
  });

  it("drops a rescue verdict when the tool is named only in a shell comment, even though the quote is the whole (comment-included) entry", async () => {
    const commentSignals: CiSignals = {
      uses: [],
      shell: [
        {
          text: "# semgrep covers this\nnpm test -- --coverage",
          source: "ci.yml",
        },
      ],
    };
    const entryId = signalIdFor(baseAnalysis(), commentSignals, "npm test");
    const quote = "# semgrep covers this⏎npm test -- --coverage";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: entryId,
          quote,
        }),
      ],
      detectFindings: [],
    });

    const analysis = baseAnalysis();
    const result = await applyLlmPass(
      analysis,
      commentSignals,
      { tools, baseline },
      config,
    );
    expect(result).toEqual(analysis);
  });

  it("drops a pair entirely when the response answers it more than once, regardless of order - no order dependence", async () => {
    const quote = "trivy fs . --severity HIGH,CRITICAL";
    const id = signalIdFor(baseAnalysis(), signals, quote);
    const bothVerdicts = [
      verdict({
        pair: "sca:trivy",
        verdict: "does-not-provide",
        signalId: id,
        quote,
        reason: "only scans dependencies",
      }),
      verdict({ pair: "sca:trivy", verdict: "provides", signalId: id, quote }),
    ];

    for (const verdicts of [bothVerdicts, [...bothVerdicts].reverse()]) {
      const analysis = baseAnalysis();
      const config = configWith({ verdicts, detectFindings: [] });
      const result = await applyLlmPass(
        analysis,
        signals,
        { tools, baseline },
        config,
      );
      expect(result).toEqual(analysis);
    }
  });

  it("stops rescuing a capability once it is satisfied, so a second rescue verdict for the same capability (a different tool) is a no-op", async () => {
    const twoSastTools: AnalysisTool[] = [
      {
        id: "semgrep",
        name: "Semgrep",
        capabilities: ["sast"],
        stacks: ["any"],
        detect: { commands: ["semgrep"] },
      },
      {
        id: "bandit",
        name: "Bandit",
        capabilities: ["sast"],
        stacks: ["any"],
        detect: { commands: ["bandit"] },
      },
    ];
    const twoSastSignals: CiSignals = {
      uses: [],
      shell: [
        { text: "semgrep --config p/golang .", source: "ci.yml" },
        { text: "bandit -r .", source: "ci.yml" },
      ],
    };
    const twoCandidateAnalysis: Analysis = {
      ...baseAnalysis(),
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
          ],
        },
      ],
    };
    const semgrepQuote = "semgrep --config p/golang .";
    const banditQuote = "bandit -r .";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: signalIdForTools(
            twoSastTools,
            twoCandidateAnalysis,
            twoSastSignals,
            semgrepQuote,
          ),
          quote: semgrepQuote,
        }),
        verdict({
          pair: "sast:bandit",
          verdict: "provides",
          signalId: signalIdForTools(
            twoSastTools,
            twoCandidateAnalysis,
            twoSastSignals,
            banditQuote,
          ),
          quote: banditQuote,
        }),
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      twoCandidateAnalysis,
      twoSastSignals,
      { tools: twoSastTools, baseline },
      config,
    );
    const sast = result.categories[0].capabilities[0];
    expect(sast.satisfied).toBe(true);
    expect(sast.present.map((p) => p.id)).toEqual(["semgrep"]);
  });

  it("stays satisfied after a demotion when a second present tool still covers the same stack, instead of being forced to unsatisfied", async () => {
    const dualToolTools: AnalysisTool[] = [
      {
        id: "trivy",
        name: "Trivy",
        capabilities: ["sca", "iac-config"],
        stacks: ["any"],
        detect: { commands: ["trivy"] },
      },
      {
        id: "snyk",
        name: "Snyk",
        capabilities: ["sca", "sast"],
        stacks: ["any"],
        detect: { commands: ["snyk"] },
      },
    ];
    const dualSignals: CiSignals = {
      uses: [],
      shell: [
        { text: "trivy fs . --severity HIGH,CRITICAL", source: "ci.yml" },
        { text: "snyk test", source: "ci.yml" },
      ],
    };
    const dualAnalysis: Analysis = {
      ...baseAnalysis(),
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
                  evidence: "runs trivy in ci.yml",
                  stackLabels: ["Any"],
                },
                {
                  id: "snyk",
                  name: "Snyk",
                  evidence: "runs snyk in ci.yml",
                  stackLabels: ["Any"],
                },
              ],
              recommended: [],
            },
          ],
        },
      ],
    };
    const quote = "trivy fs . --severity HIGH,CRITICAL";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sca:trivy",
          verdict: "does-not-provide",
          signalId: signalIdForTools(
            dualToolTools,
            dualAnalysis,
            dualSignals,
            quote,
          ),
          quote,
          reason: "only scans dependencies, not images",
        }),
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      dualAnalysis,
      dualSignals,
      { tools: dualToolTools, baseline },
      config,
    );
    const sca = result.categories[0].capabilities[0];
    expect(sca.satisfied).toBe(true);
    expect(sca.present.map((p) => p.id)).toEqual(["snyk"]);
  });

  it("skips a demotion when the present tool's deterministic credit came from a config file or manifest dependency, not CI text", async () => {
    const configCreditedAnalysis: Analysis = {
      ...baseAnalysis(),
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
                  evidence: "trivy.yaml",
                  nonCiCredit: true,
                  stackLabels: ["Any"],
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
    };
    const quote = "trivy fs . --severity HIGH,CRITICAL";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sca:trivy",
          verdict: "does-not-provide",
          signalId: signalIdFor(configCreditedAnalysis, signals, quote),
          quote,
          reason: "only covers dependencies",
        }),
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      configCreditedAnalysis,
      signals,
      { tools, baseline },
      config,
    );
    expect(result).toEqual(configCreditedAnalysis);
  });
});

describe("applyLlmPass: audit skipped on cut context", () => {
  it("skips a does-not-provide demotion when a different entry related to the same tool was truncated, even though the cited entry itself verifies in full", async () => {
    const bigRelatedEntry = `trivy ${"x".repeat(4100)}`;
    const cutSignals: CiSignals = {
      uses: [],
      shell: [
        { text: bigRelatedEntry, source: "a.yml" },
        { text: "trivy fs . --severity HIGH,CRITICAL", source: "b.yml" },
      ],
    };
    const quote = "trivy fs . --severity HIGH,CRITICAL";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sca:trivy",
          verdict: "does-not-provide",
          signalId: signalIdFor(baseAnalysis(), cutSignals, quote),
          quote,
          reason: "only covers dependencies",
        }),
      ],
      detectFindings: [],
    });

    const analysis = baseAnalysis();
    const result = await applyLlmPass(
      analysis,
      cutSignals,
      { tools, baseline },
      config,
    );
    expect(result).toEqual(analysis);
  });
});

describe("applyLlmPass: multi-stack and partial-gap rescue", () => {
  const polyglotTools: AnalysisTool[] = [
    {
      id: "trivy",
      name: "Trivy",
      capabilities: ["sca", "iac-config", "image-scan"],
      stacks: ["go"],
      detect: { commands: ["trivy"] },
    },
    {
      id: "npm-audit",
      name: "npm audit",
      capabilities: ["sca"],
      stacks: ["javascript"],
      detect: { commands: ["npm audit"] },
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

  function polyglotAnalysis(
    present: Analysis["categories"][0]["capabilities"][0]["present"],
  ): Analysis {
    const uncoveredGo = !present.some((p) => p.stackLabels.includes("Go"));
    const uncoveredJs = !present.some((p) =>
      p.stackLabels.includes("JavaScript"),
    );
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
              satisfied: !uncoveredGo && !uncoveredJs,
              present,
              recommended: [
                ...(uncoveredGo
                  ? [{ id: "trivy", name: "Trivy", stackLabels: ["Go"] }]
                  : []),
                ...(uncoveredJs
                  ? [
                      {
                        id: "npm-audit",
                        name: "npm audit",
                        stackLabels: ["JavaScript"],
                      },
                    ]
                  : []),
              ],
            },
          ],
        },
      ],
      satisfiedCount: uncoveredGo || uncoveredJs ? 0 : 1,
      partialCount: present.length > 0 && (uncoveredGo || uncoveredJs) ? 1 : 0,
      gapCount: uncoveredGo || uncoveredJs ? 1 : 0,
      buildSteps: [],
    };
  }

  it("rescues only the stack a verdict's tool actually covers, leaving the capability partial with a real recommendation for what's still missing", async () => {
    const gap = polyglotAnalysis([]);
    const goSignals: CiSignals = {
      uses: [],
      shell: [
        { text: "trivy fs ./go-service --severity HIGH", source: "ci.yml" },
      ],
    };
    const quote = "trivy fs ./go-service --severity HIGH";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sca:trivy",
          verdict: "provides",
          signalId: signalIdForWith(polyglotTools, gap, goSignals, quote),
          quote,
        }),
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      gap,
      goSignals,
      { tools: polyglotTools, baseline: polyglotBaseline },
      config,
    );
    const sca = result.categories[0].capabilities[0];
    expect(sca.satisfied).toBe(false);
    expect(sca.present).toEqual([
      { id: "trivy", name: "Trivy", evidence: quote, stackLabels: ["Go"] },
    ]);
    expect(sca.recommended).toEqual([
      { id: "npm-audit", name: "npm audit", stackLabels: ["JavaScript"] },
    ]);
  });

  it("satisfies a partial capability once a rescue verdict covers its one remaining uncovered stack", async () => {
    const partial = polyglotAnalysis([
      {
        id: "trivy",
        name: "Trivy",
        evidence: "runs trivy in ci.yml",
        stackLabels: ["Go"],
      },
    ]);
    const jsSignals: CiSignals = {
      uses: [],
      shell: [{ text: "npm audit --production", source: "ci.yml" }],
    };
    const quote = "npm audit --production";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sca:npm-audit",
          verdict: "provides",
          signalId: signalIdForWith(polyglotTools, partial, jsSignals, quote),
          quote,
        }),
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      partial,
      jsSignals,
      { tools: polyglotTools, baseline: polyglotBaseline },
      config,
    );
    const sca = result.categories[0].capabilities[0];
    expect(sca.satisfied).toBe(true);
    expect(sca.present.map((p) => p.id).sort()).toEqual(["npm-audit", "trivy"]);
  });

  it("drops to unsatisfied when a does-not-provide demotion removes the only tool covering one of two stacks", async () => {
    const satisfied: Analysis = {
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
                  evidence: "runs trivy in ci.yml",
                  stackLabels: ["Go"],
                },
                {
                  id: "npm-audit",
                  name: "npm audit",
                  evidence: "runs npm audit in ci.yml",
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
    // Neither tool here declares more than one capability, so this pair only exists because
    // `candidatePairsFor` widened audit to also build pairs for a capability-declaring-once tool -
    // it doesn't: both trivy and npm-audit only declare `sca`, so there is no audit candidate for
    // this fixture's `sca` at all. Use trivy's real multi-capability set instead.
    const multiCapTools: AnalysisTool[] = [
      {
        id: "trivy",
        name: "Trivy",
        capabilities: ["sca", "iac-config"],
        stacks: ["go"],
        detect: { commands: ["trivy"] },
      },
      {
        id: "npm-audit",
        name: "npm audit",
        capabilities: ["sca"],
        stacks: ["javascript"],
        detect: { commands: ["npm audit"] },
      },
    ];
    const sigs: CiSignals = {
      uses: [],
      shell: [{ text: "trivy fs ./go-service", source: "ci.yml" }],
    };
    const quote = "trivy fs ./go-service";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sca:trivy",
          verdict: "does-not-provide",
          signalId: signalIdForWith(multiCapTools, satisfied, sigs, quote),
          quote,
          reason: "only scans the Go module, not the whole tree",
        }),
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      satisfied,
      sigs,
      { tools: multiCapTools, baseline: polyglotBaseline },
      config,
    );
    const sca = result.categories[0].capabilities[0];
    expect(sca.satisfied).toBe(false);
    expect(sca.present).toEqual([
      {
        id: "npm-audit",
        name: "npm audit",
        evidence: "runs npm audit in ci.yml",
        stackLabels: ["JavaScript"],
      },
    ]);
    expect(sca.recommended).toEqual([
      { id: "trivy", name: "Trivy", stackLabels: ["Go"] },
    ]);
  });

  function signalIdForWith(
    toolsForPrompt: AnalysisTool[],
    analysis: Analysis,
    sigs: CiSignals,
    needle: string,
  ): string {
    const { signals: sent } = buildPrompt(analysis, sigs, {
      tools: toolsForPrompt,
    });
    const entry = sent.find((e) => e.text.includes(needle));
    if (!entry) throw new Error(`no signal entry contains "${needle}"`);
    return entry.id;
  }
});

describe("applyLlmPass: detect", () => {
  it("populates buildSteps from verified install/build/image-build findings, dropping one whose quote does not verify", async () => {
    const config = configWith({
      verdicts: [],
      detectFindings: [
        {
          kind: "install",
          signalId: signalIdFor(
            baseAnalysis(),
            signals,
            "npm ci --frozen-lockfile",
          ),
          quote: "npm ci --frozen-lockfile",
        },
        {
          kind: "build",
          signalId: "s1",
          quote: "a quote that appears nowhere in the signals",
        },
      ],
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

  it("recomputes satisfiedCount, partialCount, and gapCount after a rescue, an audit demotion, and a detect finding together", async () => {
    const sastQuote = "semgrep --config p/golang .";
    const scaQuote = "trivy fs . --severity HIGH,CRITICAL";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: signalIdFor(baseAnalysis(), signals, sastQuote),
          quote: sastQuote,
        }),
        verdict({
          pair: "sca:trivy",
          verdict: "does-not-provide",
          signalId: signalIdFor(baseAnalysis(), signals, scaQuote),
          quote: scaQuote,
          reason: "does not cover the whole tree",
        }),
      ],
      detectFindings: [
        {
          kind: "install",
          signalId: signalIdFor(
            baseAnalysis(),
            signals,
            "npm ci --frozen-lockfile",
          ),
          quote: "npm ci --frozen-lockfile",
        },
      ],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    expect(result.satisfiedCount).toBe(1); // sast rescued
    expect(result.gapCount).toBe(1); // sca demoted
    expect(result.partialCount).toBe(0);
    expect(result.buildSteps).toHaveLength(1);
  });

  it("drops a detect finding whose quote only verifies against a different entry than the one cited", async () => {
    const twoEntrySignals: CiSignals = {
      uses: [],
      shell: [
        { text: "npm ci --frozen-lockfile", source: "a.yml" },
        { text: "go build ./...", source: "b.yml" },
      ],
    };
    const npmId = signalIdFor(baseAnalysis(), twoEntrySignals, "npm ci");
    const config = configWith({
      verdicts: [],
      detectFindings: [
        { kind: "build", signalId: npmId, quote: "go build ./..." },
      ],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      twoEntrySignals,
      { tools, baseline },
      config,
    );
    expect(result.buildSteps).toEqual([]);
  });

  it("attributes a detect finding to its cited entry's own source file, not the first file seen", async () => {
    const twoFileSignals: CiSignals = {
      uses: [],
      shell: [
        { text: "npm ci --frozen-lockfile", source: "a.yml" },
        { text: "go build ./...", source: "b.yml" },
      ],
    };
    const goId = signalIdFor(baseAnalysis(), twoFileSignals, "go build");
    const config = configWith({
      verdicts: [],
      detectFindings: [
        { kind: "build", signalId: goId, quote: "go build ./..." },
      ],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      twoFileSignals,
      { tools, baseline },
      config,
    );
    expect(result.buildSteps).toEqual([
      { kind: "build", evidence: "go build ./...", source: "b.yml" },
    ]);
  });

  it("dedupes identical detect findings and caps the total kept at 20", async () => {
    const manySignals: CiSignals = {
      uses: [],
      shell: Array.from({ length: 25 }, (_, i) => ({
        text: `npm run build-${i}`,
        source: `f${i}.yml`,
      })),
    };
    const { signals: sent } = buildPrompt(baseAnalysis(), manySignals, {
      tools,
    });
    const findings = sent.map((entry, i) => ({
      kind: "build" as const,
      signalId: entry.id,
      quote: `npm run build-${i}`,
    }));
    const config = configWith({
      verdicts: [],
      detectFindings: [...findings, findings[0]],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      manySignals,
      { tools, baseline },
      config,
    );
    expect(result.buildSteps).toHaveLength(20);
    const evidence = result.buildSteps.map((s) => s.evidence);
    expect(new Set(evidence).size).toBe(evidence.length);
  });

  it("restores the real newline in a report field when the quote spans a whole multi-line entry", async () => {
    const multilineSignals: CiSignals = {
      uses: [],
      shell: [{ text: "echo one\ngo build ./...\necho two", source: "ci.yml" }],
    };
    const entryId = signalIdFor(baseAnalysis(), multilineSignals, "go build");
    const config = configWith({
      verdicts: [],
      detectFindings: [
        {
          kind: "build",
          signalId: entryId,
          quote: "echo one⏎go build ./...⏎echo two",
        },
      ],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      multilineSignals,
      { tools, baseline },
      config,
    );
    expect(result.buildSteps).toEqual([
      {
        kind: "build",
        evidence: "echo one\ngo build ./...\necho two",
        source: "ci.yml",
      },
    ]);
  });

  it("strips the truncation marker from a report field, since it is not real file text", async () => {
    const longSignals: CiSignals = {
      uses: [],
      shell: [{ text: `echo ${"x".repeat(2000)}`, source: "ci.yml" }],
    };
    const { signals: sent } = buildPrompt(baseAnalysis(), longSignals, {
      tools,
    });
    const truncatedEntry = sent.find((e) => e.truncated)!;
    expect(truncatedEntry.text.endsWith("…")).toBe(true);
    // A quote near the cut end, including the trailing marker - short enough to stay under the
    // 400-char quote cap, unlike the full 1500-char truncated entry.
    const quote = truncatedEntry.text.slice(-30);
    const config = configWith({
      verdicts: [],
      detectFindings: [{ kind: "build", signalId: truncatedEntry.id, quote }],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      longSignals,
      { tools, baseline },
      config,
    );
    expect(result.buildSteps[0]!.evidence.endsWith("…")).toBe(false);
    expect(result.buildSteps[0]!.evidence).toBe(quote.replace(/…/g, ""));
  });
});

describe("applyLlmPass: cache, spend cap, and cost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips the call entirely, without touching cache or the spend cap, when disabled or when there is nothing to rescue, audit, or detect", async () => {
    const config = configWith({ verdicts: [], detectFindings: [] });
    config.enabled = false;
    const analysis = baseAnalysis();
    expect(
      await applyLlmPass(analysis, signals, { tools, baseline }, config),
    ).toEqual(analysis);
    expect(config.client.complete).not.toHaveBeenCalled();

    const nothingToDo: Analysis = {
      ...baseAnalysis(),
      categories: [{ category: "Security", capabilities: [] }],
    };
    const config2 = configWith({ verdicts: [], detectFindings: [] });
    expect(
      await applyLlmPass(
        nothingToDo,
        { uses: [], shell: [] },
        { tools, baseline },
        config2,
      ),
    ).toEqual(nothingToDo);
    expect(config2.client.complete).not.toHaveBeenCalled();
    expect(config2.readCache).not.toHaveBeenCalled();
  });

  it("reads the cache before checking the spend cap, so a capped day still serves a cached response", async () => {
    const quote = "semgrep --config p/golang .";
    const config = configWith({ verdicts: [], detectFindings: [] });
    config.underDailySpendCap = vi.fn().mockResolvedValue(false);
    config.readCache = vi.fn().mockResolvedValue({
      model: "claude-sonnet-5-5",
      response: {
        verdicts: [
          {
            pair: "sast:semgrep",
            verdict: "provides",
            signalId: signalIdFor(baseAnalysis(), signals, quote),
            quote,
            reason: "",
          },
        ],
        detectFindings: [],
      },
      inputTokens: 10,
      outputTokens: 10,
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    expect(config.underDailySpendCap).not.toHaveBeenCalled();
    expect(config.client.complete).not.toHaveBeenCalled();
    expect(
      result.categories[0].capabilities.find((c) => c.id === "sast")!.satisfied,
    ).toBe(true);
  });

  it("skips the call on a cache miss when over the daily spend cap", async () => {
    const config = configWith({ verdicts: [], detectFindings: [] });
    config.underDailySpendCap = vi.fn().mockResolvedValue(false);
    const analysis = baseAnalysis();
    expect(
      await applyLlmPass(analysis, signals, { tools, baseline }, config),
    ).toEqual(analysis);
    expect(config.client.complete).not.toHaveBeenCalled();
  });

  it("records the adapter's costUsd on a fresh success, and not at all on a cache hit", async () => {
    const config = configWith({ verdicts: [], detectFindings: [] }, 0.00071);
    await applyLlmPass(baseAnalysis(), signals, { tools, baseline }, config);
    expect(config.recordSpend).toHaveBeenCalledWith(0.00071);

    const cachedConfig = configWith({ verdicts: [], detectFindings: [] });
    cachedConfig.readCache = vi.fn().mockResolvedValue({
      model: "claude-sonnet-5-5",
      response: { verdicts: [], detectFindings: [] },
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

  it("records a failure's costUsd when the adapter reports one (a truncated or timed-out call), and records nothing when it doesn't", async () => {
    const truncated = configWith({ verdicts: [], detectFindings: [] });
    truncated.client.complete = vi.fn().mockResolvedValue({
      ok: false,
      reason: "truncated",
      inputTokens: 100,
      outputTokens: 8000,
      costUsd: 0.082,
    });
    await applyLlmPass(baseAnalysis(), signals, { tools, baseline }, truncated);
    expect(truncated.recordSpend).toHaveBeenCalledWith(0.082);

    const noCost = configWith({ verdicts: [], detectFindings: [] });
    noCost.client.complete = vi
      .fn()
      .mockResolvedValue({ ok: false, reason: "error" });
    await applyLlmPass(baseAnalysis(), signals, { tools, baseline }, noCost);
    expect(noCost.recordSpend).not.toHaveBeenCalled();

    const thrown = configWith({ verdicts: [], detectFindings: [] });
    thrown.client.complete = vi.fn().mockRejectedValue(new Error("network"));
    const analysis = baseAnalysis();
    expect(
      await applyLlmPass(analysis, signals, { tools, baseline }, thrown),
    ).toEqual(analysis);
    expect(thrown.recordSpend).not.toHaveBeenCalled();
  });

  it("calls writeCache once with the model, response, and token counts on a cache miss", async () => {
    const response: LlmResponse = { verdicts: [], detectFindings: [] };
    const config = configWith(response);
    await applyLlmPass(baseAnalysis(), signals, { tools, baseline }, config);
    expect(config.writeCache).toHaveBeenCalledTimes(1);
    const [, entry] = vi.mocked(config.writeCache).mock.calls[0];
    expect(entry).toEqual({
      model: "claude-sonnet-5-5",
      response,
      inputTokens: 100,
      outputTokens: 50,
    });
  });

  it("falls through to a fresh call when a cached response fails shape validation, and treats a response missing detectFindings as invalid", async () => {
    const config = configWith({ verdicts: [], detectFindings: [] });
    config.readCache = vi.fn().mockResolvedValue({
      model: "claude-sonnet-5-5",
      response: { verdicts: "not an array", detectFindings: [] },
      inputTokens: 1,
      outputTokens: 1,
    });
    await applyLlmPass(baseAnalysis(), signals, { tools, baseline }, config);
    expect(config.client.complete).toHaveBeenCalledTimes(1);

    const badShape = configWith({ verdicts: [], detectFindings: [] });
    badShape.client.complete = vi.fn().mockResolvedValue({
      ok: true,
      text: JSON.stringify({ verdicts: [] }),
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
    });
    const analysis = baseAnalysis();
    expect(
      await applyLlmPass(analysis, signals, { tools, baseline }, badShape),
    ).toEqual(analysis);
  });

  it("drops a malformed item from a findings array without discarding a well-formed one sitting beside it", async () => {
    const quote = "semgrep --config p/golang .";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: signalIdFor(baseAnalysis(), signals, quote),
          quote,
        }),
        // Missing `reason` - malformed, must be dropped without affecting the entry above.
        {
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: "s1",
          quote,
        } as unknown as LlmVerdict,
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    expect(
      result.categories[0].capabilities.find((c) => c.id === "sast")!.satisfied,
    ).toBe(true);
  });

  it("still applies a good finding when recordSpend or writeCache rejects", async () => {
    const quote = "semgrep --config p/golang .";
    const response: LlmResponse = {
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: signalIdFor(baseAnalysis(), signals, quote),
          quote,
        }),
      ],
      detectFindings: [],
    };
    const config = configWith(response);
    config.recordSpend = vi.fn().mockRejectedValue(new Error("db down"));
    config.writeCache = vi.fn().mockRejectedValue(new Error("db down"));

    const result = await applyLlmPass(
      baseAnalysis(),
      signals,
      { tools, baseline },
      config,
    );
    expect(
      result.categories[0].capabilities.find((c) => c.id === "sast")!.satisfied,
    ).toBe(true);
  });

  it("treats an empty candidate/signal response as trivially valid rather than a validation error", async () => {
    const config = configWith({ verdicts: [], detectFindings: [] });
    config.client.complete = vi.fn().mockResolvedValue({
      ok: true,
      text: JSON.stringify({ verdicts: [{}], detectFindings: [{}] }),
      inputTokens: 10,
      outputTokens: 10,
      costUsd: 0.0001,
    });
    const analysis = baseAnalysis();
    expect(
      await applyLlmPass(analysis, signals, { tools, baseline }, config),
    ).toEqual(analysis);
  });
});

describe("applyLlmPass: against the real catalogue shape", () => {
  it("rescues sast via semgrep (a plain tool) on a bare invocation, even though the java baseline's own recommended tool is the ci-base-checks bundle", async () => {
    const realBaseline = getBaseline();
    const javaStack = realBaseline.stacks.find((s) => s.id === "java")!;
    const analysis: Analysis = {
      repo: "korza/gap-analysis-demo",
      defaultBranch: "main",
      stacks: [javaStack],
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
              recommended: [],
            },
          ],
        },
      ],
      satisfiedCount: 0,
      partialCount: 0,
      gapCount: 1,
      buildSteps: [],
    };
    const realSignals: CiSignals = {
      uses: [],
      shell: [
        {
          text: "semgrep --config p/java --error gateway-runtime/src",
          source: ".github/workflows/ci.yml",
        },
      ],
    };
    const quote = "semgrep --config p/java --error gateway-runtime/src";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: signalIdForWithTools(
            realTools,
            analysis,
            realSignals,
            quote,
          ),
          quote,
        }),
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      analysis,
      realSignals,
      { tools: realTools, baseline: realBaseline },
      config,
    );
    const sast = result.categories[0].capabilities[0];
    expect(sast.satisfied).toBe(true);
    expect(sast.present[0]).toMatchObject({ id: "semgrep", evidence: quote });
  });

  function signalIdForWithTools(
    toolsForPrompt: AnalysisTool[],
    analysis: Analysis,
    sigs: CiSignals,
    needle: string,
  ): string {
    const { signals: sent } = buildPrompt(analysis, sigs, {
      tools: toolsForPrompt,
    });
    const entry = sent.find((e) => e.text.includes(needle));
    if (!entry) throw new Error(`no signal entry contains "${needle}"`);
    return entry.id;
  }

  it("end-to-end: ciSignals -> analyze -> applyLlmPass on a real snapshot rescues sast via semgrep, demotes trivy on image-scan and iac-config, and keeps it on sca", async () => {
    const realBaseline = getBaseline();
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
    const realSignals = ciSignals(snapshot);
    const analysis = analyze(
      snapshot,
      { tools: realTools, baseline: realBaseline },
      realSignals,
    );

    const sastBefore = analysis.categories
      .flatMap((c) => c.capabilities)
      .find((c) => c.id === "sast")!;
    const scaBefore = analysis.categories
      .flatMap((c) => c.capabilities)
      .find((c) => c.id === "sca")!;
    const imageScanBefore = analysis.categories
      .flatMap((c) => c.capabilities)
      .find((c) => c.id === "image-scan")!;
    // Rules alone miss a bare `semgrep --config` invocation and credit `trivy fs` with every
    // capability trivy declares.
    expect(sastBefore.present).toEqual([]);
    expect(scaBefore.present.map((p) => p.id)).toEqual(["trivy"]);
    expect(imageScanBefore.present.map((p) => p.id)).toEqual(["trivy"]);

    const semgrepQuote = "semgrep --config p/java --error gateway-runtime/src";
    const trivyQuote = "trivy fs --scanners vuln --exit-code 1 .";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: signalIdForWithTools(
            realTools,
            analysis,
            realSignals,
            semgrepQuote,
          ),
          quote: semgrepQuote,
        }),
        verdict({
          pair: "image-scan:trivy",
          verdict: "does-not-provide",
          signalId: signalIdForWithTools(
            realTools,
            analysis,
            realSignals,
            trivyQuote,
          ),
          quote: trivyQuote,
          reason: "scans the filesystem for vulnerabilities, not a built image",
        }),
        verdict({
          pair: "iac-config:trivy",
          verdict: "does-not-provide",
          signalId: signalIdForWithTools(
            realTools,
            analysis,
            realSignals,
            trivyQuote,
          ),
          quote: trivyQuote,
          reason: "scans dependencies, not IaC configuration",
        }),
        // The live model also confirms sca:trivy; confirming a credited pair is a no-op.
        verdict({
          pair: "sca:trivy",
          verdict: "provides",
          signalId: signalIdForWithTools(
            realTools,
            analysis,
            realSignals,
            trivyQuote,
          ),
          quote: trivyQuote,
          reason: "scans dependencies",
        }),
      ],
      detectFindings: [],
    });

    const result = await applyLlmPass(
      analysis,
      realSignals,
      { tools: realTools, baseline: realBaseline },
      config,
    );
    const byId = new Map(
      result.categories.flatMap((c) => c.capabilities).map((c) => [c.id, c]),
    );
    expect(byId.get("sast")!.satisfied).toBe(true);
    expect(byId.get("sast")!.present.map((p) => p.id)).toEqual(["semgrep"]);
    expect(byId.get("image-scan")!.present).toEqual([]);
    expect(byId.get("iac-config")!.present).toEqual([]);
    expect(byId.get("sca")!.present.map((p) => p.id)).toEqual(["trivy"]);
    expect(byId.get("sca")!.satisfied).toBe(true);
    expect(byId.get("sca")!.llmNote).toBeUndefined();
    expect(byId.get("image-scan")!.llmNote).toBe(
      "scans the filesystem for vulnerabilities, not a built image",
    );
    expect(byId.get("iac-config")!.llmNote).toBe(
      "scans dependencies, not IaC configuration",
    );
  });
});

describe("applyLlmPass: quote verification and ordering", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sastGap = (): Analysis => ({
    ...baseAnalysis(),
    categories: [
      {
        category: "Security",
        capabilities: [baseAnalysis().categories[0].capabilities[0]],
      },
    ],
  });
  const run = (
    analysis: Analysis,
    sigs: CiSignals,
    config: LlmConfig,
    toolList: AnalysisTool[] = tools,
  ) => applyLlmPass(analysis, sigs, { tools: toolList, baseline }, config);

  it("rejects a quote that sits inside a shell comment of its cited entry, with or without the `#`, but accepts it after a `#` inside quotes", async () => {
    const commented: CiSignals = {
      uses: [],
      shell: [
        { text: "npm test # semgrep --config p/java .", source: "ci.yml" },
      ],
    };
    const quote = "semgrep --config p/java .";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: signalIdFor(sastGap(), commented, "npm test"),
          quote,
        }),
      ],
      detectFindings: [],
    });
    expect((await run(sastGap(), commented, config)).categories).toEqual(
      sastGap().categories,
    );

    const quoted: CiSignals = {
      uses: [],
      shell: [
        { text: 'echo "a # b"; semgrep --config p/java .', source: "ci.yml" },
      ],
    };
    const rescued = await run(
      sastGap(),
      quoted,
      configWith({
        verdicts: [
          verdict({
            pair: "sast:semgrep",
            verdict: "provides",
            signalId: signalIdFor(sastGap(), quoted, "semgrep"),
            quote,
          }),
        ],
        detectFindings: [],
      }),
    );
    expect(rescued.categories[0].capabilities[0].satisfied).toBe(true);
  });

  it("verifies a quote that carries the rendered label or id prefix, and shows the unprefixed text", async () => {
    const sigs: CiSignals = {
      uses: [{ value: "docker/build-push-action", source: "ci.yml" }],
      shell: [{ text: "semgrep --config p/java .", source: "ci.yml" }],
    };
    const analysis = sastGap();
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: signalIdFor(analysis, sigs, "semgrep"),
          quote: "run: semgrep --config p/java .",
        }),
      ],
      detectFindings: [
        {
          kind: "image-build",
          signalId: signalIdFor(analysis, sigs, "docker/build"),
          quote: "[s2] uses: docker/build-push-action",
        },
      ],
    });
    const result = await run(analysis, sigs, config);
    expect(result.categories[0].capabilities[0].present[0].evidence).toBe(
      "semgrep --config p/java .",
    );
    expect(result.buildSteps).toEqual([
      {
        kind: "image-build",
        evidence: "docker/build-push-action",
        source: "ci.yml",
      },
    ]);
  });

  it("applies several rescues for one capability in candidate order, whatever order the response lists them", async () => {
    const twoSast: AnalysisTool[] = [
      tools[1],
      {
        id: "bandit",
        name: "Bandit",
        capabilities: ["sast"],
        stacks: ["any"],
        detect: { commands: ["bandit"] },
      },
    ];
    const sigs: CiSignals = {
      uses: [],
      shell: [
        { text: "semgrep --config p/golang .", source: "ci.yml" },
        { text: "bandit -r src --severity-level high", source: "ci.yml" },
      ],
    };
    const analysis = sastGap();
    const id = (needle: string) =>
      signalIdForTools(twoSast, analysis, sigs, needle);
    const semgrepVerdict = verdict({
      pair: "sast:semgrep",
      verdict: "provides",
      signalId: id("semgrep"),
      quote: "semgrep --config p/golang .",
    });
    const banditVerdict = verdict({
      pair: "sast:bandit",
      verdict: "provides",
      signalId: id("bandit"),
      quote: "bandit -r src --severity-level high",
    });

    const outputs = [];
    for (const verdicts of [
      [semgrepVerdict, banditVerdict],
      [banditVerdict, semgrepVerdict],
    ]) {
      outputs.push(
        await run(
          analysis,
          sigs,
          configWith({ verdicts, detectFindings: [] }),
          twoSast,
        ),
      );
    }
    expect(outputs[0]).toEqual(outputs[1]);
    expect(outputs[0].categories[0].capabilities[0].present).toHaveLength(1);
    expect(outputs[0].categories[0].capabilities[0].present[0].id).toBe(
      "semgrep",
    );
  });

  it("collapses identical verdicts on a pair and drops a pair only when its verdicts differ", async () => {
    const quote = "semgrep --config p/golang .";
    const id = signalIdFor(sastGap(), signals, quote);
    const provides = verdict({
      pair: "sast:semgrep",
      verdict: "provides",
      signalId: id,
      quote,
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const same = await run(
      sastGap(),
      signals,
      configWith({ verdicts: [provides, { ...provides }], detectFindings: [] }),
    );
    expect(same.categories[0].capabilities[0].satisfied).toBe(true);
    expect(info).toHaveBeenLastCalledWith(
      "gap LLM pass: completed",
      expect.objectContaining({
        verdictsApplied: 1,
        verdictsNoop: 1,
        verdictsDropped: 0,
      }),
    );

    const conflict = await run(
      sastGap(),
      signals,
      configWith({
        verdicts: [
          provides,
          { ...provides, verdict: "does-not-provide", reason: "no" },
        ],
        detectFindings: [],
      }),
    );
    expect(conflict.categories).toEqual(sastGap().categories);
    expect(info).toHaveBeenLastCalledWith(
      "gap LLM pass: completed",
      expect.objectContaining({ verdictsApplied: 0, verdictsDropped: 2 }),
    );
  });

  it("never demotes a tool that a config file or dependency also credits, even with CI evidence", async () => {
    const analysis = baseAnalysis();
    analysis.categories[0].capabilities[1].present[0].nonCiCredit = true;
    const quote = "trivy fs . --severity HIGH,CRITICAL";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sca:trivy",
          verdict: "does-not-provide",
          signalId: signalIdFor(analysis, signals, quote),
          quote,
          reason: "only fs",
        }),
      ],
      detectFindings: [],
    });
    expect(await run(analysis, signals, config)).toEqual(analysis);
  });

  it("makes no call when there is no signal text, and logs one line on a cache hit", async () => {
    const config = configWith({ verdicts: [], detectFindings: [] });
    await run(baseAnalysis(), { uses: [], shell: [] }, config);
    expect(config.client.complete).not.toHaveBeenCalled();
    expect(config.readCache).not.toHaveBeenCalled();

    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const cached = configWith({ verdicts: [], detectFindings: [] });
    cached.readCache = vi.fn().mockResolvedValue({
      model: "m",
      response: { verdicts: [], detectFindings: [] },
      inputTokens: 1,
      outputTokens: 1,
    });
    await run(baseAnalysis(), signals, cached);
    expect(cached.client.complete).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("gap LLM pass: served from cache", {
      repo: "korza/example",
      verdictsApplied: 0,
      verdictsNoop: 0,
      verdictsDropped: 0,
      detectFindingsKept: 0,
    });
  });

  it("clips model-written text in logs to 200 characters", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = configWith({
      verdicts: [
        verdict({ pair: "x".repeat(500), verdict: "provides", quote: "q" }),
      ],
      detectFindings: [],
    });
    await run(baseAnalysis(), signals, config);
    const logged = warn.mock.calls.find((call) =>
      String(call[0]).includes("pair is not a candidate"),
    )![1] as { pair: string };
    expect(logged.pair).toHaveLength(200);

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const badJson = configWith({ verdicts: [], detectFindings: [] });
    badJson.client = {
      complete: vi.fn().mockResolvedValue({
        ok: true,
        text: `{"a": ${"y".repeat(500)}`,
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0,
      }),
    };
    await run(baseAnalysis(), signals, badJson);
    const detail = error.mock.calls[0][1] as { error: string };
    expect(detail.error.length).toBeLessThanOrEqual(250);
  });
});

describe("applyLlmPass: caps, relevance, display and logs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sastGap = (): Analysis => ({
    ...baseAnalysis(),
    categories: [
      {
        category: "Security",
        capabilities: [baseAnalysis().categories[0].capabilities[0]],
      },
    ],
  });
  const run = (
    analysis: Analysis,
    sigs: CiSignals,
    config: LlmConfig,
    toolList: AnalysisTool[] = tools,
  ) => applyLlmPass(analysis, sigs, { tools: toolList, baseline }, config);
  const sastOf = (analysis: Analysis) =>
    analysis.categories[0].capabilities.find((c) => c.id === "sast")!;
  const scaOf = (analysis: Analysis) =>
    analysis.categories[0].capabilities.find((c) => c.id === "sca")!;

  it("enforces the 400-character quote and 300-character reason caps on the server", async () => {
    const longCommand = `semgrep --config ${"p".repeat(384)}`;
    const exactCommand = `semgrep --config ${"p".repeat(383)}`;
    expect(longCommand).toHaveLength(401);
    expect(exactCommand).toHaveLength(400);
    const sigs: CiSignals = {
      uses: [],
      shell: [{ text: longCommand, source: "ci.yml" }],
    };
    const sigsExact: CiSignals = {
      uses: [],
      shell: [{ text: exactCommand, source: "ci.yml" }],
    };

    const tooLong = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: signalIdFor(sastGap(), sigs, "semgrep"),
          quote: longCommand,
        }),
      ],
      detectFindings: [
        {
          kind: "build",
          signalId: signalIdFor(sastGap(), sigs, "semgrep"),
          quote: longCommand,
        },
      ],
    });
    const rejected = await run(sastGap(), sigs, tooLong);
    expect(sastOf(rejected).satisfied).toBe(false);
    expect(rejected.buildSteps).toEqual([]);

    const exact = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: signalIdFor(sastGap(), sigsExact, "semgrep"),
          quote: exactCommand,
        }),
      ],
      detectFindings: [
        {
          kind: "build",
          signalId: signalIdFor(sastGap(), sigsExact, "semgrep"),
          quote: exactCommand,
        },
      ],
    });
    const accepted = await run(sastGap(), sigsExact, exact);
    expect(sastOf(accepted).satisfied).toBe(true);
    expect(accepted.buildSteps).toHaveLength(1);

    const quote = "trivy fs . --severity HIGH,CRITICAL";
    const reasons = [301, 300].map((length) => "é".repeat(length));
    const notes: string[] = [];
    for (const reason of reasons) {
      const result = await run(
        baseAnalysis(),
        signals,
        configWith({
          verdicts: [
            verdict({
              pair: "sca:trivy",
              verdict: "does-not-provide",
              signalId: signalIdFor(baseAnalysis(), signals, quote),
              quote,
              reason,
            }),
          ],
          detectFindings: [],
        }),
      );
      notes.push(scaOf(result).llmNote!);
    }
    expect(notes[0]).toBe(`${"é".repeat(300)}…`);
    expect(notes[1]).toBe("é".repeat(300));
  });

  it("checks relevance on the quote, not on the cited entry, and rejects an unknown pair or signal id without substituting another", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mixed: CiSignals = {
      uses: [],
      shell: [
        {
          text: "semgrep --config p/java .\nnpm run lint -- --max-warnings 0",
          source: "ci.yml",
        },
      ],
    };
    const id = signalIdFor(sastGap(), mixed, "semgrep");
    const unrelatedQuote = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: id,
          quote: "npm run lint -- --max-warnings 0",
        }),
      ],
      detectFindings: [],
    });
    expect(sastOf(await run(sastGap(), mixed, unrelatedQuote)).satisfied).toBe(
      false,
    );

    const relevantQuote = "semgrep --config p/golang .";
    const sigId = signalIdFor(baseAnalysis(), signals, relevantQuote);
    const unknownPair = configWith({
      verdicts: [
        verdict({
          pair: "sast:nonexistent",
          verdict: "provides",
          signalId: sigId,
          quote: relevantQuote,
        }),
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: "s999",
          quote: relevantQuote,
        }),
      ],
      detectFindings: [],
    });
    expect(
      sastOf(await run(baseAnalysis(), signals, unknownPair)).satisfied,
    ).toBe(false);
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages).toContain(
      "gap LLM pass: dropped a verdict, pair is not a candidate for this analysis",
    );
    expect(messages).toContain(
      "gap LLM pass: dropped the rescue verdict, signalId is not in this analysis",
    );
  });

  it("ignores `provides` on an audit pair of a partial capability instead of adding the tool twice", async () => {
    const polyglot: AnalysisTool[] = [
      {
        id: "trivy",
        name: "Trivy",
        capabilities: ["sca", "iac-config"],
        stacks: ["go"],
        detect: { commands: ["trivy"] },
      },
      {
        id: "npm-audit",
        name: "npm audit",
        capabilities: ["sca"],
        stacks: ["javascript"],
        detect: { commands: ["npm audit"] },
      },
    ];
    const polyglotBaseline: Baseline = {
      ...baseline,
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
    const partial: Analysis = {
      ...baseAnalysis(),
      stacks: polyglotBaseline.stacks,
      categories: [
        {
          category: "Security",
          capabilities: [
            {
              id: "sca",
              label: "Dependency scanning",
              satisfied: false,
              present: [
                {
                  id: "trivy",
                  name: "Trivy",
                  evidence: "runs trivy in ci.yml",
                  stackLabels: ["Go"],
                },
              ],
              recommended: [
                {
                  id: "npm-audit",
                  name: "npm audit",
                  stackLabels: ["JavaScript"],
                },
              ],
            },
          ],
        },
      ],
    };
    const quote = "trivy fs . --severity HIGH,CRITICAL";
    const result = await applyLlmPass(
      partial,
      signals,
      { tools: polyglot, baseline: polyglotBaseline },
      configWith({
        verdicts: [
          verdict({
            pair: "sca:trivy",
            verdict: "provides",
            signalId: signalIdForTools(polyglot, partial, signals, quote),
            quote,
          }),
        ],
        detectFindings: [],
      }),
    );
    expect(result.categories).toEqual(partial.categories);
  });

  it("keeps one detect finding per kind per source file, deduping identical findings even among fewer than 20", async () => {
    const sigs: CiSignals = {
      uses: [],
      shell: [
        { text: "npm ci --frozen-lockfile", source: "a.yml" },
        { text: "npm install --no-audit --prefer-offline", source: "a.yml" },
        { text: "npm ci --frozen-lockfile", source: "b.yml" },
      ],
    };
    const id = (needle: string) => signalIdFor(baseAnalysis(), sigs, needle);
    const first = {
      kind: "install" as const,
      signalId: id("--frozen-lockfile"),
      quote: "npm ci --frozen-lockfile",
    };
    const result = await run(
      baseAnalysis(),
      sigs,
      configWith({
        verdicts: [],
        detectFindings: [
          first,
          { ...first },
          {
            kind: "install",
            signalId: id("--no-audit"),
            quote: "npm install --no-audit --prefer-offline",
          },
        ],
      }),
    );
    expect(result.buildSteps).toEqual([
      { kind: "install", evidence: first.quote, source: "a.yml" },
    ]);
  });

  it("restores real newlines in rescue evidence and notes, and keeps the repo's source path in reports while escaping it in the prompt", async () => {
    const sigs: CiSignals = {
      uses: [],
      shell: [
        {
          text: "semgrep --config p/java .\nsemgrep ci",
          source: "dir<<<x/ci.yml",
        },
      ],
    };
    const quote = "semgrep --config p/java .⏎semgrep ci";
    const config = configWith({
      verdicts: [
        verdict({
          pair: "sast:semgrep",
          verdict: "provides",
          signalId: "s1",
          quote,
        }),
      ],
      detectFindings: [{ kind: "build", signalId: "s1", quote: "semgrep ci" }],
    });
    const result = await run(sastGap(), sigs, config);
    const sast = sastOf(result);
    expect(sast.present[0].evidence).toBe(
      "semgrep --config p/java .\nsemgrep ci",
    );
    expect(sast.llmNote).toContain(
      'via "semgrep --config p/java .\nsemgrep ci"',
    );
    expect(result.buildSteps[0].source).toBe("dir<<<x/ci.yml");
    const prompt = vi.mocked(config.client.complete).mock.calls[0][0].user;
    expect(prompt).toContain("dir‹‹‹x/ci.yml");
    expect(prompt).not.toContain("dir<<<x");

    const audit = await run(
      baseAnalysis(),
      signals,
      configWith({
        verdicts: [
          verdict({
            pair: "sca:trivy",
            verdict: "does-not-provide",
            signalId: signalIdFor(
              baseAnalysis(),
              signals,
              "trivy fs . --severity HIGH,CRITICAL",
            ),
            quote: "trivy fs . --severity HIGH,CRITICAL",
            reason: "line one⏎line two",
          }),
        ],
        detectFindings: [],
      }),
    );
    expect(scaOf(audit).llmNote).toBe("line one\nline two");
  });

  it("logs a success summary with metrics, the spend-cap skip, and a failure with its detail and request id", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await run(
      baseAnalysis(),
      signals,
      configWith({ verdicts: [], detectFindings: [] }, 0.5),
    );
    expect(info).toHaveBeenCalledWith("gap LLM pass: completed", {
      repo: "korza/example",
      model: "claude-sonnet-5-5",
      latencyMs: expect.any(Number),
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.5,
      verdictsApplied: 0,
      verdictsNoop: 0,
      verdictsDropped: 0,
      detectFindingsKept: 0,
    });

    const capped = configWith({ verdicts: [], detectFindings: [] });
    capped.underDailySpendCap = vi.fn().mockResolvedValue(false);
    await run(baseAnalysis(), signals, capped);
    expect(info).toHaveBeenCalledWith(
      "gap LLM pass: skipped, daily spend cap reached",
      { repo: "korza/example" },
    );

    const failing = configWith({ verdicts: [], detectFindings: [] });
    const detail = {
      status: 429,
      type: "rate_limit_error",
      requestId: "req_1",
    };
    failing.client = {
      complete: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: "error", detail }),
    };
    await run(baseAnalysis(), signals, failing);
    expect(warn).toHaveBeenCalledWith(
      "gap LLM pass: call did not succeed (error)",
      { repo: "korza/example", detail },
    );
  });
});
