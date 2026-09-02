/**
 * How a link to one skill reaches the plugin page that ships it.
 *
 * A skill card on /skills links to `/skills/<plugin>#<skill name>`, so the skill you clicked
 * only ever exists in the URL fragment. That is client state by construction: it is never sent
 * to the server, so nothing prerendered can read it.
 */

/** The fragment, decoded, or "" when there is none. */
export const readHash = () => {
  const raw = window.location.hash.slice(1);
  // A hand-typed "#%" is not valid encoding. Decoding throws during render, which takes the
  // whole page down rather than failing to find one skill.
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/**
 * The strip renders above the install fold and the skill list below it, with a server component
 * between them, so they cannot share React state and cannot be given a common provider without
 * dragging the whole page into a client boundary. A DOM event carries the one thing that has to
 * cross: "reveal this skill". Same mechanism the grid already uses to announce a cleared hash.
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
