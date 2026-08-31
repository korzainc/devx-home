import { signInWithGitHub } from "@/lib/auth-actions";
import { castVote } from "@/lib/roadmap-actions";
import type { VoteDirection } from "@/lib/roadmap-discussion";

/* Only the arrow carries colour. Green for up and red for down reads at a glance, but a fully
   filled box would make every card shout in two directions at once and drown out the building and
   shipped chips, which are the states that actually mean something.

   What you already voted shows as a solid box instead, so the control doubles as the record of
   what you said. Pressing it again clears it. */

function boxClass(active: boolean, size: "sm" | "lg") {
  const pad = size === "lg" ? "px-3.5 py-2 text-base" : "px-2.5 py-1.5 text-sm";
  return `flex items-center gap-1.5 rounded-lg border font-mono transition-colors ${pad} ${
    active
      ? "border-line-strong bg-surface-raised font-medium text-ink"
      : "border-line bg-canvas text-ink-muted hover:border-line-strong hover:text-ink"
  }`;
}

function Arrow({ direction }: { direction: VoteDirection }) {
  return (
    <span
      aria-hidden
      className={direction === "up" ? "text-positive" : "text-accent"}
    >
      {direction === "up" ? "↑" : "↓"}
    </span>
  );
}

function Control({
  slug,
  direction,
  count,
  active,
  size,
}: {
  slug: string;
  direction: VoteDirection;
  count: number;
  active: boolean;
  size: "sm" | "lg";
}) {
  return (
    <form action={castVote}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        aria-pressed={active}
        aria-label={`Vote ${direction === "up" ? "for" : "against"} this (${count} so far)`}
        className={boxClass(active, size)}
      >
        <Arrow direction={direction} />
        {count}
      </button>
    </form>
  );
}

/* Signed out the counts still show, because the tally is worth reading even if you cannot add to
   it. The control stays a button and starts the sign-in, so it says where to go rather than just
   no, and `here` is where GitHub sends you back to. */
function SignedOutControl({
  direction,
  count,
  here,
  size,
}: {
  direction: VoteDirection;
  count: number;
  here: string;
  size: "sm" | "lg";
}) {
  return (
    <form action={signInWithGitHub}>
      <input type="hidden" name="next" value={here} />
      <button
        type="submit"
        aria-label={`Log in to vote ${direction === "up" ? "for" : "against"} this (${count} so far)`}
        className={boxClass(false, size)}
      >
        <Arrow direction={direction} />
        {count}
      </button>
    </form>
  );
}

export function VoteButtons({
  slug,
  up,
  down,
  yours,
  signedIn,
  here,
  size = "sm",
}: {
  slug: string;
  up: number;
  down: number;
  yours: VoteDirection | null;
  signedIn: boolean;
  /** Where GitHub returns a signed-out reader who presses one of these. */
  here: string;
  size?: "sm" | "lg";
}) {
  return (
    // z-10 lifts these clear of the stretched link that makes a whole card clickable.
    <span className="relative z-10 flex items-center gap-2">
      {signedIn ? (
        <>
          <Control
            slug={slug}
            direction="up"
            count={up}
            active={yours === "up"}
            size={size}
          />
          <Control
            slug={slug}
            direction="down"
            count={down}
            active={yours === "down"}
            size={size}
          />
        </>
      ) : (
        <>
          <SignedOutControl direction="up" count={up} here={here} size={size} />
          <SignedOutControl
            direction="down"
            count={down}
            here={here}
            size={size}
          />
        </>
      )}
    </span>
  );
}
