/** The inner markup of each `<noscript>`, so an assertion cannot be satisfied by content sitting
 * between two of them -- which a greedy `<noscript>[\s\S]*x[\s\S]*</noscript>` accepts. */
export function noscriptBlocks(markup: string): string[] {
  return [...markup.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].map(
    ([, inner]) => inner,
  );
}

export function unscriptedLogins(markup: string): string[] {
  return noscriptBlocks(markup).filter((inner) =>
    inner.includes('href="/login"'),
  );
}
