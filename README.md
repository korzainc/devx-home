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

- Public repositories can be analysed without signing in. Site-wide totals include
  private repositories and are visible only to signed-in organisation members.
- A successful page analysis counts once per run URL: reloads and shared links
  reuse it; another Analyze submission creates a new run. Each successful API
  request, including a retry, creates a new run. These are submission counts,
  not unique users or verified adoption; run IDs are not abuse protection.
- The page starts recording when analysis succeeds and reads totals afterwards
  in the same response. The report streams independently of monitoring storage.
  API recording runs after its response. Failed writes do not add a count.
  Zero totals display as zero; failed reads and failed viewing gates hide them.

## Opt-in device monitoring backend

```text
CLI consent + private key → enroll/renew
Client signals → local filter + queue → Home /events → PostgreSQL → counts
```

- Device monitoring requires `TELEMETRY_ENABLED=1` (off by default). It needs no
  company sign-in; a device key identifies an installation, not a member.
  Viewing counts still requires normal portal access.
- `GET /api/telemetry/enroll` returns `{mode:"consent"}`. Mode may be unset or
  `TELEMETRY_ENROLLMENT_MODE=consent`; explicit `github` or unknown values reject
  enrollment and uploads. Discovery returns 503 for those obsolete modes.
- After terminal consent, the CLI posts `{consent:true}` with its random bearer
  to `/api/telemetry/enroll`. Home stores only the hash and returns
  `{device_id,expires_at,mode}`. Repeating it renews the same device for 12 hours.
  Background renewal adds `renew:true` and cannot register an unknown device.
  Revoked and historical company keys cannot enroll, renew or upload. Enrollment
  rejects browser origins and allows at most 60 new devices per minute.
- Bearer `POST /api/telemetry/revoke` stops uploads and renewal without deleting
  counts or history. It also allows historical company-key cleanup while
  collection is enabled. Old rows keep their original provenance.
- `/api/telemetry/events` accepts normalized `{events,metrics}` only: at most
  1,000 records / 256 KiB per batch and 5,000 records per device per minute.
  A 429 leaves the CLI queue for retry.
  Device-scoped IDs deduplicate delivery; cumulative metrics retain the maximum.
- Unknown fields, unapproved plugins and invalid client/source combinations are
  rejected. No raw OTLP attributes, prompts, tool arguments, email or paths reach
  this endpoint. Diagnostics contain only operation, stage and HTTP status.
- Install totals combine native and Korza-assisted reports per client, including
  optional terminal wrappers. Sources remain stored; different sources may
  describe the same physical install. Totals are not users or download counts.
- Official Codex's `/plugins` menu has no supported completion event. Optional
  Korza terminal wrappers cover their own route; `--native-install-logs` is an
  experimental route verified only with a custom Codex build. Prompts/traces
  remain off. Codex otherwise reports `codex.skill.injected` with `status: ok`;
  loads are not completed tasks or every skill-file read. Use a fresh acceptance
  baseline: older normalized rows and queued batches cannot be reclassified.
- Metric inputs are non-negative safe integers (maximum 9,007,199,254,740,991);
  totals preserve exact decimal digits above that range. Traffic limits do not
  prevent inflated reports. Abuse controls, value limits, retention and deletion
  policy remain rollout requirements; counters are not silently clamped.

### Database and collection setup

- Apply migrations before enabling collection. Runtime uses `DATABASE_URL`;
  migrations use `DATABASE_URL_UNPOOLED`. Never edit `.env.local` for this setup.
- **Use a fresh database for the revised, unreleased `0004_usage_monitoring.sql`.**
  Earlier versions ran only in local/test databases. Preserve those databases;
  never rewrite their migration ledger or checksums. Authentication migrations
  are unchanged; historical company keys remain rejected in older schemas.
- Hosted collection requires `NODE_ENV=production`, `VERCEL=1` and
  `VERCEL_ENV=production`. Preview cannot collect, even with a shared production
  database; development cannot inherit hosted production markers to enable it.
- Local collection requires `KORZA_LOCAL_USAGE=1`, empty Vercel markers and an
  isolated PostgreSQL URL on `127.0.0.1` or `localhost`. Remote hosts, IPv6 and
  URLs with host overrides are refused. Never tunnel to production. The app
  verifies TLS; provide a trusted certificate through `sslrootcert`. Export the
  fresh local URL before running:

```sh
DATABASE_URL_UNPOOLED="$DATABASE_URL" node scripts/migrate.mjs
VERCEL= VERCEL_ENV= KORZA_LOCAL_USAGE=1 TELEMETRY_ENABLED=1 pnpm dev
```

- For local skill-page checks, also set `KORZA_LOCAL_SKILLS_PREVIEW=1`; it only
  opens `/skills` and plugin pages on loopback in development, not deployments.
- Legacy `/api/telemetry/logs` and `/metrics` also require development mode and
  a `TELEMETRY_INGEST_TOKEN` of at least 32 characters; they are not hosted routes.
- Pool acquisition is limited to five seconds, including login/session lookups;
  usage queries have a one-second timeout. A failed page-gate lookup redirects
  to login without deleting the cookie. Deployed wake-up latency needs acceptance.

### Verify

- Sign in as an organisation member and note the CI coverage totals.
- Analyse a repository: runs **+1**, repositories **+1 only if not counted before**.
- Reload or share that report: both totals stay unchanged.
- Analyse the same repository again: only runs **+1**.
- Analyse another previously uncounted repository: both totals **+1**.
- Check plugin/skill counts using [CLI #5's steps](https://github.com/korzainc/korza-cli/pull/5).
- Run the [standard checks](#develop), then the database checks below:

```sh
TEST_TELEMETRY_DATABASE_URL="$DATABASE_URL" pnpm exec vitest run src/lib/telemetry-postgres.test.ts src/lib/telemetry-consent-postgres.test.ts
```

- Database checks use isolated loopback schemas for migrations, enrollment,
  quotas, deduplication, counts and revocation. CI runs both suites.
- Real client delivery, portal login and deployment checks remain separate from
  these protocol tests.
