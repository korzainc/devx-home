/**
 * How a link to one skill reaches the plugin page that ships it.
 *
 * The skill you clicked travels in the query string, not the fragment. A fragment is not data
 * to a browser, it is a scroll instruction: the plugin page server-renders the first five cards
 * below the install panel, so `#<name>` made the page land at the bottom before any JavaScript
 * ran, and nothing on the page could opt out of it. A query string carries the same value with
 * no scroll semantics attached.
 */

/** Shared so the link builder and the reader below cannot drift apart. */
const SKILL_PARAM = "skill";

// Encoded, even though all 57 names in the index are slug-safe today: the index is generated
// from third-party repositories, so a name is upstream's to choose. An unencoded `&` would
// truncate the value and an unencoded space would break the link outright.
export function skillLink(plugin: string, name: string) {
  return `/skills/${plugin}?${SKILL_PARAM}=${encodeURIComponent(name)}`;
}

/** The skill the page was opened for, or "" when it was opened directly. */
export const readOpenedSkill = () =>
  new URLSearchParams(window.location.search).get(SKILL_PARAM) ?? "";

/**
 * Covers back and forward, which change the query with no re-render.
 *
 * It does NOT cover a query-only navigation within this same route, and nothing here can: this
 * route is prerendered, and `segment-cache/vary-path.js` in the bundled runtime reuses a static
 * tree "across all possible search param values", so React re-renders nothing and the snapshot
 * is never re-read. Measured in a minimal 16.3.1 app: render count unchanged, this reader stale,
 * `useSearchParams` correct.
 *
 * Reachable only once some link on the plugin page points at its own pathname — a "next skill"
 * control, say. Nothing does today. The fix at that point is `useSearchParams` inside a
 * `<Suspense>` boundary, which keeps the route static; see the PR for the measurement.
 *
 * Leaving and coming back is fine and is the path users actually take: Next hides the old page
 * with `<Activity>` rather than unmounting it, and showing it again remounts effects, so the
 * store is re-read.
 */
export function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

/**
 * The strip renders above the install fold and the skill list below it, with a server component
 * between them, so they cannot share React state and cannot be given a common provider without
 * dragging the whole page into a client boundary. A DOM event carries the one thing that has to
 * cross: "reveal this skill".
 */
const SKILL_FOCUS_EVENT = "korza:skill-focus";

/** Ties the strip's control to the list it expands, for `aria-controls`. */
export const SKILL_LIST_ID = "skills-in-this-plugin";

export function focusSkill(name: string) {
  window.dispatchEvent(new CustomEvent(SKILL_FOCUS_EVENT, { detail: name }));
}

export function subscribeToSkillFocus(onFocus: (name: string) => void) {
  const handle = (event: Event) =>
    onFocus((event as CustomEvent<string>).detail);
  window.addEventListener(SKILL_FOCUS_EVENT, handle);
  return () => window.removeEventListener(SKILL_FOCUS_EVENT, handle);
}
