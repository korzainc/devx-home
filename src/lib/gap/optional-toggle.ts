// The one id both the checkbox (a plain server-rendered <input>, no JS attached) and the fix
// prompt button (a client component, reading it back via document.getElementById at click time)
// agree on, the same shape as skillCardId in skill-link.ts, minus the parameters, since there is
// exactly one checkbox on this page rather than one per item.
export const GAP_OPTIONAL_TOGGLE_ID = "gap-optional-toggle";
