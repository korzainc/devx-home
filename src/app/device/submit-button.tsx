"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Disables itself while its form's server action is in flight, so a double-click can't send a
 *  second submission that races the first - e.g. a second Approve landing after the first already
 *  consumed the claim, surfacing a confusing error for a login that actually succeeded. */
export function SubmitButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {children}
    </button>
  );
}
