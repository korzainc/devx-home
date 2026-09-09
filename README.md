# devx-home

Korza's DevX portal provides tool and skill catalogues, GitHub sign-in, CI gap
analysis, getting-started instructions, a roadmap and product updates. The
project is tracked as **DevX Home**. The CLI is named **Korza CLI**, with `korza`
as its executable and `kz` as its short alias; the support channel remains `#devx`.

## Develop

Use Node 24.x and the pnpm version pinned in `package.json`. Install the locked
dependencies before running the app:

```bash
pnpm install --frozen-lockfile
pnpm dev                       # http://localhost:3000
```

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
```

The catalogues and getting-started UI can be developed locally. Authentication
and database-backed features need the existing project credentials and database
connection. Follow [AGENTS.md](AGENTS.md) for access and database constraints;
do not overwrite `.env.local` or provision a replacement database.

`pnpm vercel-build` runs migrations only when `VERCEL_ENV=production`, then
builds Next.js. Previews skip that migration step. `pnpm migrate` runs migrations
explicitly against `DATABASE_URL_UNPOOLED`; the app uses pooled `DATABASE_URL`.
The installer settings below do not replace these existing application settings.

## Installer distribution

`/getting-started` renders a copyable install command on the server. `/setup`
serves the vendored installer with this deployment's bundle URL and expected
SHA-256 digest. The installer downloads and validates the candidate before
replacing an existing binary, then prints a setup command. It uses `korza setup`
when PATH selects that binary, otherwise a safely quoted full path. It creates
`kz` only when that name is available.

The archive and its checksum live under [public/korza/](public/korza/). One
thing about the bundle is checkable from this repository alone: the archive's
SHA-256 matches its committed sidecar. Two further facts were observed
externally on 2026-09-09 and are recorded here rather than reproducible from
this repository: `public/korza/install.sh` was verified byte-for-byte identical
to `install.sh` at `korza-cli` commit `d3192ad`, and the archive came from a
local build of that commit whose manifest is not published. Treat the binary's
provenance as recorded rather than independently verified until a signed public
release replaces this path. Later CLI changes do not update the bundle
automatically. Production builds reject demo/sandbox entry points;
`korza setup --help` lists the supported setup flags.

The archive URL carries the first 12 characters of its own digest, so each
bundle has a distinct address. This is not about the copyable command on
`/getting-started`, which holds only the `/setup` URL: `/setup` is `no-store`
and generates its pin per request, so running that command fetches the bundle
URL and digest generated for that request. It is about a saved generated
installer script, which does embed a pin.

At each bundled refresh, retain the immediately previous digest-named archive
and sidecar so a saved script can still download the bytes it pins, and list the
outgoing name in `RETAINED_ARCHIVE_NAMES`. Older pairs may be deleted; a saved
script referencing a deleted pair is no longer supported and will receive a 404
from deployments that no longer serve it. The earlier unsuffixed
`/korza/korza-0.1.0-macos.tar.gz` URL redirects to the current archive.

The old `/devx/install.sh` URL redirects to `/setup`, and the old versioned
`/devx/` archive and checksum URLs redirect to the current `/korza/` archive and
checksum. The CLI repository is `korzainc/korza-cli`; this portal remains
`korzainc/devx-home`, and the support channel remains `#devx`.

The rename does not delete an old `~/.local/bin/devx` installation. Locate it
with `command -v devx`; after `korza --version` succeeds and you confirm it is
the earlier Korza CLI, remove only that old executable. Keep `~/.devx` state
and the existing managed shell markers. `korza setup --remove` removes the
managed shell block, not installed tools, the `korza` binary or the `kz` alias.
The page FAQ includes this migration and removal guidance.

### Do any installer variables need configuring?

**Normally, none.** Vercel supplies deployment domains, `/setup` generates the
bundle URL and checksum pin, and the installer has directory and repository
defaults. Only `KORZA_PUBLIC_ORIGIN` is an optional website setting. The other
`KORZA_*` inputs below belong to the installer; they are not deployment
requirements. Retired `DEVX_*` overrides are ignored.

| Setting               | What happens without a manual value                                                                                                                                        | Reason to retain it                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `KORZA_PUBLIC_ORIGIN` | Vercel production uses `VERCEL_PROJECT_PRODUCTION_URL`, falling back to `VERCEL_URL`; previews use `VERCEL_URL`. Local development uses `http://localhost:3000` or `PORT`. | Optional choice of an exact public domain, non-Vercel hosting or a development tunnel.                                                 |
| `KORZA_DIST_URL`      | `/setup` generates the URL from the selected origin and committed artifact version. The standalone installer without this input looks up a GitHub release.                 | Pass the selected bundle to a shell script, which cannot recover its original download URL when piped or evaluated.                    |
| `KORZA_DIST_SHA256`   | `/setup` reads the expected digest from the committed sidecar and embeds it. The standalone installer without a pin downloads a sidecar.                                   | Keep the expected digest tied to the selected bundle; calculating the downloaded file's hash alone cannot establish what was expected. |
| `KORZA_BIN_DIR`       | The installer uses `$HOME/.local/bin`.                                                                                                                                     | Optional destination for the CLI binary, including isolated installer tests. If `HOME` is unavailable, a directory must be supplied.   |
| `KORZA_REPO`          | The standalone installer uses `korzainc/korza-cli`.                                                                                                                        | Optional standalone installer override for another repository. It is ignored when `/setup` supplies the bundle URL.                    |

