# Public Agent hub

Agent is the public guide to Bittrees AI tools, connections, workflows and learning.
AI owns the local app; MCP owns connection configuration; Workflows owns central
work management; Roles owns permission review. Agent links to those services and
does not grant their authority or duplicate their controls.

## Content and routes

- `/`: AI and MCP entry points, a map of the tools and selected learning links.
- `/tools`: curated Bittrees tools grouped by purpose.
- `/workflows`: how the tools fit together and where to review access.
- `/resources`: Bittrees setup guides and selected external publisher resources.
- `/developers`: central MCP setup and existing Agent discovery contracts.
- `/contribute`: a bounded contribution guide using each project's review route.
- `/projects` and `/readiness`: supporting snapshots, not live service/task status.

`src/ecosystem/resources.mjs` owns the shared links, descriptions, requirements,
page metadata and last review date. Update availability with the owning app's
current evidence. Prefer stable setup pages to a hardcoded latest download tag.
External resources are publisher references, not Bittrees-approved integrations.
Preserve the excluded product policy and deferred Bitlogic/Skillmesh scope.

The six pages share `src/ecosystem/ui.mjs` and `public/hub.css`. The server and
static build use the same renderers. Existing machine routes and authenticated
contribution clients keep their endpoints and independent authorization.

## Validation and release

Use existing dependencies. Run `npm run check`, `npm test`, `npm run build` and
`npm run verify:api`. The smoke suite includes all six hub pages. For local smoke
use the built server (`HOST=127.0.0.1 PORT=... node scripts/serve-dist.mjs`), whose
JSON assets carry the generated release identity; a source-mode development
server has package fallback identity unless explicitly configured.

Check the hub at 320, 375, 768 and 1280px, keyboard skip/focus behavior, promoted
links and the consent UI. Check HTML and CSS MIME types under nosniff. After
release verify `/api/health` matches the exact merged commit, all new routes,
stylesheet, sitemap and canonical metadata. Use the existing production smoke
and rollback procedures in `production-operations-runbook.md`; retain the prior
deployment and do not create another monitoring schedule for the hub.

The initial hub release preserves noindex/disallow-all, durable-write gates,
source permissions, owner signatures and Safe approvals. Public search launch
requires the existing claim/legal/security review and coherent HTML/header/
robots configuration. Do not infer launch approval from publishing these pages.

## Support and upkeep

Public website problems route to the Agent repository issue tracker; private
credentials or app data must not be posted there. Tool problems route to their
owning service. Reconcile outdated directory/backlog data with those owners
before changing task status. Existing local AI ownership is the preferred path
for future scheduled upkeep only after its adapter, source authority and native
execution are verified. No new crawler, hosted search, service or paid inference
is required by this hub.

## Selective indexing preparation (29 October 2026)

The existing indexing flag now applies only to the six explicit hub paths in
`INDEXABLE_HUB_PATHS`. Preview and development deployments stay noindex even if
the flag is present. Error responses, JSON, administration and legacy review
pages stay excluded. HTML metadata, response headers and the enabled sitemap
share the route policy. The enabled robots policy allows crawling public pages
so crawlers can read noindex on excluded reference pages; authenticated APIs
and administration remain disallowed. Robots rules are not access control.

Rebuild after any indexing environment change so generated assets and runtime
policy agree. Keep the global Vercel noindex header while indexing approval is
pending: Vercel serves generated HTML directly, bypassing runtime response
headers. A future approved indexing release must replace that global header
with explicit platform rules for the six hub pages and retain exclusions for
all other paths, then verify the public production headers. Protected previews
add their own noindex header and cannot prove this platform behavior.
For an approved indexing release, pass `--expect-public-hub-indexing` to the
smoke suite and update the explicit hosted release expectation together. Never
turn on indexing solely because the code is deployable.

Owner supplied Bittrees, Inc., agent@bittrees.org and Bounties' terms as the
publication reference. The Open Metaverse framework does not supply an
incorporation country or business mailing address. Final terms/policy approval
is not asserted by the factual notice or draft. Recipient acceptance and
forwarding configuration are verified; end-to-end email delivery was not tested.

The October reconciliation preserves original all-project review dates and all
66 task statuses. Agent evidence notes and public landing-page observations are
new evidence, not completion decisions. Consumers must refresh the task-feed
revision before preparing a source-bound CRM sync approval.
