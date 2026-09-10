/** Setup overview and manual commands for the Getting started page. */

/** Guided setup overview. */
export const walkthrough: { does: string; detail: string }[] = [
  {
    does: "Choose your tools",
    detail: "See what’s already set up and choose what you need.",
  },
  {
    does: "Install what’s missing",
    detail: "Installs your choices and any tools they need.",
  },
  {
    does: "Sign in when asked",
    detail: "Follow prompts in your terminal or browser.",
  },
  {
    does: "See what’s ready",
    detail: "Get next steps or instructions to finish an incomplete setup.",
  },
];

/** The commands themselves, one disclosure per tool. Closed by default. */
export const manualCommands: {
  tool: string;
  why: string;
  title: string;
  commands: string[];
  note: string;
  noteFirst?: boolean;
}[] = [
  {
    tool: "Xcode tools",
    why: "ships Apple's own git, no install step needed after",
    title: "Xcode Command Line Tools",
    commands: ["xcode-select --install"],
    note: "This is the only step git needs. Apple ships its own git with these tools; there is no separate git install.",
  },
  {
    tool: "git",
    why: "your commit author name and email",
    title: "Git",
    commands: [
      'git config --global user.name "Your Name"',
      'git config --global user.email "you@korza.ai"',
    ],
    note: "Use the name and email you want recorded on your commits.",
  },
  {
    tool: "gh",
    why: "user-space install, sign in over HTTPS",
    title: "GitHub CLI",
    commands: [
      "gh auth login --hostname github.com --git-protocol https --web",
      "gh auth setup-git --hostname github.com",
    ],
    note: "Install gh first from https://github.com/cli/cli#installation, then run these commands to sign in and configure Git's HTTPS credentials. SSH access is set up separately below.",
  },
  {
    tool: "SSH access",
    noteFirst: true,
    why: "GitHub SSH access, separate from HTTPS",
    title: "SSH access",
    commands: [
      'ssh-keygen -t ed25519 -C "you@korza.ai"',
      "gh auth refresh --hostname github.com --scopes write:public_key",
      'gh ssh-key add ~/.ssh/id_ed25519.pub --title "$(hostname)"',
      "ssh-add ~/.ssh/id_ed25519",
      "ssh -T git@github.com",
    ],
    note: 'Skip key creation when reusing an existing key, and adjust the public and private key paths in these commands. ssh-add loads the key so Claude can clone without a passphrase prompt; run it again if the agent forgets the key. The permission step authorizes uploading only the public key; the private key stays on your machine. Check GitHub\'s published fingerprint before accepting the first SSH connection. A successful check prints "successfully authenticated"; GitHub returns exit code 1 because it does not provide shell access.',
  },
  {
    tool: "claude",
    why: "install, sign in, then the Korza marketplace (four plugins)",
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
    tool: "homebrew",
    why: "optional, nothing above needs it",
    title: "Homebrew",
    commands: [
      '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    ],
    note: "Optional. The other tools can be installed without Homebrew.",
  },
  {
    tool: "Python (uv)",
    why: "optional, a uv-managed Python",
    title: "Python, via uv",
    commands: [
      "curl -LsSf https://astral.sh/uv/install.sh | sh",
      "uv python install",
    ],
    note: "Optional. The installer writes PATH setup into your shell config rather than the current shell, so open a new terminal (or run source $HOME/.local/bin/env) before the second command, or uv will not be found. A system or pyenv Python does not count here: this is specifically a uv-managed one, since that is what Korza CLI installs and verifies.",
  },
  {
    tool: "Node (fnm)",
    why: "optional, an fnm-managed Node LTS",
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
    q: "Where can I find CLI help?",
    a: "Run korza --help for commands or korza setup --help for setup options. The installer also adds kz as a short name for korza when that name is available.",
  },
  {
    q: "What does it change on my machine?",
    a: "Korza CLI installs and configures the tools you choose and their prerequisites. It saves progress and logs in ~/.devx and adds a marked block to ~/.zshrc. korza setup --remove removes only that block; installed tools and the CLI remain. Manual installers may add their own shell settings.",
  },
  {
    q: "Can I run it more than once?",
    a: "Yes. Run korza setup to reopen the tool catalogue. Enter starts an unfinished tool or opens details for a ready tool. To reinstall a ready tool, press r, then Enter. Run korza doctor whenever you want to check the installed toolchain.",
  },
  {
    q: "What happens if a step fails?",
    a: "Independent steps can continue. Korza CLI shows what needs attention and how to retry.",
  },
  {
    q: "It will not let me in. Is that my machine?",
    a: "Not always. Some blockers are access, not software, for example not yet being in the Korza GitHub org. Ask in #devx rather than retrying.",
  },
  {
    q: "Something is broken, or the CLI does not do this yet.",
    a: "Ask in #devx. Include the tool name and any error message.",
  },
  {
    q: "I already have some of these tools installed.",
    a: "Configured tools are skipped by default. An installed tool may still need sign-in or configuration. Reinstalling it is an explicit choice.",
  },
  {
    q: "My laptop is managed and I do not have admin rights.",
    a: "Some steps need administrator approval. You can defer them and continue with independent tools. Ask your IT team about the steps your device policy blocks.",
  },
  {
    q: "When am I actually done?",
    a: "When the tools you chose are ready, follow the next steps shown. You can return later to set up other tools.",
  },
];
