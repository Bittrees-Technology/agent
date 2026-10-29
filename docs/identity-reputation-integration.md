# Bittrees identity, delegation and work history

Approved direction: integrate existing Bittrees services. No AdapterScan
contract, indexer or upstream pull request is required. This document separates
the implemented discovery correction from the remaining integration contract.

## Ownership

| Service | Owns | Does not establish |
| --- | --- | --- |
| Agent | Public discovery, reviewed identity associations and evidence presentation | Roles grants, device enrollment, source authority or task completion |
| Roles | Enrolled principals/credentials, contributor authority, scoped delegation and revocation | Work quality, completed jobs or external reputation |
| Workflows | Canonical runs/steps, assignment, source-confirmed execution receipts and work history | New contributor permissions or an inferred quality endorsement |
| Local AI / MCP / source app | Device custody and execution; typed transport; actual source authorization and action receipts | Permission from model output, identity listings or ratings |

## Existing enforcement to reuse

Roles `lib/mcp-authority.mjs` enrolls a principal only through an authenticated
owner session and credential-possession proof. Enrollment grants no permissions.
Its `createDelegation` requires current action and delegation authority for each
exact tenant/workspace/project/resource/action. An until-revoked delegation
additionally requires `delegate-until-revoked:<action>`. Each decision rechecks
the contributor, agent credential, policy and delegation; an agent cannot
redelegate through this interface. Do not imply all contributors may delegate.

Workflows `lib/device-worker.mjs` checks the fresh signed Roles decision, exact
operation/parameters and enrolled device/workflow binding. It rechecks source
connection revocation and owner authority at each lease/completion mutation.
Preserve idempotency, durable retries and successor rules. These source paths
exist; current production activation and end-to-end local enrollment remain
unverified by this increment.

## Implemented in this increment

Agent's existing `get_agent_reputation` lookup keeps its tool name and profile
lookup statuses. Its numeric score is now nullable and returns null while work
evidence is unverified, for both known and unknown profiles. Profile review is
reported separately. Work-history counts are null, not zero. External reputation
is not checked and current Roles authorization is not evaluated by discovery.
Consumers must handle null without coercing it to zero or ranking by profile
inclusion. The versioned projection is `bittrees.agent.reputation-evidence.v1`.

The existing public `/workflows` guide describes contributor delegation and
service ownership. Preserve the intentional legacy-page redirects, public hub,
indexing/write gates, shared sign-in and protected administration. Do not restore
the retired profile pages or publish staged internal agent records in the hub.

## Remaining identity association contract (not implemented or activated)

Use a durable reviewed association connecting the public Agent ID, exact Roles
`agent:<uuid>` principal, credential fingerprint and association revision. Keep
device identity separate: one agent may have several individually approved
devices, and key rotation must not rewrite historical attribution. Model name,
model digest and runtime version describe an execution, not the agent identity.

Optional AdapterScan references must retain chain ID, adapter, UBID, control
standard, bound address and token ID, plus optional registry/agent IDs. Do not
merge by display name, ENS name or wallet alone. A shared controller is not proof
that two agents are the same. Public profile inclusion and external association
changes require the existing owner/reviewer process.

Bind owner approval and agent/device possession to the exact association,
audience, nonce, revision and expiry. Reciprocal external wallet claims establish
only that wallet association. They do not prove device-key possession or grant
Roles scope. Controller/key/endpoint changes hold the affected association for
review; they never transfer Bittrees delegation automatically. Historical receipts
retain the binding revision that actually performed the work.

## Workflows evidence contract (partially implemented, not activated)

Local Workflows follow-up now implements part of this contract on branch
`feat/agent-work-history-20261029`: new completions retain source-recorded
principal/credential and authority provenance atomically with completion, and
the existing owner-scoped run response projects a filtered history panel.
It has no production deployment or public Agent association. It deliberately
does not claim reviewer acceptance, an independent signed attestation, reputation
credit or an external business mutation. The remaining contract below still
requires identity association, source-reader authorization and acceptance.

Workflows is the canonical owner of history; Agent consumes a privacy-filtered
read projection rather than maintaining a second mutable task ledger. A receipt
needs the workflow/run/step IDs, definition revision, logical operation ID,
executor principal, credential fingerprint, association revision, input/output
commitments, source receipt reference, outcome and timestamps. Preserve the
authority decision/delegation provenance privately; publication must not expose
owner workspaces, credentials, private source URLs, prompts or business data.

Source-confirmed execution and reviewer acceptance are distinct events. A signed
worker statement alone does not prove a source mutation; a source acknowledgment
does not prove output quality. Only the appropriate source/verifier can admit
evidence to its category. Retry, replay, pending reconciliation, cancellation,
authorization denial and offline state must not create extra accepted work.
Count one logical accepted result; separately attribute executor/coordinator/
reviewer contributions. Superseding reviews preserve earlier decisions.

Future read endpoints need authenticated owner/workspace authorization for
private history, bounded pagination and a reviewable public projection. An empty
authorized result is zero; unavailable, stale or unauthorized evidence is unknown.
No endpoint or automatic publication is introduced by this increment.

## Reputation and external discovery

Keep profile proof, community feedback, source-confirmed execution, reviewer
acceptance and measured reliability separate. Include sample size, task category,
measurement window, evidence provenance and calculation version. Do not translate
workflow completion directly into a quality rating, or count source outages as
bad model answers. All reputation is advisory and cannot create permissions.

An optional read-only AdapterScan connector can use reviewed public GET paths
after its adapter is implemented. Bound requests, cache with freshness metadata,
respect Retry-After, validate payloads, sanitize text and keep metadata out of
model instructions. Unknown/error results remain unknown. Use chain-qualified
references; do not accept the cross-chain first result as canonical. Its raw
ratings are community observations, not Bittrees-verified work or independent
reviews. No connector, automatic crawl, RPC, transaction, external signature or
gas spending is enabled here. Public on-chain attestations remain a separate
future reviewed action, not a prerequisite for useful local integration.

## Acceptance before claiming completion

1. Owner-approved association plus agent/device possession proof; mismatch,
   expired challenge and changed-controller cases denied.
2. Contributor delegates an exact authorized scope; excess scope, missing
   delegation permission, redelegation and revoked parent authority denied.
3. Real central trigger through local model, MCP and authorized source produces
   a durable completion receipt and only its authorized successor.
4. Retry/restart reconciles the same operation without duplicate credit or
   source mutation. Device/delegation revocation blocks the next action.
5. Private history stays owner-scoped. Agent shows only reviewed public evidence;
   unknown evidence, rejected reviews and stale identity are represented honestly.

Until these pass, describe this work as preparation, not live synchronized agent
identity/reputation. The Mac app, grants and production data remain unchanged.
