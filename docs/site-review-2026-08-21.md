# agent.bittrees.org site review — 2026-08-21

## Review scope

The production portal was reviewed at desktop and 390 × 844 mobile widths across:

- `/`
- `/onboarding`
- `/mcp`
- `/mcp-docs`
- `/submission-status`
- `/reputation`
- `/identity-keys`
- `/terms-of-use`
- `/privacy`
- the 404 page

The review also covered route metadata, response headers, `robots.txt`, `sitemap.xml`, `llms.txt`, the MCP JSON-RPC surface, the project registry, static-build output, smoke policy, and responsive overflow.

## Main findings

1. The home page presented the route inventory and legal caveats before the value proposition. Its mobile document was more than 20,000 pixels tall.
2. The primary navigation carried too many links and groups to remain readable at tablet and mobile widths.
3. The home contribution-signing form overflowed horizontally on a 390-pixel viewport because nested signing rows retained min-content widths.
4. `/mcp` and `/mcp-docs` were nearly identical and centered a long tool table instead of the shortest agent connection path.
5. The project registry was machine-readable but had no dedicated human directory or stable per-project resource route.
6. The MCP gateway exposed tools but not MCP resources, so agents could not enumerate the portal's trusted documents and projects through the protocol.
7. `llms.txt` was comprehensive but too long for a first-hop discovery document and did not follow the concise linked-document shape proposed by llms.txt v2.
8. HTML metadata did not advertise the agent guide or machine discovery documents, and response headers did not link to them.
9. No capability-first unauthenticated discovery method was available before MCP initialization.
10. The visual system was consistent but read as a long internal operations document rather than an expandable ecosystem portal.

## Implemented improvements

- Reframed the home page around one universal Bittrees agent interface, featured projects, a clear MCP endpoint, and progressive disclosure for operational detail.
- Added `/projects` with the full reviewed ecosystem registry and a stable `/v1/projects/:projectId` JSON resource for each project.
- Reduced primary navigation to five high-frequency destinations and moved governance, legal, reputation, and key-management routes to the footer.
- Fixed signing-form min-width constraints and responsive table/form behavior.
- Separated the live MCP gateway page from client setup documentation.
- Added MCP `server/discover`, `resources/list`, and `resources/read` support.
- Published core portal resources plus one resource per reviewed project through the MCP endpoint.
- Reworked `/llms.txt` into a concise first-hop guide and retained the expanded material at `/llms-full.txt`.
- Added HTML and HTTP `Link` discovery for the agent guide, project registry, MCP metadata, and preview Server Card.
- Added `/.well-known/ai-catalog.json`, `/mcp/server-card`, caching, ETags, CORS, and a repository-level `server.json` for registry readiness.
- Added `/projects` to the sitemap and all new documents to the static build and smoke policy.
- Updated shared page styling with a calmer ecosystem visual system, rounded controls, better header wrapping, and responsive layouts.

## Production gates that remain intentionally closed

- Keep `noindex,nofollow` until Bittrees public claims and source registry content are approved.
- Do not enable production contribution writes until the legal/IP/NDA, security, reviewer-authority, and shared transactional-store gates are cleared.
- Treat the MCP Server Card and AI Catalog routes as experimental preview discovery, not finalized MCP standard behavior.
- Keep protocol compatibility at the currently implemented MCP versions until a tested protocol upgrade is completed.
- Obtain legal-approved Terms of Use, privacy policy, and public privacy contact content before public launch.

## Growth rule

A new Bittrees product or data source should be added once to `data/bittrees-projects.json`. The portal should then expose it through the human `/projects` directory, `/projects.json`, a stable `/v1/projects/:projectId` route, and MCP `resources/list`/`resources/read` without introducing another top-level gateway.
