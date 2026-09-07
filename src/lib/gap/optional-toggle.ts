// The one id both the checkbox (a plain server-rendered <input>, no JS attached) and the fix
// prompt button (a client component, reading it back via document.getElementById at click time)
// agree on, the same shape as skillCardId in skill-link.ts, minus the parameters, since there is
// exactly one checkbox on this page rather than one per item.
export const GAP_OPTIONAL_TOGGLE_ID = "gap-optional-toggle";

// Ids for the content the checkbox's aria-controls points at, stamped onto the same elements the
// CSS reveal already targets via `.gap-optional-row`. Kept as functions, not a shared constant,
// since there are many of these (one per optional row, one per all-optional section) rather than
// one shared id.
export function optionalRowId(capabilityId: string): string {
  return `gap-optional-${capabilityId}`;
}

export function optionalSectionId(category: string): string {
  return `gap-optional-section-${category.toLowerCase().replace(/\s+/g, "-")}`;
}
