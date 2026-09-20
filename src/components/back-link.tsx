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
 * When the reader actually arrived from inside the app, going back to the parent is the wrong
 * move — it drops them at the top of a section they were already several steps into. DX-162: on
 * `/tools/biome` the link always returned to `/tools` even for a reader who came from the gap
 * report, whose own place was that report. So a click follows history instead, but only when the
 * previous entry is one of ours.
 *
 * "One of ours" is decided by a counter this app owns rather than by `document.referrer`, which a
 * SPA navigation never updates, and rather than by `history.length`, which counts entries from
 * before the tab reached this site. The counter starts at 0 on a fresh document and only a
 * navigation made inside the app raises it, so a positive value means the step back lands on a
 * page of ours. Anyone arriving by deep link, bookmark or an external referrer has 0 and gets the
 * href, which is why the fallback has to stay a real link.
 */

const DEPTH_KEY = "korza:nav-depth";

/** Read as a number, tolerating the key being absent, unparseable or unreadable: Safari throws on
 *  sessionStorage in a private window rather than returning null. */
export function navDepth(): number {
  try {
    const raw = window.sessionStorage.getItem(DEPTH_KEY);
    const depth = Number(raw);
    return Number.isFinite(depth) && depth > 0 ? depth : 0;
  } catch {
    return 0;
  }
}

/** Called on every in-app navigation, from the root layout. */
export function recordNavDepth(): void {
  try {
    window.sessionStorage.setItem(DEPTH_KEY, String(navDepth() + 1));
    window.dispatchEvent(new Event(DEPTH_EVENT));
  } catch {
    // A browser refusing storage just means every back link stays an ordinary link.
  }
}

/** The counter changes through `recordNavDepth`, which is a plain function call rather than
 *  anything React watches, so it announces itself. */
const DEPTH_EVENT = "korza:nav-depth-change";

function subscribe(onChange: () => void) {
  window.addEventListener(DEPTH_EVENT, onChange);
  return () => window.removeEventListener(DEPTH_EVENT, onChange);
}

const canGoBackNow = () => navDepth() > 0;

/** There is no history to follow on the server, and the first client render has to agree with
 *  the HTML it hydrates, so both start at false and the store corrects it. */
const serverSnapshot = () => false;

export function BackLink({
  href,
  children,
  className = "w-fit font-mono text-xs text-ink-faint hover:text-accent",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  // Via a store rather than state set in an effect: sessionStorage does not exist on the server,
  // so `serverSnapshot` keeps the first render matching the HTML and React swaps in the real
  // answer on hydration.
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
