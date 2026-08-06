# Production operations runbook

This runbook is the operator entry point for `agent.bittrees.org` production
operations. It covers DNS, hosting, CI/CD, observability, rollback, backups,
incident response, and a safe alert-test procedure. It does not authorize DNS,
TLS, deploy, secret, wallet, signer, registry-authority, or public-launch
mutations on its own.

Use this together with
[production-observability-backups.md](./production-observability-backups.md).

## Shortest operator path

Two consolidated commands cover a release. Both are fail-closed.

```bash
# 1. Preflight — one command runs check → test → build → schema → security and
#    writes machine-readable evidence + the launch-readiness checklist.
npm run preflight
#    -> output/production-readiness/preflight-evidence.json  (overallStatus)
#    -> output/production-readiness/launch-readiness.json     (go / no-go)

# 2. Rollout — one command plans, runs preview smoke, and (only with --confirm)
#    promotes the alias, re-verifies health + smoke, records a rollback target,
#    and writes the immutable release manifest. Without --confirm it is a
#    dry-run and never moves the alias.
npm run rollout -- --action=publish --target=<deployment-url>            # dry-run
npm run rollout -- --action=publish --target=<deployment-url> --confirm  # promote
npm run rollout -- --action=rollback --confirm                           # roll back
```

Two launch capabilities stay behind explicit, default-off gates
(`src/feature-gates.mjs`); the portal is fail-closed until each is enabled:

- `PUBLIC_INDEXING_ENABLED` — off keeps `noindex,nofollow` + `robots.txt` disallow.
- `CONTRIBUTION_INTENTS_WRITE_ENABLED` — off means submissions are never persisted.

Do not enable either gate without the named legal/security/ops decisions in the
launch-readiness checklist reaching `accepted`.

## Scope and live inventory

- Repo root:
  `/Users/jhineline/bob/Library/Assistants/idagents/id-agents/workspace/projects/agent`
- Vercel project: `bittrees-tech/agent`
- Production custom domain: `https://agent.bittrees.org`
- Protected staging custom domain: `https://agent-staging.bittrees.org`
- Protected rollback rehearsal domain:
  `https://agent-staging-rollback.bittrees.org`
- Primary monitor/backup workflow: `.github/workflows/production-observability.yml`
- Clean-machine CI workflow: `.github/workflows/clean-machine.yml`
- Protected transport helper: `scripts/request-url.mjs`
- Rollout helpers: `scripts/rollout-check.mjs`,
  `scripts/select-rollback-target.mjs`
- Backup helper: `scripts/production-backup.mjs`
- Checked-in Vercel project link: `.vercel/project.json`
- Repo app env contract: `.env.example`

Refresh the point-in-time inventory before any action:

```bash
vercel project inspect agent --scope bittrees-tech
vercel domains inspect agent.bittrees.org --scope bittrees-tech
vercel domains inspect agent-staging.bittrees.org --scope bittrees-tech
vercel domains inspect agent-staging-rollback.bittrees.org --scope bittrees-tech
vercel inspect https://agent.bittrees.org --scope bittrees-tech --format=json
npm run rollout:rollback-target -- --project=agent --scope=bittrees-tech --exclude-url=https://agent.bittrees.org
dig bittrees.org NS +short
```

### Verified baseline on July 17, 2026

- `vercel domains inspect` confirmed `ns1.vercel-dns.com` and
  `ns2.vercel-dns.com` as the intended and current nameservers for
  `agent.bittrees.org` and the protected staging domains.
- Public production `agent.bittrees.org` resolved to deployment
  `dpl_DYf1My3XqNR3cuq1Mb7TosphuLz6` at raw URL
  `https://agent-hyof8z19s-bittrees-tech.vercel.app`.
- Public `/api/health` exposed release commit
  `857a3313a49cb485272a244298775b75515f10c8` on ref
  `prod-readiness-hsts-testscope-20260715`, with `dirty: false` and
  `source: git-commit`.
- `npm run health -- --base-url=https://agent.bittrees.org` passed.
- `npm run smoke -- --base-url=https://agent.bittrees.org` passed for `32`
  routes.
