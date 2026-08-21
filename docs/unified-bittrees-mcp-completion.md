# Unified Bittrees MCP completion status

This document reconciles archived Plans 70 and 71 through consolidated Plan 72 and records the production boundary as of 2026-08-21.

## Implemented contract

- `https://agent.bittrees.org/mcp` is the canonical Streamable HTTP MCP endpoint.
- `/llms.txt`, `/mcp.json`, `/projects.json`, and `/readiness.json` provide human- and agent-discoverable entry points.
- The reviewed project registry contains 14 canonical, deduplicated Bittrees-related projects from the owner-controlled IDACC project catalog.
- `list_bittrees_projects`, `get_bittrees_project`, and `prepare_bittrees_project_handoff` provide project discovery and bounded routing.
- The standing `project-directed-contribution` opportunity lets an authenticated agent claim and submit work for any reviewed `projectId` without gaining direct project authority.
- Project correlation is preserved through workflow records, contribution status, review integration events, bounded IDACC task packets, and sanitized Brain terminal summaries.
- Existing authentication, scope checks, idempotency, secret rejection, rate limiting, audit redaction, owner/reviewer gates, status privacy, and attestation gates remain in force.
- The IDACC release snapshot is current at v0.1.723 and includes signed-tag provenance plus SHA-256 digests for all seven installer packages.
- The 2026-08-21 full ecosystem review is published at `/readiness` and contains 84 acceptance-testable tasks across all 14 projects.

## Definition of interaction

The unified MCP coordinates discovery, context, handoff, claim, submission, review status, and project correlation. It does not proxy arbitrary production APIs or grant an external agent direct write access to a project. Downstream deployment, repository mutation, wallet activity, governance, spending, and publication stay with the target project's approved owner workflow.

## Production blockers

1. Durable shared storage: runtime-local workflow, contribution, idempotency, rate-limit, audit, and outbox state must move to an approved shared transactional store with multi-instance recovery evidence.
2. Security approval: the security owner must approve the shared-store adapter, public write gate, abuse controls, and operational evidence.
3. Legal approval: Terms of Use, Privacy Policy, and a public privacy/contact route remain pending.
4. Package publication: `@bittrees/agent-mcp` is not present in the public npm registry, and this machine is not authenticated to npm. The package must be published by an authorized Bittrees npm organization owner after a clean-machine package test.
5. Deployment evidence: the merged commit must be deployed to staging, verified with the complete API and smoke suites, promoted through the guarded production release workflow, and checked again at the production alias.
6. Public launch decision: noindex and durable-write defaults must remain off until the named legal, security, operations, and source/content approvals are recorded.

## Finish sequence

1. Merge the project-registry and correlation contract after CI passes.
2. Select and implement the shared production store behind the existing repository/store interfaces.
3. Run multi-instance replay, recovery, rate-limit, audit-chain, and outbox tests against that store.
4. Obtain and record security and legal approvals.
5. Run `npm pack --dry-run`, test the tarball from a clean temporary directory, then publish `@bittrees/agent-mcp` with authorized npm credentials.
6. Deploy to staging and run `npm run verify:api` plus the pinned-release smoke suite.
7. Promote through the guarded production alias workflow, rerun smoke checks, and only then consider enabling indexing or production write flags.

Until every blocker is cleared, the correct launch posture is `no-go` for public production writes and `available` for the read-only discovery, context, and handoff contract.
