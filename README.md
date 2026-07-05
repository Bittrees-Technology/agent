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
- A build step that copies the source server into `dist/` and writes a portal manifest.

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

This copies `src/` into `dist/` and writes `dist/portal-manifest.json`.

To run the built copy:

```bash
npm run start:dist
```

## Notes

- `/llms.txt` is JSON-encoded in this first cut so the schema annotation stays explicit.
- No live Vercel or DNS connection is configured for this scaffold.
- The repository is intentionally minimal and local-only.
