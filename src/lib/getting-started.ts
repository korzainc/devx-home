/**
 * Content for the Getting Started page: the words and the commands, kept out of the markup so a
 * step changes here rather than in a component.
 *
 * The page follows the setup PRD: one command leads, the manual path sits below it, and the
 * manual path is what works today until the binary ships.
 */

/** The six stages the installer runs, in order. Shared by the inert rail and the stage player. */
export const stages = [
  "Detect",
  "Select",
  "Confirm",
  "Execute",
  "Verify",
  "Summary",
] as const;

/** What the installer does, in order. Five lines, not six stages: this is the promise, not the UI. */
export const walkthrough: { does: string; detail: string }[] = [
  { does: "Checks your machine", detail: "Nothing changes yet." },
  {
    does: "Asks two things, once",
    detail:
      "Permission to change your machine, and a browser sign in for GitHub and Claude.",
  },
  {
    does: "Installs what is missing",
    detail: "Skips anything already there.",
  },
  {
    does: "Proves each tool works",
    detail: "Runs a real command, not a file check.",
  },
  { does: "Shows you what changed", detail: "And what to try next." },
];

/** The manual path, as a list of what each tool is for. Same order as the commands below. */
export const manualTools: { tool: string; why: string }[] = [
  { tool: "Xcode tools", why: "required by Homebrew" },
  { tool: "homebrew", why: "installs everything below" },
  { tool: "git", why: "name and email, from your GitHub account" },
  { tool: "gh", why: "sign in, and an SSH key" },
  { tool: "claude", why: "sign in, and the Korza marketplace" },
  { tool: "docker", why: "needed by codezen's TDD skill" },
];

/** The commands themselves, one disclosure per tool. Closed by default. */
export const manualCommands: {
  title: string;
  commands: string[];
  note: string;
}[] = [
  {
    title: "Xcode Command Line Tools",
    commands: ["xcode-select --install"],
    note: "Homebrew will not install without these. On a new Mac this is always the first thing missing.",
  },
  {
    title: "Homebrew",
    commands: [
      '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    ],
    note: "Then follow the two lines it prints at the end, which put brew on your PATH.",
  },
  {
    title: "Git",
    commands: [
      "brew install git",
      'git config --global user.name "Your Name"',
      'git config --global user.email "you@korza.ai"',
    ],
    note: "If you sign in to GitHub first, both of those values are already on your account and you can copy them from there.",
  },
  {
    title: "GitHub CLI, and an SSH key",
    commands: ["brew install gh", "gh auth login", "gh auth status"],
    note: "Choose SSH when it asks, and let it generate a key for you. The last command should say you are signed in.",
  },
  {
    title: "Claude Code, and the Korza marketplace",
    commands: [
      "brew install --cask claude-code",
      "claude plugin marketplace add korzainc/marketplace",
      "claude plugin install codezen@korza-marketplace",
    ],
    note: "Run claude once first to sign in. The marketplace repo is private, so the last two only work once your GitHub account is in the Korza org. If it fails there, that is an access request, not a broken machine.",
  },
  {
    title: "Docker",
    commands: ["brew install --cask docker", "open -a Docker"],
    note: "Docker takes a few seconds to come up, and asks for your password the first time. Once the menu bar icon settles, docker info should print without an error. Only needed for codezen's TDD skill, which will not run without it.",
  },
];

export const faq: { q: string; a: string }[] = [
  {
    q: "What does it change on my machine?",
    a: "One block in ~/.zshrc, clearly marked. Nothing else in that file is touched, and devx setup --remove deletes it.",
  },
  {
    q: "Can I run it more than once?",
    a: "Yes. On a machine that is already set up it reports there is nothing to do, and changes nothing.",
  },
  {
    q: "What happens if a step fails?",
    a: "The independent steps still run. The summary names the step that failed, the reason, and what to try next.",
  },
  {
    q: "It is not letting me in, is that my machine?",
    a: "Not always. Some blockers are access, not software, for example not yet being in the Korza GitHub org. Ask in #devx rather than retrying.",
  },
  {
    q: "I already have some of these tools installed.",
    a: "They are skipped by default. Reinstalling one is an explicit choice, not automatic.",
  },
  {
    q: "My laptop is managed and I do not have admin rights.",
    a: "Different from an access block, this one is the device itself. Steps that need elevation are named as blocked and skipped. The ones that do not need it still run.",
  },
  {
    q: "When am I actually done?",
    a: "Not when six tools show a checkmark. You are done when you can finish the first real task, for example installing the Korza Marketplace plugins.",
  },
];
