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
import { PreviewInstallCommand } from "./preview-install";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("install command", () => {
  it("copies the command displayed for this deployment and announces success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<PreviewInstallCommand />);
    const command = bootstrapCommand(`${window.location.origin}/setup`);
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
    render(<PreviewInstallCommand />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Copy install command" }),
      );
    });
    expect(screen.getByRole("status").textContent).toBe("");
    expect(
      screen.getByText(bootstrapCommand(`${window.location.origin}/setup`), {
        exact: false,
      }),
    ).toBeDefined();
  });

  it("does not expose a runnable placeholder or enabled copy control in server HTML", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<PreviewInstallCommand />);
    expect(container.querySelector("button")?.disabled).toBe(true);
    expect(container.textContent).not.toContain("curl");
  });
});
