/** Registers the `@/` resolve hook. Used via `node --import ./scripts/register-alias.mjs`. */
import { register } from "node:module";

register("./alias-hook.mjs", import.meta.url);
