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

Manual validation:

```bash
npm run health -- --base-url=https://agent.bittrees.org
npm run smoke -- --base-url=https://agent.bittrees.org
```

Protected staging or shadow-production URLs can be checked through the
authenticated Vercel CLI transport:

```bash
npm run rollout:check -- --base-url=https://agent-staging.bittrees.org --vercel-protected
```

A failed smoke run is an actionable production contract alert. Do not relax the smoke expectations to hide deployment drift; route release, Vercel, DNS, TLS, and secret fixes to the owning deploy/backend tasks.

## Backup capture

The production backup command is:

```bash
npm run backup:production -- --base-url=https://agent.bittrees.org --output-dir=output/production-backups --skip-vercel
```

The workflow `backup` job runs daily at 02:17 UTC and on manual dispatch. It uploads a `production-backup-*` artifact with 30-day retention.

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
npm run rollout:check -- --base-url=https://<candidate-url> --rollback-url=https://<ready-rollback-url>
```

Alias promotion, DNS changes, TLS changes, deployment creation, and secret changes remain outside this runbook.
