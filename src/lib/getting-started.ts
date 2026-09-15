/** Manual commands and questions for the Getting started page. */

/** The commands themselves, one disclosure per tool. Closed by default. */
export const manualCommands: {
  tool: string;
  why: string;
  title: string;
  commands: string[];
  comments?: Record<string, string>;
  breakBefore?: string[];
  note: string | string[];
  noteFirst?: boolean;
  installUrl?: string;
}[] = [
  {
    tool: "Xcode tools",
    why: "Install Apple’s developer tools, including Git",
    title: "Xcode Command Line Tools",
    commands: ["xcode-select --install"],
    note: "Finish the installation in Apple’s dialog before continuing.",
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
    note: "Install Xcode tools first. Replace the example name and email with yours, using an email linked to your GitHub account. These commands change the default author name and email for your Git commits.",
  },
  {
    tool: "GitHub CLI",
    noteFirst: true,
    installUrl: "https://github.com/cli/cli#macos",
    why: "Sign in to GitHub",
    title: "GitHub CLI",
    commands: [
      "gh auth login --hostname github.com --git-protocol https --web",
      "gh auth setup-git --hostname github.com",
    ],
    note: "Complete the Xcode tools step, then install GitHub CLI using the link above. Run these commands to sign in and let Git use your GitHub account.",
  },
  {
    tool: "SSH access",
    noteFirst: true,
    why: "Optional GitHub access over SSH",
    title: "SSH access",
    commands: [
      'ssh-keygen -t ed25519 -C "you@korza.ai"',
      "gh auth refresh --hostname github.com --scopes admin:public_key",
      'gh ssh-key add ~/.ssh/id_ed25519.pub --title "$(hostname)"',
      "ssh-add ~/.ssh/id_ed25519",
      "ssh -T git@github.com",
    ],
    breakBefore: [
      "gh auth refresh --hostname github.com --scopes admin:public_key",
      "ssh -T git@github.com",
    ],
    comments: {
      "gh auth refresh --hostname github.com --scopes admin:public_key":
        "Finish key creation first, or use your existing key.",
      "ssh-add ~/.ssh/id_ed25519":
        "Load the key. Enter its passphrase if asked.",
      "ssh -T git@github.com":
        "Check GitHub’s fingerprint before accepting a new connection.",
    },
    note: [
      "Optional. Set up an SSH key if you use SSH clone URLs. Complete the GitHub CLI step first. The Claude plugin commands below use HTTPS.",
      "If you already have an SSH key, skip key creation and use its paths below. Skip the upload if that key is already on GitHub.",
      "ssh-add loads your key for SSH commands. Run it again if the SSH agent no longer has the key.",
      "GitHub needs permission to add the public key. The private key stays on your Mac.",
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
      "CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 claude plugin marketplace add korzainc/marketplace",
      "CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 claude plugin marketplace update korza-marketplace",
      "CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 claude plugin install codezen@korza-marketplace",
      "CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 claude plugin install superpowers@korza-marketplace",
      "CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 claude plugin install mattpocock-skills@korza-marketplace",
      "CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 claude plugin install humanizer@korza-marketplace",
    ],
    breakBefore: ["claude auth login"],
    comments: {
      "claude auth login":
        "Finish installation and any shell setup first. Complete the GitHub CLI step before adding plugins.",
      "CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1 claude plugin install codezen@korza-marketplace":
        "Install the four plugins included by Korza CLI.",
    },
    note: "Sign in to GitHub with access to Korza's repositories. These plugin commands use HTTPS, so you don't need an SSH key.",
  },
  {
    tool: "Homebrew",
    why: "Optional package manager",
    title: "Homebrew",
    commands: [
      '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    ],
    note: "Follow the installer’s shell setup instructions before using brew.",
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
    breakBefore: ["uv python install"],
    comments: {
      "uv python install": "Open a new terminal after installing uv.",
    },
    note: "Install uv, then use it to install Python.",
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
    breakBefore: ["fnm install --lts"],
    comments: {
      "fnm install --lts": "Open a new terminal after installing fnm.",
    },
    note: "Install fnm, then use it to install and select Node.js LTS.",
  },
];

export const faq: { q: string; a: string }[] = [
  {
    q: "Where can I find help with Korza CLI?",
    a: "Run korza --help for commands or korza setup --help for setup options. The installer also adds kz as a short name for korza when that name is available.",
  },
  {
    q: "What does it change on my machine?",
    a: "Korza CLI installs and configures the tools you choose and any tools they need. It saves your tool selection and logs in ~/.korza and adds a marked block to ~/.zshrc. korza setup --remove removes only that block. Installed tools and the CLI remain. Manual installers may add their own shell settings.",
  },
  {
    q: "How do I change my Git name or email?",
    a: "Run korza setup. Select Git & GitHub and press [r], then [Enter]. Review your current details and choose Edit.",
  },
  {
    q: "Can I stop and come back later?",
    a: "Yes. Press [Escape] from the tool list to let running installs finish and skip waiting tools. Run korza setup when you want to continue. Apple’s installer may keep running after you leave setup.",
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
    q: "How do I report a problem or request a tool?",
    a: "Ask in #devx. Include the tool name and any error message.",
  },
  {
    q: "What if I already have some tools installed?",
    a: "Configured tools are skipped by default. An installed tool may still need sign-in or configuration. Run korza doctor to check your tools.",
  },
  {
    q: "What if I do not have administrator access?",
    a: "Some steps need administrator approval. You can leave those steps for later and continue with other tools. Ask the IT team if device policy blocks a step.",
  },
  {
    q: "When is setup complete?",
    a: "When the tools you chose are ready, follow the next steps shown. You can return later to set up other tools.",
  },
];
