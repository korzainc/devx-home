import { InstallPanel, type InstallTab } from "@/components/install-panel";
import { actionDetails } from "@/data/action-details";
import type { InstallMethod } from "@/lib/install-commands";

/** The `with:` keys a GitHub Action step accepts, from the overlay. A tool whose action the
 *  overlay does not document degrades to the bare `uses:` line rather than to an empty table. */
function ActionInputs({ action }: { action: string }) {
  const details = actionDetails[action];
  if (!details) return null;
  return (
    <div className="flex flex-col gap-3">
      {details.note && <p className="text-xs text-ink-faint">{details.note}</p>}
      <div className="flex flex-col gap-2">
        <span className="text-[0.65rem] tracking-wide text-ink-faint uppercase">
          Inputs
        </span>
        <dl className="flex flex-col gap-2">
          {details.inputs.map((input) => (
            <div
              key={input.name}
              className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,9rem)_1fr]"
            >
              <dt className="font-mono text-xs text-ink">{input.name}</dt>
              <dd className="text-xs leading-relaxed text-ink-muted">
                {input.description}
                {input.fallback && (
                  <span className="text-ink-faint">
                    {" "}
                    Defaults to{" "}
                    <code className="font-mono">{input.fallback}</code>.
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function toTab(method: InstallMethod): InstallTab {
  return {
    id: method.id,
    label: method.label,
    // No block label: the tab already names the method, and a second copy of "Homebrew" above
    // `brew install` reads as a heading for something the reader can already see.
    blocks: [
      {
        target: method.target,
        content: method.command,
        note: method.note,
        name: `${method.label} ${method.target ? "snippet" : "command"}`,
      },
    ],
    extra: method.action ? <ActionInputs action={method.action} /> : undefined,
  };
}

/**
 * The install section of a tool detail page. Renders nothing when the tool has no method, which
 * is the honest answer for a check that ships with its toolchain rather than an empty panel
 * captioned "no install".
 */
export function ToolInstall({ methods }: { methods: InstallMethod[] }) {
  if (methods.length === 0) return null;
  return <InstallPanel tabs={methods.map(toTab)} />;
}
