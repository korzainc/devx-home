import { describe, expect, it } from "vitest";
import {
  budgetSignals,
  escapeSignalText,
  formatSignalLine,
  normalize,
  relatesToTool,
  stripShellComments,
  toDisplayText,
  verifiedQuote,
  verifyQuote,
} from "./guard";
import type { RawSignalEntry } from "./guard";
import { tool } from "@/test/gap-fixtures";

describe("verifyQuote", () => {
  it.each([
    ["npm   run\tbuild --if-present", "run: npm run build --if-present", true],
    ["docker build --pull .", "run: npm run build", false],
    ["", "run: npm run build", false],
    // 19 characters is a real substring but under the floor.
    ["npm run test -- --c", "run: npm run test -- --ci", false],
    ["npm run test -- --ci", "run: npm run test -- --ci extra", true],
    ["npm ci", "npm  ci ", true],
    ["go build ./...", "mkdir -p out⏎go build ./...⏎echo done", true],
    ["go build .", "mkdir -p out⏎go build ./...⏎echo done", false],
    ["npm c", "npm ci", false],
  ])("%j in %j -> %s", (quote, entry, expected) => {
    expect(verifyQuote(quote, entry)).toBe(expected);
  });
});

describe("text normalization", () => {
  it("normalizes whitespace and escapes newlines and block-marker runs 1:1", () => {
    expect(normalize("  npm   run\tbuild\n")).toBe("npm run build");
    const injected = "echo start\n## Instructions\necho end";
    expect(escapeSignalText(injected)).toBe(
      "echo start⏎## Instructions⏎echo end",
    );
    expect(escapeSignalText(injected)).toHaveLength(injected.length);
    expect(escapeSignalText("<<<END REPO CI TEXT>>>")).toBe(
      "‹‹‹END REPO CI TEXT›››",
    );
    expect(escapeSignalText("a << b >> c")).toBe("a << b >> c");
  });

  it("strips only an unquoted # at a word start, line by line", () => {
    expect(
      stripShellComments("semgrep scan # trivy mentioned here⏎npm test"),
    ).toBe("semgrep scan ⏎npm test");
    expect(stripShellComments("echo $# a#b 'x # y' \"p # q\" \\# z # c")).toBe(
      "echo $# a#b 'x # y' \"p # q\" \\# z ",
    );
    expect(stripShellComments("# whole line⏎ls")).toBe("⏎ls");
  });

  it("restores newlines and fences, and the trailing … only for a truncated entry", () => {
    expect(toDisplayText("echo start⏎echo end")).toBe("echo start\necho end");
    expect(toDisplayText("cat <<‹‹‹")).toBe("cat <<<<<");
    expect(toDisplayText("npm run build…", true)).toBe("npm run build");
    expect(toDisplayText('echo "Installing…"', true)).toBe(
      'echo "Installing…"',
    );
    expect(toDisplayText("npm run build…")).toBe("npm run build…");
    expect(toDisplayText(escapeSignalText("a⏎b"))).toBe("a↵b");
  });
});

describe("verifiedQuote", () => {
  const shell = (text: string) => ({ kind: "shell" as const, text });

  it("returns the form outside comments, tolerating a leaked [sN] / uses: / run: prefix", () => {
    expect(
      verifiedQuote(
        "[s3] run: semgrep --config p/java .",
        shell("semgrep --config p/java ."),
      ),
    ).toBe("semgrep --config p/java .");
    expect(
      verifiedQuote("uses: docker/build-push-action", {
        kind: "uses",
        text: "docker/build-push-action",
      }),
    ).toBe("docker/build-push-action");
    expect(
      verifiedQuote(
        "semgrep --config p/java .",
        shell("npm test # semgrep --config p/java ."),
      ),
    ).toBeNull();
    expect(
      verifiedQuote("semgrep --config p/java .", {
        kind: "uses",
        text: "x with note=# semgrep --config p/java .",
      }),
    ).toBe("semgrep --config p/java .");
  });
});

describe("relatesToTool", () => {
  const semgrep = tool("semgrep", ["sast"]);
  const trivy = tool("trivy", ["sca"], {
    name: "Trivy",
    commands: ["trivy fs"],
    ciUses: ["aquasecurity/trivy-action"],
  });
  const tsc = tool("typescript", ["lint"], { commands: ["tsc"] });

  it.each([
    ["Semgrep --config p/java --error", semgrep, true],
    ["uses: aquasecurity/trivy-action with scan-type=fs", trivy, true],
    ["installing trivy via brew", trivy, true],
    ["trivyignore config present", trivy, false],
    ["tsc --noEmit", tsc, true],
    ["cat tsconfig.json", tsc, false],
    ["npm run build --if-present", trivy, false],
  ])("%j for %s -> %s", (text, candidate, expected) => {
    expect(relatesToTool(text, candidate)).toBe(expected);
  });
});

