# Production observability and backups

This runbook covers `https://agent.bittrees.org` production monitoring and backup capture. It does not authorize DNS, TLS, Vercel project, secret, deploy, wallet, signer, or public-launch mutations.

## Monitoring and alerting

The production monitor is `.github/workflows/production-observability.yml`.

- `monitor` runs every 15 minutes and on manual dispatch.
- It executes `npm run health -- --base-url=https://agent.bittrees.org` against `/api/health`.
- It executes `npm run smoke -- --base-url=https://agent.bittrees.org` against the published `/monitoring.json` route contract.
- It uploads `production-observability-*` artifacts containing the health summary and smoke log.
- On failure it opens, or comments on, a deduplicated GitHub issue titled `agent.bittrees.org production monitor failed`.

The uptime check is the fast alert for service availability and release-health shape. The smoke check is the contract alert for route status, noindex/nofollow retention, security headers, structured errors, source/claim drift, MCP route shape, IDACC release metadata, and contribution-gate posture.

The measurable public monitoring contract lives at `/monitoring.json`.

- SLO window: `30d rolling`
- `public-health-availability`: `99.9%` objective, `43` minutes of error budget, page at `SEV-1` after `2` consecutive monitor failures or immediate release-provenance drift
- `route-contract-smoke`: `99.5%` objective, `216` minutes of error budget, page at `SEV-2` on any route-contract regression
- `daily-backup-freshness`: `100%` objective, `0` minutes of error budget, page at `SEV-2` when the daily `02:17 UTC` backup fails or the manifest pointer is inconsistent

Issue titles are part of the alert contract and must remain stable for automation:

- `agent.bittrees.org production monitor failed`
- `agent.bittrees.org production backup failed`

Manual validation:

```bash
npm run health -- --base-url=https://agent.bittrees.org
npm run smoke -- --base-url=https://agent.bittrees.org
```

Protected staging or shadow-production URLs can be checked through the
authenticated Vercel CLI transport:

```bash
env -u VERCEL_TOKEN npm run rollout:check -- --base-url=https://agent-staging.bittrees.org --vercel-protected --health-only
env -u VERCEL_TOKEN npm run rollout:check -- --base-url=https://agent-staging-rollback.bittrees.org --vercel-protected --health-only
```

## Vercel project contract

The checked-in project link for this repo is Vercel project `bittrees-tech/agent`
with `projectId` `prj_EWpgzLIvSGXWeKKCEE580GIPUeha` and `orgId`
`team_5EGk9VVROK20lVlaEtPkZe50` in `.vercel/project.json`.

Observed operator-facing domain bindings on July 17, 2026:

- production custom domain `agent.bittrees.org`
- staging custom domain `agent-staging.bittrees.org`
- protected rollback rehearsal custom domain `agent-staging-rollback.bittrees.org`

Verified live state on July 17, 2026:

- `agent.bittrees.org` resolved to Vercel production deployment `dpl_DYf1My3XqNR3cuq1Mb7TosphuLz6`
  with release commit `857a3313a49cb485272a244298775b75515f10c8`.
- `agent-staging.bittrees.org` resolved to protected deployment
  `dpl_6ZmnQZJt4hjq1rsV1XTvjvFHHadm` and returned the expected unauthenticated
  `302` redirect to Vercel SSO.
- `agent-staging-rollback.bittrees.org` resolved to protected deployment
  `dpl_CsRigFyzBLqujp4mnpz4PKKj2N1U` and returned the same expected SSO redirect.
- `npm run rollout:rollback-target -- --project=agent --scope=bittrees-tech --exclude-url=https://agent.bittrees.org`
  selected retained READY production deployment
  `https://agent-8l7nljgcz-bittrees-tech.vercel.app` with
  `meta.githubCommitSha: c03faf8e262f4dd2d78f4ea29886ef9afcf33d4a` and
  `meta.gitDirty: "1"`.

Operational expectations:

- `agent-staging.bittrees.org` may return a Vercel SSO `302` for unauthenticated
  requests. Treat that as expected for protected staging and use
  `npm run rollout:check -- --base-url=https://agent-staging.bittrees.org --vercel-protected`
  when you need staging verification.
- `agent-staging-rollback.bittrees.org` is the protected rollback rehearsal
  alias. Treat the same Vercel SSO `302` behavior as expected and validate it
  through `--vercel-protected`.
- The repo-owned application env contract is the names-only list in
  `.env.example`. Do not add platform-managed Vercel env names to that file
  unless the app code starts reading them.
- Live Vercel project env names that are present but not referenced by the app
  code should be treated as operator-owned external state. As of July 17, 2026
  the observed set is `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`,
  `KV_REST_API_URL`, `KV_URL`, and `REDIS_URL`.

A failed smoke run is an actionable production contract alert. Do not relax the smoke expectations to hide deployment drift; route release, Vercel, DNS, TLS, and secret fixes to the owning deploy/backend tasks.

The workflow observes production and captures evidence; it does not create
deployments, move aliases, rotate secrets, or mutate DNS.

## Manual publish and rollback control

Production alias mutation is handled by
`.github/workflows/production-release-control.yml`, not by the observability
workflow. That workflow is manual-only (`workflow_dispatch`), runs in the
GitHub `production` environment, and requires `secrets.VERCEL_TOKEN`.

