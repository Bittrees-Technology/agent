# Integrate Page Workflows Evidence

Task: #dae9e330 / integrate-page-workflows

## Implementation

- Updated `src/portal.mjs` so the landing page contribution workflow renders from `data/agent-onboarding/contribution-workflow.json`, including review gates.
- Added live workflow JSON handlers:
  - `GET /v1/workflow/opportunities`
  - `GET /v1/workflow/opportunities/:opportunityId`
  - `GET /v1/workflow/status`
  - `POST /v1/workflow/registrations`
- The registration route reuses the existing MCP `register_external_agent` review queue and requires a bearer token with `contributor:register`.
- Added route tests in `test/portal.test.mjs` for discovery, brief inspection, authorized registration, and status lookup.

## Verification

- `npm run check` passed. Log: `output/integrate-page-workflows-dae9e330-npm-check.log`
- `npm test` passed: 57/57. Log: `output/integrate-page-workflows-dae9e330-npm-test.log`
- `npm run build` passed. Log: `output/integrate-page-workflows-dae9e330-npm-build.log`
- `npm run verify:api` passed. Log: `output/integrate-page-workflows-dae9e330-verify-api.log`

## Journey Demo

Recorded in `output/integrate-page-workflows-dae9e330-journey-demo.log`.

- Machine-readable onboarding discovery: `GET /onboarding.json`
- Opportunity discovery: `GET /v1/workflow/opportunities?priority=high`
- Requirement inspection: `GET /v1/workflow/opportunities/source-registry-hardening`
- Authorized registration: `POST /v1/workflow/registrations` with `contributor:register`
- Status inspection: `GET /v1/workflow/status?id=<registration>&kind=registration`
- Autonomous tool discovery: `POST /mcp` `tools/list`

## Coordination Notes

Created child task rows:

- `integrate-workflow-content-dae9e330` / #c67278b2
- `validate-workflow-content-dae9e330` / #5afc7091
- `verify-workflow-journeys-dae9e330` / #243433ec

Assignment attempts from `task-master` were rejected by the manager with `task_assign_forbidden`; `ops-lead` was notified to assign the child rows.

## Brain / Instruction Accounting

Used Brain context and injected instructions from the delegation:

- `entity:task:9b554ee4-2685-47df-b807-85e2e8016f01`
- `entity:task:cbacc910-94b0-4f43-a324-dc1dc6a35b24`
- `entity:goal:goal_mqx09y9d_acrer`
- `fact:2433`
- `fact:2476`
- `fact:2477`
- `fact:2478`
- `fact:2479`
- `text:25740`
- `text:709`
- `memory:2149`
- `memory:4`

Pre-existing dirty state was present in `src/portal.mjs`, `test/portal.test.mjs`, `docs/`, `output/`, and `test-results/` before this implementation pass.
