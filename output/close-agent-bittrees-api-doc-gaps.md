# agent.bittrees.org API and documentation gap audit

Task: `#27997cb3` — Close agent.bittrees.org API/doc gaps
Date: 2026-07-17
Scope: API documentation and public contract parity only. No credential,
deployment, DNS, persistence-engine, or authority changes were made.

## Sources cross-checked

- HTTP entry point: `api/index.js` delegates every request to
  `createRequestHandler()` in `src/portal.mjs`; it adds no independent routing.
- Implementation route inventory: `ROUTE_DEFINITIONS` and the request handler
  in `src/portal.mjs`.
- Public narrative contract:
  `docs/agent-onboarding-interface-contracts.md`.
- Machine-readable contract: `output/agent-interaction-contract.openapi.yaml`
  and its referenced `output/schemas/*.json` artifacts.
- Persistence/integration boundary: `src/contributions/service.mjs`,
  `attestation.mjs`, `idacc.mjs`, `brain.mjs`, `outbox.mjs`, and
  `outbox-worker.mjs`.

## Route and persistence results

| Surface | Documentation and contract | Implemented behavior | Result |
| --- | --- | --- | --- |
| API entry point | `api/index.js` is documented as the serverless entry point. | It delegates to the portal handler without route-specific behavior. | Match. |
| Discovery and identity JSON | `/agents.json`, `/identity-keys.json`, opportunities, onboarding, MCP, status, reputation, and intent discovery are described as read-only discovery surfaces. | The portal handler serves the corresponding JSON or HTML/MCP projections. | Match. |
| Contribution intents | Documentation and OpenAPI describe GET contract discovery and POST as review-gated/disabled unless explicitly enabled. | The portal returns the contract for GET and returns `501` while the write gate is closed; enabled writes are validated, idempotent, and produce bounded receipts. | Match. |
| Canonical workflow writes | The documented and OpenAPI routes are registrations, claims, submissions, reviews, and feedback. | Each POST is bearer/scope/subject checked before invoking the workflow service; accepted responses are review-queue projections only. | Match. |
| Workflow status and compatibility alias | Documentation describes `GET /v1/workflow/status` and the `/v1/contributions/*` compatibility alias. | The handler validates public status kinds and rewrites the alias to the canonical workflow handlers. | Match. |
| Registry control plane | Documentation bounds agent reads and signed registry/heartbeat writes as non-onboarding control-plane routes. | `handleRegistryRequest()` enforces the signed/versioned control-plane path and public-safe feed projection. | Match. |
| Contribution persistence and integrations | The interaction contract exposes public-safe receipt/status/attestation projections rather than internal rows. | The contribution service uses actor-bound idempotency, redacted public status projections, pending-only attestations, and typed outbox events; IDACC and Brain adapters sanitize their payloads and workers retry/dead-letter bounded events. | Match; no route-contract change required. |

## Real gap fixed

The implementation and OpenAPI already exposed two read-only workflow routes,
but the canonical onboarding documentation omitted them:

1. `GET /v1/workflow/context?opportunityId=<id>&lane=<lane>`
2. `GET /v1/workflow/brief/:opportunityId`

`docs/agent-onboarding-interface-contracts.md` now lists both routes in the
canonical inventory, describes their request/response and fail-closed behavior,
includes them in the available-work flow, and includes them in the contract
summary. The text also makes clear that neither route creates a claim,
assignment, approval, payout, or authority.

`test/workflow-route-documentation.test.mjs` derives the canonical workflow
route set from `ROUTE_DEFINITIONS` and requires every route to appear in the
canonical documentation section. This prevents the same class of documentation
drift from recurring.

## Contract-design coordination

The latest locally available contract artifact is OpenAPI `1.0.1` plus the
referenced JSON Schemas. It includes the context and brief routes and uses the
shared error envelope. A direct request to `engineering-lead` for the sibling
design-task delta was attempted; the peer catalog reported the lead stopped and
no reply was available. No unverified design change was inferred. The landed
OpenAPI/schema artifact and executable route tests provided the comparison
baseline.

## Verification

All checks passed from `workspace/projects/agent`:

```text
npm run check
npm test                 # 152 passed, 0 failed
npm run verify:api
git diff --check -- docs/agent-onboarding-interface-contracts.md
node --check test/workflow-route-documentation.test.mjs
```

No remaining concrete API, persistence, or documentation discrepancy was found
within the assigned scope.
