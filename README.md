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

Use the same host in `BETTER_AUTH_URL` and the GitHub App callback URL.
Local sign-in redirects loopback aliases to that host to keep OAuth cookies consistent.

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

The current archive and checksum are in [public/korza/](public/korza/).
This candidate was built on 2026-09-16 from `korza-cli` commit `7415747522e9d4760f12f1e75801ead18183ec12`.
It is ad-hoc signed; clean-VM acceptance is pending. Production builds exclude
demo and sandbox modes.
Later CLI changes do not update this bundle automatically.

The old `/devx/install.sh` URL redirects to `/setup`. The old versioned `/devx/`
archive and checksum URLs redirect to the matching `/korza/` assets. The CLI
repository is `korzainc/korza-cli`; this portal and `#devx` keep their names.

`korza setup --remove` removes the managed shell block, not installed tools,
the CLI binary or the `kz` alias. The FAQ explains what setup changes.

### Update manifest

`/korza/release.json` describes the single current macOS bundle: `version`,
archive `url`, checksum `sum_url`, and `notes`. It uses the same version and paths
as `/setup`, with absolute URLs for this deployment and no HTTP caching.
An unconfigured deployment returns 503 instead of advertising a release.

This endpoint does not switch existing clients away from GitHub Releases.
The CLI currently reads it only when `KORZA_UPDATE_MANIFEST` points to its URL;
default client wiring is a separate change. For each future update, bump the
binary version and refresh the archive, checksum and bundle version together.
Replacing an archive at the same version does not trigger the version comparison.
When distribution moves to GitHub Releases, retain this endpoint for older clients
and point its download and checksum URLs at the published assets.

### Installer deployment

No custom installer environment variables are needed in Vercel. `/setup` uses
Vercel's deployment URL and supplies the bundled download and checksum.
Local development uses `localhost` and the server port (default `3000`).
`KORZA_PUBLIC_ORIGIN` remains an optional override for another host or a development
tunnel. Use an HTTPS origin without credentials, path, query or fragment. HTTP is
allowed only for loopback hosts outside production. An empty or invalid override
fails closed: `/setup` and `/korza/release.json` return 503 rather than falling back
to a different download host. The validated hostname is also allowed for Next.js
development assets.
The installer installs to `~/.local/bin` by default.
The copied command downloads the complete script and checks its shell header
before running it. Failed downloads and unexpected responses stop
installation. Redirects are followed: the command uses `curl -fsSL`, and the
legacy `/devx/install.sh` path depends on a redirect to `/setup`. These checks
do not authenticate the server.

### Release handoff and validation

The chosen host must serve `/setup` and the bundle without browser authentication.
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
`public/korza/install.sh` with `korza-cli/install.sh`, copy the archive and checksum
together, update `BUNDLED_ARTIFACT_VERSION` if needed, and update the source
provenance above. Keep one archive and its matching checksum. Fetch `/setup`
again after a refresh; an older saved script may pin the previous checksum.
Check the route and installer tests before deploying.
A checksum detects mismatched bytes; it does not authenticate a compromised
installer server.

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

## Analysis usage counts

- Public repositories can be analysed without signing in. Site-wide run and
  distinct-repository totals include private repositories, so only signed-in
  organisation members can view them.
- A successful page run counts once; reloads and shared links reuse it. Another
  Analyze submission or successful API request, including a retry, adds a run.
  These are submission counts, not unique users or adoption.
- Monitoring failures leave the report available. Zero totals display as zero;
  unavailable totals are hidden.

## Opt-in device monitoring backend

- Off by default. Set `TELEMETRY_ENABLED=1`; leave `TELEMETRY_ENROLLMENT_MODE`
  unset or set it to `consent`. Other modes reject enrollment and uploads.
  CLI consent needs no company sign-in; viewing counts requires portal access.
- The CLI filters and queues client signals before sending counts to
  `/api/telemetry/events`. Home accepts approved plugins and normalized fields
  only, with no prompts, tool arguments, email or file paths.
- Device keys are stored as hashes and expire after 12 hours unless renewed.
  Revocation stops uploads and renewal without deleting recorded counts.
- Install totals combine native and Korza-assisted reports per client; different
  sources can describe the same install. Skill loads do not prove task completion.
  Counts are self-reported, not unique users or downloads.
- Codex `/plugins` installs are not counted. Terminal wrappers cover their own
  route; native install logs need a custom build. Codex skill counts require
  successful loads (`status: ok`). Use a fresh baseline when checking counts.
- Batches allow 1,000 records / 256 KiB, with 5,000 records per device per minute.
  IDs deduplicate retries, but traffic limits do not prevent inflated reports.
  Abuse controls, retention and deletion policy remain rollout requirements.

### Database and collection setup

- Apply migrations before enabling collection. **Use a fresh database for the
  revised, unreleased `0004_usage_monitoring.sql`.** Preserve older test databases
  and their migration ledgers. Runtime uses `DATABASE_URL`; migrations use
  `DATABASE_URL_UNPOOLED`. Follow [AGENTS.md](AGENTS.md); never edit `.env.local`.
- Hosted collection requires `NODE_ENV=production`, `VERCEL=1` and
  `VERCEL_ENV=production`. Preview deployments cannot collect.
- Local collection needs `KORZA_LOCAL_USAGE=1`, empty Vercel markers and an
  isolated PostgreSQL URL on `localhost` or `127.0.0.1`. Host overrides are refused;
  never tunnel to production. Supply a trusted TLS certificate with `sslrootcert`.
  Export the fresh local `DATABASE_URL`, then run:

```sh
DATABASE_URL_UNPOOLED="$DATABASE_URL" node scripts/migrate.mjs
VERCEL= VERCEL_ENV= KORZA_LOCAL_USAGE=1 TELEMETRY_ENABLED=1 pnpm dev
```

- `KORZA_LOCAL_SKILLS_PREVIEW=1` opens skill and plugin pages only on loopback in
  development. Legacy `/api/telemetry/logs` and `/metrics` are also development-only
  and require a `TELEMETRY_INGEST_TOKEN` of at least 32 characters.

### Verify

- Follow the [analysis walkthrough](https://github.com/korzainc/devx-home/pull/72)
  and [client setup and count checks](https://github.com/korzainc/korza-cli/pull/5).
- Run the [standard checks](#develop), then these database suites against isolated
  loopback PostgreSQL. They create separate test schemas and also run in CI:

```sh
TEST_TELEMETRY_DATABASE_URL="$DATABASE_URL" pnpm exec vitest run src/lib/telemetry-postgres.test.ts src/lib/telemetry-consent-postgres.test.ts
```

- Real client delivery, portal login and deployment still need separate checks.
