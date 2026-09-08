/**
 * Content for the Getting Started page: the words and the commands, kept out of the markup so a
 * step changes here rather than in a component.
 *
 * The page follows the setup PRD: one command installs devx, then devx setup
 * leads the guided flow. The manual path remains available below.
 */

/** What the installer does, in order. Five lines, not six stages: this is the promise, not the UI. */
export const walkthrough: { does: string; detail: string }[] = [
  { does: "Checks your machine", detail: "Nothing changes yet." },
  {
    does: "Pauses when you are needed",
    detail:
      "For browser sign-in, an administrator password, or a secure SSH confirmation.",
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

/**
 * The manual path, as a list of what each tool is for. The page pairs these with the commands
 * below by index (`manualTools[i]` labels `manualCommands[i]`), so a row added to one and not
 * the other would mislabel every row after it. A test checks each rendered label's commands.
 */
export const manualTools: { tool: string; why: string }[] = [
  {
    tool: "Xcode tools",
    why: "ships Apple's own git, no install step needed after",
  },
  { tool: "git", why: "name and email, from your GitHub account" },
  { tool: "gh", why: "user-space install, sign in over HTTPS" },
  {
    tool: "SSH access",
    why: "sets up SSH access by default; HTTPS remains independent",
  },
  {
    tool: "claude",
    why: "install, sign in, then the Korza marketplace (four plugins)",
  },
  { tool: "homebrew", why: "optional, nothing above needs it" },
  { tool: "Python (uv)", why: "optional, a uv-managed Python" },
  { tool: "Node (fnm)", why: "optional, an fnm-managed Node LTS" },
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
    note: "This is the only step git needs. Apple ships its own git with these tools; there is no separate git install.",
  },
  {
    title: "Git",
    commands: [
      'git config --global user.name "Your Name"',
      'git config --global user.email "you@korza.ai"',
    ],
    note: "If you sign in to GitHub first, both of those values are already on your account and you can copy them from there.",
  },
  {
    title: "GitHub CLI",
    commands: [
      "gh auth login --hostname github.com --git-protocol https --web",
      "gh auth setup-git --hostname github.com",
    ],
    note: "HTTPS, not SSH: everything devx installs clones over HTTPS, so an SSH key would authorize git@github.com without unlocking anything here. Install gh itself from https://github.com/cli/cli#installation, whichever way you prefer, Homebrew included.",
  },
  {
    title: "SSH access",
    commands: [
      'ssh-keygen -t ed25519 -C "you@korza.ai"',
      "gh auth refresh --hostname github.com --scopes write:public_key",
      'gh ssh-key add ~/.ssh/id_ed25519.pub --title "$(hostname)"',
      "ssh -T git@github.com",
    ],
    note: 'devx configures GitHub HTTPS credentials and sets up SSH access by default. HTTPS remains independent, while the SSH key enables git@github.com remotes. Reuse an existing key instead of the first command if you already have one. The permission step opens GitHub to authorize uploading your public key. The last command should print a fingerprint prompt the first time, then "successfully authenticated".',
  },
  {
    title: "Claude Code, and the Korza marketplace",
    commands: [
      "curl -fsSL https://claude.ai/install.sh | bash",
      "claude plugin marketplace add korzainc/marketplace",
      "claude plugin install codezen@korza-marketplace",
      "claude plugin install superpowers@korza-marketplace",
      "claude plugin install mattpocock-skills@korza-marketplace",
      "claude plugin install humanizer@korza-marketplace",
    ],
    note: "The first line is the official installer, the same one devx runs. If you would rather go through npm, npm install -g @anthropic-ai/claude-code is devx's own fallback, and https://docs.claude.com/en/docs/claude-code/setup covers both routes. Run claude once after installing to sign in. The marketplace repo is private, so the plugin installs only work once your GitHub account is in the Korza org. If it fails there, that is an access request, not a broken machine.",
  },
  {
    title: "Homebrew",
    commands: [
      '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    ],
    note: "Optional. Nothing above needs it, devx installs everything into your own user space.",
  },
  {
    title: "Python, via uv",
    commands: [
      "curl -LsSf https://astral.sh/uv/install.sh | sh",
      "uv python install",
    ],
    note: "Optional. The installer writes PATH setup into your shell config rather than the current shell, so open a new terminal (or run source $HOME/.local/bin/env) before the second command, or uv will not be found. A system or pyenv Python does not count here: this is specifically a uv-managed one, since that is what devx installs and verifies.",
  },
  {
    title: "Node, via fnm",
    commands: [
      "curl -fsSL https://fnm.vercel.app/install | bash",
      "fnm install --lts",
      "fnm default lts-latest",
    ],
    note: "Optional. Same shell-config caveat as uv: fnm is not on PATH until you open a new terminal, and node resolves only once fnm's shell hook has run, so the two commands after the installer need that new shell. nvm or a system Node does not make this row true, since it is specifically an fnm-managed Node LTS.",
  },
];

export const faq: { q: string; a: string }[] = [
  {
    q: "What does it change on my machine?",
    a: "devx setup installs missing tools and configures Git and GitHub access. It keeps its shell configuration in one marked block in ~/.zshrc. devx setup --remove removes that block. The manual installers manage their own shell configuration separately.",
  },
  {
    q: "Can I run it more than once?",
    a: "Yes. Tools that are already configured start unselected. You can choose additional tools or explicitly select a tool to reinstall it.",
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
    q: "Something is broken, or the CLI does not do this yet.",
    a: "Post in #devx. That is the DevX team's support channel for exactly this: a broken step, a missing tool, a question about the setup itself.",
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
    a: "Not when every tool shows a checkmark. You are done when you can finish the first real task, for example installing the Korza Marketplace plugins.",
  },
];
