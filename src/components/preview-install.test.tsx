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

const command = bootstrapCommand("https://setup.example/setup");

describe("install command", () => {
  it("copies the command displayed for this deployment and announces success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<PreviewInstallCommand command={command} />);
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
    render(<PreviewInstallCommand command={command} />);
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
    container.innerHTML = renderToString(
      <PreviewInstallCommand command={command} />,
    );
    expect(container.querySelector("code")?.textContent).toBe(command);
    expect(container.textContent).not.toContain("Loading");
  });
  it("shows a manual fallback without a copyable command when setup is unavailable", () => {
    render(<PreviewInstallCommand command={null} />);
    const button = screen.getByRole("button", {
      name: "Copy install command",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Installer unavailable/)).toBeDefined();
  });
});

it("updates keyboard access when a disclosure resizes and disconnects on unmount", () => {
  const observers: {
    callback: ResizeObserverCallback;
    targets: Element[];
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      record;
      constructor(callback: ResizeObserverCallback) {
        this.record = {
          callback,
          targets: [] as Element[],
          disconnect: vi.fn(),
        };
        observers.push(this.record);
      }
      observe(target: Element) {
        this.record.targets.push(target);
      }
      disconnect() {
        this.record.disconnect();
      }
    },
  );
  const view = render(<PreviewInstallCommand command={command} />);
  const group = screen.getByRole("group", { name: "Install command" });
  expect(group.tabIndex).toBe(-1);
  Object.defineProperty(group, "scrollWidth", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(group, "clientWidth", {
    configurable: true,
    value: 300,
  });
  const resize = () =>
    act(() => {
      for (const observer of observers)
        observer.callback([], {} as ResizeObserver);
    });
  expect(observers.some((observer) => observer.targets.includes(group))).toBe(
    true,
  );
  resize();
  expect(group.tabIndex).toBe(0);
  Object.defineProperty(group, "clientWidth", {
    configurable: true,
    value: 900,
  });
  resize();
  expect(group.tabIndex).toBe(-1);
  view.unmount();
  for (const observer of observers)
    expect(observer.disconnect).toHaveBeenCalledOnce();
});
