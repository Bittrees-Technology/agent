# fix-agent-bittrees-legal-static-asset-shadow Evidence

Task: `fix-agent-bittrees-legal-static-asset-shadow`
Date: 2026-07-09
Agent: architecture-engineer

## Summary

Defect 5 was a deployment-shape bug: the static build emitted extensionless files at `dist/contribution-intents` and `dist/gateway/contribution-intents`. On Vercel, those static files can win before the catch-all rewrite to `/api/index`, so POST requests hit static hosting and receive a bare 405 instead of the documented disabled 501 response.

The fix keeps both contribution-intent routes dynamic:

- `src/portal.mjs` marks both contribution-intent JSON routes as non-static and filters POST-capable contribution routes out of `buildStaticAssets()`.
- `scripts/serve-dist.mjs` routes `/contribution-intents` and `/gateway/contribution-intents` through the dynamic portal handler so local dist serving mirrors the Vercel rewrite path.
- `scripts/verify-api-handler.mjs` fails if the static build would emit either shadowing path.
- `test/portal.test.mjs` asserts the two static files are absent and that both POST routes return 501 disabled-response JSON bodies when writes are disabled.
- `README.md` documents that the two routes are intentionally excluded from static output.

## Consolidated Red-Defect Coverage

1. Legal/no-rights/no-authority wording: covered by current `UNIVERSAL_PORTAL_DISCLAIMER` and `NO_RIGHTS_CREATED_DISCLAIMER`, plus tests for public route outputs.
2. Privacy/retention/secrets handling: covered by `CONTRIBUTION_PRIVACY_NOTICE` on contribution-intent contract outputs and route tests.
3. Prelaunch status wording: tests now align with current `prelaunch-contract-under-review`, `prelaunch-registry-under-review`, and staged registry labels.
4. Reviewed profile wording: tests now reject old `approved-signed-profile` output and expect `registry-reviewed-profile`.
5. Static asset POST shadowing: `dist/contribution-intents` and `dist/gateway/contribution-intents` are absent; API POSTs return documented 501 disabled responses.

## Verification

Remote sync check:

- `git fetch origin`: passed with no new upstream commit.
- `git status --short --branch`: `main...origin/main [ahead 3]` with local dirty worktree changes; no pull/rebase was performed because origin had no new sibling commit to rebase onto and the worktree contained active local edits.

Full requested verification:

- `npm run check`: passed.
- `npm test`: passed, 25/25 tests.
- `npm run build`: passed, built `dist/` with 19 static assets.
- Static asset check:
  - `dist/contribution-intents`: absent.
  - `dist/gateway/contribution-intents`: absent.
  - `rg --files dist`: listed 19 assets and neither shadowing path.
- `npm run verify:api`: passed.
  - `POST /contribution-intents`: 501.
  - `POST /gateway/contribution-intents`: 501.
  - Enabled-write and invalid-form handler cases also passed.
- Local smoke:
  - Server: `PORT=3137 HOST=127.0.0.1 npm start`.
  - `npm run smoke -- --base-url=http://127.0.0.1:3137`: passed for 19 routes.

## Brain Context Used

Used Brain source ids from the task brief and recall:

- `text:22272`: prior QA identified empty 405 on both contribution-intent POST routes.
- `memory:778`, `memory:729`, `memory:723`, `memory:768`, `memory:757`, `memory:783`: repeated live/post-release evidence of the same empty 405 blocker.
- `text:22637` / `memory:798` and `memory:801`: legal authority/no-compensation context for defects 1-4 wording.
- `memory:804`: new reusable memory recorded for the static-asset shadowing pattern and fix.

No production deployment was performed.
