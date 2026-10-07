import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Approve CLI sign-in",
};

export default function DeviceDonePage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-7 py-10 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        Done
      </h1>
      <p className="text-sm leading-relaxed text-ink-muted">
        Return to your terminal.
      </p>
    </div>
  );
}
