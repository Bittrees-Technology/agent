# Contribution-Intent Workflow And Data Contract Spec

Task: `design-agent-bittrees-workflow-data-contract`
Project: `workspace/projects/agent` (`agent.bittrees.org`)
Status: implementation spec for the existing contract surface, not a live-write enablement request

## Source Evidence

- `README.md:144` documents Local Plan 71 MCP/stdout verification context.
- `README.md:146` documents the contribution-intent launch posture and form field family.
- `src/portal.mjs:16` defines the canonical contribution-intent route.
- `src/portal.mjs:98` defines local JSONL storage destinations for non-production writes.
- `src/portal.mjs:881` defines `agent.bittrees.contribution-intent.v1`.
- `src/portal.mjs:950` defines `agent.bittrees.contribution-intent.response.v1`.
- `src/portal.mjs:969` defines the HTML form contract.
- `src/portal.mjs:999` defines the route contract and default disabled response.
- `src/portal.mjs:2154` and `src/portal.mjs:2171` register the two JSON routes.
- `src/portal.mjs:2800`, `src/portal.mjs:3047`, and `src/portal.mjs:3129` define form rendering, form-to-payload mapping, and validation.
- `src/portal.mjs:3426`, `src/portal.mjs:3453`, and `src/portal.mjs:3479` define handoff notification, submission records, and local persistence.
- `src/portal.mjs:3534` and `src/portal.mjs:5252` wire POST handling for the two intent paths.
- `api/index.js:1` and `api/index.js:5` expose the same request handler through the Vercel API entrypoint.

## Scope

The contribution-intent workflow lets an agent, human, team, or tool prepare a source-aware Bittrees contribution packet for lead review. The existing portal intentionally keeps public/default submission writes disabled. In the default launch posture, POST requests return `501` with `status: "not_implemented"` and `liveWrite: false`; browser/form callers receive an HTML offline packet template.

When a non-production write flag is explicitly enabled, the same routes validate JSON or form submissions and write local review artifacts. This non-production mode is for verification and staging only; it does not grant authority, create public attestations, mutate production opportunities, move assets, request onchain execution, or bypass lead/security review.

## Routes

`GET /contribution-intents`

- Machine-readable contract endpoint.
- Returns launch status, privacy/no-rights notices, request schema, response schema, form submission contract, default disabled response, feature-flag state, and security gate metadata.
- Canonical URL: `https://agent.bittrees.org/contribution-intents`.

`GET /gateway/contribution-intents`

- Gateway contract endpoint for the HTML-first form action.
- Returns the same schema/contract data, with `contract.schema: "agent.bittrees.gateway-contribution-intent.contract.v1"`, `contract.endpoint: "/gateway/contribution-intents"`, and `contract.canonicalContractEndpoint: "/contribution-intents"`.
- Canonical URL: `https://agent.bittrees.org/gateway/contribution-intents`.

`POST /contribution-intents`

- JSON or form-capable API intake path.
- Default/public behavior: `501`, `accepted: false`, `liveWrite: false`.
- Non-production write-flag behavior: validate payload, persist JSONL artifacts, return `202`, `accepted: true`, `liveWrite: true`, and `receiptId`.

`POST /gateway/contribution-intents`

- HTML form action using `application/x-www-form-urlencoded`.
- Shares the same parser, schema validation, write gate, persistence, and response contract as `/contribution-intents`.
- HTML callers receive disabled, validation, or receipt pages; JSON/API callers receive JSON envelopes.

Trailing-slash variants of defined routes are canonicalized by the shared request handler.

## Write Gate And Storage Decision

The intended interim state is: keep public/default contribution-intent writes disabled until security-router clearance and a production control-plane backend are approved. The stub response is intentional for public launch safety.

Current write gate:

- Primary flag: `CONTRIBUTION_INTENTS_WRITE_ENABLED`.
- Aliases: `CONTRIBUTION_INTENTS_ENABLED`, `PORTAL_ENABLE_CONTRIBUTION_INTENTS`.
- Truthy values: `1`, `true`, `yes`, `on`.
- Default: disabled.

Non-production storage destination when a write flag is enabled:

- Directory: `CONTRIBUTION_INTENTS_DATA_DIR`, or `var/contribution-intents/` under the project root when unset.
- Submission log: `submissions.jsonl`.
- Fleet notification log: `fleet-notifications.jsonl`.
- Records are append-only JSONL review artifacts.

Production storage is not selected in this spec. The trigger to replace the stub with durable production writes is explicit security-router clearance plus an approved authenticated control-plane persistence path. Until then, the correct production behavior remains `501/not_implemented/liveWrite:false`; non-production JSONL exists only to verify validation, receipts, and fleet-review handoff records.

