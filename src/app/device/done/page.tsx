import type { Metadata } from "next";

type Params = {
  searchParams: Promise<{ outcome?: string }>;
};

export async function generateMetadata({
  searchParams,
}: Params): Promise<Metadata> {
  const { outcome } = await searchParams;
  if (outcome === "approved") return { title: "CLI sign-in approved" };
  if (outcome === "denied") return { title: "CLI sign-in denied" };
  return { title: "Nothing to confirm" };
}

// Reads searchParams, so it can't be prerendered.
export const instant = false;

/**
 * `outcome` is checked for "approved" explicitly, not inferred as "not denied" - a missing
 * or forged query param must land on a neutral state, never the copy a real approval gets.
 */
export default async function DeviceDonePage({ searchParams }: Params) {
  const { outcome } = await searchParams;
  const approved = outcome === "approved";
  const denied = outcome === "denied";

  const title = approved
    ? "Approved"
    : denied
      ? "Denied"
      : "Nothing to confirm";
  const body = approved
    ? "Return to your terminal."
    : denied
      ? "The request was denied. If you meant to approve it, run the CLI command again to get a new code."
      : "There's no sign-in request to confirm here.";

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-7 py-10 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        {title}
      </h1>
      <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}
