"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const KEY = "devx.skills.intro.dismissed";
/** Same-tab writes do not fire `storage`, so the setter announces itself. */
const EVENT = "devx:skills-intro-dismissed";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function isDismissed() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Storage can be blocked outright. Treat that as dismissed: a nudge that cannot remember
    // being closed would return on every visit, which is worse than never appearing.
    return true;
  }
}

/**
 * Dismissed on the server, so nothing renders in the prerendered HTML and a client without
 * JavaScript gets the catalogue rather than an overlay it has no way to close. This is the
 * opposite call from DX-100 on purpose: there, content was hidden from no-JS clients and had
 * to be restored; here the overlay *is* the enhancement, and the page underneath is complete.
 */
function serverSnapshot() {
  return true;
}

export function SkillsFirstRunNudge() {
  /**
   * Two sources, OR'd. `stored` is the persisted flag; `closedHere` is this view's own copy.
   * Reading alone was not enough: when reads work but `setItem` throws, as it does on a full
   * quota, the write was swallowed, the re-read still returned null, and the overlay could
   * never be closed by Skip or Escape. Closing must not depend on persisting succeeding.
   */
  const stored = useSyncExternalStore(subscribe, isDismissed, serverSnapshot);
  const [closedHere, setClosedHere] = useState(false);
  const dismissed = stored || closedHere;
  const dialog = useRef<HTMLDivElement | null>(null);

  const dismiss = useCallback(() => {
    // First, so it closes whether or not the rest of this works.
    setClosedHere(true);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // A full quota, or a browser refusing writes. It stays closed for this view; it will
      // greet the reader again next visit, which is the honest outcome when nothing can be
      // remembered.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  /**
   * Takes focus on open, unless the reader is already using the page. The server markup omits
   * this overlay, so it appears after hydration: on a slow connection someone can be mid-query
   * in the skills search when it mounts, and grabbing focus then sends their next keystrokes
   * somewhere they cannot see. Anything focused other than the body means they got there first.
   */
  useEffect(() => {
    if (dismissed) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    dialog.current?.focus();
  }, [dismissed]);

  /**
   * Focus goes somewhere deliberate when this closes, whichever way it closed: this tab's
   * buttons, Escape, or another tab writing the flag.
   *
   * An effect on the open-to-closed transition rather than a cleanup. A cleanup keyed on
   * `dismissed` also ran on unmount, so leaving `/skills` with the nudge still open stamped
   * `tabIndex` on the *next* page's heading and focused it, overriding history restoration --
   * passive cleanup runs after the DOM swap, so `querySelector` resolved against the new tree.
   * Effects do not run on unmount, so this cannot mistake a navigation for a close.
   *
   * `wasOpen` keeps it from firing for a returning reader, who arrives already dismissed. By
   * this point the overlay has left the DOM and focus has fallen to the body, which is the
   * signal to forward it; focus anywhere else means the reader moved on themselves.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!dismissed) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const heading = document.querySelector<HTMLElement>("h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [dismissed]);

  /**
   * Escape closes, and Tab stays inside. Listening on the document rather than the dialog:
   * the handler used to sit on the dialog itself, so once focus left it (a backdrop click
   * drops focus to the body) nothing recaptured it and the controls behind the overlay stayed
   * keyboard reachable while `aria-modal` claimed they were not.
   */
  useEffect(() => {
    if (dismissed) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const node = dialog.current;
      if (!node) return;
      const stops = node.querySelectorAll<HTMLElement>("a[href], button");
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;

      if (!node.contains(active)) {
        // Focus escaped: pull it back to whichever end the reader was heading for.
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dismissed, dismiss]);

  /**
   * Body scroll is locked while this is open. `fixed inset-0 overflow-y-auto` scrolls the
   * overlay but chains to the document once its own content ends, so the catalogue moved
   * underneath and the reader lost their place. `aria-modal` does not imply a scroll lock.
   */
  useEffect(() => {
    if (dismissed) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [dismissed]);

  if (dismissed) return null;

  // `main` carries `isolate`, so no z-index here can beat the header one context up. Safe
  // without an SSR guard: `serverSnapshot` means this never renders on the server.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-canvas/85 px-4 py-12 backdrop-blur-sm">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="skills-first-run-title"
        tabIndex={-1}
        className="w-full max-w-4xl overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl outline-none"
      >
        <div className="grid md:grid-cols-2">
          <div className="flex flex-col gap-5 p-7">
            <h2
              id="skills-first-run-title"
              className="font-display text-2xl font-semibold tracking-tight"
            >
              First time here? 👋
            </h2>

            <p className="leading-relaxed text-ink-muted">
              Everything on this page is a{" "}
              <strong className="font-medium text-ink">skill</strong>: a written
              procedure your agent loads when it applies. Some you call with a
              slash, but{" "}
              <strong className="font-medium text-ink">
                most fire on their own
              </strong>
              , the moment the job matches. Skills ship inside plugins, and a
              plugin is what you install.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/skills-intro/demo"
                onClick={dismiss}
                className="rounded-lg border border-line-strong bg-accent-wash px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent"
              >
                See it run
              </Link>
              <Link
                href="/skills-intro"
                onClick={dismiss}
                className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-line-strong"
              >
                Show me around
              </Link>
              {/* `ml-auto` on the button, not a flex-1 spacer beside it. The spacer stayed on
                  the first line absorbing leftover width, so once the row wrapped the button
                  dropped to its own line flush left, directly under the two it is meant to sit
                  apart from. This pushes it to the far side of whichever line it lands on. */}
              <button
                type="button"
                onClick={dismiss}
                className="ml-auto text-sm text-ink-faint transition-colors hover:text-ink-muted"
              >
                Skip for now
              </button>
            </div>
          </div>

          {/* Static, unlike the demo page's terminal. This one sits beside a decision, so a
              replay competing for attention would work against the two buttons. Only the
              caret moves, which is enough to read the pane as a live session. */}
          <FirstRunPreview />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The condensed before and after, trimmed to what fits beside the copy. */
function FirstRunPreview() {
  const rows: { tone: string; text: string }[] = [
    { tone: "text-ink", text: "> “write the requirements doc”" },
    { tone: "text-ink-faint", text: "✗ 640 words, wrong phase," },
    { tone: "text-ink-faint", text: "  no sign-off" },
  ];

  return (
    <div className="flex flex-col border-t border-line bg-canvas md:border-t-0 md:border-l">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        </span>
        <span className="font-mono text-xs text-ink-faint">
          same ask, twice
        </span>
      </div>

      <div className="flex flex-col gap-1 px-5 py-5 font-mono text-xs leading-[1.9]">
        {rows.map((row) => (
          <span key={row.text} className={`whitespace-pre ${row.tone}`}>
            {row.text}
          </span>
        ))}

        <span aria-hidden="true" className="my-2 border-t border-line" />

        <span className="text-ink">
          <span className="text-ink-faint">{"> "}</span>
          <span className="text-accent">/brainstorm</span> requirements doc
        </span>
        <span className="text-ink">
          <span className="text-accent">{"✓ "}</span>one question at a time,
        </span>
        <span className="whitespace-pre text-ink">
          {"  agreed first"}
          {/* The one moving part, so the pane reads as a session rather than a screenshot. */}
          <span
            aria-hidden="true"
            className="animate-caret ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-accent"
          />
        </span>
      </div>
    </div>
  );
}