## Request Contract

Schema name: `agent.bittrees.contribution-intent.v1`
Schema URL: `https://agent.bittrees.org/schemas/contribution-intent-request.v1.json`
Content types: `application/json` or `application/x-www-form-urlencoded`
Maximum body size: 1 MiB

Required top-level fields:

- `schema`
- `intentId`
- `submittedAt`
- `contributor`
- `targetLane`
- `summary`
- `proposedTemplate`
- `handoff`
- `safety`

No unknown top-level, nested contributor, nested handoff, or nested safety keys are accepted.

### Field Rules

`schema`

- Required constant: `agent.bittrees.contribution-intent.v1`.

`intentId`

- Required string.
- Length: 8 to 120 characters.
- Format: lower-case alphanumeric at both ends, with lower-case alphanumeric, `.`, `_`, `:`, or `-` internally.
- Generated form default: `intent-YYYY-MM-DD-<12 hex-ish random chars>`.

`submittedAt`

- Required ISO-8601 date-time string.
- Generated form default: current server timestamp.

`contributor.kind`

- Required enum: `agent`, `human`, `team`, `tool`.

`contributor.name`

- Required string, 1 to 120 characters.

`contributor.agentId`

- Optional string, 1 to 160 characters.

`contributor.team`

- Optional string, 1 to 120 characters.

`contributor.contactRoute`

- Required string, 1 to 300 characters.
- Expected values are manager/contact routes such as `M:engineering-team/engineering-lead`, public-safe URLs, or other reviewable contact channels.

`targetLane`

- Required enum: `research`, `inc-ops-governance`, `capital-treasury`, `discovery`, `awareness`.

`summary`

- Required string, 20 to 1200 characters.
- The rendered form currently allows up to 2000 characters, but server validation is authoritative at 1200.

`proposedTemplate`

- Required enum: `source-backed-claim`, `contribution-task`, `opportunity-brief`, `treasury-verification-request`, `awareness-summary`.

`handoff.requestedOwnerRoute`

- Required string, 1 to 160 characters.
- Intended to name the lead/team route that should receive review, for example `M:engineering-team/engineering-lead`.

`handoff.goalId`

- Optional string, 1 to 120 characters.

`handoff.expectedOutput`

- Required string, 10 to 1200 characters.

`handoff.acceptanceCriteria`

- Required array of strings.
- Item count: 1 to 10.
- Item length: 5 to 400 characters.

`handoff.outOfScope`

- Required array of strings.
- Item count: 1 to 10.
- Item length: 3 to 300 characters.

`handoff.backlogPolicy`

- Required string, 10 to 600 characters.
- The rendered form currently allows up to 700 characters, but server validation is authoritative at 600.

`handoff.sourceIds`

- Optional array of strings.
- Item count: 0 to 20.
- Item length: 1 to 160 characters.

`safety.noSecretsIncluded`

- Required boolean constant: `true`.

`safety.noLiveWriteAcknowledged`

- Required boolean constant: `true`.

`safety.noOnchainActionRequested`

- Required boolean constant: `true`.

## Form Contract

Action: `/gateway/contribution-intents`
Method: `POST`
Encoding: `application/x-www-form-urlencoded`
Generated defaults: `schema`, `intentId`, `submittedAt`

Canonical form field names:

- `contributor.kind`
- `contributor.name`
- `contributor.agentId`
- `contributor.team`
- `contributor.contactRoute`
- `targetLane`
- `summary`
- `proposedTemplate`
- `handoff.requestedOwnerRoute`
- `handoff.goalId`
- `handoff.expectedOutput`
- `handoff.acceptanceCriteria`
- `handoff.outOfScope`
- `handoff.backlogPolicy`
- `handoff.sourceIds`
- `safety.noSecretsIncluded`
- `safety.noLiveWriteAcknowledged`
- `safety.noOnchainActionRequested`

Accepted aliases:

- `contributor.kind`: `contributorKind`, `contributor_kind`
- `contributor.name`: `contributorName`, `contributor_name`
- `contributor.agentId`: `contributorAgentId`, `contributor_agent_id`
- `contributor.team`: `contributorTeam`, `contributor_team`
- `contributor.contactRoute`: `contributorContactRoute`, `contributor_contact_route`
- `handoff.requestedOwnerRoute`: `requestedOwnerRoute`, `requested_owner_route`
- `handoff.goalId`: `goalId`, `goal_id`
- `handoff.expectedOutput`: `expectedOutput`, `expected_output`
- `handoff.acceptanceCriteria`: `acceptanceCriteria`, `acceptance_criteria`
- `handoff.outOfScope`: `outOfScope`, `out_of_scope`
- `handoff.backlogPolicy`: `backlogPolicy`, `backlog_policy`
- `handoff.sourceIds`: `sourceIds`, `source_ids`
- `safety.noSecretsIncluded`: `noSecretsIncluded`, `no_secrets_included`
- `safety.noLiveWriteAcknowledged`: `noLiveWriteAcknowledged`, `no_live_write_acknowledged`
- `safety.noOnchainActionRequested`: `noOnchainActionRequested`, `no_onchain_action_requested`

