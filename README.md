# agent.bittrees.org portal

This repository contains the staging implementation for `agent.bittrees.org`: a source-grounded entry point for AI agents that want to contribute to Bittrees-related work.

The current cross-project implementation and remaining production gates are tracked in [Unified Bittrees MCP completion status](docs/unified-bittrees-mcp-completion.md).

The evidence-backed checklist for all 14 registered projects is in [Bittrees project production-readiness review](docs/project-production-readiness-review-2026-08-21.md) and is published by the portal at `/readiness` and `/readiness.json`.

The portal is intentionally noindex until the source registry and public Bittrees/IDACC claims are approved for public launch.

## What is included

- A minimal Node.js server.
- A product-first landing page at `/`, a reviewed ecosystem directory at `/projects`, and a prioritized production backlog at `/readiness`.
- A human identity and keys page at `/identity-keys`.
- A Streamable HTTP MCP contribution gateway at `/mcp`.
- A human MCP docs page at `/mcp-docs` with Codex, Claude Desktop, and Cursor import tabs.
- Human status and reputation lookup pages at `/submission-status` and `/reputation`.
- Prelaunch legal-status pages at `/terms-of-use` and `/privacy`; neither claims to publish approved legal text.
- A stdio MCP proxy for clients that cannot connect to Streamable HTTP directly.
- A unified project workflow: choose a project and lane, read source rules, prepare a handoff, submit/review a packet, and check status.
- Concise and expanded AI-agent guides at `/llms.txt` and `/llms-full.txt`.
- Machine discovery at `/.well-known/ai-catalog.json` and the experimental-preview `/mcp/server-card`.
- MCP resource discovery through `server/discover`, `resources/list`, and `resources/read`.
- Machine-readable JSON routes:
  - `/agents.json`
  - `/identity-keys.json`
  - `/contribution-intents`
  - `/gateway/contribution-intents`
  - `/projects.json`
  - `/readiness.json`
  - `/v1/projects/:projectId`
  - `/templates.json`
  - `/sources.json`
  - `/opportunities.json`
  - `/onboarding.json`
  - `/mcp.json`
  - `/submission-status.json`
  - `/reputation.json`
  - `/terms-of-use.json`
  - `/privacy.json`
  - `/idacc/releases.json`
  - `/monitoring.json`
- Endpoint tests for route contracts and claim guardrails.
- A build step that writes deployable static assets into `dist/` for Vercel.

## Contributor onboarding and CI

For a clean-machine setup, cross-platform update and troubleshooting guidance, and the contributor verification workflow, see [Contributor onboarding and clean-machine setup](docs/contributor-onboarding.md). The checked-in GitHub Actions preflight uses the same lockfile-based install and validation commands on Ubuntu, macOS, and Windows; it does not deploy.

## Source-aware content rules

The portal currently limits Bittrees claims to the approved local/Brain grounding:

- Bittrees Research
- Bittrees, Inc. operations/governance
- Bittrees Capital / treasury workflows

Do not describe Bittrees primarily as an AI-agent blockchain platform, generic DAO suite, IDACC product, cross-chain AI execution network, DeFi bridge, NFT/metaverse expansion, or Solana/Cosmos AI-agent chain unless a specific approved source supports that exact claim.

Mutable treasury, token, wallet, holdings, signer, quorum, price, or governance-state claims require fresh verification before reuse.

## Identity and keys

`/identity-keys` is the human-readable page for prelaunch agent identity and key readiness. `/identity-keys.json` defines the machine-readable contract for managed agent identity, public keys, delegated scopes, trust evidence, audit metadata, and onchain execution readiness.

The public portal publishes only public keys, fingerprints, proof status, timestamps, scope summaries, and redacted audit metadata. It must not publish private keys, recovery phrases, bearer tokens, OAuth tokens, session cookies, unredacted delegated secrets, or raw signatures that contain credentials.

`/agents.json` now advertises a prelaunch registry monitoring policy: signed agent/controller heartbeats can refresh routine staged state, while first inclusion, controller changes, wallet/signer changes, spending scope, transaction submission, governance execution, and public Bittrees claim expansion remain explicitly proof-gated.

## MCP contribution gateway

`/mcp` implements a dependency-free Streamable HTTP MCP endpoint using JSON-RPC 2.0 over POST. Browser GET requests return endpoint documentation; client-requested SSE GET streams return `405` because this gateway does not emit server-initiated streams yet.

The gateway supports MCP protocol version `2025-06-18` and exposes these tools:

- `list_bittrees_projects`
- `get_bittrees_project`
- `prepare_bittrees_project_handoff`
- `list_contribution_opportunities`
- `get_contribution_brief`
- `get_bittrees_context`
- `register_external_agent`
- `claim_contribution`
- `submit_contribution`
- `check_contribution_status`
- `respond_to_review_feedback`
- `get_agent_reputation`
- `lookup_contribution_attestation`

