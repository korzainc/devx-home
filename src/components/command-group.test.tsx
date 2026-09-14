// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { manualCommands } from "@/lib/getting-started";
import { CommandGroup } from "./install-panel";

const shells = [
  { shell: "/bin/sh", args: [] as string[] },
  ...(existsSync("/bin/zsh") ? [{ shell: "/bin/zsh", args: ["-dfis"] }] : []),
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("copies only the chosen command, excluding comments and later interactive steps", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const commands = [
    "claude auth login",
    "claude plugin marketplace add korzainc/marketplace",
  ];
  render(
    <CommandGroup
      commands={commands}
      breakBefore={[commands[1]]}
      comments={{ [commands[1]]: "Finish sign-in first." }}
    />,
  );
  expect(screen.queryByText("Terminal")).toBeNull();
  expect(screen.getByText("Finish sign-in first.")).toBeDefined();
  await act(async () => {
    fireEvent.click(
      screen.getAllByRole("button", { name: "Copy terminal command" })[0],
    );
  });
  expect(writeText).toHaveBeenCalledExactlyOnceWith(commands[0]);
});

it("copies a whole block with failure-gated commands", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(
    <CommandGroup
      commands={[
        "fnm install --lts",
        "fnm default lts-latest",
        "fnm use lts-latest",
      ]}
    />,
  );
  expect(screen.getAllByRole("button")).toHaveLength(1);
  await act(async () => {
    fireEvent.click(screen.getByRole("button"));
  });
  expect(writeText).toHaveBeenCalledExactlyOnceWith(
    "fnm install --lts &&\n\nfnm default lts-latest &&\n\nfnm use lts-latest",
  );
});

it("keeps every displayed block valid shell syntax with comments and spacing", () => {
  for (const entry of manualCommands) {
    const { container, unmount } = render(
      <CommandGroup
        commands={entry.commands}
        comments={entry.comments}
        breakBefore={entry.breakBefore}
      />,
    );
    for (const field of container.querySelectorAll("code")) {
      const result = spawnSync("/bin/sh", ["-n"], {
        input: field.textContent ?? "",
        encoding: "utf8",
      });
      expect(result.status, `${entry.tool}: ${result.stderr}`).toBe(0);
    }
    unmount();
  }
});

it.each(shells)(
  "stops a copied block after failure across an explanation in $shell",
  async ({ shell, args }) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(
      <CommandGroup
        commands={["false", "printf should-not-run"]}
        comments={{ "printf should-not-run": "A later step." }}
      />,
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Copy terminal command" }),
      );
    });
    const copied = writeText.mock.calls[0][0];
    const result = spawnSync(shell, args, {
      input: `${copied}\n`,
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        PATH: "/usr/bin:/bin",
        HOME: tmpdir(),
        ZDOTDIR: tmpdir(),
      },
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toMatch(/command not found/);
    expect(screen.getByText("A later step.", { exact: false })).toBeDefined();
    expect(copied).not.toContain("A later step.");
  },
);

it.each(
  shells.flatMap((shell) => [
    { ...shell, failUpdate: false },
    { ...shell, failUpdate: true },
  ]),
)(
  "scopes HTTPS to every copied plugin command in $shell (fail update: $failUpdate)",
  async ({ shell, args, failUpdate }) => {
    const entry = manualCommands.find((entry) => entry.tool === "Claude Code")!;
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(
      <CommandGroup
        commands={entry.commands}
        comments={entry.comments}
        breakBefore={entry.breakBefore}
      />,
    );
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole("button", { name: "Copy terminal command" })[1],
      );
    });
    const copied = writeText.mock.calls[0][0];
    const dir = mkdtempSync(join(tmpdir(), "manual-plugin-https-"));
    try {
      // Log arguments and transport only. Never invoke Claude or sign in.
      writeFileSync(
        join(dir, "claude"),
        `#!/bin/sh
printf '%s|%s\n' "\${CLAUDE_CODE_PLUGIN_PREFER_HTTPS-unset}" "$*"
if [ "\${FAIL_UPDATE-}" = 1 ] && [ "$*" = "plugin marketplace update korza-marketplace" ]; then
  exit 23
fi
`,
        { mode: 0o700 },
      );
      const result = spawnSync(shell, args, {
        input: `${copied} &&\nclaude verify-scope\n`,
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          HOME: dir,
          ZDOTDIR: dir,
          PATH: dir,
          FAIL_UPDATE: failUpdate ? "1" : "0",
        },
      });
      const operations = [
        "unset|auth login",
        "1|plugin marketplace add korzainc/marketplace",
        "1|plugin marketplace update korza-marketplace",
      ];
      if (!failUpdate)
        operations.push(
          "1|plugin install codezen@korza-marketplace",
          "1|plugin install superpowers@korza-marketplace",
          "1|plugin install mattpocock-skills@korza-marketplace",
          "1|plugin install humanizer@korza-marketplace",
          "unset|verify-scope",
        );
      expect(result.status, result.stderr).toBe(failUpdate ? 23 : 0);
      expect(result.stdout.trim().split("\n")).toEqual(operations);
      expect(result.stderr).not.toMatch(/command not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
