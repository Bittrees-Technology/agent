# Bittrees project production-readiness review — 2026-08-21

## Outcome

The review covers all 14 projects in the canonical Bittrees project registry. It produced 84 evidence-backed tasks: 36 P0 launch/safety priorities, 45 P1 production requirements, and 3 P2 quality improvements. Twenty-one tasks are explicitly blocked by an owner decision, external review, production dependency, or approval.

The canonical working backlog is:

- human: `/readiness`
- machine: `/readiness.json`
- source: `data/project-readiness.json`
- project detail: `/v1/projects/:projectId`
- MCP: `resources/list` and `resources/read`

The task registry is a point-in-time planning artifact. It is not a legal opinion, financial audit, smart-contract audit, launch approval, or statement that any project is safe for production.

## Review method

Each project was checked across six dimensions:

1. product and user experience;
2. AI-agent discovery and interoperability;
3. engineering quality and release automation;
4. security and transaction safety;
5. legal, privacy, and governance;
6. operations, observability, recovery, and support.

Evidence included canonical and locally available repositories, README files, package scripts, tests, CI and release metadata, live public routes, response metadata and security headers, discovery artifacts, desktop/mobile rendering, the IDACC catalog, and existing planning records. Private infrastructure or undocumented off-repository processes were not counted as complete.

## Plans 70 and 71 reconciliation

Plans 70 and 71 are no longer separate unfinished implementations; the repository’s existing completion record says they were archived and consolidated through Plan 72. Their intended contract is substantially implemented:

- Plan 70’s onboarding/data-contract work is represented by the seven versioned flows in `/onboarding.json`, their schemas and examples, project/source discovery, and the guarded workflow routes.
- Plan 71’s MCP client-access work is represented by the live Streamable HTTP endpoint, the local stdio proxy, client import documentation, server discovery, tools, resources, and protocol tests.
- Cross-project discovery, bounded handoffs, project correlation, contribution review, status lookup, and MCP resource reads exist.

What remains is productionization, not another duplicate plan: durable shared workflow state, security/legal/operations approvals, package publication, deployment evidence, and the public indexing/write decision. Those items are captured under the `agent` project’s readiness tasks and in `docs/unified-bittrees-mcp-completion.md`.

## Cross-project summary

| Project | Current stage | P0 | P1 | P2 | Primary gap |
| --- | --- | ---: | ---: | ---: | --- |
| Bittrees Agent Gateway | prelaunch platform | 3 | 3 | 0 | Durable control plane and launch approvals |
| Bitlogic | testnet validation | 2 | 3 | 1 | Sepolia acceptance and independent security review |
| Bittrees Capital | public preview | 2 | 4 | 0 | Mobile clipping and transaction-safety proof |
| Bittrees Governance | public preview | 2 | 4 | 0 | Integration E2E and contributor privacy model |
| Bittrees.org Hub | legacy public site | 1 | 4 | 1 | Replace the sparse three-link page with the full ecosystem hub |
| Bittrees Research | member preview | 2 | 4 | 0 | Membership authorization and member-data privacy |
| Bittrees Vault | uncommitted prototype | 4 | 2 | 0 | Archive/relaunch decision and canonical source history |
| Bounties | launch gated | 4 | 2 | 0 | Explicit activation, audit, durable data, and legal gates |
| Chirpy | public preview | 2 | 4 | 0 | Production services and messaging privacy/moderation approval |
| CryptoDirectory | repository release workflow | 2 | 4 | 0 | Stable public deployment and freshness SLA |
| ID Agents Control Center | released desktop product | 2 | 3 | 1 | Version reconciliation and runtime security audit |
| NFTFactory | protected prelaunch | 4 | 2 | 0 | Production backend/contracts/indexer and testnet acceptance |
| SkillMesh | testnet public preview | 4 | 2 | 0 | Protocol conformance, provider runtime, and execution sandbox |
| Token Compute Partnership | commercial preview | 2 | 4 | 0 | Reliable lead intake and independently validated methodology |

## Site and discovery findings

The strongest current public product presentation is on the agent portal, Bounties, Chirpy, SkillMesh, Bitlogic, IDACC, and TCP. The largest experience problems are Bittrees.org’s extremely sparse hub, Bittrees Governance’s text-heavy hierarchy, Bittrees Capital’s verified mobile horizontal overflow, and very long mobile documents on TCP and SkillMesh.

Agent discovery is uneven:

- `agent.bittrees.org` has MCP, llms.txt, project resources, AI catalog, server card, health, robots, and sitemap.
- SkillMesh already has MCP, OpenAPI, A2A, llms.txt, health, and an agent manifest, but the root HTML does not advertise all of them and canonical/sitemap polish is incomplete.
- Most other live projects have no genuine llms.txt or versioned agent contract. Several single-page apps return their HTML shell with status 200 for nonexistent discovery paths, which can look like a valid machine document unless the content type/body is checked.
- Bittrees Agent Gateway and Bounties have the strongest observed root security-header sets. Most other public origins need CSP, nosniff, clickjacking, referrer, and permissions policies.
- NFTFactory’s public origin currently responds behind an access gate, so it is correctly classified as a protected preview rather than a public API.

The agent portal previously emitted the experimental AI catalog and server card as static files in production, causing a generic `application/octet-stream` response to shadow the dynamic custom media type. Those files are now deliberately excluded from the static build so the dynamic route preserves custom MIME, CORS, ETag, and conditional-request behavior.

## Recommended execution order

### Wave 1 — stop unsafe or misleading launches

1. Keep Agent writes/indexing, Bounties activation, Vault relaunch, NFTFactory launch, and SkillMesh production execution fail-closed.
2. Fix Bittrees Capital’s mobile clipping.
3. Record owner decisions for Vault, NFTFactory access, Bitlogic’s testnet milestone, and SkillMesh’s production network.
4. Commission the contract/runtime/security reviews identified as P0.

### Wave 2 — build production foundations

1. Add protected CI and deployed smoke suites where absent.
2. Provision durable data, migrations, backups, restore drills, observability, and incident ownership.
3. Complete legal/privacy/support surfaces, especially for financial, governance, marketplace, messaging, member, and lead-intake data.
4. Test high-risk wallet and onchain paths end to end with simulation, explicit previews, negative authorization cases, and recovery.

### Wave 3 — make the ecosystem professional and universally discoverable

1. Rebuild `bittrees.org` as the canonical product hub generated from the shared project registry.
2. Publish canonical metadata, real robots/sitemaps, security headers, llms.txt, health, and versioned read contracts for each public project.
3. Link every project to `agent.bittrees.org`, and expose its approved read resources through the unified MCP rather than creating disconnected agent gateways.
4. Enforce responsive, accessibility, performance, content-freshness, and release-provenance checks in CI.

## Closing tasks safely

Task states are `todo`, `in-progress`, `blocked`, and `done`. A task may move to `done` only when every acceptance criterion has durable evidence and the responsible owner records completion. For legal, financial, security, public-claim, wallet, signer, governance, or deployment authority, self-attestation is insufficient.

When a new Bittrees project or data source is added, add it to both `data/bittrees-projects.json` and `data/project-readiness.json`. Tests require a one-to-one project mapping, unique task IDs, and explicit acceptance criteria so the human directory, JSON routes, per-project resource, llms.txt, MCP catalog, monitoring, build, and smoke suite remain synchronized.