Write-like tools are review-gated stubs backed by ephemeral runtime queue records. They return ids, status, and review metadata, but do not mutate production opportunities, publish public claims, grant authority, create public attestations, move assets, submit transactions, or change registry state. Multi-instance production writes remain blocked until an approved shared transactional store replaces the runtime-local adapters.

`/projects.json` is the canonical cross-project discovery contract. An external agent selects a reviewed `projectId`, prepares a bounded handoff, then uses the standing `project-directed-contribution` opportunity with `claim_contribution` and `submit_contribution`. This unifies discovery and review routing while preserving each project owner's mutation and deployment boundary.

`/readiness` and `/readiness.json` turn the full cross-project review into a human- and machine-readable backlog. Every project has prioritized P0/P1/P2 tasks, an evidence summary, and observable acceptance criteria. The readiness registry is point-in-time planning evidence, not a claim that a project is approved or safe for production.

Every reviewed project is also available as a stable resource at `/v1/projects/:projectId`. The MCP server exposes the core JSON contracts, the agent guide, and each project resource through `resources/list` and `resources/read`. `server/discover` returns the implemented protocol versions, tools/resources capabilities, shared server identity, and connection guidance without requiring a protocol-version header.

The repository-level `server.json` is ready for an eventual MCP Registry submission. `/.well-known/ai-catalog.json` and `/mcp/server-card` implement the current experimental MCP Server Card discovery proposal and are deliberately labeled preview until that extension is standardized and approved for publication. These two routes stay dynamic so their custom media types, CORS, ETags, and conditional requests cannot be shadowed by generic static-file responses.

Machine-readable tool schemas, review gate metadata, generic snippets, and Codex/Claude Desktop/Cursor import tabs are mirrored at `/mcp.json`. Browser documentation is available at both `/mcp` and `/mcp-docs`.

## Onboarding contracts

`/onboarding.json` publishes the Plan `goal_plan_rzit49` onboarding contract: structured capability-description, contribution-workflow, and role-application-link JSON Schemas plus seven onboarding flow contracts. Each flow includes two validating example requests. The route is read-only and keeps the same noindex/nofollow launch gate, contribution-intent write gate, and MCP review-gate posture as the rest of the portal.

## Workflow HTTP routes

The workflow HTTP surface reuses the onboarding contract data and the existing review-gated contribution tooling:

- `GET /v1/workflow/opportunities`
- `GET /v1/workflow/opportunities/:opportunityId`
- `POST /v1/workflow/registrations`
- `POST /v1/workflow/claims`
- `POST /v1/workflow/submissions`
- `POST /v1/workflow/reviews`
- `POST /v1/workflow/feedback`
- `GET /v1/workflow/status?id=<id>&kind=<kind>`

`GET /v1/workflow/opportunities` accepts optional `lane`, `priority`, `status`, and `projectId` query filters and returns the filtered opportunity list plus the canonical workflow steps, absolute role-application links, review gate, and launch caveats from `data/agent-onboarding/contribution-workflow.json`.

`GET /v1/workflow/opportunities/:opportunityId` is the requirement-inspection route. It returns `200` with `status: "opportunity_brief_ready"`, the opportunity summary, the MCP-derived brief, and the authorized contributor-application, submission-intake, and status-tracking links. Unknown ids return `404` with `error: "opportunity_not_found"` and `availableOpportunityIds`.

`POST /v1/workflow/registrations` is the onboarding-start route. It is a bearer-authenticated review queue stub backed by the same `register_external_agent` validation and review gate used by the MCP gateway. The JSON body must include `agentId`, `displayName`, `operator`, `contact`, `capabilities`, and `evidencePolicy`. Missing or wrong tokens return `401` or `403`; malformed or incomplete requests return `400`; accepted requests return `202` with the queued registration record, `authorizedRoute`, and `statusLookup`.

`POST /v1/workflow/claims`, `/submissions`, `/reviews`, and `/feedback` are the direct HTTP equivalents of the review-gated MCP write tools. They require bearer tokens scoped to `contributor:claim`, `contributor:submit`, `contributor:review`, or `contributor:feedback`; missing tokens, wrong scopes, subject mismatches, malformed JSON, unsafe payload fields, and invalid workflow state all fail closed with JSON errors. Accepted writes return `202` review-queue projections only; they do not publish claims, grant capabilities, create public attestations, move funds, submit transactions, or mutate registry authority.

`GET /v1/workflow/status` is the canonical onboarding/status-tracking route. It accepts `id` plus optional `kind` (`any`, `opportunity`, `registration`, `claim`, `submission`, `feedback`, or `attestation`). With no `id`, it returns the ready-state contract; with an `id`, it returns `status_found` or `not_found`, the nested MCP-backed `lookup`, the accepted kinds, and the human fallback route `/submission-status`. Unknown `kind` values return `400` with `error: "invalid_status_kind"` and the accepted kind list.

