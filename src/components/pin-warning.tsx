import type { VersionStatus } from "@/lib/catalogue-entries";

/** What the catalogue knows about an entry's supply chain, said plainly.
 *
 *  This used to be a sentence someone wrote by hand in `plugins.json`, and it went stale the
 *  moment a pin moved -- superpowers' claimed "one release behind" while the index said two.
 *  Derived from `versions` instead, which is measured against upstream every time the index is
 *  generated. It still ages between syncs; it can no longer disagree with the row beside it.
 */
export function PinWarning({ version }: { version: VersionStatus }) {
  const message = pinMessage(version);
  if (!message) return null;

  return (
    <p
      className="max-w-2xl text-sm leading-relaxed text-ink-muted"
      data-testid="pin-warning"
    >
      {message}
    </p>
  );
}

/** Exported for the tests, which assert the wording per state rather than per entry: the
 *  catalogue's own pins move, so asserting on superpowers would fail when someone re-pins it. */
export function pinMessage(version: VersionStatus): string | null {
  switch (version.state) {
    case "unpinned":
      return `Tracks ${version.pinned} rather than a release, so upstream commits reach your machine without review. Latest release is ${version.latest}.`;
    case "no-releases":
      // Distinct from "unpinned": upstream has cut nothing to pin to, so this is not a choice
      // anyone made here and re-pinning is not the fix.
      return `Tracks ${version.pinned}. Upstream has published no releases to pin to, so every commit reaches your machine without review.`;
    case "behind":
      return `Pinned to ${version.pinned}, ${version.behind} ${version.behind === 1 ? "release" : "releases"} behind ${version.latest}.`;
    case "current":
      return null;
  }
}
