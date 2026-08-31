import { Octocat } from "@/components/octocat";
import { signInWithGitHub } from "@/lib/auth-actions";
import { deleteComment, postComment } from "@/lib/roadmap-actions";
import type { EntryComment } from "@/lib/roadmap-discussion";

const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

function ago(at: Date): string {
  const seconds = Math.round((at.getTime() - Date.now()) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  if (Math.abs(seconds) < 60) return relative.format(seconds, "second");
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  if (Math.abs(days) < 30) return relative.format(days, "day");
  return relative.format(Math.round(days / 30), "month");
}

function Composer({ slug }: { slug: string }) {
  return (
    <form action={postComment} className="flex flex-col items-start gap-3">
      <input type="hidden" name="slug" value={slug} />
      {/* The global :focus-visible ring is accent red, which on a box this size reads as an error
          rather than focus. Overridden here only, so the rest of the site keeps its ring. */}
      <textarea
        name="body"
        rows={3}
        required
        maxLength={2000}
        placeholder="Add a comment"
        aria-label="Add a comment"
        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-line-strong"
      />
      <button
        type="submit"
        className="rounded-lg border border-line-strong bg-surface-raised px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
      >
        Post
      </button>
    </form>
  );
}

/* The composer is replaced rather than shown disabled. A greyed-out box is still a dead end, and
   it reads as broken to anyone who misses the caption. The thread underneath stays readable, so
   nothing is hidden behind the login, only writing is. */
function SignedOutPanel({ here }: { here: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface px-4 py-4">
      <p className="text-sm text-ink-muted">
        Comments are signed, so the argument has a name against it. Log in to
        join this one.
      </p>
      <form action={signInWithGitHub}>
        <input type="hidden" name="next" value={here} />
        <button
          type="submit"
          className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface-raised px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
        >
          <Octocat className="h-4 w-4" />
          Log in to comment
        </button>
      </form>
    </div>
  );
}

export function RoadmapComments({
  slug,
  here,
  viewerId,
  comments,
}: {
  slug: string;
  here: string;
  viewerId: string | null;
  comments: EntryComment[];
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-8">
      {/* A plain label. A heading that asks something steers the thread, and the entry's own open
          question is already answered further up the page on its own terms. */}
      <h2 className="text-sm font-medium text-ink">Comments</h2>

      {viewerId ? <Composer slug={slug} /> : <SignedOutPanel here={here} />}

      {comments.length === 0 ? (
        <p className="text-sm text-ink-faint">No comments yet.</p>
      ) : (
        <div className="flex flex-col">
          {comments.map((comment) => (
            <article
              key={comment.id}
              className="flex flex-col gap-1.5 border-t border-line py-4"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-ink">
                  {comment.author}
                </span>
                <time
                  dateTime={comment.at.toISOString()}
                  className="font-mono text-xs text-ink-faint"
                >
                  {ago(comment.at)}
                </time>
                {comment.authorId === viewerId ? (
                  <form action={deleteComment} className="ml-auto">
                    <input type="hidden" name="id" value={comment.id} />
                    <button
                      type="submit"
                      className="text-xs text-ink-faint transition-colors hover:text-accent"
                    >
                      Delete
                    </button>
                  </form>
                ) : null}
              </div>
              {/* Plain text, rendered as text. Markdown here would be one more thing to sanitise
                  for the sake of bold in a two line reply. */}
              <p className="text-sm leading-relaxed whitespace-pre-line text-ink-muted">
                {comment.body}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
