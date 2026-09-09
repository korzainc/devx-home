"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/** One multi-select filter axis, whether it is drawn as a chip row or hidden behind a menu.
 *  `param` is both the query-string key and the key this hook stores selections under. */
export type FilterAxis = {
  param: string;
  /** Every value the axis can legitimately hold. Anything else arriving from the URL is dropped
   *  rather than filtered on. */
  valid: string[];
};

/**
 * Query text plus the selections for every filter axis a catalogue page has, kept in the URL so a
 * filtered view can be linked to.
 *
 * Axes are read once, on the first render. They describe the page, not its state, so a page that
 * derives its options from live data should hand in the same list every time.
 */
export function useCatalogueFilters({
  axes,
  initial = {},
  sync = true,
}: {
  axes: FilterAxis[];
  /** Straight off the query string, so unlike every later change these are not values this hook
   *  produced. */
  initial?: Record<string, string[]>;
  /**
   * Whether selections are written back to the URL. Off for a panel that shares the page with
   * another catalogue: two mounted panels owning the same param would each strip the other's
   * value on every click. The panel that a link is worth pointing at keeps the sync.
   */
  sync?: boolean;
}) {
  const [query, setQuery] = useState("");

  // Anything that is not a real value is dropped at mount rather than filtered on: a typo would
  // otherwise narrow the grid while lighting up no control to explain why, and a value carrying
  // an `&` would round-trip out of the effect below as a second, forged query key.
  const [picked, setPicked] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      axes.map((axis) => [
        axis.param,
        (initial[axis.param] ?? []).filter((value) =>
          axis.valid.includes(value),
        ),
      ]),
    ),
  );

  // Captured once. The effect needs the params of axes that are currently empty too, so it can
  // clear them from the URL, and reading them off `axes` every render would make the effect fire
  // on an identity change the caller did not intend.
  const params = useRef(axes.map((axis) => axis.param));

  const router = useRouter();
  const pathname = usePathname();
  // Skip the first run: the URL already matches `initial`, that being where it came from, so
  // replacing on mount would be a same-value no-op navigation for no reason.
  const mounted = useRef(false);

  useEffect(() => {
    if (!sync) return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    // Only the keys this hook owns are rewritten. Anything else already on the URL, a utm tag or
    // whatever a shared link carried, is carried through: a filter click should not quietly strip
    // the rest of someone's address bar. Read off `location` rather than useSearchParams, since
    // a catalogue also renders as its own Suspense fallback, where that hook would opt the
    // prerendered shell out of static rendering.
    const others = new URLSearchParams(window.location.search);
    for (const param of params.current) others.delete(param);
    // Ours are built by hand rather than through URLSearchParams, which would percent-encode the
    // comma separator and show %2C in the address bar instead of a readable list. Safe to
    // concatenate because every value was checked against the real ones at mount.
    const parts = params.current
      .filter((param) => picked[param]?.length)
      .map((param) => `${param}=${picked[param].join(",")}`);
    const rest = others.toString();
    if (rest) parts.push(rest);
    const search = parts.join("&");
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
  }, [picked, pathname, router, sync]);

  function toggle(param: string, value: string) {
    setPicked((previous) => {
      const current = previous[param] ?? [];
      return {
        ...previous,
        [param]: current.includes(value)
          ? current.filter((entry) => entry !== value)
          : [...current, value],
      };
    });
  }

  // Read off `picked` rather than the ref of axis params: the two hold the same keys, since
  // `picked` is seeded from the axes and only ever gains one through `toggle`.
  const filtering =
    query.trim().length > 0 ||
    Object.values(picked).some((values) => values.length > 0);

  return {
    query,
    setQuery,
    picked,
    /** Never undefined, so a caller can pass it straight to a control. */
    pickedFor: (param: string) => picked[param] ?? [],
    toggle,
    filtering,
  };
}
