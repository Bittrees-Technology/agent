# agent.bittrees.org portal scaffold

This repository contains the first-cut local scaffold for the `agent.bittrees.org` portal.

## What is included

- A minimal Node.js server.
- A human landing page at `/`.
- Machine-readable stub routes at:
  - `/llms.txt`
  - `/agents.json`
  - `/templates.json`
  - `/idacc/releases.json`
- Schema-annotated responses for each stub route.
- A build step that writes deployable static assets into `dist/` for Vercel.

## Source-aware content rules

- Only Bittrees facts already established in Brain or local memory are surfaced here:
  - Bittrees Research
  - Bittrees, Inc. operations/governance
  - Bittrees Capital / treasury workflows
- Anything else in this scaffold is an explicit placeholder until sourced.

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

This writes deployable static files:

- `dist/index.html`
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
- `vercel.json` configures Vercel to build and serve the static `dist/` output.
- The scaffold remains intentionally minimal and noindex until public launch approval.
