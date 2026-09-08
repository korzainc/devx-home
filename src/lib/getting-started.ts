/** Setup overview and manual commands for the Getting started page. */

/** Guided setup overview. */
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

/** Labels pair with manualCommands by index. Keep their order aligned. */
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
    note: "Install gh first from https://github.com/cli/cli#installation, then run these commands to sign in and configure Git's HTTPS credentials. SSH access is set up separately below.",
  },
  {
    title: "SSH access",
    commands: [
      'ssh-keygen -t ed25519 -C "you@korza.ai"',
      "gh auth refresh --hostname github.com --scopes write:public_key",
      'gh ssh-key add ~/.ssh/id_ed25519.pub --title "$(hostname)"',
      "ssh-add ~/.ssh/id_ed25519",
      "ssh -T git@github.com",
    ],
    note: 'Skip key creation when reusing an existing key, and adjust the public and private key paths above. ssh-add loads the key so Claude can clone without a passphrase prompt; run it again if the agent forgets the key. The permission step authorizes uploading the public key. Check GitHub\'s published fingerprint before accepting the first SSH connection. A successful check prints "successfully authenticated"; GitHub returns exit code 1 because it does not provide shell access.',
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
    note: "After the official installer finishes, follow its PATH instructions and run claude once to sign in before adding the marketplace. GitHub shorthand uses SSH by default, so complete the SSH access steps first. If access fails, check the loaded key and your Korza GitHub membership. See https://code.claude.com/docs/en/setup for installation help.",
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
      "curl -fsSL https://fnm.vercel.app/install | bash -s -- --force-install",
      "fnm install --lts",
      "fnm default lts-latest",
    ],
    note: "Optional. --force-install downloads fnm directly, so Homebrew is not required. Open a new terminal after the installer, then run the remaining commands so fnm's PATH and shell hook are loaded. This installs an fnm-managed Node LTS independently of nvm or a system Node.",
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
