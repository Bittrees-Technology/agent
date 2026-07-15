# agent.bittrees.org — human-view cleanup / completion wave

**Goal:** goal_mr4khc5x_lf68y
**Repo:** Bittrees-Technology/agent
**Branch:** `prod-readiness-hsts-testscope-20260715` (base commit `de0e2a6`)
**Status:** DONE, verified green locally. Uncommitted (see Branch/commit status).
**Prior context:** prod query `query_1784073156757_1ph96jf`, SEO query `query_1784073620970_4vamp37`.

## Objective
Audit and clean the site so it reads professionally to humans: replace/hide internal
queue vocabulary (blocked, under-review, ready-for-triage, review-gated-queue,
prelaunch, disabled, ready-for-review, daily-smoke-ready) on user-facing surfaces,
reduce clutter, and complete safe backlog items — **without** removing truthful
noindex/legal/submission gates.

## Architecture note (how the site is served)
All routes rewrite to `/api/index` → `src/portal.mjs` `createRequestHandler`. User-facing
HTML is rendered dynamically by portal.mjs. Machine-readable JSON contracts (`*.json`,
`/v1/...`) carry precise internal `status` slugs that agents/tooling + the test suite
consume. The cleanup is therefore **presentation-only**: it changes what humans see in
HTML, and never mutates the JSON `status` contracts.

## Files changed (this cleanup wave)
| File | Change |
|---|---|
| `src/portal.mjs` | `humanizeStatus()` + public status vocabulary (Available / Preview / Coming soon / Legal review pending / Under review); applied to every HTML status badge, landing route-directory cards, legal content-status rows, identity-keys ENS/gate readouts. Added `renderPortalFooter()` (site-wide contentinfo landmark) + `renderNotFoundPage()` (branded HTML 404). Fallback 404 now content-negotiates: HTML for browsers, JSON preserved for machines. |
| `test/portal.test.mjs` | Identity-keys HTML assertions reconciled to humanized labels; JSON-contract assertions still pin the precise machine slugs. |
| `scripts/smoke-check.mjs` | Identity-keys HTML smoke assertion swapped from raw slug `blocked-not-completed` → humanized `Coming soon`; not-complete evidence + completion guard retained. |
| (pre-existing on branch: `src/server.mjs`, `vercel.json`, `.github/workflows/clean-machine.yml`, `.gitignore` — HSTS/CI/test-scope work, not part of this wave) | — |

> Concurrency note: a second worker was active on `src/portal.mjs`/`test/portal.test.mjs`
> during this wave and independently upgraded my initial `humanizeStatus` into the
> 5-word public vocabulary + `hint` system and updated the unit tests. Our changes
> merged cleanly (my footer/404/content-negotiation + smoke reconciliation ride on top).
> The file was hash-stable across the final test + verification passes.

## Labels resolved (user-facing → human-readable, truth preserved)
Raw machine slugs no longer render on ANY user-facing HTML page (verified by tag-stripped
sweep across `/`, `/mcp`, `/mcp-docs`, `/submission-status`, `/reputation`,
`/identity-keys`, `/onboarding`, `/privacy`, `/terms`, `/terms-of-use`):

| Internal slug (still in JSON contract) | Public HTML label |
|---|---|
| `prelaunch-contract-under-review`, `prelaunch-onboarding-contract-ready` | Preview |
| `prelaunch-registry-under-review`, `prelaunch-profile-review-active`, `review-gated queue`, `ready-for-triage` | Under review |
| `blocked-pending-legal-approved-content`, `pending-legal-approved-content` | Legal review pending |
| `blocked-not-completed`, `blocked-without-explicit-controller-or-safe-approval`, `contract-only-disabled` | Coming soon |
| `human-view-ready`, `source-grounded-context-ready`, `brief-ready`, `ready` | Available |

Landing route directory (biggest offender) previously showed ~30 raw badges; now shows
only the 5 clean states. Legal/terms/privacy pages keep truthful "pending legal approval"
prose + gate tables. Identity-keys onchain-execution gate shows "Coming soon" in HTML
while `/identity-keys.json` still carries the exact `blocked-*` slugs and the completion
guard (`!/rollout complete|68/68 executed|completed successfully|ready to execute/`) stays.

