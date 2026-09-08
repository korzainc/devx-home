import { InstallPanel } from "@/components/install-panel";
import type { InstallCommand } from "@/lib/catalogue-entries";

/**
 * The install section of a plugin detail page. One tab per agent the plugin ships for, each
 * carrying the two commands in the order they are run: registering the marketplace is a
 * once-per-machine step, installing the plugin is not.
 */
export function PluginInstall({ commands }: { commands: InstallCommand[] }) {
  return (
    <InstallPanel
      tabs={commands.map((entry) => ({
        id: entry.agent,
        label: entry.agent,
        blocks: [
          {
            label: "Register once per machine",
            name: "Register command",
            content: entry.register,
          },
          { label: "Install", name: "Install command", content: entry.install },
        ],
      }))}
    />
  );
}
