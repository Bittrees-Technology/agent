# Agent funnel and MCP migration contract

Agent owns onboarding, public project discovery and existing contribution review.
The toolbar and contextual links lead to MCP Connect, Explore, Automations and
Status. Sign-in never grants execution access; app authorization and approval
requirements remain independent.
The independent [Bittrees MCP repository](https://github.com/Bittrees-Technology/mcp)
owns transport, integration profiles, rules, automation, authoritative catalog,
schemas and its dedicated Vercel/database/release configuration. Agent has no MCP
service deployment workflow, runtime secret requirement, database or worker.

The funnel links to `https://mcp.bittrees.org/connect`. GET `/connect` reconstructs
only the supported selected/bittrees/ecosystem selection fields and hands off to
that page; it never copies arbitrary query arguments or secrets. GET
`/connection.json` is a compatibility configuration generator targeting the new
canonical `https://mcp.bittrees.org/mcp` endpoint. The separate service's production health and durable storage were verified on
September 16, 2026. Existing clients still migrate explicitly; contribution clients
keep their Agent endpoint unless a separate adapter has been authorized.

Existing POST `/mcp` continues to serve Agent's legacy contribution API and its
existing identity, review and write gates. Explicit selected-mode legacy requests
continue through a local read-only compatibility adapter. There is no cross-origin
POST redirect, bearer forwarding, implicit service permission or new private tool.
Migration requires an explicit client URL change and independently provisioned MCP
credentials for private configuration/automation. A selected project is visibility,
not authority to send messages, sign, spend, grant permissions or execute actions.

`data/bittrees-projects.json` is a reviewed public discovery snapshot. The Agent
site and compatibility resources deliberately keep this local last-known-good
copy; they do not fetch or trust arbitrary live source URLs. New catalog revisions
from the MCP repository must pass schema, deduplication and affiliation review
before an Agent update. Snapshot freshness is displayed; shared Git history or
publication alone is not a claim that both services run the same revision.
`/catalog-sync.json` and `/catalog-status` hand off to MCP's operational status.

`bittrees.project.json` describes only this Agent product for reviewed onboarding
into the independent service. The original 14-project readiness review remains
historical; new inventory entries do not receive fabricated acceptance results.
The excluded products listed below are absent from discovery and active plans.

The service extraction is recoverable at Agent commit
`5016589b84da082684db83f8aefb15b02e5232ef`, and independent MCP commit
`d125f88b69bfbdfa2369c16c36aef7794d19aaa0`. Service code and production ownership
were handed to the parent task; Agent PR21 covers funnel and compatibility only.

## Excluded products

Bitlogic, Bittrees Vault, SkillMesh, Metatokens, Wallet, TreeSwap, Builders Advocacy
Group, MyCloud and Bittrees Node must stay out of public discovery, connection
selection, readiness queues and active integration plans until explicit owner
reapproval. `src/public-project-policy.mjs` applies independently of imported
snapshots, including aliases and saved selections. Historical review documents
are evidence only, not active rollout instructions.
