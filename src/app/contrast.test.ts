import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The strip puts normal-sized text on --accent-wash, and a jsdom test cannot measure rendered
 * contrast, so this reads the tokens out of the stylesheet and does the arithmetic instead.
 */

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

// One palette to read since the app went dark-only. The hex is what anchors this: `@theme inline`
// restates every token as `var(--x)`, which this deliberately will not match.
function token(name: string) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`--${name} not found in the palette`);
  return match[1];
}

function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const channels = [1, 3, 5].map(
      (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
    );
    const [r, g, b] = channels.map((c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every token the app renders as text on the accent wash, --ink-faint included: an active facet
// menu's chevron (facet-menu.tsx) is aria-hidden and the button carries its own label, but it is
// still the visible affordance and clears AA by only 0.11.
//
// --accent and --accent-strong are the same hex today, so covering only one of them would
// pass on the other's behalf and stop catching a change to either.
describe("the accent wash", () => {
  it.each(["accent", "accent-strong", "ink-muted", "ink", "ink-faint"])(
    "clears AA for %s",
    (name) => {
      expect(
        contrast(token(name), token("accent-wash")),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});

/**
 * The stroke behind a marked phrase in the home page headings. Drawn over the glyphs it put --ink
 * on the stroke at 2.83:1, sampled from a screenshot, under the 3:1 large text has to clear. It now
 * hangs below the words, where nothing sits on it.
 *
 * The arithmetic below is against the --highlight token itself, so it reads lower than that: the
 * stroke is a gradient of the token at 52-82% over the canvas, and this cannot composite. Being the
 * stricter of the two is the right way round for a guard.
 *
 * It deliberately does not pin the geometry, because a darker stroke that carries the text is just
 * as correct. It asserts the trade instead, so whoever moves the stroke back over the glyphs owes
 * the ratio, which is the part that was wrong rather than the position.
 */
describe("the brush stroke", () => {
  const rule = css.match(/\.mark::before\s*\{([^}]*)\}/);

  it("has a rule to read", () => {
    // Or everything below passes on a stylesheet that no longer draws a stroke at all.
    expect(rule, ".mark::before is gone or renamed").not.toBeNull();
  });

  it("clears 3:1 whenever it is drawn behind the glyphs", () => {
    // `inset: auto` leaves the top edge unset, which is what makes it an underline: the stroke is
    // placed from the bottom of the phrase and never reaches up over the text.
    if (/inset:\s*auto/.test(rule![1]!)) return;
    expect(contrast(token("ink"), token("highlight"))).toBeGreaterThanOrEqual(
      3,
    );
  });
});