- Unauthenticated `curl -I` to `agent-staging.bittrees.org` and
  `agent-staging-rollback.bittrees.org` returned the expected `302` redirect to
  `https://vercel.com/sso-api`.
- Protected staging `agent-staging.bittrees.org` resolved to deployment
  `dpl_6ZmnQZJt4hjq1rsV1XTvjvFHHadm` and passed
  `env -u VERCEL_TOKEN npm run rollout:check -- --base-url=https://agent-staging.bittrees.org --vercel-protected --health-only`.
- Protected rollback rehearsal `agent-staging-rollback.bittrees.org` resolved
  to deployment `dpl_CsRigFyzBLqujp4mnpz4PKKj2N1U` and passed the same protected
  health check.
- `npm run rollout:rollback-target` selected retained READY production
  deployment `dpl_DdcdHEBbXfLPGgndatiB79HycrGT` at
  `https://agent-8l7nljgcz-bittrees-tech.vercel.app`, with
  `meta.githubCommitSha: c03faf8e262f4dd2d78f4ea29886ef9afcf33d4a` and
  `meta.gitDirty: "1"`.

Treat those ids as dated evidence, not perpetual truth. Re-run the commands
above before any release or incident action.

## DNS and hosting checks

Run these before and after any deploy or rollback:

```bash
dig bittrees.org NS +short
dig agent.bittrees.org A +noall +answer
curl -sSI https://agent.bittrees.org/
curl -sSI https://agent-staging.bittrees.org/
curl -sSI https://agent-staging-rollback.bittrees.org/
```

Expected posture:

- The `bittrees.org` zone is Vercel-nameserver managed. `agent.bittrees.org` is
  served through the wildcard `*.bittrees.org ALIAS`, so exact-host `A` answers
  can rotate across Vercel edge IPs. Do not pin a single IP pair or require an
  explicit host `CNAME`.
- Public production serves through Vercel with `HTTP 200`.
- Public requests to `agent-staging.bittrees.org` and
  `agent-staging-rollback.bittrees.org` may return `HTTP 302` to
  `vercel.com/sso-api`; that is expected while protection stays enabled.
- `cache-control: no-store`, `cdn-cache-control: no-store`, and
  `x-robots-tag: noindex, nofollow` remain present on the public production
  surface.

## CI/CD and deploy flow

The repo has two operator-visible GitHub workflows:

- `.github/workflows/clean-machine.yml`
  - validates `npm ci`, `npm run check`, `npm run test:onboarding`, `npm test`,
    and `npm run build` across Ubuntu, macOS, and Windows
  - does not deploy
- `.github/workflows/production-observability.yml`
  - runs the production health/smoke monitor every 15 minutes
  - runs the backup job daily at `02:17 UTC`
  - uploads monitor and backup artifacts
  - opens or comments on GitHub issues when the monitor or backup job fails
  - does not deploy
- `.github/workflows/production-release-control.yml`
  - is manual-only and production-environment scoped
  - writes `alias-plan.json`, pre-release rollout proof, alias result, post-release health proof, and a single immutable `release-manifest.json`
  - verifies the selected deployment before alias mutation and verifies live production again after the alias move

Live deployment behavior is Vercel-driven. On July 17, 2026, `vercel inspect`
showed Node `24.x`, output directory `dist`, and a single rewrite of all routes
to `/api/index`, matching `vercel.json`.

Local operator preflight:

```bash
npm run check
npm test
npm run build
npm run verify:api
```

Deploy identity and release metadata checks:

```bash
vercel inspect https://agent.bittrees.org --scope bittrees-tech --format=json
curl -sS https://agent.bittrees.org/api/health | jq '.releaseMetadata'
curl -sS https://agent.bittrees.org/idacc/releases.json | jq '.data.releaseMetadata'
git ls-remote https://github.com/Bittrees-Technology/agent.git refs/heads/main refs/heads/prod-readiness-hsts-testscope-20260715
```

Treat any of the following as a release-provenance incident even if uptime and
smoke are green:

- public `releaseMetadata.commitSha` or `gitRef` disagrees with the intended
  release target
- public `releaseMetadata.source` is not `git-commit`
- a retained rollback candidate reports `meta.gitDirty: "1"` and is being
  considered for public promotion without explicit release-owner approval

