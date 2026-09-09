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

The current bundle is Korza CLI (`korza`, with `kz` as its short alias), built
from `devx-cli` main commit `412fe82`. Its archive under
`public/korza/` matches `devx-cli/dist/korza-0.1.0-macos.tar.gz` byte-for-byte.
Refresh the archive and checksum together when the CLI changes. Production
builds omit demo/sandbox entry points; setup flags are documented by
`korza setup --help`. The `KORZA_*` environment names are preferred; `DEVX_*` aliases remain supported;
old `/devx/` installer and artifact URLs redirect to the current Korza assets.
The repository and support channel
are still named `devx-home` and `#devx`.

### Vercel deployment settings

For the installer, `KORZA_PUBLIC_ORIGIN` is the only custom Vercel setting you
may need. Existing authentication and database configuration is separate.

| Setting                                                     | Where to configure it                                                | Required value / behavior                                                                                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KORZA_PUBLIC_ORIGIN`                                       | Vercel Project Settings → Environment Variables; scope to Production | Optional explicit public HTTPS origin, such as `https://your-domain.example`, with no path, credentials, query or fragment. Set it when you want to choose the exact domain. |
| `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | Supplied by Vercel; enable automatic system-variable exposure        | No manual values needed. Production uses the production domain; previews use their own deployment URL.                                                                       |
| `KORZA_DIST_URL`, `KORZA_DIST_SHA256`                       | Generated inside the `/setup` response                               | Do not populate these in Vercel. The route selects and pins the committed bundle. These are not a release-source toggle.                                                     |
| `KORZA_BIN_DIR`, `KORZA_REPO`                               | Optional environment overrides on the machine running the installer  | Not website deployment settings. Defaults are `~/.local/bin` and `korzainc/devx-cli`.                                                                                        |
| `KORZA_SIGN_ID`, `KORZA_KEYCHAIN_PROFILE`                   | CLI release-build machine                                            | Not website deployment settings. Explicit signing identity and notarization profile for `build.sh`.                                                                          |
| `KORZA_UPDATE_MANIFEST`                                     | CLI development/rehearsal environment                                | Optional update-manifest override. Leave unset for normal GitHub release checks.                                                                                             |

Before deploying, decide which public domain users should see and whether preview
builds should install their own bundle. Normally leave `KORZA_PUBLIC_ORIGIN`
unset in Preview so it follows each deployment; a Production value should not
be copied to all environments by accident. If the chosen preview is protected,
the installer will stop safely rather than bypass browser authentication.

Precedence is `KORZA_PUBLIC_ORIGIN`, then the legacy `DEVX_PUBLIC_ORIGIN`, then
Vercel's domain. An explicitly empty or invalid override fails closed instead
of silently choosing another host. Remove an override to use the default.
Vercel chooses the shortest production custom domain when available, otherwise
a `vercel.app` domain; an explicit override makes the intended domain unambiguous.
See [Vercel's system variables](https://vercel.com/docs/environment-variables/system-environment-variables).

Save variables in the appropriate environment, then redeploy. Set the origin at
both build and runtime for deployments outside Vercel. Changing this setting does
not publish a CLI release or change the distribution source. When Releases is
ready, update the source-selection code and verify its URL and checksum together.

Local development defaults to `http://localhost:3000` (or `PORT`). For a tunnel:

```bash
KORZA_PUBLIC_ORIGIN=https://your-tunnel.example pnpm dev
```

Only that configured host is added to Next's development-origin allowlist.
HTTP origins are accepted only for local loopback during development or tests.
Changes to deployment origins require a rebuild.

The selected host must serve `/setup`, the archive and its checksum without browser
authentication. For local development on localhost, 127.0.0.1 or [::1], the page
shows a compact download-then-run command that trusts the local server and rejects
redirects. It waits for curl to succeed before executing the complete response.
Remote URLs and production builds keep the shebang guard, which rejects login HTML;
the shebang check detects a wrong response format, not an untrusted script.
The pinned digest detects altered downloads but does not authenticate a compromised
script server. DX-161 replaces this bundled prerelease with verified release
distribution; update the installer, archive and checksum together at that transition.

Public installer validation remains part of DX-161. A preview protected by Vercel
SSO can verify that login HTML is rejected, but cannot verify installation through
the public one-liner. Before marking that path verified, use a host where `/setup`,
the archive and checksum are accessible without browser authentication, then run
the rendered command on a clean Mac. Testing a binary copied into a VM validates
the CLI separately; it does not establish that the hosted download path works.

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
