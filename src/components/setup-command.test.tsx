// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrapCommand } from "@/lib/bootstrap-command";
import { SetupCommand } from "./setup-command";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const command = bootstrapCommand("https://setup.example/setup");

describe("install command", () => {
  it("copies the command displayed for this deployment and announces success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<SetupCommand command={command} />);
    expect(screen.getByText(command, { exact: false })).toBeDefined();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Copy install command" }),
      );
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(command);
    expect(screen.getByRole("status").textContent).toBe(
      "Install command copied",
    );
  });

  it("keeps the command selectable without claiming success when clipboard access fails", async () => {
    const writeText = vi
      .fn()
      .mockRejectedValue(new Error("Clipboard unavailable"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<SetupCommand command={command} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Copy install command" }),
      );
    });
    expect(screen.getByRole("status").textContent).toBe("");
    expect(
      screen.getByText(command, {
        exact: false,
      }),
    ).toBeDefined();
  });

  it("renders the complete command in server HTML without waiting for JavaScript", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<SetupCommand command={command} />);
    expect(container.querySelector("code")?.textContent).toBe(command);
    expect(container.textContent).not.toContain("Loading");
  });
  it("shows a manual fallback without a copyable command when setup is unavailable", () => {
    render(<SetupCommand command={null} />);
    const button = screen.getByRole("button", {
      name: "Copy install command",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Installer unavailable/)).toBeDefined();
  });
});
