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

// Every token the app renders as normal-sized text on the accent wash. --accent and
// --accent-strong are the same hex today, so covering only one of them would pass on the
// other's behalf and stop catching a change to either.
describe("the accent wash", () => {
  it.each(["accent", "accent-strong", "ink-muted", "ink"])(
    "clears AA for %s",
    (name) => {
      expect(
        contrast(token(name), token("accent-wash")),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
