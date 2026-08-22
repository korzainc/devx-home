import type { Metadata } from "next";
import { getUpdates } from "@/lib/updates";

export const metadata: Metadata = {
  title: "Updates",
  description:
    "What the DevX team has shipped, newest first, and how to start using it.",
};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export default function UpdatesPage() {
  const updates = getUpdates();

  return (
    <div className="flex flex-col">
      {/* Same accent bloom the home page sections open with. `isolate` keeps the negative
          z-index behind the heading rather than behind the page background. */}
      <header className="relative isolate flex max-w-2xl flex-col gap-3 pb-10">
        <span
          aria-hidden
          className="absolute -top-10 -left-12 -z-10 h-36 w-96 rounded-full bg-accent/20 blur-3xl"
        />
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Updates
        </h1>
        <p className="text-lg leading-relaxed text-ink-muted">
          What the DevX team has shipped. Everything below is live now, so each
          entry says how to start using it.
        </p>
      </header>

      <ol className="flex flex-col">
        {updates.map((entry) => (
          <li
            key={entry.slug}
            id={entry.slug}
            // scroll-mt clears the sticky header when an anchor link lands here.
            className="grid scroll-mt-20 grid-cols-1 border-t border-dashed border-line sm:grid-cols-4"
          >
            <div className="pt-6 sm:pt-12">
              {/* Sticky so the date stays alongside the body of a long entry. top-20 clears the
                  sticky header rather than the viewport edge. */}
              <a
                href={`#${entry.slug}`}
                className="sticky top-20 block font-display font-medium tracking-tight text-ink hover:text-accent"
              >
                <time dateTime={entry.date}>
                  {dateFormat.format(new Date(entry.date))}
                </time>
              </a>
            </div>

            <div className="max-w-3xl pt-4 pb-10 sm:col-span-3 sm:border-l sm:border-dashed sm:border-line sm:pt-12 sm:pb-20 sm:pl-12">
              <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {entry.title}
              </h2>
              {/* The markdown is repo-authored and rendered at build time, so there is no untrusted
                  input on this path. */}
              <div
                className="prose-body mt-4"
                dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