Array form encoding:

- `handoff.acceptanceCriteria` and `handoff.outOfScope` may be repeated or newline-delimited.
- `handoff.sourceIds` may be repeated, newline-delimited, or comma-delimited.

Boolean form encoding:

- Safety checkbox values are true when the last submitted value is one of `1`, `true`, `yes`, or `on`.
- Missing or false safety acknowledgements fail validation.

## Response Contract

Schema name: `agent.bittrees.contribution-intent.response.v1`
Schema URL: `https://agent.bittrees.org/schemas/contribution-intent-response.v1.json`

Required response fields:

- `$schema`
- `route`
- `canonicalUrl`
- `generatedAt`
- `requestSchema`
- `responseSchema`
- `securityGate`
- `schema`
- `status`
- `accepted`
- `liveWrite`
- `message`

Status values:

- `not_implemented`: live writes disabled.
- `accepted`: non-production write enabled, validation passed, artifacts persisted.
- `rejected`: write enabled but body read, parse, validation, or persistence failed.

Optional response fields:

- `receiptId`
- `nextStep`
- `errors`

Default disabled response:

```json
{
  "schema": "agent.bittrees.contribution-intent.response.v1",
  "status": "not_implemented",
  "accepted": false,
  "liveWrite": false,
  "message": "Contribution-intent submission is documented but disabled until security-router clears live write handling.",
  "nextStep": "Use the request schema or form field contract to prepare an offline handoff packet; do not POST secrets, credentials, wallet data, or live execution requests."
}
```

Accepted non-production response shape:

```json
{
  "schema": "agent.bittrees.contribution-intent.response.v1",
  "status": "accepted",
  "accepted": true,
  "liveWrite": true,
  "receiptId": "7a6f4c54-3d3c-49db-91a7-f7eb90ffef51",
  "message": "Contribution intent accepted, persisted, and fleet notification queued.",
  "nextStep": "Lead review has been queued for M:engineering-team/engineering-lead. Use the receipt ID to correlate stored submission and fleet-notification records."
}
```

Rejected write-enabled response shape:

```json
{
  "schema": "agent.bittrees.contribution-intent.response.v1",
  "status": "rejected",
  "accepted": false,
  "liveWrite": true,
  "message": "Contribution intent rejected because the request body did not match the documented schema.",
  "nextStep": "Fix the validation errors and resubmit the contribution intent.",
  "errors": [
    "body.summary must be at least 20 characters."
  ]
}
```

## Concrete JSON Request Example

```json
{
  "schema": "agent.bittrees.contribution-intent.v1",
  "intentId": "intent-2026-07-09-workflow-spec",
  "submittedAt": "2026-07-09T15:00:00.000Z",
  "contributor": {
    "kind": "agent",
    "name": "architecture-engineer",
    "agentId": "architecture-engineer",
    "team": "engineering-team",
    "contactRoute": "M:engineering-team/architecture-engineer"
  },
  "targetLane": "inc-ops-governance",
  "summary": "Prepare an implementation-ready contribution workflow and data-contract packet for the agent portal.",
  "proposedTemplate": "contribution-task",
  "handoff": {
    "requestedOwnerRoute": "M:engineering-team/engineering-lead",
    "goalId": "goal_plan_rzit49",
    "expectedOutput": "A consolidated implementation spec for contribution-intent routes, schema, validation, storage, and handoff events.",
    "acceptanceCriteria": [
      "Spec covers form fields, API routes, validation, storage, and handoff records.",
      "Spec includes concrete JSON and form examples."
    ],
    "outOfScope": [
      "Do not enable production writes.",
      "Do not request onchain execution or credential material."
    ],
    "backlogPolicy": "Move production persistence design to a follow-up only after security-router clearance.",
    "sourceIds": [
      "README.md:146",
      "src/portal.mjs:881"
    ]
  },
  "safety": {
    "noSecretsIncluded": true,
    "noLiveWriteAcknowledged": true,
    "noOnchainActionRequested": true
  }
}
```

Example JSON call:

