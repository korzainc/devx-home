/**
 * The header's link styles: `row` for the wide bar, `panel` for a dropdown or the narrow menu.
 * Both step weight as well as contrast, so the current page never rides on colour alone.
 *
 * No `"use client"`: the server-rendered login and sign-out controls need these too, and the
 * server cannot call a client module's exports.
 */
const styles = {
  row: {
    // Full height and `relative`, for the current item's rule.
    base: "relative flex h-full items-center text-sm whitespace-nowrap transition-colors",
    idle: "text-ink-muted hover:text-ink",
    current: "font-medium text-ink",
  },
  panel: {
    // `min-h-11` is 44px: these rows are thumb-tapped, and `py-2` on 14px text leaves them 36px.
    base: "flex min-h-11 items-center rounded-md px-2.5 py-2 text-sm whitespace-nowrap transition-colors",
    idle: "text-ink-muted hover:bg-surface hover:text-ink",
    // The plate is the one hover already draws, held on.
    current: "bg-surface font-medium text-ink",
  },
} as const;

export type NavLinkShape = keyof typeof styles;

/** The class list for a header link, for the cases that are not the `NavLink` component. */
export function navLinkClass(shape: NavLinkShape, current = false) {
  const style = styles[shape];
  return `${style.base} ${current ? style.current : style.idle}`;
}
