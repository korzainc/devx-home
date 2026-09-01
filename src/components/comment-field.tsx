"use client";

// `<textarea>` has no `pattern` attribute, so unlike the repository inputs this can't reject
// whitespace-only input declaratively. `setCustomValidity` is the equivalent: it blocks
// submission and shows the browser's own validation bubble instead of posting nothing.
export function CommentField() {
  return (
    <textarea
      name="body"
      rows={3}
      required
      maxLength={2000}
      placeholder="Add a comment"
      aria-label="Add a comment"
      onInput={(event) => {
        const value = event.currentTarget.value;
        event.currentTarget.setCustomValidity(
          value.trim() ? "" : "A comment needs more than whitespace.",
        );
      }}
      // The global :focus-visible ring is accent red, which on a box this size reads as an error
      // rather than focus. Overridden here only, so the rest of the site keeps its ring.
      className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-line-strong"
    />
  );
}
