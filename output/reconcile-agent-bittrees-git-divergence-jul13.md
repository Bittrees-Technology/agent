# Git reconciliation evidence

Date: 2026-07-13
Repository: `git@github.com:Bittrees-Technology/agent.git`

## Reconciliation

- Before reconciliation, local `main` was `a9935d5` and `origin/main` was `f430bc7`; the branches were ahead 13 / behind 11 from merge-base `bc4c965`.
- `git log --cherry-mark main...origin/main` showed 10 patch-identical commit pairs. The local-only commits were the workflow-content, ToU, and agent-readable-route changes; the remote-only commit was release-route coverage.
- Safety refs were created before rewriting: `reconcile-backup-20260713-main` and `reconcile-pre-20260713` both point to `a9935d5`.
- Local `main` was rebased with `git rebase --onto origin/main 271365d main`. The three genuinely local commits were replayed and the overlapping route changes were resolved by retaining `/onboarding`, `/tou`, the sanitized public registry feed, and the existing signed registry control-plane routes.

## Verification

Commands run from the repository root:

```text
npm run check     PASS
npm test          PASS (120 tests, 0 failures)
npm run build     PASS (23 static assets)
npm run verify:api PASS (all api/index.js handler checks)
git diff --check  PASS
```

Before push, `origin/main` was an ancestor of local `main`; no force-push was required. Existing untracked output, package-lock, and test-results artifacts were preserved and were not included in the reconciliation.
