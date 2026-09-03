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

export const readOpenedSkill = () => {
  const fromQuery = new URLSearchParams(window.location.search).get(
    SKILL_PARAM,
  );
  if (fromQuery) return fromQuery;
  // Links the app handed out before the query string existed. Card ids are plugin-qualified
  // now, so a fragment no longer even finds a native anchor target.
  const raw = window.location.hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

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

// Qualified by plugin: Activity keeps the page you came from in the same document, so an
// unqualified id resolves into a `display:none` tree and the jump silently does nothing.
export const skillListId = (plugin: string) => `skills-in-${plugin}`;
export const skillCardId = (plugin: string, name: string) =>
  `${plugin}--${name}`;

export function focusSkill(name: string) {
  window.dispatchEvent(new CustomEvent(SKILL_FOCUS_EVENT, { detail: name }));
}

export function subscribeToSkillFocus(onFocus: (name: string) => void) {
  const handle = (event: Event) =>
    onFocus((event as CustomEvent<string>).detail);
  window.addEventListener(SKILL_FOCUS_EVENT, handle);
  return () => window.removeEventListener(SKILL_FOCUS_EVENT, handle);
}
