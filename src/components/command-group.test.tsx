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
import { CommandGroup, InstallPanel } from "./install-panel";

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
    { ...shell, failMarketplace: false },
    { ...shell, failMarketplace: true },
  ]),
)(
  "scopes HTTPS to every copied plugin command in $shell (fail marketplace: $failMarketplace)",
  async ({ shell, args, failMarketplace }) => {
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
if [ "\${FAIL_MARKETPLACE-}" = 1 ] && [ "$*" = "plugin marketplace add korzainc/marketplace" ]; then
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
          FAIL_MARKETPLACE: failMarketplace ? "1" : "0",
        },
      });
      const operations = [
        "unset|auth login",
        "1|plugin marketplace add korzainc/marketplace",
      ];
      if (!failMarketplace)
        operations.push(
          "1|plugin install codezen@korza-marketplace",
          "1|plugin install superpowers@korza-marketplace",
          "1|plugin install mattpocock-skills@korza-marketplace",
          "1|plugin install humanizer@korza-marketplace",
          "unset|verify-scope",
        );
      expect(result.status, result.stderr).toBe(failMarketplace ? 23 : 0);
      expect(result.stdout.trim().split("\n")).toEqual(operations);
      expect(result.stderr).not.toMatch(/command not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

it("keeps instructions attached to commands that exist", () => {
  for (const entry of manualCommands) {
    for (const command of [
      ...Object.keys(entry.comments ?? {}),
      ...(entry.breakBefore ?? []),
    ]) {
      expect(entry.commands, `${entry.tool}: ${command}`).toContain(command);
    }
  }
});

it("places key loading instructions beside a separate copyable step", () => {
  const entry = manualCommands.find((entry) => entry.tool === "SSH access")!;
  const { container } = render(<CommandGroup {...entry} />);
  const instruction = screen.getByText(
    "Load the key. Enter its passphrase if asked.",
  );
  expect(instruction.parentElement?.querySelector("code")?.textContent).toBe(
    "ssh-add ~/.ssh/id_ed25519",
  );
  expect(container.textContent).not.toContain("admin:public_key");
});

it.each([false, true])(
  "only adds a scroll tab stop when content overflows (snippet: %s)",
  (snippet) => {
    render(
      <InstallPanel
        tabs={[
          {
            id: "test",
            label: "Test",
            blocks: [
              {
                name: "Example command",
                content: "a long command",
                target: snippet ? "example.yml" : undefined,
              },
            ],
          },
        ]}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "Example command" }),
    ).toBeNull();
    const group = screen.getByRole("group", { name: "Example command" });
    expect(group.tabIndex).toBe(-1);
    Object.defineProperty(group, "scrollWidth", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(group, "clientWidth", {
      configurable: true,
      value: 300,
    });
    fireEvent(window, new Event("resize"));
    expect(group.tabIndex).toBe(0);
    Object.defineProperty(group, "clientWidth", {
      configurable: true,
      value: 900,
    });
    fireEvent(window, new Event("resize"));
    expect(group.tabIndex).toBe(-1);
  },
);

it("names each copy control by tool and step", () => {
  render(
    <CommandGroup
      label="Claude Code"
      commands={["claude auth login", "claude plugin list"]}
      breakBefore={["claude plugin list"]}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Copy claude code command 1" }),
  ).toBeDefined();
  expect(
    screen.getByRole("button", { name: "Copy claude code command 2" }),
  ).toBeDefined();
});