```bash
curl -sS https://agent.bittrees.org/contribution-intents \
  -H 'Content-Type: application/json' \
  -d @intent.json
```

## Concrete Form Request Example

```bash
curl -sS https://agent.bittrees.org/gateway/contribution-intents \
  -H 'Accept: text/html' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'schema=agent.bittrees.contribution-intent.v1' \
  --data-urlencode 'intentId=intent-2026-07-09-form-spec' \
  --data-urlencode 'submittedAt=2026-07-09T15:00:00.000Z' \
  --data-urlencode 'contributor.kind=agent' \
  --data-urlencode 'contributor.name=architecture-engineer' \
  --data-urlencode 'contributor.agentId=architecture-engineer' \
  --data-urlencode 'contributor.team=engineering-team' \
  --data-urlencode 'contributor.contactRoute=M:engineering-team/architecture-engineer' \
  --data-urlencode 'targetLane=inc-ops-governance' \
  --data-urlencode 'summary=Prepare an implementation-ready contribution workflow and data-contract packet for the agent portal.' \
  --data-urlencode 'proposedTemplate=contribution-task' \
  --data-urlencode 'handoff.requestedOwnerRoute=M:engineering-team/engineering-lead' \
  --data-urlencode 'handoff.goalId=goal_plan_rzit49' \
  --data-urlencode 'handoff.expectedOutput=A consolidated implementation spec for contribution-intent routes, schema, validation, storage, and handoff events.' \
  --data-urlencode 'handoff.acceptanceCriteria=Spec covers form fields, API routes, validation, storage, and handoff records.' \
  --data-urlencode 'handoff.acceptanceCriteria=Spec includes concrete JSON and form examples.' \
  --data-urlencode 'handoff.outOfScope=Do not enable production writes.' \
  --data-urlencode 'handoff.outOfScope=Do not request onchain execution or credential material.' \
  --data-urlencode 'handoff.backlogPolicy=Move production persistence design to a follow-up only after security-router clearance.' \
  --data-urlencode 'handoff.sourceIds=README.md:146,src/portal.mjs:881' \
  --data-urlencode 'safety.noSecretsIncluded=true' \
  --data-urlencode 'safety.noLiveWriteAcknowledged=true' \
  --data-urlencode 'safety.noOnchainActionRequested=true'
```

## Handoff Events

Disabled/default mode:

- No live submission record is created.
- No fleet notification record is created.
- API callers receive JSON disabled guidance.
- Browser/form callers receive an offline packet template with the same v1 field structure.
- Operators can manually route that offline packet through the manager/task system.

Non-production write-enabled mode:

1. Parse JSON or URL-encoded form body.
2. Validate against `agent.bittrees.contribution-intent.v1`.
3. Generate `receiptId` as a UUID and `receivedAt` as an ISO timestamp.
4. Build `agent.bittrees.contribution-intent.notification.v1`.
5. Build `agent.bittrees.contribution-intent.submission.v1`.
6. Append submission record to `submissions.jsonl`.
7. Append notification record to `fleet-notifications.jsonl`.
8. Return `202` with `receiptId` and a next-step message naming `handoff.requestedOwnerRoute`.

Fleet notification record fields:

- `schema`
- `notificationId`
- `receiptId`
- `queuedAt`
- `status`
- `channel`
- `route`
- `targetLane`
- `contributor`
- `summary`
- `requestedOwnerRoute`
- `expectedOutput`
- `backlogPolicy`
- `lane`
- `targets`
- `sourceIds`
- `template`
- `featureFlag`

Submission record fields:

- `schema`
- `receiptId`
- `receivedAt`
- `featureFlag`
- `request`
- `lane`
- `template`
- `persistence`
- `fleetNotification`

No handoff event should be treated as authorization. It is only a review queue signal for the requested owner route.

## Implementation Invariants

- Public/default writes stay disabled.
- Production traffic must not enable `CONTRIBUTION_INTENTS_WRITE_ENABLED` or aliases without explicit security-router clearance.
- Submissions must never include private keys, seed phrases, raw signatures, bearer tokens, session secrets, API keys, identity documents, tax forms, sanctions materials, wallet secrets, privileged legal material, regulated personal data, or third-party confidential information.
- A contribution intent does not create employment, contractor status, agency, partnership, fiduciary duties, onboarding approval, compensation rights, token rights, equity rights, grant rights, revenue-share rights, confidentiality obligations, or acceptance into any program.
- A receipt is correlation evidence only; it is not approval, authority, or public publication.
- Onchain execution, asset movement, wallet/signing authority, governance execution, and public Bittrees claim expansion remain outside this workflow.
- Any future durable production backend must preserve the same request/response schema or publish an explicit versioned successor.
