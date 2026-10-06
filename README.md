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
Local login redirects loopback aliases to that host before sign-in starts. A stale form on another alias is rejected instead of creating an
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
public-repository analyses, not unique users or member adoption. The page's run
ID deduplicates reloads and shared links; it is not an abuse control. Successful
API requests always get a new run ID. These totals are not an audited measure of
adoption. Recording runs
after the response, and the badge streams separately; a new count can appear on
the next request. Storage failure must not prevent a report from rendering.

Hosted collection requires `NODE_ENV=production`, `VERCEL=1` and
`VERCEL_ENV=production`. Previews cannot collect, including when they share the
production database. Development processes cannot enable hosted collection by
inheriting production markers. For local acceptance, explicitly
set `KORZA_LOCAL_USAGE=1` and a `DATABASE_URL` pointing to an isolated loopback
PostgreSQL database (`127.0.0.1` or `localhost`). The app requires TLS with a
trusted certificate; set `sslrootcert` in the connection URL for a local CA.
Start with
`VERCEL= VERCEL_ENV= KORZA_LOCAL_USAGE=1 pnpm dev` so inherited dotenv markers
do not disable local collection by selecting the hosted check.
Bracketed IPv6 URLs are not enabled for local collection with the current driver. Remote local database URLs
are refused. Do not use a tunnel to a production database for local acceptance.
The same boundary applies to device monitoring. The legacy pilot requires
development mode, so any non-empty `VERCEL` or `VERCEL_ENV` disables it. It also
requires explicit local opt-in and a loopback database.
Existing pilot rows remain historical data; unknown-provenance rows are not
silently relabelled or deleted.

## Opt-in device monitoring backend

Apply `0004_usage_monitoring.sql` before enabling
`TELEMETRY_ENABLED=1`. Use the existing `DATABASE_URL`, migration-only
`DATABASE_URL_UNPOOLED`. Never edit `.env.local` for this rollout. The flag defaults off;
the earlier `/api/telemetry/logs` and `/metrics` pilot remains development-only.

Monitoring uses the CLI's explicit sharing choice and a private device key. It
needs no company sign-in or GitHub App credentials; a device key proves an
installation, not membership. Portal sign-in and viewing access are unchanged.
`GET /api/telemetry/enroll` advertises `{mode:"consent"}`. The enrollment mode may
be unset or `TELEMETRY_ENROLLMENT_MODE=consent`. Explicit obsolete `github` or
unknown values fail closed: discovery returns 503, enrollment is refused, and
uploads stop. An explicitly company-only deployment is never silently made public.
Bearer revocation remains available for cleanup while collection is enabled.

The CLI reads `GET /api/telemetry/enroll`, then sends
`POST /api/telemetry/enroll` with `{consent:true}` and its private random bearer.
The server stores only its hash and returns `{device_id,expires_at,mode}`.
Repeated requests renew the same device for 12 hours, preserving deduplication.
Background renewals also send `renew:true`; unknown devices are rejected rather
than registered again. The original terminal consent remains required.
Revoked tokens cannot renew. Enrollment accepts JSON from the CLI, rejects browser
origin headers, and permits at most 60 new devices per minute across the deployment.
Each consent device may submit at most 5,000 records per minute; HTTP 429 retains
the CLI queue for retry. These limits bound traffic, not the truth of self-reported
activity. Deployment-level abuse protection and retention remain rollout work.

Devices have no user account. Existing company device keys are rejected at
enrollment and both ingestion checks; they are never relabelled as consent.
Event and metric rows retain their `identity_kind` provenance, including
historical `github` and `legacy` rows. Recorded totals remain self-reported,
including installations without company sign-in; they are not verified employee
adoption. Company browser authorization, code exchange and browser device
management are no longer part of monitoring.

