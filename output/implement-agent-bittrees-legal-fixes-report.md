# implement-agent-bittrees-legal-fixes Report

Task: `implement-agent-bittrees-legal-fixes`  
Parent: `fix-agent-bittrees-legal-staging-defects` (`#4fda65ed`)  
Goal: `goal_plan_rzit49`  
Repo: `/Users/jhineline/bob/Library/Assistants/idagents/id-agents/workspace/projects/agent`  
Source commit containing code changes: `07f281f Fix contribution-intent route shadowing`

## Summary

Implemented the five red legal/staging defects in source:

- Replaced old launch/readiness/profile labels with `prelaunch-contract-under-review`, `prelaunch-registry-under-review`, `prelaunch-monitoring-active`, and `registry-reviewed-profile`.
- Replaced registry/publication overstatement with staged-review wording and the approved contract-draft launch-gate copy.
- Added the approved universal disclaimer, no-rights-created disclaimer, and contribution privacy/intake notice to landing, `llms.txt`, and JSON route outputs.
- Mirrored the privacy notice on `/contribution-intents` and `/gateway/contribution-intents`.
- Kept `/contribution-intents` and `/gateway/contribution-intents` dynamic by excluding them from static output and routing them through the dynamic handler in `start:dist`.

## Files

- `src/portal.mjs`
- `test/portal.test.mjs`
- `scripts/serve-dist.mjs`
- `scripts/verify-api-handler.mjs`
- `README.md`

Existing Plan-71 frontend deltas remain in the repository history/working tree; no production deploy was performed.

## Verification

- `npm run check`: passed.
- `npm test`: passed, 25/25 tests.
- `npm run build`: passed, built `dist/` with 19 static assets.
- Static file check: `dist/contribution-intents` and `dist/gateway/contribution-intents` are absent.
- `npm run verify:api`: passed.
- Required dist smoke: `npm run build && PORT=58206 HOST=127.0.0.1 npm run start:dist`; `npm run smoke -- --base-url=http://127.0.0.1:58206` passed for 19 routes.

## Caveat

The privacy notice uses the interim contact route `M:engineering-team/engineering-lead` because no dedicated approved public privacy contact route exists yet. This remains a placeholder requiring legal sign-off before treating it as final.

## Brain Accounting

Used source ids: `text:22645`, `text:22643`, `text:22641`, `memory:803`, `memory:802`, `memory:801`, `memory:267`, `memory:799`, `memory:798`, `memory:793`, `memory:642`, `memory:54`, `memory:45`, `memory:14`, `memory:82`.

Used instruction ids: `memory:45`, `memory:14`, `memory:82`, `memory:270`, `memory:296`, `memory:329`.