## Health and observability

Primary public checks:

```bash
npm run health -- --base-url=https://agent.bittrees.org
npm run smoke -- --base-url=https://agent.bittrees.org
```

Protected staging or rollback checks:

```bash
env -u VERCEL_TOKEN npm run rollout:check -- \
  --base-url=https://agent-staging.bittrees.org \
  --vercel-protected \
  --health-only

env -u VERCEL_TOKEN npm run rollout:check -- \
  --base-url=https://agent-staging-rollback.bittrees.org \
  --vercel-protected \
  --health-only
```

Protected URLs are verified through `scripts/request-url.mjs`, which shells out
to `vercel curl` when `--vercel-protected` is set. Raw `curl` to those domains
should still be expected to hit Vercel SSO.

Release-control evidence expectations:

- `output/production-release-control/alias-plan.json` is the dry-run selection record.
- `output/production-release-control/pre-release-rollout.json` proves the chosen deployment passed rollout verification before alias mutation.
- `output/production-release-control/post-release-health.json` and `post-release-smoke.log` prove the live alias after the move.
- `output/production-release-control/release-manifest.json` and `release-manifest.json.sha256` are the immutable provenance bundle for the release decision.

Alert and evidence expectations:

- `.github/workflows/production-observability.yml` uploads
  `production-observability-*` artifacts with the health summary and smoke log.
- On monitor failure, GitHub opens or updates the issue titled
  `agent.bittrees.org production monitor failed`.
- On backup failure, GitHub opens or updates the issue titled
  `agent.bittrees.org production backup failed`.
- Public `/monitoring.json` is the authoritative smoke contract. On July 17,
  2026 it published `status: daily-smoke-ready` and retained the
  `X-Request-Id` observability contract.

Measurable SLO and alert thresholds are also pinned in `/monitoring.json`:

- `public-health-availability`: `99.9%` over a `30d rolling` window, with `43` minutes of error budget and a `SEV-1` page when `2` consecutive monitor runs fail or release provenance drifts.
- `route-contract-smoke`: `99.5%` over the same window, with `216` minutes of error budget and a `SEV-2` page on any route-contract regression.
- `daily-backup-freshness`: `100%` objective for the daily `02:17 UTC` backup run; any miss is `SEV-2`.

Treat the issue titles below as automation contracts, not prose:

- `agent.bittrees.org production monitor failed`
- `agent.bittrees.org production backup failed`

If protected probes fail with `The specified token is not valid`, rerun from a
clean Vercel CLI session or clear the inherited `VERCEL_TOKEN` override for
that command. Do not weaken Vercel protection just to satisfy smoke.

## Rollback rehearsal

Select the most recent READY production candidate that is not currently serving
the public custom domain:

```bash
npm run rollout:rollback-target -- \
  --project=agent \
  --scope=bittrees-tech \
  --exclude-url=https://agent.bittrees.org
```

Validate the selected candidate through protected transport before any alias
move:

```bash
env -u VERCEL_TOKEN node scripts/rollout-check.mjs \
  --health-only \
  --base-url=https://agent-8l7nljgcz-bittrees-tech.vercel.app \
  --vercel-protected \
  --summary-file=output/e9c1-ops-proof/rollback-candidate-health-summary.json

env -u VERCEL_TOKEN node scripts/smoke-check.mjs \
  --base-url=https://agent-8l7nljgcz-bittrees-tech.vercel.app \
  --vercel-protected
```

Rollback acceptance before any alias move:

- the selected candidate is `READY`
- candidate `/api/health` returns `status: ok`
- candidate smoke passes the full `32` route matrix
- candidate release metadata exposes a concrete `commitSha`
- current public production smoke also passes
- candidate metadata does not show `meta.gitDirty: "1"`, or the release owner
  explicitly approves promoting that dirty candidate as an incident exception

After an actual alias move, re-run:

```bash
npm run health -- --base-url=https://agent.bittrees.org
npm run smoke -- --base-url=https://agent.bittrees.org
```

## Backups and restore

Capture the production backup:

```bash
npm run backup:production -- \
  --base-url=https://agent.bittrees.org \
  --output-dir=output/production-backups \
  --skip-vercel
```

