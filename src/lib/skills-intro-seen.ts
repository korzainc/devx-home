/**
 * The one place the first-run flag is named and written. The nudge reads it to decide whether
 * to appear; the intro pages write it on arrival. Shared so the two cannot disagree about the
 * key, which is the whole contract between them.
 */

export const INTRO_SEEN_KEY = "devx.skills.intro.dismissed";

/** Same-tab writes do not fire `storage`, so the setter announces itself. */
export const INTRO_SEEN_EVENT = "devx:skills-intro-dismissed";

/** The one route with an overlay to reveal. The script below runs on all of them. */
export const INTRO_ROUTE = "/skills";

/**
 * Set on `<html>`, and the whole visibility contract. The stylesheet reveals the overlay and
 * locks body scroll under it, so both can happen before React exists.
 */
export const INTRO_UNSEEN_ATTR = "data-intro-unseen";

/**
 * Runs in the document head, before the first paint. The overlay is in the served HTML but
 * hidden by default, and this is what reveals it -- that way a client without JavaScript is
 * left with the catalogue rather than an overlay it has no way to close.
 *
 * Built from the constants above rather than written out, so a renamed key cannot leave the
 * script reading one name while the rest of the app writes another.
 */
export const PRE_PAINT_SCRIPT = `try{if(location.pathname===${JSON.stringify(
  INTRO_ROUTE,
)}&&localStorage.getItem(${JSON.stringify(
  INTRO_SEEN_KEY,
)})!=="1")document.documentElement.setAttribute(${JSON.stringify(
  INTRO_UNSEEN_ATTR,
)},"")}catch(e){}`;

export function showIntro() {
  document.documentElement.setAttribute(INTRO_UNSEEN_ATTR, "");
}

export function hideIntro() {
  document.documentElement.removeAttribute(INTRO_UNSEEN_ATTR);
}

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
  // Before the event, so the overlay goes on the same frame as the click rather than waiting
  // for React to hear about it and re-render.
  hideIntro();
  window.dispatchEvent(new Event(INTRO_SEEN_EVENT));
}