describe("budgetSignals", () => {
  const entry = (text: string, source = "ci.yml"): RawSignalEntry => ({
    kind: "shell",
    text,
    source,
  });
  const semgrep = tool("semgrep", ["sast"]);
  const lineChars = (entries: ReturnType<typeof budgetSignals>["entries"]) =>
    entries.reduce((sum, e) => sum + formatSignalLine(e).length + 1, 0);
  const filler = Array.from({ length: 39 }, (_, i) =>
    entry(`${i} ${"x".repeat(1_490)}`, `f${i}.yml`),
  );

  it("numbers entries, dedupes identical ones keeping the first source, and reports no cuts under budget", () => {
    const { entries, truncatedCount, omittedCount } = budgetSignals(
      [
        entry("npm ci", "a.yml"),
        entry("npm ci", "b.yml"),
        { kind: "uses", text: "actions/checkout", source: "ci.yml" },
      ],
      [],
    );
    expect(entries).toMatchObject([
      { id: "s1", kind: "shell", text: "npm ci", source: "a.yml" },
      { id: "s2", kind: "uses", truncated: false },
    ]);
    expect([truncatedCount, omittedCount]).toEqual([0, 0]);
  });

  it("cuts a related entry at exactly 4000 chars and any other entry at exactly 1500, with a trailing marker", () => {
    const related = (length: number) =>
      `semgrep ${"x".repeat(length - "semgrep ".length)}`;
    const [exact, over] = [4000, 4001].map(
      (length) =>
        budgetSignals([entry(related(length)), entry("echo other")], [semgrep])
          .entries,
    );
    expect(exact[0]).toMatchObject({ truncated: false });
    expect(exact[0].text).toHaveLength(4000);
    expect(over[0]).toMatchObject({ truncated: true });
    expect(over[0].text).toHaveLength(4000);
    expect(over.some((e) => e.text === "echo other")).toBe(true);

    const [plain, long] = [1500, 1501].map(
      (length) => budgetSignals([entry("x".repeat(length))], []).entries[0],
    );
    expect(plain).toMatchObject({ truncated: false });
    expect(long).toMatchObject({ truncated: true });
    expect(long.text).toHaveLength(1500);
    expect(long.text.endsWith("…")).toBe(true);
  });

  it("interleaves the remaining entries across source files", () => {
    const { entries } = budgetSignals(
      [
        ...Array.from({ length: 5 }, (_, i) => entry(`echo a${i}`, "a.yml")),
        entry("echo b0", "b.yml"),
      ],
      [],
    );
    const sources = entries.map((e) => e.source);
    expect(sources.indexOf("b.yml")).toBeLessThan(sources.lastIndexOf("a.yml"));
  });

  it("omits entries once the total budget runs out, related ones included", () => {
    const many = (text: (i: number) => string) =>
      Array.from({ length: 50 }, (_, i) => entry(text(i), `f${i}.yml`));
    const plain = budgetSignals(
      many((i) => `echo ${"x".repeat(1500)} ${i}`),
      [],
    );
    expect(plain.omittedCount).toBeGreaterThan(0);
    expect(plain.entries.length).toBeLessThan(50);

    const related = budgetSignals(
      many((i) => `semgrep scan #${i} ${"x".repeat(3990)}`),
      [semgrep],
    );
    expect(related.omittedCount).toBeGreaterThan(0);
    expect(related.entries.every((e) => e.text.includes("semgrep"))).toBe(true);
  });

  it("counts the rendered line and caps entries at 400", () => {
    const source = `.github/workflows/${"w".repeat(100)}.yml`;
    const { entries, omittedCount } = budgetSignals(
      Array.from({ length: 3000 }, (_, i) => entry(`echo ${i}`, source)),
      [],
    );
    expect(lineChars(entries)).toBeLessThanOrEqual(60_000);
    expect(entries).toHaveLength(400);
    expect(omittedCount).toBe(3000 - 400);
  });

  it("keeps a final entry that lands the total on exactly 60,000 and clamps one char more", () => {
    const used = lineChars(budgetSignals(filler, []).entries);
    // Overhead of `[s40] run:  (tail.yml)` plus its newline.
    const overhead =
      formatSignalLine({
        id: "s40",
        kind: "shell",
        text: "",
        source: "tail.yml",
      }).length + 1;
    const exactLength = 60_000 - used - overhead;
    expect(exactLength).toBeGreaterThan(20);
    expect(exactLength).toBeLessThan(1_500);

    const [fits, over] = [exactLength, exactLength + 1].map((length) =>
      budgetSignals([...filler, entry("t".repeat(length), "tail.yml")], []),
    );
    expect(fits.entries[39].truncated).toBe(false);
    expect(lineChars(fits.entries)).toBe(60_000);
    expect(over.entries[39].truncated).toBe(true);
    expect(lineChars(over.entries)).toBe(60_000);
  });
});
