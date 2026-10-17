# Agent backlog → MCP → CRM

Agent publishes its entire approved production backlog grouped by site at
`https://agent.bittrees.org/tasks.json`. The existing `/readiness.json` stays
compatible. Both are public read-only snapshots; neither endpoint writes to CRM.
The feed is also listed as an Agent MCP resource.

## Source contract

The normal Agent JSON envelope carries `generatedAt`, the JSON `schema`, and
`data`. The schema is available at `/tasks.json#/schema`. `data.schema` is
`agent.bittrees.task-feed.v1`; `data.revision` is a SHA-256 content revision.
The envelope timestamp is not part of this digest. `reviewedAt` remains the
source review date, not a claim of fresh acceptance or task completion.

Each project has `projectId`, `name`, `siteUrl`, and `tasks`. Each task includes
`sourceId`, `projectId`, `title`, `description`, `status`, `priority`, `area`,
`acceptanceCriteria`, `progressNote`, `sourceUrl`, and `contentHash`.
`sourceId` is `agent-readiness:<projectId>:<taskId>` and stays stable when wording
or status changes. Source IDs must not be recycled. Task and project ordering
does not affect the feed revision. Excluded products are filtered independently
of incoming snapshots; their tasks must never be imported.

## MCP orchestration and CRM permissions

MCP owns scheduling, the approved actor connection, destination mapping and
sync receipts. Configure the destination explicitly; do not infer a workspace
or grant access from public feed visibility or shared sign-in. CRM must still
validate current project grants and create/update rights for every operation.
Use the existing MCP connection and CRM tools rather than a direct database writer.

Keep a mapping from feed origin + `sourceId` to CRM task ID and last successfully
synced `contentHash`. Repeated delivery must upsert the same mapped record; use
feed origin + source ID + content hash as the operation idempotency key. Group by
source `projectId` under the approved destination. Record source provenance and
acceptance criteria. Preserve blocked/in-progress states without treating them
as completed. Never claim an import succeeded until CRM confirms it.

Sync is source-to-CRM for source-owned fields. Preserve CRM assignments, comments,
scheduling and other user-owned fields. If a source-owned field was edited in
CRM since the last successful sync, retain it and report a conflict for review.
CRM completion never changes Agent acceptance records automatically.

`tombstones` is an explicit retirement list of `{sourceId, reason}`; initially
empty. Missing tasks, transient failures, and tombstones never automatically
remove or complete CRM records. Retain them for review. Never infer deletion
from a smaller snapshot. Activation requires an approved MCP actor and selected
CRM destination; publishing this feed alone does not activate a sync.
