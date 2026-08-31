<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# The database already exists

Postgres is a Neon instance created through the Vercel Marketplace and connected to the Vercel
project, so `DATABASE_URL` and `DATABASE_URL_UNPOOLED` arrive from Vercel. There is deliberately no
Neon account, no `NEON_API_KEY` and no Neon CLI profile.

Neon's own agent skills read that absence as "no account" and route you into a claimable-project
flow that provisions a second, temporary database. Do not follow it. Do not run `neon init --agent`,
`neon claim` or `neon link`, and do not install the Neon CLI or MCP server globally.

Never write to `.env.local`. It holds the GitHub App client secret, which GitHub displays once and
cannot re-issue. Read current values with `vercel env pull .env.vercel` instead.

Runtime queries use the pooled `DATABASE_URL`. Schema migrations use `DATABASE_URL_UNPOOLED`,
because transaction-mode poolers break session-level migration statements.

The Neon skills are not vendored here. If you want them:
`npx skills add neondatabase/agent-skills -s neon -s neon-postgres`
