"use client";

import { useEffect, useRef, useState } from "react";
import { useHorizontalOverflow } from "./use-horizontal-overflow";
import cliPreview from "@/lib/cli-preview-frames.json";

// Captured from Korza's production renderer with controlled tool states and versions.
// Preserve its text, spacing and colours; shell input and timing are illustrative.
const frames = cliPreview.frames.map((frame) => ({
  ...frame,
  lines: frame.lineIds.map((id) => cliPreview.lines[id]),
}));
const finalFrame = frames.length - 1;
const screenLines = Math.max(...frames.map((frame) => frame.lines.length));

export function TerminalPreview() {
  const figure = useRef<HTMLElement>(null);
  const startMarker = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const frameClock = useRef({ frame: -1, remaining: 0 });
  // Useful server/no-JS fallback, also used for reduced motion.
  const [frame, setFrame] = useState(finalFrame);
  const [pending, setPending] = useState(true);
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [canAnimate, setCanAnimate] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const card = figure.current;
    const marker = startMarker.current;
    if (!motion || !card || !marker || !("IntersectionObserver" in window)) {
      setPending(false);
      return;
    }

    const section = card.closest("section");
    const header = document.querySelector("header");
    let inView = false;
    let topInView = false;
    const hashTarget = document.getElementById(window.location.hash.slice(1));
    // An initial anchor scroll must pass the preview before it can enter again.
    let awaitingInitialScroll = Boolean(
      hashTarget &&
      card.compareDocumentPosition(hashTarget) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
    let cardObserver: IntersectionObserver;
    let startObserver: IntersectionObserver;

    const maybeStart = () => {
      if (
        started.current ||
        awaitingInitialScroll ||
        !inView ||
        !topInView ||
        document.hidden ||
        motion.matches ||
        section?.dataset.entry === "waiting" ||
        (section && getComputedStyle(section).opacity === "0")
      )
        return;
      started.current = true;
      setPending(false);
      setCanAnimate(true);
      setFrame(0);
    };

    const observe = () => {
      cardObserver?.disconnect();
      startObserver?.disconnect();
      inView = false;
      topInView = false;
      // The sticky header covers this part of the viewport, including after resize.
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      const rootMargin = `-${headerHeight}px 0px 0px 0px`;
      cardObserver = new IntersectionObserver(
        ([entry]) => {
          inView =
            entry.isIntersecting &&
            entry.boundingClientRect.width > 0 &&
            entry.boundingClientRect.height > 0;
          setVisible(inView);
          maybeStart();
        },
        { rootMargin, threshold: 0 },
      );
      // A one-pixel marker avoids waiting for a percentage of a tall terminal.
      startObserver = new IntersectionObserver(
        ([entry]) => {
          topInView = entry.isIntersecting && entry.intersectionRatio === 1;
          if (!topInView) awaitingInitialScroll = false;
          maybeStart();
        },
        { rootMargin, threshold: 1 },
      );
      cardObserver.observe(card);
      startObserver.observe(marker);
    };
    observe();
    const resize =
      header && "ResizeObserver" in window ? new ResizeObserver(observe) : null;
    if (header && resize) resize.observe(header);
    else window.addEventListener("resize", observe);

    // Entry can become visible without another intersection callback.
    const entrance = section ? new MutationObserver(maybeStart) : null;
    if (section) {
      entrance?.observe(section, {
        attributes: true,
        attributeFilter: ["data-entry"],
      });
      section.addEventListener("animationend", maybeStart);
    }
    const onMotion = () => {
      if (motion.matches) {
        if (started.current) setFrame(finalFrame);
        setCanAnimate(false);
        setPaused(false);
      } else {
        setCanAnimate(started.current);
        maybeStart();
      }
    };
    const onVisibility = () => {
      setTabVisible(!document.hidden);
      maybeStart();
    };
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cardObserver.disconnect();
      startObserver.disconnect();
      resize?.disconnect();
      window.removeEventListener("resize", observe);
      entrance?.disconnect();
      section?.removeEventListener("animationend", maybeStart);
      motion.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (
      !canAnimate ||
      !visible ||
      !tabVisible ||
      document.hidden ||
      paused ||
      frame === finalFrame
    )
      return;
    if (frameClock.current.frame !== frame) {
      frameClock.current = { frame, remaining: frames[frame].durationMs };
    }
    const clock = frameClock.current;
    const resumedAt = performance.now();
    const timer = window.setTimeout(
      () => setFrame((current) => Math.min(current + 1, finalFrame)),
      clock.remaining,
    );
    return () => {
      window.clearTimeout(timer);
      clock.remaining = Math.max(
        0,
        clock.remaining - (performance.now() - resumedAt),
      );
    };
  }, [canAnimate, visible, tabVisible, paused, frame]);

  const scroll = useHorizontalOverflow(frame);
  const complete = frame === finalFrame;
  const reveal = canAnimate && frames[frame].origin === "cli-renderer";
  const departing = canAnimate && frames[frame].name === "checking";

  return (
    <figure
      ref={figure}
      data-animated={canAnimate || undefined}
      data-playing={
        (canAnimate && !complete && !paused && visible && tabVisible) ||
        undefined
      }
      className="terminal-preview relative isolate w-full min-w-0 rounded-xl border border-line bg-surface shadow-[0_12px_32px_-14px_rgb(0_0_0/0.8)]"
    >
      <noscript>
        <style>{`.terminal-preview-output { visibility: visible !important; }`}</style>
      </noscript>
      <span
        ref={startMarker}
        aria-hidden="true"
        className="pointer-events-none absolute left-5 top-5 h-px w-px"
      />
      {canAnimate && (
        <figcaption className="absolute right-5 top-5 z-10 flex items-center gap-4 text-xs text-ink-muted">
          {!complete ? (
            <button
              type="button"
              aria-label={`${paused ? "Resume" : "Pause"} setup preview`}
              className="min-h-11 rounded px-1 hover:text-ink"
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? "Resume" : "Pause"}
            </button>
          ) : (
            <button
              type="button"
              aria-label="Replay setup preview"
              className="min-h-11 rounded px-1 hover:text-ink"
              onClick={() => {
                setFrame(0);
                setPaused(false);
              }}
            >
              Replay
            </button>
          )}
        </figcaption>
      )}
      <div
        role="region"
        aria-label="Example Korza CLI setup screen"
        {...scroll}
        className="overflow-x-auto px-5 py-5"
      >
        <pre
          className={`terminal-preview-output m-0 whitespace-pre font-mono text-[11px] leading-[1.6] lg:text-xs${pending ? " motion-safe:invisible" : ""}`}
          data-reveal={reveal || undefined}
          data-depart={departing || undefined}
          data-paused={paused || !visible || !tabVisible || undefined}
          style={{
            minHeight: `${screenLines * 1.6}em`,
            animationDelay: departing
              ? `${Math.max(0, frames[frame].durationMs - 120)}ms`
              : undefined,
            animationPlayState:
              paused || !visible || !tabVisible ? "paused" : "running",
          }}
        >
          {frames[frame].lines.map((line, lineIndex) => (
            <span key={lineIndex}>
              {line.map((run, runIndex) => (
                <span
                  key={runIndex}
                  className={
                    [
                      line.length >= 5 &&
                      ["  ", "❯ "].includes(line[0].text) &&
                      ["●", "✓", "|", "/", "-", "\\"].includes(line[1].text)
                        ? runIndex === 0
                          ? "terminal-preview-cursor"
                          : runIndex === 1
                            ? "terminal-preview-marker"
                            : ""
                        : "",
                      runIndex === 1 &&
                      ["|", "/", "-", "\\"].includes(run.text) &&
                      line.some((part) =>
                        /(?:Installing|Verifying).*elapsed/.test(part.text),
                      )
                        ? "terminal-preview-spinner"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  style={{ color: run.color, fontWeight: run.bold ? 700 : 400 }}
                >
                  {run.text}
                </span>
              ))}
              {lineIndex < frames[frame].lines.length - 1 ? "\n" : ""}
            </span>
          ))}
        </pre>
      </div>
    </figure>
  );
}
