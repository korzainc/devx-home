/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { RepoReadError } from "@/lib/gap/types";
import type { LlmConfig } from "@/lib/gap/llm/types";

const state = vi.hoisted(() => ({
  token: "gho_fixture" as string | null,
  afterResponse: [] as (() => Promise<void>)[],
  record: vi.fn(),
  getSession: vi.fn(),
  isOrgMember: vi.fn(),
  getLlmConfig: vi.fn(),
  applyLlmPass: vi.fn(),
  loadSnapshot: vi.fn(),
}));
vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => state.afterResponse.push(callback),
}));
vi.mock("@/lib/session", () => ({
  getGitHubToken: async () => state.token,
  getSession: state.getSession,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/membership", () => ({ isOrgMember: state.isOrgMember }));
vi.mock("@/lib/gap-llm-config", () => ({ getLlmConfig: state.getLlmConfig }));
vi.mock("@/lib/gap/llm/apply", () => ({ applyLlmPass: state.applyLlmPass }));
vi.mock("@/lib/analysis-usage", () => ({ recordAnalysisRun: state.record }));
vi.mock("@/lib/catalogue", () => ({
  tools: [],
  getBaseline: () => ({
    categories: [],
    capabilities: {},
    universal: [],
    stacks: [],
  }),
}));
vi.mock("@/lib/gap/github", () => ({
  githubReader: {
    parseRef: (input: string) =>
      input === "korzainc/example"
        ? { provider: "github", owner: "korzainc", repo: "example" }
        : null,
    loadSnapshot: state.loadSnapshot,
  },
}));

const snapshot = {
  ref: { provider: "github", owner: "korzainc", repo: "example" },
  repoId: 42,
  defaultBranch: "main",
  paths: [],
  files: {},
};
const request = (body: unknown = { repo: "korzainc/example" }) =>
  new Request("https://home.example/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "retry" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  state.getSession.mockResolvedValue({ user: { id: "fixture-user" } });
  state.isOrgMember.mockResolvedValue(true);
});

afterEach(() => {
  state.token = "gho_fixture";
  state.afterResponse.length = 0;
  vi.resetAllMocks();
});

describe("analysis API usage recording", () => {
  it("returns the report before optional recording starts or finishes", async () => {
    state.loadSnapshot.mockResolvedValue(snapshot);
    let finishRecording!: () => void;
    state.record.mockReturnValue(
      new Promise<void>((resolve) => (finishRecording = resolve)),
    );

    // The real analysis pipeline runs against a fixture reader, with no network
    // or DB. Invoking `after` callbacks is explicit; this is not a Next server.
    let returned = false;
    const responsePromise = POST(request()).then((response) => {
      returned = true;
      return response;
    });
    let recording: Promise<void> | undefined;
    try {
      await vi.waitFor(() => expect(returned).toBe(true));
      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        repo: "korzainc/example",
        defaultBranch: "main",
        stacks: [],
        filesRead: [],
        categories: [],
        satisfiedCount: 0,
        partialCount: 0,
        gapCount: 0,
        buildSteps: [],
      });
      expect(state.record).not.toHaveBeenCalled();
      expect(state.afterResponse).toHaveLength(1);

      recording = state.afterResponse[0]();
      expect(state.record).toHaveBeenCalledWith(expect.any(String), 42);
    } finally {
      finishRecording();
      await responsePromise;
      await recording;
    }
  });

  it("assigns separate identities to successful API retries, without changing the JSON report", async () => {
    state.loadSnapshot.mockResolvedValue(snapshot);
    const body = { repo: "korzainc/example", run: "shared-client-value" };
    const first = await POST(request(body));
    const retry = await POST(request(body));

    expect(await first.json()).toEqual(await retry.json());
    expect(state.afterResponse).toHaveLength(2);
    await Promise.all(state.afterResponse.map((callback) => callback()));
    const ids = state.record.mock.calls.map(([id]) => id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
    expect(ids[1]).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
    expect(ids[0]).not.toBe(ids[1]);
    expect(state.record.mock.calls.map(([, repoId]) => repoId)).toEqual([
      42, 42,
    ]);
  });

  it.each([
    { name: "no token", token: null, session: null, member: false },
    { name: "no session", token: "gho_fixture", session: null, member: false },
    {
      name: "no org membership",
      token: "gho_fixture",
      session: { user: { id: "fixture-user" } },
      member: false,
    },
  ])(
    "rejects $name without analysis or recording",
    async ({ token, session, member }) => {
      state.token = token;
      state.getSession.mockResolvedValue(session);
      state.isOrgMember.mockResolvedValue(member);

      const response = await POST(request());

      expect(response.status).toBe(401);
      expect(state.getSession).toHaveBeenCalledTimes(token ? 1 : 0);
      expect(state.isOrgMember).toHaveBeenCalledTimes(session ? 1 : 0);
      expect(state.getLlmConfig).not.toHaveBeenCalled();
      expect(state.loadSnapshot).not.toHaveBeenCalled();
      expect(state.applyLlmPass).not.toHaveBeenCalled();
      expect(state.afterResponse).toHaveLength(0);
      expect(state.record).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "records one successful run when the LLM pass fails: %s",
    async (fails) => {
      state.loadSnapshot.mockResolvedValue(snapshot);
      const llm: LlmConfig = {
        enabled: true,
        client: { complete: vi.fn() },
        model: "fixture-model",
        effort: "low",
        readCache: vi.fn(),
        writeCache: vi.fn(),
        underDailySpendCap: vi.fn(),
        recordSpend: vi.fn(),
      };
      state.getLlmConfig.mockReturnValue(llm);
      if (fails)
        state.applyLlmPass.mockRejectedValue(new Error("fixture failure"));
      else
        state.applyLlmPass.mockImplementation(async (analysis) => ({
          ...analysis,
          buildSteps: [
            { kind: "build", evidence: "npm run build", source: "ci.yml" },
          ],
        }));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const response = await POST(request());
        const report = await response.json();

        expect(response.status).toBe(200);
        expect(report.repo).toBe("korzainc/example");
        expect(report).not.toHaveProperty("repoId");
        expect(report.buildSteps).toHaveLength(fails ? 0 : 1);
        expect(state.applyLlmPass).toHaveBeenCalledExactlyOnceWith(
          expect.any(Object),
          expect.any(Object),
          expect.any(Object),
          llm,
        );
        expect(state.record).not.toHaveBeenCalled();
        expect(state.afterResponse).toHaveLength(1);
        await state.afterResponse[0]();
        expect(state.record).toHaveBeenCalledExactlyOnceWith(
          expect.any(String),
          42,
        );
      } finally {
        errorSpy.mockRestore();
      }
    },
  );

  it("does not record invalid input or a failed repository read", async () => {
    const invalid = await POST(request({ repo: "bad" }));
    expect(invalid.status).toBe(400);
    expect(state.loadSnapshot).not.toHaveBeenCalled();

    state.loadSnapshot.mockRejectedValue(
      new RepoReadError(404, "Missing repo"),
    );
    const missing = await POST(request());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Missing repo" });
    expect(state.afterResponse).toHaveLength(0);
    expect(state.record).not.toHaveBeenCalled();
  });
});