`POST /api/telemetry/events` accepts bearer-authenticated normalized
`{events, metrics}` batches, at most 1,000 records and 256 KiB. Unknown fields,
plugins outside the shared catalogue approval list and invalid client/source combinations are rejected. IDs are
scoped to the device for retry deduplication. No raw OTLP attributes, prompts,
tool arguments, email or paths are accepted. The CLI uses idempotent bearer
`POST /api/telemetry/revoke`, including cleanup of historical company keys.
Revocation does not delete recorded counts or their device history.
Korza-assisted install counts also cover the CLI's opt-in terminal command
wrappers. Home combines install reports per client while retaining each report’s
source in the database.
Wrappers do not repair official Codex's in-session install reporting.
The monitoring migration creates the tables and their read indexes together.
Run it before collecting usage; the earlier authentication migrations are unchanged.
Monitoring migrations were applied only to local/test databases. This unreleased
consolidated migration has been revised to remove company-only storage. Preserve
older databases and use a fresh database for this migration; the runner refuses
changed checksums and must never have its existing ledger rewritten. The retained
consent handlers also reject company keys in an older schema without relabelling
or deleting its history.

Database connection acquisition is bounded to five seconds, including a wait for
an available pooled connection. Usage queries retain their one-second query
timeout; an unavailable database must not indefinitely block a completed report.
This is the existing shared pool, so the acquisition limit also bounds login and
session lookups. The page gate treats a failed lookup as signed out and redirects
to login without deleting the session cookie. This availability tradeoff is
intentional; actual deployed database wake-up latency still needs acceptance.

Plugin installation totals sum recorded reports per client. The database retains
each report's native or Korza-assisted source, including wrapped terminal commands.
Historical reports from different sources can describe the same installation;
the displayed total is not a deduplicated count of physical installs or adoption.
Official Codex terminal installs can be recorded through the optional Korza
launcher; its `/plugins` menu lacks a supported completion event. Native Codex
install logs are a separate experimental route, checked only with a custom
source build and explicit `--native-install-logs` opt-in. That choice sends
diagnostics to the local filter; prompts and traces remain off. Codex otherwise
exports skill-load metrics. Repeated delivery of the same device/event ID is deduplicated.
These counts are not unique users or download totals.

Codex skill-load counts accept only `codex.skill.injected` points with
`status: ok`; failed, missing or unknown outcomes are excluded during filtering.
Use `$codezen:code-review` for explicit Codex selection; `codezen_code-review` is
the normalized reporting label. Native implicit detection can miss a skill read
together with other files in one shell command. Counts therefore describe reported
loads, not every instruction-file access or completed task. Earlier normalized rows omit
the original status, so this correction cannot reclassify historical counts or
pending batches from an older collector. Use a fresh baseline for acceptance;
upgrading does not silently delete earlier data or queued reports.

Metric points must be non-negative safe integers (at most 9,007,199,254,740,991).
Aggregates retain exact decimal digits above that range. This numeric limit
prevents invalid values, not inflated client reports. Consent devices are limited
to 5,000 records per minute; this limits traffic, not claimed cumulative values.
Limits on self-reported values still need an agreed policy. The receiver does not silently clamp cumulative counters.
Retention and deletion policy also remain prerequisites for activation; revocation
stops new uploads but retains existing counts. Telemetry route diagnostics contain
only the operation, processing stage and HTTP status, excluding errors and request data.

Validation separates protocol evidence from real client and deployment acceptance:

- Unit tests cover device bearer checks, explicit consent, rollout/Preview gates,
  strict normalized records and packet bounds.
- `TEST_TELEMETRY_DATABASE_URL=<local PostgreSQL URL> pnpm exec vitest run src/lib/telemetry-postgres.test.ts src/lib/telemetry-consent-postgres.test.ts`
  creates and removes unique schemas, checks migration reruns and read indexes,
  and tests enrollment, renewal, quotas, deduplication, exact counts, revocation
  races and historical company-key rejection using actual PostgreSQL. The first
  suite also exercises the retained routes over loopback HTTP. Both refuse remote
  database hosts and connection-string overrides before opening a connection.
  No company identity is substituted; the HTTP adapter substitutes only Next's
  request-context marker.
- CI runs both PostgreSQL suites against the migration job's disposable database,
  in addition to the default unit suite.
- Real native client delivery and the eventual deployment still need acceptance.
  Ordinary portal GitHub sign-in and member-only viewing remain separate checks;
  passing a device-protocol harness does not validate that browser login.