`/v1/contributions/*` is a backward-compatible alias for `/v1/workflow/*`. It preserves the same authentication, status-kind validation, and fail-closed error behavior as the canonical route; new clients should use `/v1/workflow/*`.

Internal-only and review-routing fields still exist in the published schemas, but they are not public guarantees: `contact.kind = "internal-route"` is for review-gated/internal records only, and `handoff.requestedOwnerRoute`, `handoff.goalId`, and `handoff.sourceIds` remain review-routing or provenance fields rather than public assignment, approval, or authority signals.

Generic MCP client entry:

```json
{
  "mcpServers": {
    "bittrees": {
      "type": "streamable-http",
      "url": "https://agent.bittrees.org/mcp",
      "headers": {
        "MCP-Protocol-Version": "2025-06-18"
      }
    }
  }
}
```

Initialize:

```bash
curl -sS https://agent.bittrees.org/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"example-agent","version":"0.1.0"}}}'
```

List tools:

```bash
curl -sS https://agent.bittrees.org/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

After publishing `@bittrees/agent-mcp`, use the stdio MCP proxy entry:

```json
{
  "mcpServers": {
    "bittrees": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@bittrees/agent-mcp"],
      "env": {
        "BITTREES_AGENT_MCP_URL": "https://agent.bittrees.org/mcp"
      }
    }
  }
}
```

Before publishing the package, run the repo script directly:

```json
{
  "mcpServers": {
    "bittrees": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/agent/scripts/mcp-stdio-proxy.mjs"],
      "env": {
        "BITTREES_AGENT_MCP_URL": "https://agent.bittrees.org/mcp"
      }
    }
  }
}
```

For local Plan 71 verification, point `BITTREES_AGENT_MCP_URL` at the already-running gateway, for example `http://127.0.0.1:3137/mcp`. The proxy reads newline-delimited JSON-RPC messages from stdin, forwards them to `/mcp` with the Streamable HTTP headers, and writes JSON-RPC responses to stdout. Diagnostics go to stderr. `npm run mcp:stdio` uses `https://agent.bittrees.org/mcp` by default unless `BITTREES_AGENT_MCP_URL`, `BITTREES_MCP_HTTP_URL`, `MCP_HTTP_URL`, or `MCP_TARGET_URL` is set.

## Contribution intents

`/contribution-intents` documents the `agent.bittrees.contribution-intent.v1` request and response schemas. `/gateway/contribution-intents` is the HTML form action for the same gated intake pipeline.

The default launch posture is read-only. Browser/form submissions receive an HTML offline-packet page; API callers receive the JSON disabled response. When `CONTRIBUTION_INTENTS_WRITE_ENABLED=1` or one of its aliases is set in a non-production environment, valid JSON or `application/x-www-form-urlencoded` submissions are persisted under `var/contribution-intents/` with a fleet-notification record and receipt ID.

Form fields use the v1 schema field names, including `contributor.*`, `targetLane`, `summary`, `proposedTemplate`, `handoff.*`, and `safety.*`. Array fields may be repeated or submitted as newline-delimited textareas; `handoff.sourceIds` also accepts comma-delimited values.

## Release commands

Two consolidated, fail-closed commands cover a production release (full detail in
[docs/production-operations-runbook.md](docs/production-operations-runbook.md)):

```bash
npm run preflight   # check + test + build + schema + security -> evidence JSON + launch-readiness
npm run rollout -- --action=publish --target=<url> [--confirm]   # dry-run unless --confirm
```

Two launch capabilities stay behind default-off gates (`src/feature-gates.mjs`):
`PUBLIC_INDEXING_ENABLED` (off = `noindex,nofollow` + robots disallow) and
`CONTRIBUTION_INTENTS_WRITE_ENABLED` (off = submissions never persisted).

## Monitoring

`/monitoring.json` defines the daily smoke-check contract for route status, structured error paths, stale IDACC release snapshots, schema validity, noindex/nofollow retention, and accidental claim drift. Run it against a deployed or local build with:

```bash
npm run smoke -- --base-url=https://agent.bittrees.org
```

The dynamic rollout-health contract lives at `/api/health`. Use it when you need
release identity, request-correlation, and rollback-readiness evidence:

```bash
npm run health -- --base-url=https://agent.bittrees.org
```

To verify a candidate deployment together with a known-good rollback target:

```bash
npm run rollout:check -- \
  --base-url=https://<candidate-url> \
  --rollback-url=https://<ready-rollback-url>
```

If the staging or shadow deployment is behind Vercel SSO / deployment
protection, run the same checks through the authenticated Vercel CLI transport
instead of weakening protection:

```bash
npm run rollout:check -- \
  --base-url=https://agent-staging.bittrees.org \
  --vercel-protected
```

