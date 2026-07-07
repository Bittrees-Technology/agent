# agent.bittrees.org portal scaffold

This repository contains the first-cut static scaffold for the `agent.bittrees.org` portal.

## What is included

- A minimal Node.js server.
- A human landing page at `/`.
- Machine-readable discovery routes at:
  - `/llms.txt`
  - `/agents.json`
  - `/templates.json`
  - `/idacc/releases.json`
- A documented contribution-intent contract at `/contribution-intents`.
- Schema-annotated responses for each machine-readable route.
- A build step that copies the source server into `dist/` and writes a portal manifest.

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

## Contribution intent

`/contribution-intents` documents `agent.bittrees.contribution-intent.v1` request and response schemas so agents can prepare offline handoff packets.

The launch posture is read-only. `POST /contribution-intents` always returns `501` with the documented response contract and does not persist, relay, enqueue, or otherwise accept the submitted body. Live submission writes remain blocked until `security-router` clears the open security-gate items.

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

This copies `src/` into `dist/` and writes `dist/portal-manifest.json`.

To run the built copy:

```bash
npm run start:dist
```

## Notes

- `/llms.txt` is JSON-encoded in this first cut so the schema annotation stays explicit.
- No live Vercel or DNS connection is configured for this scaffold.
- The repository is intentionally minimal, static, and read-only for launch-gate review.
