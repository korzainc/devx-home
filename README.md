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
Local login and telemetry consent redirect loopback aliases to that host before
sign-in starts. A stale form on another alias is rejected instead of creating an
OAuth state cookie that the callback cannot read. Existing sessions are retained.

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

The analysis badge is visible only to signed-in organisation members because its
totals include private repositories. Public repository analysis remains available
without signing in. Counts represent successful Analyze submissions: refreshing
or sharing the same run URL adds nothing, while submitting Analyze again creates
a new run. Every successful API request creates its own run; retrying the same
request counts again. These are raw successful submissions, including anonymous
public-repository analyses, not unique users or member adoption. Recording runs
after the response, and the badge streams separately; a new count can appear on
the next request. Storage failure must not prevent a report from rendering.

Collection is enabled only on Vercel production (`VERCEL=1` and
`VERCEL_ENV=production`). Preview and development deployments do not write usage,
including when they share the production database. For local acceptance, explicitly
set `KORZA_LOCAL_USAGE=1` and a `DATABASE_URL` pointing to an isolated loopback
PostgreSQL database; leave the Vercel variables unset. Remote local database URLs
are refused. Do not use a tunnel to a production database for local acceptance.
The same boundary applies to device monitoring and the development pilot.
Existing pilot rows remain historical data; unknown-provenance rows are not
silently relabelled or deleted.

## Opt-in device monitoring backend

Apply migrations through `0007_telemetry_read_indexes.sql` before enabling
`TELEMETRY_ENABLED=1`. Use the existing `DATABASE_URL`, migration-only
`DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET` and GitHub App authentication
configuration. Never edit `.env.local` for this rollout. The flag defaults off;
the earlier `/api/telemetry/logs` and `/metrics` pilot remains development-only.

The GitHub credentials must belong to the approved `korza-devx` App installed
on `korzainc`, with repository access for the signing-in user. Replacing a local
test App's credentials does not convert its stored GitHub user token. Acceptance
requires a grant from the approved App, a process restart and a matching callback
URL. Keep `BETTER_AUTH_SECRET` stable so existing encrypted tokens remain readable.
Changing the GitHub App credentials does not revoke issued telemetry credentials;
revoke those separately when needed.

The CLI opens `/telemetry/connect` with `redirect_uri`, `state`,
`code_challenge` and `code_challenge_method=S256`. Browser consent requires a
session, same-origin CSRF protection and fresh Korza App access verification.
Only `http://127.0.0.1:<port>/callback` is accepted. The returned code expires
after 60 seconds and can be exchanged once at `/api/telemetry/exchange` using
`{code, code_verifier, redirect_uri}`. The response contains
`{token, device_id, expires_at}`. Device credentials expire within 12 hours;
renewal requires another browser authorization. The CLI sends its existing
`device_id` in the connection request when renewing. Home verifies ownership
and rotates the token on that same device, preserving cumulative counter
deduplication and pending event identity. Only credential hashes are stored.
Ingestion rechecks the same approved GitHub App access policy using the device
owner's stored provider account. Positive access is cached for at most five
minutes; removal can therefore take up to five minutes to be observed. A
confirmed denial atomically revokes that owner's devices and pending authorization
codes. Code issuance and exchange serialize with removal under the user row lock,
so an old grant cannot revive a removed member's device. The
receiver rechecks membership and device status under shared row locks before
writing a batch. Missing or ambiguous GitHub accounts, empty tokens and provider
outages return 503 without changing membership or revoking devices, so the collector retains queued
counts; they never fall back to a stale positive verdict. Cache freshness uses the
database clock. If the cache expires before ingestion acquires its lock, the
receiver also returns 503 so the collector retries without asking for new consent.
Provider verification
has a ten-second wait budget and shares an in-flight refresh per owner. Better
Auth may finish its own token refresh after that deadline; the timed-out request
writes no membership verdict or usage. The 12-hour device
expiry and explicit browser renewal remain unchanged.
Expired codes are removed in batches of at most 1,000 during issuance.

`POST /api/telemetry/events` accepts bearer-authenticated normalized
`{events, metrics}` batches, at most 1,000 records and 256 KiB. Unknown fields,
plugins outside the shared catalogue approval list and invalid client/source combinations are rejected. IDs are
scoped to the device for retry deduplication. No raw OTLP attributes, prompts,
tool arguments, email or paths are accepted. Browser revocation lives at
`/telemetry/devices`; the CLI uses idempotent bearer `POST /api/telemetry/revoke`.
Revocation does not delete recorded counts or their device history.
The connected-devices page paginates retained history, so an older renewed device
remains reachable for browser revocation.
An expired or invalid revocation form shows a reload link; it never revokes a
device without valid CSRF protection. HTML forms use a same-origin referrer
policy so browsers supply an origin on submission; redirects retain no-referrer.

Migration `0007_telemetry_read_indexes.sql` adds indexes for plugin and skill
count reads and device/user foreign keys. It leaves previously applied migrations
unchanged. The transactional migration runner builds these indexes with ordinary
`CREATE INDEX`, so apply it during a maintenance window for a large existing
telemetry table.

Database connection acquisition is bounded to five seconds, including a wait for
an available pooled connection. Usage queries retain their one-second query
timeout; an unavailable database must not indefinitely block a completed report.
This is the existing shared pool, so the acquisition limit also bounds login and
session lookups. The page gate treats a failed lookup as signed out and redirects
to login without deleting the session cookie. This availability tradeoff is
intentional; actual deployed database wake-up latency still needs acceptance.

Plugin installation totals are grouped by both client and source. Claude's native
reports and installs verified through Korza CLI are displayed separately because
they can describe the same installation; they must not be added together. Codex
installation counts cover only installs verified through Korza CLI. Repeated
delivery of the same device/event ID is deduplicated. These counts are not unique
users or download totals.

Validation separates production identity acceptance from protocol evidence:

- Unit tests cover callback/PKCE/CSRF validation, fresh membership failure,
  strict normalized records and packet bounds.
- `TEST_TELEMETRY_DATABASE_URL=<local PostgreSQL URL> pnpm exec vitest run src/lib/telemetry-postgres.test.ts`
  creates and removes a unique schema, checks migration reruns and bounded
  cleanup, and tests atomic exchange, replay/expiry, deduplication and revocation
  with actual PostgreSQL and loopback HTTP. It refuses remote database hosts.
  Browser identity is substituted only in this test harness.
- CI runs that PostgreSQL/HTTP suite against the migration job's disposable
  database, in addition to the default unit suite. Connection-string overrides
  are rejected by the harness before opening a database connection.
- Real GitHub sign-in, fresh company access, browser consent through the Next
  proxy and the eventual deployment still need an authorized-user acceptance
  test. Passing the harness does not establish that a future credential or
  environment change will work.