The last four settings are **not Vercel dashboard inputs**. The generated URL
and checksum are an interface between the website and its installer. Shell
variables are one way to pass these values, not an additional deployment
requirement. Replacing them with script literals would still require the same
URL and expected digest; it would change the interface without removing those
requirements.

`KORZA_BIN_DIR` does not sandbox `korza setup`: it relocates only the CLI binary
installed by `install.sh`. Normal setup still manages tools and configuration
under the user's home. `KORZA_REPO` affects installer discovery only, not the
compiled CLI updater. These overrides can remain optional without making users
configure them for normal installation.

### Vercel deployment

Enable access to Vercel's system environment variables. Vercel supplies
`VERCEL_ENV`, `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL`; do not rename or
manually populate them. Its production-domain value selects the shortest custom
domain, or a `vercel.app` domain if there is no custom domain.
See [Vercel's system-variable reference](https://vercel.com/docs/environment-variables/system-environment-variables).

Leave `KORZA_PUBLIC_ORIGIN` unset if the inferred domain
is correct. If a specific public host is needed, set `KORZA_PUBLIC_ORIGIN` to
an HTTPS origin such as `https://your-domain.example`, with no path, credentials,
query or fragment. Scope a production override to **Production**. Normally leave
**Preview** unset so each preview installs its own bundle.

Precedence is the Korza override, then the deployment or
local-development default. An explicitly empty or invalid override fails closed;
remove it to restore inference. If no valid origin is available, the page offers
manual setup and `/setup` returns HTTP 503. Request `Host` and forwarded headers
never choose the download server. The server-rendered command and generated
installer must agree on a trusted origin, rather than guessing from a request.

Save changes in the intended environment and redeploy. For production hosting
outside Vercel, provide a valid origin at build and runtime. CLI build settings
`KORZA_SIGN_ID` and `KORZA_KEYCHAIN_PROFILE` belong on the release-build machine;
`KORZA_UPDATE_MANIFEST` is a CLI rehearsal override. None belongs in the website's
normal deployment configuration.

For a local tunnel:

```bash
KORZA_PUBLIC_ORIGIN=https://your-tunnel.example pnpm dev
```

Only the selected host is added to Next's development-origin allowlist. HTTP
origins are allowed only for loopback outside production. Locally, the page uses
a compact download-then-run command, rejects redirects and waits for curl to
succeed. Remote URLs and production builds retain the shebang guard to reject
login HTML. This is response-format validation, not authentication of a script.

### Release handoff and validation

The bundle remains an ad-hoc-signed prerelease candidate. DX-161 covered public
distribution and was canceled on 2026-09-09 as superseded by the deployment-origin
flow, so the release transition below is not currently tracked by a ticket. A
Vercel login page will stop the terminal installer; the HTML guard does not
bypass deployment protection. The chosen host must serve `/setup` and the bundle
without browser authentication.
Keep the checksum sidecar accessible for manual verification as well.

When the CLI release is ready:

1. Validate the candidate on a clean Mac or disposable macOS VM, complete
   Developer ID signing and accepted notarization, and publish the universal
   macOS archive with its matching SHA-256 sidecar.
2. Update `/setup` source selection in `src/lib/setup-script.ts` to use the
   verified release distribution. Publishing a GitHub release or changing the
   origin alone does not switch this website away from its committed bundle.
3. Verify the rendered install command on a clean Mac against the actual public
   host, including the URL, expected checksum, signature and printed setup
   command. A copied binary tested in a VM does not prove the hosted path works.

For a bundled refresh before that transition, synchronize
`public/korza/install.sh` with `korza-cli/install.sh` and copy the archive and
checksum together, naming both after the first 12 characters of the new
archive's digest. Update `BUNDLED_ARTIFACT_DIGEST` in `src/lib/artifact.ts`, and
`BUNDLED_ARTIFACT_VERSION` if the CLI version moved. Add the outgoing name to
`RETAINED_ARCHIVE_NAMES`, keeping its files committed, and drop the entry before
it along with its files. Update the recorded source commit and observation date
above. `pnpm test` covers the naming, the sidecar and the
installer; run it before deploying. A checksum detects mismatched bytes; it does
not authenticate a compromised installer server.

## Toolchain maintenance

`pnpm typecheck` runs `next typegen` before `tsc --noEmit` because the TypeScript
configuration includes Next's generated route and layout types. Keep that order
on a clean checkout.

Dependency build permissions are committed in `pnpm-workspace.yaml`, including
`unrs-resolver` for the lint toolchain. Review dependency build-script changes
rather than assuming an updated package has the same requirements.

The workspace also pins `@eslint/eslintrc@3.3.6`'s `js-yaml` dependency to
4.3.2 for [CVE-2026-84375](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh).
This stays within the parent's supported v4 range. Remove the scoped override
when replacing that parent with a version that resolves a patched parser.

`package.json` currently constrains TypeScript to `~6.0.3` and ESLint to `^9`.
Use `pnpm-lock.yaml` for the resolved versions; this README does not claim every
dependency is the latest release. When upgrading the lint toolchain, check
compatibility with `eslint-config-next` and run formatting, tests, lint, type
checking and a production build together.
