// The id the server-rendered checkbox and the client-side fix-prompt button both key off of:
// the button reads it back via document.getElementById at click time. One shared id is enough
// since this page has exactly one checkbox, unlike skillCardId in skill-link.ts which needs one
// per item.
export const GAP_OPTIONAL_TOGGLE_ID = "gap-optional-toggle";

// Ids for the elements the checkbox's aria-controls points at, matching what the CSS reveal
// already targets via `.gap-optional-row`. Functions instead of a shared constant, since there's
// one of these per optional row and per all-optional section, not a single shared id.
export function optionalRowId(capabilityId: string): string {
  return `gap-optional-${capabilityId}`;
}

export function optionalSectionId(category: string): string {
  return `gap-optional-section-${category.toLowerCase().replace(/\s+/g, "-")}`;
}
