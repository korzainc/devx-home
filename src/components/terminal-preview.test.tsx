/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import cliPreview from "@/lib/cli-preview-frames.json";
import { TerminalPreview } from "./terminal-preview";

let intersect: (ratio: number, topVisible?: boolean) => void;
let changeMotion: () => void;
let reduced = false;
beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  intersect = () => {};
  changeMotion = () => {};
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, fn: () => void) => {
      changeMotion = fn;
    },
    removeEventListener: vi.fn(),
  }));
  const observers: {
    callback: (entries: IntersectionObserverEntry[]) => void;
    targets: Element[];
  }[] = [];
  intersect = (ratio, topVisible = ratio > 0) =>
    act(() => {
      for (const observer of observers) {
        if (!observer.targets.length) continue;
        observer.callback(
          observer.targets.map((target) => {
            const isFigure = target.tagName === "FIGURE";
            const visible = isFigure ? ratio > 0 : topVisible;
            return {
              target,
              isIntersecting: visible,
              intersectionRatio: isFigure ? ratio : Number(topVisible),
              boundingClientRect: new DOMRect(
                0,
                0,
                isFigure ? 1104 : 1,
                isFigure ? 676 : 1,
              ),
              intersectionRect: new DOMRect(
                0,
                0,
                visible ? 1 : 0,
                visible ? 1 : 0,
              ),
              rootBounds: new DOMRect(0, 65, 1280, 735),
              time: 0,
            };
          }),
        );
      }
    });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      targets: Element[] = [];
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
        observers.push({ callback, targets: this.targets });
      }
      observe(target: Element) {
        this.targets.push(target);
      }
      disconnect() {
        this.targets.length = 0;
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const output = () => screen.getByRole("region").textContent ?? "";
function tick() {
  act(() => {
    vi.advanceTimersToNextTimer();
  });
}
function advanceTo(text: string) {
  for (let i = 0; i < 80 && !output().includes(text); i++) tick();
  expect(output()).toContain(text);
}
function wait() {
  act(() => {
    vi.advanceTimersByTime(10000);
  });
}

it("waits until the output enters view, shows the flow, then holds success", () => {
  render(<TerminalPreview />);
  intersect(0);
  wait();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  intersect(0.1);
  expect(output()).toBe("$ ");
  advanceTo("$ korza setup");
  advanceTo("Checking this machine…");
  advanceTo("Install skills");
  expect(output()).toContain("Install · optional");
  advanceTo("2 running");
  expect(output()).not.toContain("Your tools are ready");
  advanceTo("Verifying");
  advanceTo("Your tools are ready");
  wait();
  intersect(0);
  intersect(0.7);
  wait();
  expect(output()).toContain("Your tools are ready");
  fireEvent.click(screen.getByRole("button", { name: "Replay setup preview" }));
  expect(output()).toBe("$ ");
});

it("keeps activity visible and pauses without handling terminal keys", () => {
  render(<TerminalPreview />);
  intersect(0.7);
  advanceTo("2 running");
  expect(
    screen.getByRole("button", { name: "Pause setup preview" }),
  ).toBeDefined();
  const first = output();
  tick();
  expect(output()).not.toBe(first);
  fireEvent.click(screen.getByRole("button", { name: "Pause setup preview" }));
  const paused = output();
  wait();
  fireEvent.keyDown(screen.getByRole("figure"), { key: "ArrowDown" });
  expect(output()).toBe(paused);
  expect(
    screen.getByRole("button", { name: "Resume setup preview" }),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Resume setup preview" }));
  tick();
  expect(output()).not.toBe(paused);
});

it("suspends outside the viewport without losing its place", () => {
  render(<TerminalPreview />);
  intersect(0.7);
  advanceTo("2 running");
  const paused = output();
  intersect(0);
  wait();
  expect(output()).toBe(paused);
  intersect(0.7);
  tick();
  expect(output()).not.toBe(paused);
});

it("keeps static success for reduced motion, including a change during playback", () => {
  reduced = true;
  render(<TerminalPreview />);
  intersect(0.7);
  wait();
  expect(output()).toContain("Your tools are ready");
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  cleanup();
  reduced = false;
  render(<TerminalPreview />);
  intersect(0.7);
  advanceTo("2 running");
  act(() => {
    reduced = true;
    changeMotion();
  });
  wait();
  expect(output()).toContain("Your tools are ready");
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});

it("excludes the obsolete detect menu from the captured flow", () => {
  const text = cliPreview.lines
    .flat()
    .map((run) => run.text)
    .join("\n");
  expect(text).not.toContain("opening setup choices");
  expect(text).not.toContain("Checked this machine. Nothing was changed.");
});

it("shows each focus step from the CLI key handler", () => {
  expect(
    cliPreview.frames
      .filter((frame) => frame.key)
      .map((frame) => [frame.key, frame.focusedTool]),
  ).toEqual([
    ["down", "brew"],
    ["down", "claude"],
    ["right", "claude"],
    ["down", "korza"],
    ["enter", "korza"],
    ["down", "uv"],
    ["down", "fnm"],
    ["enter", "fnm"],
  ]);
});

it.each([0.001, 0.02, 0.2, 0.5])(
  "starts on arrival with only %s of the card visible",
  (ratio) => {
    render(<TerminalPreview />);
    intersect(ratio);
    expect(output()).toBe("$ ");
    tick();
    expect(output()).not.toBe("$ ");
  },
);

it("does not start from a deep link showing only the lower part of the card", () => {
  render(<TerminalPreview />);
  intersect(0.8, false);
  wait();
  expect(output()).toContain("Your tools are ready");
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  intersect(0.2, true);
  expect(output()).toBe("$ ");
});

it("keeps playing after the banner scrolls past, then pauses when the card leaves view", () => {
  render(<TerminalPreview />);
  intersect(0.2);
  advanceTo("2 running");
  intersect(0.15, false);
  const visibleOutput = output();
  tick();
  expect(output()).not.toBe(visibleOutput);
  intersect(0, false);
  const offscreenOutput = output();
  wait();
  expect(output()).toBe(offscreenOutput);
  intersect(0.1, false);
  tick();
  expect(output()).not.toBe(offscreenOutput);
});

it("waits for a hidden tab and starts when it becomes visible without another scroll", () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  render(<TerminalPreview />);
  intersect(0.8);
  wait();
  expect(output()).toContain("Your tools are ready");
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  expect(output()).toBe("$ ");
});

it("starts when reduced motion is disabled while the output is already visible", () => {
  reduced = true;
  render(<TerminalPreview />);
  intersect(0.2);
  expect(output()).toContain("Your tools are ready");
  act(() => {
    reduced = false;
    changeMotion();
  });
  expect(output()).toBe("$ ");
});

it("preserves manual pause through hiding, resizing and returning", () => {
  render(<TerminalPreview />);
  intersect(0.2);
  advanceTo("2 running");
  fireEvent.click(screen.getByRole("button", { name: "Pause setup preview" }));
  const paused = output();
  intersect(0, false);
  wait();
  fireEvent(window, new Event("resize"));
  intersect(0.2);
  wait();
  expect(output()).toBe(paused);
  expect(
    screen.getByRole("button", { name: "Resume setup preview" }),
  ).toBeDefined();
});

it("waits for the section entrance before starting", async () => {
  const { container } = render(
    <section data-entry="waiting">
      <TerminalPreview />
    </section>,
  );
  intersect(0.8);
  wait();
  expect(output()).toContain("Your tools are ready");
  await act(async () => {
    delete container.querySelector("section")!.dataset.entry;
  });
  expect(output()).toBe("$ ");
});

it("does not start while an initial deep link scrolls past the preview", () => {
  window.history.replaceState(null, "", "#manual");
  try {
    render(
      <>
        <TerminalPreview />
        <section id="manual">Manual setup</section>
      </>,
    );
    intersect(0.8);
    expect(output()).toContain("Your tools are ready");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(
      screen
        .getByRole("region")
        .querySelector("pre")!
        .classList.contains("motion-safe:invisible"),
    ).toBe(false);
    intersect(0, false);
    intersect(0.2, true);
    expect(output()).toBe("$ ");
  } finally {
    window.history.replaceState(null, "", window.location.pathname);
  }
});

it("keeps the fallback visible until playback without changing reserved height", () => {
  const { container } = render(<TerminalPreview />);
  const terminal = container.querySelector("pre")!;
  const height = terminal.style.minHeight;
  expect(terminal.classList.contains("motion-safe:invisible")).toBe(false);
  intersect(0.2);
  expect(terminal.classList.contains("motion-safe:invisible")).toBe(false);
  expect(terminal.textContent).toBe("$ ");
  expect(terminal.style.minHeight).toBe(height);
});

it("shows the static fallback when intersection observation is unavailable", () => {
  Reflect.deleteProperty(window, "IntersectionObserver");
  const { container } = render(<TerminalPreview />);
  expect(
    container.querySelector("pre")!.classList.contains("motion-safe:invisible"),
  ).toBe(false);
  expect(output()).toContain("Your tools are ready");
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});

it("reveals the CLI once per playback and respects pause and reduced motion", () => {
  const { container } = render(<TerminalPreview />);
  const terminal = container.querySelector("pre")!;
  intersect(0.2);
  advanceTo("Checking this machine…");
  expect(terminal.dataset.reveal).toBeUndefined();
  expect(terminal.dataset.depart).toBe("true");
  expect(terminal.style.animationDelay).toBe("1080ms");
  tick();
  expect(terminal.dataset.depart).toBeUndefined();
  expect(terminal.style.animationDelay).toBe("");
  expect(terminal.dataset.reveal).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Pause setup preview" }));
  expect(terminal.style.animationPlayState).toBe("paused");
  fireEvent.click(screen.getByRole("button", { name: "Resume setup preview" }));
  expect(terminal.style.animationPlayState).toBe("running");
  tick();
  expect(terminal.dataset.reveal).toBe("true");
  advanceTo("Your tools are ready");
  fireEvent.click(screen.getByRole("button", { name: "Replay setup preview" }));
  expect(terminal.dataset.reveal).toBeUndefined();
  advanceTo("Checking this machine…");
  tick();
  expect(terminal.dataset.reveal).toBe("true");
  reduced = true;
  act(() => changeMotion());
  expect(terminal.dataset.reveal).toBeUndefined();
});

it("resumes the remaining frame time instead of restarting the frame", () => {
  render(<TerminalPreview />);
  intersect(0.2);
  act(() => vi.advanceTimersByTime(30));
  fireEvent.click(screen.getByRole("button", { name: "Pause setup preview" }));
  act(() => vi.advanceTimersByTime(1000));
  expect(output()).toBe("$ ");
  fireEvent.click(screen.getByRole("button", { name: "Resume setup preview" }));
  act(() => vi.advanceTimersByTime(45));
  expect(output()).toBe("$ k");
});

it("shows qualified estimates and measured download detail without losing controls", () => {
  render(<TerminalPreview />);
  intersect(0.7);
  advanceTo("Installing fnm: about 6s");
  expect(output()).toContain("Installing Node.js takes extra time");
  advanceTo("60% of 3.0 MB, about 4s left");
  expect(output()).toContain("elapsed");
  expect(document.querySelector(".terminal-preview-spinner")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Pause setup preview" }));
  const paused = output();
  wait();
  expect(output()).toBe(paused);
  fireEvent.click(screen.getByRole("button", { name: "Resume setup preview" }));
  advanceTo("Verifying");
  expect(output()).not.toContain("% of");
  expect(output()).not.toContain("left.");
  advanceTo("Your tools are ready");
  fireEvent.click(screen.getByRole("button", { name: "Replay setup preview" }));
  expect(output()).toBe("$ ");
});
