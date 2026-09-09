import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SkillsDemoTerminal } from "@/components/skills-demo-terminal";
import { InstallPanel } from "@/components/install-panel";
import {
  GettingStartedNote,
  InstallPrerequisite,
} from "@/components/skills-install-notes";
import { getPlugin, installCommands } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Skills, before and after",
  description:
    "The same request run twice, once without a skill and once with one, then how to install the plugin that ships it.",
};

/** The plugin the demo shows, and the one whose install commands it prints. */
const DEMO_PLUGIN = "codezen";

export default function SkillsDemoPage() {
  const plugin = getPlugin(DEMO_PLUGIN);
  // The transcript names /brainstorm, which ships in this plugin. If the catalogue ever drops
  // the entry, a 404 is honest; printing install commands for a plugin we no longer list is not.
  if (!plugin) notFound();

  return (
    <div className="flex flex-col gap-10">
      <Link
        href="/skills-intro"
        className="w-fit font-mono text-xs text-ink-faint hover:text-accent"
      >
        ← Introduction to skills
      </Link>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">
          The same ask, twice
        </h1>
        <p className="max-w-2xl leading-relaxed text-ink-muted">
          Once without a skill, once with one. This is the real shape of the
          exchange: one question at a time, with the agent&rsquo;s own guess
          attached, so you correct it instead of writing the brief yourself.
        </p>
      </div>

      <SkillsDemoTerminal />

      {/* The same panel the detail pages use, so someone who arrives here and then opens a
          plugin meets one interaction rather than two. A tab per agent, two blocks each. */}
      <InstallPanel
        heading="Get it on your machine"
        tabs={installCommands(plugin).map((entry) => ({
          id: entry.agent,
          label: entry.agent,
          blocks: [
            {
              label: "Register once per machine",
              content: entry.register,
              name: `${entry.agent} register command`,
            },
            {
              label: "Install",
              content: entry.install,
              name: `${entry.agent} install command`,
            },
          ],
        }))}
        intro={<InstallPrerequisite />}
        footer={<GettingStartedNote />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/skills"
          className="rounded-lg border border-line-strong bg-accent-wash px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent"
        >
          Browse plugins
        </Link>
        <Link
          href="/skills-intro"
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-line-strong"
        >
          What&rsquo;s a skill?
        </Link>
      </div>
    </div>
  );
}
