/** Setup overview and manual commands for the Getting started page. */

/** Guided setup overview. */
export const walkthrough: { does: string; detail: string }[] = [
  {
    does: "Choose your tools",
    detail: "See what’s already set up and choose what you need.",
  },
  {
    does: "Install what’s missing",
    detail: "Korza CLI installs your choices and any tools they need.",
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
  note: string | string[];
  noteFirst?: boolean;
  installUrl?: string;
}[] = [
  {
    tool: "Xcode tools",
    why: "Install Apple’s developer tools, including Git",
    title: "Xcode Command Line Tools",
    commands: ["xcode-select --install"],
    note: "Finish the installation in Apple’s dialog before continuing. These tools include Git. Set your commit name and email in the Git step below.",
  },
  {
    tool: "Git",
    noteFirst: true,
    why: "Set your commit name and email",
    title: "Git",
    commands: [
      'git config --global user.name "Your Name"',
      'git config --global user.email "you@korza.ai"',
    ],
    note: "Install Xcode tools first. Replace the example name and email with the details you want on your commits. These commands replace your current Git defaults. Korza CLI can suggest details from GitHub for you to review instead.",
  },
  {
    tool: "GitHub CLI",
    noteFirst: true,
    installUrl: "https://github.com/cli/cli#installation",
    why: "Sign in to GitHub",
    title: "GitHub CLI",
    commands: [
      "gh auth login --hostname github.com --git-protocol https --web",
      "gh auth setup-git --hostname github.com",
    ],
    note: "Complete the Xcode tools step first. Install GitHub CLI using the link above. Run these commands to sign in. Git will use your GitHub account over HTTPS.",
  },
  {
    tool: "SSH access",
    noteFirst: true,
    why: "Connect to GitHub over SSH",
    title: "SSH access",
    commands: [
      'ssh-keygen -t ed25519 -C "you@korza.ai"',
      "gh auth refresh --hostname github.com --scopes write:public_key",
      'gh ssh-key add ~/.ssh/id_ed25519.pub --title "$(hostname)"',
      "ssh-add ~/.ssh/id_ed25519",
      "ssh -T git@github.com",
    ],
    note: [
      "Complete the GitHub CLI step first.",
      "If you already have an SSH key, skip key creation. Use that key's paths in the remaining commands.",
      "ssh-add loads your key so Claude can use it without another passphrase prompt. Run it again if the SSH agent no longer has the key.",
      "GitHub needs permission to add the public key. The private key stays on your Mac.",
      "Check GitHub's published fingerprint before accepting the first connection.",
      'A successful check prints "successfully authenticated". GitHub returns exit code 1 because it does not provide shell access.',
    ],
  },
  {
    tool: "Claude Code",
    noteFirst: true,
    why: "Install Claude Code and Korza skills",
    title: "Claude Code and Korza skills",
    commands: [
      "curl -fsSL https://claude.ai/install.sh | bash",
      "claude auth login",
      "claude plugin marketplace add korzainc/marketplace",
      "claude plugin install codezen@korza-marketplace",
      "claude plugin install superpowers@korza-marketplace",
      "claude plugin install mattpocock-skills@korza-marketplace",
      "claude plugin install humanizer@korza-marketplace",
    ],
    note: "Run the installer first, then follow its terminal instructions before signing in. The marketplace commands below use SSH, so complete the SSH access step before adding plugins. You also need access to Korza’s GitHub repositories. Korza CLI uses HTTPS for this step.",
  },
  {
    tool: "Homebrew",
    why: "Optional package manager",
    title: "Homebrew",
    commands: [
      '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    ],
    note: "Follow the installer’s printed shell setup instructions before using brew. The other tools on this page can be installed without Homebrew.",
  },
  {
    tool: "Python (uv)",
    noteFirst: true,
    why: "Optional Python setup",
    title: "Python with uv",
    commands: [
      "curl -LsSf https://astral.sh/uv/install.sh | sh",
      "uv python install",
    ],
    note: "Run the installer, then open a new terminal before running uv python install. This adds a Python version managed by uv, as Korza CLI does. Other Python installations stay separate.",
  },
  {
    tool: "Node.js (fnm)",
    noteFirst: true,
    why: "Optional Node.js setup",
    title: "Node.js with fnm",
    commands: [
      "curl -fsSL https://fnm.vercel.app/install | bash -s -- --force-install",
      "fnm install --lts",
      "fnm default lts-latest",
      "fnm use lts-latest",
    ],
    note: "Run the installer, then open a new terminal before the remaining commands. These install and activate the current long-term support (LTS) version of Node.js through fnm. Homebrew is not required. Other Node.js installations stay separate.",
  },
];

export const faq: { q: string; a: string }[] = [
  {
    q: "Where can I find CLI help?",
    a: "Run korza --help for commands or korza setup --help for setup options. The installer also adds kz as a short name for korza when that name is available.",
  },
  {
    q: "What does it change on my machine?",
    a: "Korza CLI installs and configures the tools you choose and any tools they need. It saves progress and logs in ~/.devx and adds a marked block to ~/.zshrc. korza setup --remove removes only that block; installed tools and the CLI remain. Manual installers may add their own shell settings.",
  },
  {
    q: "How do I change my Git name or email?",
    a: "Run korza setup. Select Git & GitHub and press r, then Enter. Review your current details and choose Edit.",
  },
  {
    q: "Can I stop and come back later?",
    a: "Yes. Press Esc from the tool list to let running installs finish and skip waiting tools. Run korza setup when you want to continue. Apple’s installer may keep running after you leave setup.",
  },
  {
    q: "What happens if a step fails?",
    a: "Independent steps can continue. Korza CLI shows what needs attention and how to retry.",
  },
  {
    q: "What if I cannot sign in or access a repository?",
    a: "Check that you are using the right account and have access to Korza’s GitHub organisation. Ask in #devx if access is missing.",
  },
  {
    q: "Something is broken, or the CLI does not do this yet.",
    a: "Ask in #devx. Include the tool name and any error message.",
  },
  {
    q: "I already have some of these tools installed.",
    a: "Configured tools are skipped by default. An installed tool may still need sign-in or configuration. Run korza doctor to check your tools without installing anything.",
  },
  {
    q: "My laptop is managed and I do not have admin rights.",
    a: "Some steps need administrator approval. You can leave those steps for later and continue with other tools. Ask your IT team if your device policy blocks a step.",
  },
  {
    q: "When am I actually done?",
    a: "When the tools you chose are ready, follow the next steps shown. You can return later to set up other tools.",
  },
];
