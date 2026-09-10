/**
 * The one place the first-run flag is named and written. The nudge reads it to decide whether
 * to appear; the intro pages write it on arrival. Shared so the two cannot disagree about the
 * key, which is the whole contract between them.
 */

export const INTRO_SEEN_KEY = "devx.skills.intro.dismissed";

/** Same-tab writes do not fire `storage`, so the setter announces itself. */
export const INTRO_SEEN_EVENT = "devx:skills-intro-dismissed";

export function isIntroSeen() {
  try {
    return window.localStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    // Storage can be blocked outright. Treat that as seen: a nudge that cannot remember being
    // closed would return on every visit, which is worse than never appearing.
    return true;
  }
}

/**
 * Records the flag and tells this tab. Never throws: a full quota or a browser refusing writes
 * must not take down the caller, and the honest outcome is that the reader is greeted again
 * next visit.
 */
export function markIntroSeen() {
  try {
    window.localStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    // Nothing to recover: the flag simply does not persist.
  }
  window.dispatchEvent(new Event(INTRO_SEEN_EVENT));
}
