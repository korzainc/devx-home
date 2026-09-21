"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { NavArrow } from "@/components/nav-arrow";

/**
 * The back link at the top of a detail page.
 *
 * `href` names the section the page belongs to and is what the link really points at: it renders
 * as a plain anchor, so it survives no-JS, right-click, middle-click and a crawler, and it is the
 * answer whenever history cannot be followed.
 *
 * `followHistory` opts a link in to going back instead, and only the detail pages set it. A link
 * whose label names a place rather than a return — the "Home" up-link on `/skills` and `/tools` —
 * has to keep going to that place, or the label describes somewhere the click does not land.
 *
 * When the reader actually arrived from inside the app, going back to the parent is the wrong
 * move — it drops them at the top of a section they were already several steps into. DX-162: on
 * `/tools/biome` the link always returned to `/tools` even for a reader who came from the gap
 * report, whose own place was that report. So a click follows history instead, but only when the
 * previous entry is one of ours.
 *
 * "One of ours" is decided by a mark this app writes rather than by `document.referrer`, which a
 * SPA navigation never updates, and rather than by `history.length`, which counts entries from
 * before the tab reached this site. An entry the reader navigated to from inside the app carries
 * the mark; the entry a deep link, bookmark or external referrer lands on does not, and gets the
 * href, which is why the fallback has to stay a real link.
 *
 * The mark lives on the history entry rather than in the tab, which is the whole point. A per-tab
 * counter answers "how many navigations has this tab made", which is the wrong question: going
 * back is itself a navigation, so it raised the count when it should have lowered it, and a cold
 * deep link → forward → back then claimed a safe step back onto the external referrer.
 * `history.state` is per-entry, so the browser restores the earlier entry's answer on a back step
 * and a cold arrival simply has no mark.
 *
 * It is a mark and not a depth because it does not need to be a depth: the only question asked of
 * it is whether the entry behind this one is ours, which is true of every entry reached by an
 * in-app navigation and false of the first entry of a document.
 */

const MARK_KEY = "korzaFromApp";

type MarkedState = Record<string, unknown> & { [MARK_KEY]?: unknown };

const readState = () => window.history.state as MarkedState | null;

/** Whether the reader reached the current history entry by navigating inside the app. */
export function cameFromApp(): boolean {
  try {
    return readState()?.[MARK_KEY] === true;
  } catch {
    return false;
  }
}

/** Called on every in-app navigation, from the root layout. Marks the entry Next has just pushed.
 *  Spreads the existing state because Next keeps its own router keys there. */
export function markCameFromApp(): void {
  try {
    window.history.replaceState(
      { ...(readState() ?? {}), [MARK_KEY]: true },
      "",
    );
    window.dispatchEvent(new Event(DEPTH_EVENT));
  } catch {
    // A browser refusing replaceState just means every back link stays an ordinary link.
  }
}

/** The mark is written by `markCameFromApp`, a plain function call rather than anything React
 *  watches, so it announces itself. */
const DEPTH_EVENT = "korza:nav-mark-change";

/** `popstate` too: a back or forward step swaps in another entry's state without any code of ours
 *  running, and the answer can differ between entries. */
function subscribe(onChange: () => void) {
  window.addEventListener(DEPTH_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(DEPTH_EVENT, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

const canGoBackNow = () => cameFromApp();

/** There is no history to follow on the server, and the first client render has to agree with
 *  the HTML it hydrates, so both start at false and the store corrects it. */
const serverSnapshot = () => false;

export function BackLink({
  href,
  children,
  className = "w-fit font-mono text-xs text-ink-faint hover:text-accent",
  followHistory = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  /** Opt in to the history behaviour, for a link whose label names a return rather than a place.
   *  Off by default: `/skills` and `/tools` carry an up-link labelled "Home", and following
   *  history there lands the reader somewhere the label did not name. */
  followHistory?: boolean;
}) {
  const router = useRouter();
  // Via a store rather than state set in an effect: `history` does not exist on the server, so
  // `serverSnapshot` keeps the first render matching the HTML and React swaps in the real answer
  // on hydration.
  const canGoBack = useSyncExternalStore(
    subscribe,
    canGoBackNow,
    serverSnapshot,
  );

  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        // Let the browser handle anything that is not a plain left click: a modified click means
        // "open this somewhere else", and there the href is the whole point.
        if (
          !followHistory ||
          !canGoBack ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;

        event.preventDefault();
        router.back();
      }}
    >
      <NavArrow direction="left" /> {children}
    </Link>
  );
}
