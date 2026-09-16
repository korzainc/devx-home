/**
 * The current item's mark: 1px sitting exactly on the header's `border-b`, so that stretch of
 * the border reads as recoloured. Needs its parent `relative` and full-height.
 */
export function CurrentRule() {
  return (
    <span
      aria-hidden
      className="absolute -bottom-px left-0 h-px w-full bg-accent"
    />
  );
}
