import type { Metadata } from "next";
import Image from "next/image";
import korzaLogo from "@/assets/korza-logo.png";
import { Octocat } from "@/components/octocat";
import { signInWithGitHub } from "@/lib/auth-actions";

export const metadata: Metadata = {
  title: "Log in",
  description:
    "Log in to Korza DevX with your GitHub account. The gap analysis reads repositories with your own access.",
};

const comingSoon = ["GitLab", "Azure DevOps"];

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-7 py-10 text-center">
      {/* Not `priority`: the header renders this same file at the same width on every page, so
          the request is already in flight before this one mounts. */}
      <Image
        src={korzaLogo}
        alt="Korza"
        width={128}
        height={40}
        className="h-7 w-auto invert dark:invert-0"
      />

      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        Log in to Korza DevX
      </h1>

      <div className="flex w-full flex-col gap-3">
        <form action={signInWithGitHub}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-surface-raised px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
          >
            <Octocat className="h-[18px] w-[18px]" />
            Continue with GitHub
          </button>
        </form>

        {/* Not buttons. A disabled button still reads as something that will work later in the
            same place, and these will each need their own OAuth app before they can. */}
        {comingSoon.map((provider) => (
          <div
            key={provider}
            className="flex w-full items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 text-sm font-medium text-ink-faint"
          >
            <span>Continue with {provider}</span>
            <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-normal">
              Coming soon
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-ink-faint">
        Korza DevX reads repositories with your own access. It asks for contents
        and metadata, read only.
      </p>
    </div>
  );
}