Operational expectations:

- `publish` requires an explicit deployment target and can optionally pin the
  expected commit SHA.
- `rollback` can auto-select the newest retained `READY` production deployment
  that is not currently serving `agent.bittrees.org`.
- The underlying `scripts/production-alias-control.mjs` flow is dry-run by
  default and refuses to mutate aliases unless the caller passes both
  `--apply` and `--confirm-alias=agent.bittrees.org`.
- Before any alias move, the release-control workflow runs
  `npm run rollout:check` against the selected deployment URL and writes
  `output/production-release-control/pre-release-rollout.json`.
- Alias control refuses targets that are not `production`, not `READY`, or
  report `meta.gitDirty=1` unless the caller explicitly allows the dirty
  target as an incident exception.
- Every alias move is followed by `npm run rollout:check -- --health-only` and
  `npm run smoke` against `https://agent.bittrees.org`.
- The workflow writes a single immutable `release-manifest.json` plus
  `release-manifest.json.sha256` under `output/production-release-control/`
  so plan, preview verification, alias result, post-release verification, and
  smoke evidence stay bound to one provenance record.
- The workflow uploads a `production-release-control-*` evidence artifact
  retained for 30 days.

## Backup capture

The production backup command is:

```bash
npm run backup:production -- --base-url=https://agent.bittrees.org --output-dir=output/production-backups --skip-vercel
```

The workflow `backup` job runs daily at 02:17 UTC and on manual dispatch. It uploads a `production-backup-*` artifact with 30-day retention.

The current default route set captures `15` route snapshots plus headers,
request ids, response request ids, and SHA-256 hashes. `latest-manifest.json`
is the pointer file that must match the selected `backup-manifest.json` before
restore.

Each backup writes a timestamped directory containing:

- `backup-manifest.json` with schema `agent.bittrees.production-backup.v1`.
- Route body snapshots and response headers for `/api/health`, `/monitoring.json`, `/portal-manifest.json`, `/idacc/releases.json`, the public JSON contracts, and `/v1/registry/agents`.
- SHA-256 hashes, status codes, content types, byte counts, request ids, and response request ids.
- Optional Vercel deployment metadata when the Vercel CLI is authenticated and `--skip-vercel` is omitted.
- Optional non-secret state paths supplied with `--include-path` or `PRODUCTION_STATE_PATHS`.

Current production writes are disabled by default, so there is no approved mutable production data directory to snapshot from Vercel. If a future approved deployment uses durable local or mounted state, include only the non-secret state paths:

```bash
PRODUCTION_STATE_PATHS=/var/lib/agent-bittrees/contribution-intents,/var/lib/agent-bittrees/workflow-state \
npm run backup:production -- --base-url=https://agent.bittrees.org --output-dir=/secure/backups/agent-bittrees
```

Use `--require-vercel` only in an operator environment where Vercel CLI auth is already configured:

```bash
npm run backup:production -- --base-url=https://agent.bittrees.org --require-vercel
```

## Restore procedure

1. Select the backup artifact and verify `latest-manifest.json.manifestSha256` matches the selected `backup-manifest.json`.
2. Compare route hashes and release metadata against the candidate or rollback deployment.
3. If explicit state paths were captured, stop writers first, copy files from `state/<path>/` back to the original path named in `backup-manifest.json`, then restart the service.
4. Run:

```bash
npm run health -- --base-url=https://agent.bittrees.org
npm run smoke -- --base-url=https://agent.bittrees.org
```

5. If a rollback deployment is needed, select and validate the target without mutating aliases:

```bash
npm run rollout:rollback-target -- --project=agent --scope=bittrees-tech --exclude-url=https://agent.bittrees.org
env -u VERCEL_TOKEN node scripts/rollout-check.mjs --health-only --base-url=https://<candidate-url> --vercel-protected
env -u VERCEL_TOKEN node scripts/smoke-check.mjs --base-url=https://<candidate-url> --vercel-protected
```

Alias promotion, DNS changes, TLS changes, deployment creation, and secret changes remain outside this runbook.

## Incident classification

- `SEV-1`: customer-visible outage or complete loss of public health/smoke coverage. Target first human response within `15` minutes.
- `SEV-2`: route-contract, release-provenance, or backup freshness failure with production still partially reachable. Target first human response within `60` minutes.
- `SEV-3`: flake, stale evidence snapshot, or documentation drift without active production impact. Triage within `24` hours.

First-response checklist:

1. Confirm whether `/api/health`, `/monitoring.json`, and the current production deployment all fail or only one slice is degraded.
2. Capture the failing GitHub Actions run URL, uploaded artifacts, `/api/health` `releaseMetadata`, and the echoed `X-Request-Id`.
3. Classify severity before changing deployment, DNS, TLS, Vercel protection, or secrets.
4. Validate any rollback candidate with protected `rollout:check` and `smoke-check` commands before requesting an alias move.

## Evidence anchors

- [production-observability.yml](../.github/workflows/production-observability.yml)
- [project.json](../.vercel/project.json)
- [.env.example](../.env.example)
- [request-url.mjs](../scripts/request-url.mjs)
- [rollout-check.mjs](../scripts/rollout-check.mjs)
- [select-rollback-target.mjs](../scripts/select-rollback-target.mjs)
- [production-backup.mjs](../scripts/production-backup.mjs)