## Safe backlog items completed
- **Branded HTML 404** — `renderNotFoundPage()` served to browsers (Accept: text/html) at
  404 with portal styling, nav, working-route list, and footer; **JSON 404 preserved**
  for machine clients (stable `error`/`availableRoutes` shape). Telemetry logs `not_found`.
- **Footer landmark** — `renderPortalFooter()` `<footer aria-label>` (contentinfo) on all
  10 HTML pages + the 404 page; self-contained scoped style (CSP-safe), compact, with
  route links + truthful prelaunch/disclaimer line.
- **Route metadata / OG** — `renderPageMetadata` already emits canonical, og:title/
  description/url/type/site_name/locale, twitter:card=summary, theme-color. **og:image
  intentionally NOT wired**: no production image asset exists (only screenshots under
  `output/`), and CSP is `img-src 'self' data:`; shipping an og:image would 404. Correct
  to leave absent — documented, not an oversight.
- **Status presentation cleanup** — unified 5-word vocabulary across every badge/table.

## Truthful gates preserved (NOT touched)
- `noindex,nofollow` (vercel.json `X-Robots-Tag` + per-page meta) — intact.
- Terms/Privacy legal-content-pending gates — still read "pending legal approval".
- Contribution-intent write gate / submission review gates — unchanged.
- Identity-keys onchain-execution blocked state — HTML says "Coming soon", JSON keeps
  `blocked-*`; no page implies completion.

## Build / test evidence
- `npm test` → **121 tests, 121 pass, 0 fail**.
- `npm run build` → **built dist/ with 26 static assets** (release `0.1.0+de0e2a6…dirty`).
- `npm run smoke` vs **local** build → all content/label/page assertions pass. Remaining
  2 failures are environmental only: `/idacc/releases.json` missing deployed commit SHA /
  build identity (needs deploy-time `EXPECTED_RELEASE_*` env; not a code defect).
- `npm run smoke` vs **live** `https://agent.bittrees.org` → fails (e.g. `/terms` 404,
  release tag v0.1.638 vs GitHub v0.1.640). This is the **known stale/diverged live
  deployment** (deploy pipeline NO-GO, owned by maintainer) — NOT introduced here.
- Manual verification: tag-stripped HTML sweep of all 10 pages → zero raw machine slugs;
  footer present on all pages + 404; branded 404 returns HTTP 404 `text/html`; JSON 404
  preserved for `Accept: application/json`.

## Labels still "blocked" (by design — owner + acceptance criteria)
These remain gated on purpose; NOT resolvable by this cleanup:
1. **Terms of Use / Privacy legal content** — Owner: legal/general-counsel. Acceptance:
   approved final Terms + privacy policy & public contact route supplied to the portal;
   then the page can publish real content instead of the pending-status page.
2. **Onchain execution / ENS primary-name rollout (identity-keys)** — Owner: onchain
   execution lane. Acceptance: authorized-controller-signer, isolated-custody-attestations,
   numeric-spend-cap, broadcaster-authority gates satisfied + wallet-record mismatch
   reconciled (currently 0/68 executed). (Matches standing NO-GO for identity-keys.)
3. **Public launch (noindex)** — Owner: lead. Acceptance: lead approves claims, registry
   controls, identity/key publication, intake safeguards, source scope, route contracts.
4. **Live deployment divergence** — Owner: maintainer. Acceptance: deploy this branch so
   live matches GitHub main (live smoke currently fails on stale deploy).

## Branch / commit status
- Branch `prod-readiness-hsts-testscope-20260715`, base `de0e2a6`.
- Changes are **verified-green but UNCOMMITTED**. Given (a) a concurrent writer on the
  same branch and (b) the established push ownership (git-manager/maintainer own commit+
  push for this repo; deploy is maintainer-owned), I did **not** commit or push.
- ⚠ Recommend git-manager checkpoint-commit the converged state promptly (uncommitted
  edits on this repo have historically been reverted). Do not deploy live as part of this
  wave — deploy is a separate maintainer-owned gate.
