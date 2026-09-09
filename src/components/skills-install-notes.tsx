import Link from "next/link";

/**
 * The two notes the onboarding demo hangs off its install panel. They live here rather than
 * inline on the page so a test can render the same thing the page does: asserted inline, a test
 * only proves that a sentence passed to a prop appears, which stays green after the sentence is
 * deleted from the page.
 */

/** Every command on that page assumes an agent is already installed, and none of them say so. */
export function InstallPrerequisite() {
  return (
    <p>
      <span aria-hidden="true" className="text-accent">
        *
      </span>{" "}
      Claude Code or Codex CLI has to be on your machine already.
    </p>
  );
}

/**
 * For a reader with nothing set up. The label stays honest about where it goes: `/getting-started`
 * arrives with #39, and until then this points at the home page, so it must not promise a guide.
 */
export function GettingStartedNote() {
  return (
    <p>
      New to all this?{" "}
      <Link
        href="/"
        className="text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink"
      >
        Start from the DevX home page
      </Link>
      .
    </p>
  );
}
