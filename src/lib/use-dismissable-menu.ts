"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * A ref for a `details` used as a menu, which shuts on the three things that should shut a menu:
 * a click outside it, Escape, and a navigation.
 *
 * A bare `details` does none of them. It closes only by clicking its own summary a second time,
 * so the avatar menu stayed open over the page while the reader clicked around behind it.
 *
 * The navigation case is separate: the header lives in the root layout, so a client side
 * navigation never remounts it and an open menu would still be sitting over the page you just
 * moved to.
 */
export function useDismissableMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;

    // `pointerdown`, not `click`: dismissing on the way down means the click itself still lands
    // on whatever was underneath, so leaving the menu and pressing a link is one press rather
    // than two. It also covers touch without waiting for the synthesised mouse event.
    const onPointerDown = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) menu.open = false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Read before closing: the panel holding focus is about to be hidden, and focus left on a
      // hidden element strands the keyboard at the top of the page.
      const held = menu.contains(document.activeElement);
      menu.open = false;
      if (held) menu.querySelector("summary")?.focus();
    };

    // Bound while open only, off the element's own state, so a closed header costs no document
    // listeners. `toggle` fires for the summary, for Escape and for the writes above alike.
    const onToggle = () => {
      if (menu.open) {
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
      } else {
        document.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      }
    };

    menu.addEventListener("toggle", onToggle);
    return () => {
      menu.removeEventListener("toggle", onToggle);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return ref;
}
