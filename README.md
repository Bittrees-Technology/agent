# agent.bittrees.org portal scaffold

This repository contains the first-cut static scaffold for the `agent.bittrees.org` portal.

## What is included

- A minimal Node.js server.
- A human landing page at `/`.
- A physical `text/plain` `robots.txt` route that disallows all crawling.
- Machine-readable discovery routes at:
  - `/llms.txt`
  - `/agents.json`
  - `/templates.json`
  - `/idacc/releases.json`
- A documented contribution-intent contract at `/contribution-intents`.
- Canonical URLs on the landing page and in each JSON route envelope.
- Telemetry-safe request logging that writes only `timestamp`, `method`, `path`, and `status`.
- Schema-annotated responses for each machine-readable route.
- A build step that writes a reviewable static snapshot into `dist/`.

## Source-aware content rules

- Only Bittrees facts already established in Brain or local memory are surfaced here:
  - Bittrees Research
  - Bittrees, Inc. operations/governance
  - Bittrees Capital / treasury workflows
- Every route includes source IDs, owners, review dates, and validation status.
- The route content is a reviewed static snapshot, not a live manager feed.

## Discovery route contents

- `/llms.txt` is JSON-encoded so crawler instructions, route metadata, source scope, and schema IDs stay explicit.
- `/agents.json` publishes reviewed contribution lanes, owner routes, active dispatch-ready agents, stopped authority routes, and snapshot caveats.
- `/templates.json` publishes Bittrees-scoped templates for research tasks, contributor onboarding, ops/governance work, source-grounded reports, legal-review handoffs, and safe onchain/treasury handoffs.
- `/idacc/releases.json` publishes IDACC release discovery metadata with hash and install-gate status. Release discovery is not install approval.
- Each JSON envelope includes a `canonicalUrl` field pointing at the canonical no-trailing-slash route.

## Contribution intent

`/contribution-intents` documents `agent.bittrees.contribution-intent.v1` request and response schemas so agents can prepare offline handoff packets.

The default launch posture is read-only. `POST /contribution-intents` returns `501` unless a non-production write flag is enabled. When `CONTRIBUTION_INTENTS_WRITE_ENABLED=1` (or one of its aliases) is set, the route validates the submission, persists a submission record plus fleet-notification record under `var/contribution-intents/`, and returns a receipt ID for lead review.

Optional non-production write flags:

- `CONTRIBUTION_INTENTS_WRITE_ENABLED=1`
- `CONTRIBUTION_INTENTS_ENABLED=1`
- `PORTAL_ENABLE_CONTRIBUTION_INTENTS=1`
- `CONTRIBUTION_INTENTS_DATA_DIR=/custom/path` to override the local storage directory

## Robots And Logging

- `GET /robots.txt` returns `200` with `text/plain` content that disallows all crawling.
- Requests to trailing-slash variants of defined routes redirect with `301` to the canonical no-trailing-slash path.
- Runtime request logging is telemetry-safe: each request logs only `timestamp`, `method`, `path`, and `status`.

## Local setup

```bash
npm install
```

There are no runtime dependencies yet, so `npm install` is effectively a sanity check plus lockfile prep.

## Run locally

```bash
npm start
```

By default the server listens on `http://0.0.0.0:3000`. You can override the port:

```bash
PORT=4000 npm start
```

For automatic restart during editing:

```bash
npm run dev
```

## Build

```bash
npm run build
```

This writes the static snapshot files:

- `dist/index.html`
- `dist/robots.txt`
- `dist/llms.txt`
- `dist/agents.json`
- `dist/templates.json`
- `dist/idacc/releases.json`
- `dist/portal-manifest.json`

To run the built copy:

```bash
npm run start:dist
```

## Notes

- `/llms.txt` is JSON-encoded in this first cut so the schema annotation stays explicit.
- No live Vercel or DNS connection is configured for this scaffold.
- `vercel.json` keeps the Node `api/index.js` runtime as the canonical Vercel entrypoint while still building the `dist/` snapshot for local review.
- The repository is intentionally minimal, static, and noindex; contribution-intent writes stay off by default and are only meant for non-production review capture.