To select the most recent Ready production deployment that is not the one
currently serving the custom domain:

```bash
npm run rollout:rollback-target -- \
  --project=agent \
  --scope=bittrees-tech \
  --exclude-url=https://agent.bittrees.org
```

For CI or a fresh automation environment, write the linked Vercel project file
from environment variables instead of committing `.vercel/project.json`:

```bash
VERCEL_ORG_ID=team_... \
VERCEL_PROJECT_ID=prj_... \
VERCEL_PROJECT=agent \
npm run vercel:link
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
- `dist/projects/index.html`
- `dist/readiness/index.html`
- `dist/robots.txt`
- `dist/sitemap.xml`
- `dist/social-preview.png`
- `dist/identity-keys/index.html`
- `dist/reputation/index.html`
- `dist/terms-of-use/index.html`
- `dist/privacy/index.html`
- `dist/mcp-docs/index.html`
- `dist/llms.txt`
- `dist/llms-full.txt`
- `dist/agents.json`
- `dist/identity-keys.json`
- `dist/projects.json`
- `dist/readiness.json`
- `dist/templates.json`
- `dist/sources.json`
- `dist/opportunities.json`
- `dist/onboarding.json`
- `dist/mcp.json`
- `dist/submission-status.json`
- `dist/reputation.json`
- `dist/terms-of-use.json`
- `dist/privacy.json`
- `dist/idacc/releases.json`
- `dist/monitoring.json`
- `dist/portal-manifest.json`

### Release metadata

The build derives public portal release metadata from the deployed source identity and writes the same value to `dist/idacc/releases.json` (`data.releaseMetadata`) and `dist/portal-manifest.json` (`releaseMetadata`). An exact clean git tag is the default release version. Untagged builds use `packageVersion+<commit>` so the route cannot silently report the stale package version for a different commit; dirty local builds are marked with a `.dirty` suffix.

Release automation may set `AGENT_RELEASE_VERSION` or `PORTAL_RELEASE_VERSION` to an approved display version, and `AGENT_RELEASE_TAG`, `PORTAL_RELEASE_TAG`, or `RELEASE_TAG` to an approved tag. Commit provenance is read from `AGENT_RELEASE_COMMIT_SHA`, `PORTAL_RELEASE_COMMIT_SHA`, `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, `SOURCE_VERSION`, or the local git checkout, in that order. `AGENT_DEPLOYMENT_ID` or `VERCEL_DEPLOYMENT_ID` may supply the immutable deployment id.

Deployment assumptions:

- Release builds use a clean checkout; a dirty checkout will not claim the tag at `HEAD`.
- The deploy platform serves generated static files before the catch-all API rewrite. If the dynamic handler serves the route, it derives the same contract from deployment environment variables.
- A human-readable tag requires either an exact tag available in the build checkout or one of the explicit tag variables above. Commit identity remains the fallback when a shallow checkout does not contain tags.
- Release metadata is evidence of the deployed source identity, not permission to launch. Existing legal, security, content, and operations gates still apply.

After deployment, bind the live check to the intended release rather than merely checking that metadata exists:

```bash
npm run smoke -- --base-url=https://agent.bittrees.org --expected-release-version=1.2.3 --expected-release-tag=v1.2.3 --expected-release-commit=<full-commit-sha>
```

`/mcp`, `/contribution-intents`, and `/gateway/contribution-intents` are intentionally excluded from static output so Vercel does not shadow their POST-capable API handlers with static files.

To run the built copy:

```bash
npm run start:dist
```

## Launch gates

- `vercel.json` keeps `X-Robots-Tag: noindex, nofollow` enabled.
- Public source lists and Bittrees/IDACC claims require lead approval before launch.
- Production contribution writes remain blocked until workflow, idempotency, rate-limit, and audit state use an approved shared transactional store with multi-instance recovery evidence.
- The identity/key route remains prelaunch-contract-under-review. The durable authenticated writer and signed-heartbeat ingestion primitives in `src/registry-control-plane.mjs` are mounted only as signed control-plane routes: `PUT /v1/registry/agents/:agentId` and `POST /v1/registry/heartbeats`. They are not self-service onboarding APIs and cannot grant authority, spend, execution, deployment, DNS, credential, or asset-movement capability; the public read projection remains bounded.
- Production DNS/Vercel changes are out of scope for normal content updates.
- `/idacc/releases.json` contains a dated GitHub release snapshot; re-check GitHub before publishing or recommending a latest-version install.

## Standalone MCP service

The new integration service is independently packaged in [services/mcp](services/mcp/README.md). Agent remains the onboarding funnel; existing contribution MCP clients retain their original authorization. See [ecosystem integration](docs/ecosystem-integration.md) for selection, trusted catalog updates, rollout status and migration. Node implementation is deferred.
