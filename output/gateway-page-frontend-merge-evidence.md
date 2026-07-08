# Gateway Page Frontend Merge Evidence

Task: `gateway-page-frontend`
Parent: `implement-gateway-page` (`#874f265a`)
Date: 2026-07-08

## Merge Reconciliation

- Fetched `origin/main` and reconciled the local portal branch with upstream commits `cc5e453` and `a32f38b`.
- Preserved the upstream source registry, identity/key, opportunities, monitoring, and smoke-test workflow.
- Reconciled the contribution-intent workflow by keeping the serverless API handler and adding the landing-page form against `agent.bittrees.contribution-intent.v1`.
- Kept `POST /contribution-intents` and `POST /gateway/contribution-intents` behind non-production write flags.
- Refreshed the IDACC release snapshot from GitHub latest: `v0.1.621`, published `2026-07-07T23:13:08Z`, asset SHA-256 `01f15d30de696f43efbfae11f131d28b086de85949a386d584ee62a09fd151d6`.

## Verification

- `npm run check` passed.
- `npm test` passed: 11 tests.
- `npm run build` passed: 15 static assets.
- `npm run verify:api` passed, including disabled form guidance, enabled JSON receipt, invalid form feedback, enabled form receipt, and persisted JSONL records.
- `npm run smoke -- --base-url=http://127.0.0.1:4317` passed after restarting the local server on the refreshed tree.

## Notes

- First smoke run correctly failed because `/idacc/releases.json` still referenced `v0.1.619` while GitHub latest was `v0.1.621`.
- No production write flag was enabled.
