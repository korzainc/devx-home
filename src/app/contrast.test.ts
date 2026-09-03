import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The strip sits on --accent-wash, where --accent measures 4.38:1 and --ink-faint 2.76:1 in
 * light mode. Both are under AA for normal-sized text, and neither is visible in a jsdom test,
 * so this reads the tokens and does the arithmetic.
 */

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function palette(mode: "light" | "dark") {
  // Light lives on the bare :root; dark overrides it inside the media query.
  const dark = css.slice(css.indexOf("prefers-color-scheme: dark"));
  const source = mode === "light" ? css.slice(0, css.indexOf("@media")) : dark;
  return (name: string) => {
    const match = source.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    if (!match) throw new Error(`--${name} not found in the ${mode} palette`);
    return match[1];
  };
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

describe.each(["light", "dark"] as const)("%s mode", (mode) => {
  const token = palette(mode);

  // Every run of normal-sized text the strip puts on the accent wash.
  it.each(["accent-strong", "ink-muted", "ink"])(
    "clears AA for %s on the accent wash",
    (name) => {
      expect(
        contrast(token(name), token("accent-wash")),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
