# devx-home

Korza's DevX portal: a tools catalogue, a skills catalogue, a CI gap analysis for a given
repo, and product updates. Tracked in the Linear project **DevX Home**.

Bootstrap only right now (DX-31) — no features, no catalogues, no auth.

## Develop

pnpm, pinned via `packageManager` in `package.json`.

```bash
pnpm install
pnpm dev           # http://localhost:3000
```

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Installer distribution

`/getting-started` renders its install command on the server. `/setup` uses the
same configured origin and pins the expected checksum from the committed sidecar.
Request `Host` and forwarded headers cannot select a download host.

Set `DEVX_PUBLIC_ORIGIN` to the public HTTPS origin when building and deploying
outside Vercel, or when overriding its defaults. On Vercel, production uses
`VERCEL_PROJECT_PRODUCTION_URL`; previews use `VERCEL_URL`. Enable Vercel's system
environment variables, or provide the explicit origin. An invalid or missing
production origin disables the install command and returns 503 from `/setup`.

Local development defaults to `http://localhost:3000` (or `PORT`). For another
port or a tunnel, set the origin explicitly before starting Next:

```bash
DEVX_PUBLIC_ORIGIN=https://your-tunnel.example pnpm dev
```

Only that configured host is added to Next's development-origin allowlist.
HTTP origins are accepted only for local loopback during development or tests.
Changes to deployment origins require a rebuild.

The selected host must serve `/setup`, the archive and its checksum without browser
authentication. The bootstrap rejects unexpected responses such as login HTML;
the shebang check detects a wrong response format, not an untrusted script.
The pinned digest detects altered downloads but does not authenticate a compromised
script server. DX-161 replaces this bundled prerelease with verified release
distribution; update the installer, archive and checksum together at that transition.

## Gotchas worth knowing before you touch the toolchain

**`typecheck` runs `next typegen` first, deliberately.** `tsc` alone fails on a clean checkout
with `Cannot find name 'LayoutProps'` — Next generates those route/layout globals into
`.next/types`, which `tsconfig.json` includes. Without the typegen step, `pnpm typecheck` only
passes when a previous build happens to have left `.next` behind, so it would pass locally and
fail in CI.

**Approved build scripts live in `pnpm-workspace.yaml`, not `package.json`.** pnpm 11 no longer
reads the `pnpm` field in `package.json`, and it treats an unapproved build script as a hard
error on _every_ command rather than a warning — so one unapproved dependency makes every script
exit 1. See that file for what is approved and why.

## Dependency ceilings

Two dev dependencies are deliberately held below their latest published major. Both are
capped by `eslint-config-next`'s bundled plugins, not by our own code, so raising either
one breaks `pnpm lint` outright:

- **TypeScript is `~6.0.3`, not 7.x.** `typescript-eslint` hard-refuses TS 7 with
  `"typescript-eslint does not support TS 7.0"` (its peer range is `<6.1.0`, which is also
  why the range is `~` rather than `^` — `^6.0.3` would let 6.1.x in and break lint).
  Tracking: typescript-eslint#10940.
- **ESLint is `^9`, not 10.x.** `eslint-plugin-react` still calls `context.getFilename()`,
  removed in ESLint 10, so every lint run dies in `react/display-name`.

Everything else is on latest. Re-check these when `eslint-config-next` next bumps its
plugin set.
