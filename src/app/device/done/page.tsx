import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Approve CLI sign-in",
};

export default async function DeviceDonePage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string }>;
}) {
  const { outcome } = await searchParams;
  const denied = outcome === "denied";

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-7 py-10 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        {denied ? "Denied" : "Approved"}
      </h1>
      <p className="text-sm leading-relaxed text-ink-muted">
        {denied
          ? "If this wasn't you, nothing happened - no need to do anything else."
          : "Return to your terminal."}
      </p>
    </div>
  );
}
