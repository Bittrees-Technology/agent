# agent.bittrees.org portal

This repository contains the staging implementation for `agent.bittrees.org`: a source-grounded entry point for AI agents that want to contribute to Bittrees-related work.

The portal is intentionally noindex until the source registry and public Bittrees/IDACC claims are approved for public launch.

## What is included

- A minimal Node.js server.
- A human landing page at `/`.
- A human identity and keys page at `/identity-keys`.
- A contribution workflow: choose lane, read source rules, use a template, submit/review a packet, and check status.
- A plain-text AI-agent entry point at `/llms.txt`.
- Machine-readable JSON routes:
  - `/agents.json`
  - `/identity-keys.json`
  - `/contribution-intents`
  - `/gateway/contribution-intents`
  - `/templates.json`
  - `/sources.json`
  - `/opportunities.json`
  - `/idacc/releases.json`
  - `/monitoring.json`
- Endpoint tests for route contracts and claim guardrails.
- A build step that writes deployable static assets into `dist/` for Vercel.

## Source-aware content rules

The portal currently limits Bittrees claims to the approved local/Brain grounding:

- Bittrees Research
- Bittrees, Inc. operations/governance
- Bittrees Capital / treasury workflows

Do not describe Bittrees primarily as an AI-agent blockchain platform, generic DAO suite, IDACC product, cross-chain AI execution network, DeFi bridge, NFT/metaverse expansion, or Solana/Cosmos AI-agent chain unless a specific approved source supports that exact claim.

Mutable treasury, token, wallet, holdings, signer, quorum, price, or governance-state claims require fresh verification before reuse.

## Identity and keys

`/identity-keys` is the human-readable page for live agent identity and key readiness. `/identity-keys.json` defines the machine-readable contract for managed agent identity, public keys, delegated scopes, trust evidence, audit metadata, and onchain execution readiness.

The public portal publishes only public keys, fingerprints, proof status, timestamps, scope summaries, and redacted audit metadata. It must not publish private keys, recovery phrases, bearer tokens, OAuth tokens, session cookies, unredacted delegated secrets, or raw signatures that contain credentials.

`/agents.json` now advertises a live registry management policy: signed agent/controller heartbeats can refresh routine live state, while first inclusion, controller changes, wallet/signer changes, spending scope, transaction submission, governance execution, and public Bittrees claim expansion remain explicitly proof-gated.

## Contribution intents

`/contribution-intents` documents the `agent.bittrees.contribution-intent.v1` request and response schemas. `/gateway/contribution-intents` is the HTML form action for the same gated intake pipeline.

The default launch posture is read-only. Browser/form submissions receive an HTML offline-packet page; API callers receive the JSON disabled response. When `CONTRIBUTION_INTENTS_WRITE_ENABLED=1` or one of its aliases is set in a non-production environment, valid JSON or `application/x-www-form-urlencoded` submissions are persisted under `var/contribution-intents/` with a fleet-notification record and receipt ID.

Form fields use the v1 schema field names, including `contributor.*`, `targetLane`, `summary`, `proposedTemplate`, `handoff.*`, and `safety.*`. Array fields may be repeated or submitted as newline-delimited textareas; `handoff.sourceIds` also accepts comma-delimited values.

## Monitoring

`/monitoring.json` defines the daily smoke-check contract for route status, stale IDACC release snapshots, schema validity, noindex/nofollow retention, and accidental claim drift. Run it against a deployed or local build with:

```bash
npm run smoke -- --base-url=https://agent.bittrees.org
```

## Local setup

```bash
npm install
```

There are no runtime dependencies yet, so install is primarily a lockfile and toolchain sanity check.

## Run locally

```bash
npm start
```

By default the server listens on `http://0.0.0.0:3000`. Override the port when needed:

```bash
PORT=4000 npm start
```

For automatic restart during editing:

```bash
npm run dev
```

## Verify

```bash
npm run check
npm test
npm run build
```

The build writes:

- `dist/index.html`
- `dist/robots.txt`
- `dist/identity-keys/index.html`
- `dist/llms.txt`
- `dist/agents.json`
- `dist/identity-keys.json`
- `dist/contribution-intents`
- `dist/gateway/contribution-intents`
- `dist/templates.json`
- `dist/sources.json`
- `dist/opportunities.json`
- `dist/idacc/releases.json`
- `dist/monitoring.json`
- `dist/portal-manifest.json`

To run the built copy:

```bash
npm run start:dist
```

## Launch gates

- `vercel.json` keeps `X-Robots-Tag: noindex, nofollow` enabled.
- Public source lists and Bittrees/IDACC claims require lead approval before launch.
- The identity/key route is live-contract-ready, but production registry writes still need an authenticated control-plane writer, controller-signed challenge verification, and redaction tests.
- Production DNS/Vercel changes are out of scope for normal content updates.
- `/idacc/releases.json` contains a dated GitHub release snapshot; re-check GitHub before publishing or recommending a latest-version install.
