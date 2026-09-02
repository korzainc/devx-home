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

export function skillLink(plugin: string, name: string) {
  return `/skills/${plugin}?${SKILL_PARAM}=${name}`;
}

/** The skill the page was opened for, or "" when it was opened directly. */
export const readOpenedSkill = () =>
  new URLSearchParams(window.location.search).get(SKILL_PARAM) ?? "";

/** Back and forward are the only things that change the query without a remount. */
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