The default backup currently captures `15` route snapshots plus headers and
hashes. Vercel deployment metadata is optional and only included when the CLI
is authenticated and `--skip-vercel` is omitted.

Verify the pointer hash before restore:

```bash
cat output/production-backups/latest-manifest.json
cat output/production-backups/<timestamp>/backup-manifest.json
```

Current scope boundary:

- production writes are disabled by default
- there is no approved mutable production data directory in the visible contract
- any future `PRODUCTION_STATE_PATHS` restore must be limited to explicit,
  non-secret mounted state named in `backup-manifest.json`

For the full capture and restore contract, use
[production-observability-backups.md](./production-observability-backups.md).

## Safe alert test

Use a controlled negative assertion against the health script to prove the
monitor would fail on bad release metadata without mutating production:

```bash
npm run health -- \
  --base-url=https://agent.bittrees.org \
  --expected-release-commit=0000000000000000000000000000000000000000
```

Expected result:

- non-zero exit
- error showing the live `releaseMetadata.commitSha` did not match the expected
  bogus SHA

That is sufficient to prove the alert path behind
`.github/workflows/production-observability.yml` would go red and execute its
GitHub issue open or update step on a real metadata mismatch.

## Incident response

Severity guide:

- `SEV-1`
  - public custom domain unavailable
  - smoke fails on critical public routes
  - public release metadata disappears, contradicts the intended release, or
    points at an unexpected source
  - DNS, TLS, or alias break prevents operator verification on the public site
- `SEV-2`
  - protected staging or rollback rehearsal fails rollout checks
  - backup job fails
  - public release snapshot or monitoring contract drifts without a live outage
  - the best retained rollback candidate is unavailable or provenance-dirty
- `SEV-3`
  - docs or runbook drift
  - minor cache or header inconsistencies with no customer-visible outage
  - evidence-bundle gaps that do not block live health, smoke, backup, or
    rollback decisions

First-response checklist:

1. Freeze non-essential deploy activity.
2. Capture evidence:

```bash
date -u '+%Y-%m-%dT%H:%M:%SZ'
vercel inspect https://agent.bittrees.org --scope bittrees-tech --format=json
curl -sSI https://agent.bittrees.org/
curl -sS https://agent.bittrees.org/api/health | jq
curl -sS https://agent.bittrees.org/monitoring.json | jq
curl -sS https://agent.bittrees.org/idacc/releases.json | jq
npm run health -- --base-url=https://agent.bittrees.org
npm run smoke -- --base-url=https://agent.bittrees.org
```

3. Determine whether the issue is:
   - DNS or hosting
   - release provenance
   - route-contract or smoke
   - protected staging or rollback only
   - backup or restore only
4. If rollback may be needed, run `npm run rollout:rollback-target` and
   validate the selected candidate before any alias move.
5. Record the evidence bundle path plus any GitHub Actions run URL or existing
   alert issue title in the incident thread or task packet.

Routing and escalation:

- Raise `SEV-1` immediately to the owning ops lead and the operator with
  `bittrees-tech` Vercel access.
- Route DNS, nameserver, alias, or TLS problems to the operator with
  `bittrees-tech` access.
- Route release-provenance mismatches, including `meta.gitDirty: "1"` rollback
  candidates, to the release owner before any publish or rollback proceeds.
- Route route-contract or smoke regressions to the current portal or repo owner
  together with the `production-observability-*` artifact or local evidence
  bundle.
- Route backup or restore failures to the operator with backup artifact access.
  Do not change DNS, TLS, or secrets from a backup alert alone.

## Evidence and reference anchors

- [production-observability-backups.md](./production-observability-backups.md)
- [production-observability.yml](../.github/workflows/production-observability.yml)
- [clean-machine.yml](../.github/workflows/clean-machine.yml)
- [project.json](../.vercel/project.json)
- [.env.example](../.env.example)
- [request-url.mjs](../scripts/request-url.mjs)
- [rollout-check.mjs](../scripts/rollout-check.mjs)
- [select-rollback-target.mjs](../scripts/select-rollback-target.mjs)
- [production-backup.mjs](../scripts/production-backup.mjs)
