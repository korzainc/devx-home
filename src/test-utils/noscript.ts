/** Login links actually inside a `<noscript>`, rather than anywhere between two of them, which a
 * greedy `<noscript>[\s\S]*href[\s\S]*</noscript>` would also accept. */
export function unscriptedLogins(markup: string): string[] {
  return [...markup.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)]
    .map(([, inner]) => inner)
    .filter((inner) => inner.includes('href="/login"'));
}
