/**
 * How a link to one skill reaches the plugin page that ships it.
 *
 * The query string, not the fragment: a fragment is a scroll instruction to a browser, and the
 * plugin page server-renders its first cards below the install panel.
 */

const SKILL_PARAM = "skill";

/** Encoded because the index is generated from third-party repos; the name is upstream's. */
export function skillLink(plugin: string, name: string) {
  return `/skills/${plugin}?${SKILL_PARAM}=${encodeURIComponent(name)}`;
}

export const readOpenedSkill = () =>
  new URLSearchParams(window.location.search).get(SKILL_PARAM) ?? "";

/**
 * Back and forward only. A query-only navigation within this route does not re-render at all in
 * 16.3.1 — the static tree is reused across search values — so this reader goes stale the day a
 * link here points at its own pathname. Nothing does today; the fix then is `useSearchParams`
 * inside a `<Suspense>`. Leaving and returning is fine: Activity remounts effects.
 */
export function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

/** A server component sits between the strip and the list, so an event is what can cross. */
const SKILL_FOCUS_EVENT = "korza:skill-focus";

/** Ties the strip's control to the list, for `aria-controls`. */
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
