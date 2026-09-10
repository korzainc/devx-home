// The first-run flag. Shared so the nudge and the intro pages cannot drift on the key.

export const INTRO_SEEN_KEY = "devx.skills.intro.dismissed";

/** Same-tab writes do not fire `storage`, so the setter announces itself. */
export const INTRO_SEEN_EVENT = "devx:skills-intro-dismissed";

export function isIntroSeen() {
  try {
    return window.localStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    // Blocked storage counts as seen: a nudge that cannot remember being closed returns
    // on every visit.
    return true;
  }
}

/** Never throws; a refused write just means the reader is greeted again next visit. */
export function markIntroSeen() {
  try {
    window.localStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {}
  window.dispatchEvent(new Event(INTRO_SEEN_EVENT));
}
