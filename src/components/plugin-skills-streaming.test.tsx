/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PluginSkillsWithUsage } from "./plugin-skills-with-usage";
import { PluginSkills } from "./plugin-skills";
import { SkillContextStrip } from "./skill-context-strip";
import { PREVIEW } from "./collapsible-grid";
import { skillsForPlugin } from "@/lib/catalogue";
import { skillCardId } from "@/lib/skill-link";
import type { SkillUsage } from "@/lib/skill-usage";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  member: vi.fn(),
  usage: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/membership", () => ({ isOrgMember: mocks.member }));
vi.mock("@/lib/skill-usage", () => ({ readSkillUsage: mocks.usage }));

const plugin = "mattpocock-skills";
const skills = skillsForPlugin(plugin);
const target = skills[PREVIEW];

beforeEach(() => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  history.replaceState(null, "", "/");
});

it("renders exact large skill totals alongside ordinary singular counts", async () => {
  const skills = skillsForPlugin("superpowers").slice(0, 1);
  await act(async () => {
    render(
      <PluginSkills
        plugin="superpowers"
        skills={skills}
        usagePromise={Promise.resolve({
          [skills[0].name]: { claude: 1, codex: "9007199254740993" },
        })}
      />,
    );
  });
  const badge = screen.getByLabelText(`Recorded usage for ${skills[0].name}`);
  expect(badge.textContent).toContain("1 activation via Claude Code");
  expect(badge.textContent).toContain("9007199254740993 skill loads via Codex");
});

async function renderPendingUsage() {
  const pending = Promise.withResolvers<Record<string, SkillUsage>>();
  mocks.usage.mockReturnValue(pending.promise);
  // Evaluate the server wrapper once, as the RSC payload does, then render its
  // stable client list before optional usage has settled.
  const list = PluginSkillsWithUsage({ plugin, skills });
  await act(async () => {
    render(
      <>
        <SkillContextStrip plugin={plugin} skills={skills} />
        {list}
      </>,
    );
  });
  expect(mocks.usage).toHaveBeenCalledOnce();
  expect(mocks.member).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText(/^Recorded usage for/)).toBeNull();

  return async (outcome: "resolve" | "reject") => {
    await act(async () => {
      if (outcome === "resolve") {
        pending.resolve({ [target.name]: { claude: 2 } });
      } else {
        pending.reject(new Error("usage unavailable"));
      }
      await list.props.usagePromise;
    });
    expect(mocks.usage).toHaveBeenCalledOnce();
    expect(mocks.member).toHaveBeenCalledOnce();
    const badge = screen.queryByLabelText(`Recorded usage for ${target.name}`);
    if (outcome === "resolve") {
      expect(badge?.textContent).toContain("2 activations via Claude Code");
    } else {
      expect(badge).toBeNull();
    }
  };
}

it.each(["resolve", "reject"] as const)(
  "keeps the expanded list mounted when pending usage %ss",
  async (outcome) => {
    const settle = await renderPendingUsage();
    const toggle = screen.getByRole("button", { name: /^Show all / });
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const card = document.getElementById(skillCardId(plugin, target.name));
    expect(card).not.toBeNull();

    await settle(outcome);

    expect(screen.getByRole("button", { name: /^Show fewer/ })).toBe(toggle);
    expect(document.getElementById(skillCardId(plugin, target.name))).toBe(
      card,
    );
  },
);

it.each(["resolve", "reject"] as const)(
  "keeps the selected skill and focus when pending usage %ss",
  async (outcome) => {
    history.replaceState(null, "", `?skill=${encodeURIComponent(target.name)}`);
    const settle = await renderPendingUsage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Show in list/ }));
    });
    const card = document.getElementById(skillCardId(plugin, target.name));
    expect(card).not.toBeNull();
    expect(document.activeElement).toBe(card);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();

    await settle(outcome);

    expect(document.getElementById(skillCardId(plugin, target.name))).toBe(
      card,
    );
    expect(document.activeElement).toBe(card);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
  },
);
