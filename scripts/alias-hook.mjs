/**
 * Resolves the `@/` alias for scripts that import the app's own TypeScript modules.
 *
 * `tsconfig.json` maps `@/*` to `src/*`, which Next understands and Node does not. Registering a
 * four-line resolve hook is cheaper than adding a bundler or a second copy of the corpus module
 * for build-time use.
 */
import { pathToFileURL } from "node:url";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = resolvePath(dirname(fileURLToPath(import.meta.url)), "../src");

import { existsSync } from "node:fs";

/** TypeScript imports are extensionless; Node's resolver needs the real file. */
function withExtension(path) {
  if (existsSync(path)) return path;
  for (const ext of [".ts", ".tsx", ".json", "/index.ts"]) {
    if (existsSync(path + ext)) return path + ext;
  }
  return path;
}

export async function resolve(specifier, context, nextResolve) {
  // `catalogue.ts` imports "server-only", whose real package throws unless the react-server build
  // condition is set - which a plain Node script never sets. vitest.config.mts aliases it to a
  // stub for the same reason; this points at that same stub rather than adding a second one.
  if (specifier === "server-only") {
    return nextResolve(
      pathToFileURL(resolvePath(src, "test/server-only-stub.ts")).href,
      context,
    );
  }
  if (specifier.startsWith("@/")) {
    const path = withExtension(resolvePath(src, specifier.slice(2)));
    // Bundlers infer `with { type: "json" }` from the extension; Node requires it stated. The
    // app's own imports are plain, so it is added here rather than in the source.
    const attributes = path.endsWith(".json")
      ? { ...context.importAttributes, type: "json" }
      : context.importAttributes;
    return nextResolve(pathToFileURL(path).href, {
      ...context,
      importAttributes: attributes,
    });
  }
  return nextResolve(specifier, context);
}

/**
 * Node validates import attributes at load time, so setting them in `resolve` is not enough. The
 * app imports its JSON plainly because Next infers the type from the extension.
 */
export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    return nextLoad(url, { ...context, importAttributes: { type: "json" } });
  }
  return nextLoad(url, context);
}
