# Public Agent MCP reads

Endpoint: `https://agent.bittrees.org/api/public-mcp`.
Manifest: root `bittrees.tools.json`, mirrored at
`https://agent.bittrees.org/.well-known/bittrees-tools.json`.
Central discovery: `https://mcp.bittrees.org/mcp`.

This stateless source connection needs no authentication. It exposes only
`agent.list_projects`, `agent.list_opportunities`, `agent.get_opportunity` and
`agent.list_tasks`. It does not borrow credentials from the central gateway.
Never send credentials to this public connection. Cookie/bearer presence
cannot change its projection. The legacy `/mcp` interface is separate.

Use POST with Content-Type `application/json`, Accept
`application/json, text/event-stream`, and a supported MCP-Protocol-Version
header (`2025-11-25` or `2025-06-18`) after initialization. Initialization
negotiates the requested supported version or returns the latest supported
version. There are no sessions, streaming subscriptions or server-initiated
requests; GET/HEAD/DELETE return 405. Supported notifications return 202.
An Origin header, when present, must be exactly Agent or central MCP's HTTPS
origin. Query parameters and alternate transport/content types are rejected.

Lists accept limit 1–20 (default 10), offset 0–10000, and an optional snapshot
revision. Later pages require the first page's sourceRevision in `revision`;
keep filters unchanged. A changed source revision requires restarting at the
first page. Project IDs and opportunity IDs come from the public lists.
Opportunity filters use its published lane/priority/status enums; task
priorities are separately P0/P1/P2. `tools/list` carries the current schemas.

Public project output omits owner contacts, keys, source-review internals and
authorization configuration. Opportunity output contains the curated brief
and acceptance criteria, never contributor queue or receipt state. Retired
project opportunities are excluded. Data comes from the same published source
snapshots as the existing GET APIs, using pure projections rather than mutable
workflow-store methods. It does not verify private/live queue progress.

Task output preserves each original sourceId/contentHash and the task feed's
revision, with a bounded page instead of the whole feed. No record is silently
truncated. A byte-limited page reports `byteLimited:true` and the exact
`nextOffset`; oversized single records fail closed. Task omission is never a
deletion instruction. CRM imports require their separate actor/project grants,
mapping and conflict review; this adapter does not perform them.

Requests are bounded to 16 KiB of JSON, 12 nesting levels and a five-second
stream-read deadline. Platform-preparsed bodies are checked independently.
Public source snapshots are capped at 256 KiB. Records are projected before output, with a 24 KiB record-page budget
and a 64 KiB final JSON-RPC wire limit (including both MCP content formats).
No URL/header/path overrides, arbitrary receipt lookups, private history,
registry controls, signing, writes, outbox or recurring jobs are exposed.

The connection's read-only annotations and grantsAuthority:false boundary are
descriptive. They never substitute for source authorization of a later action.
