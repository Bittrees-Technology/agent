# Contributor onboarding and clean-machine setup

This guide is the repository entry point for contributors working on the `agent.bittrees.org` portal. It is deliberately limited to local development and review: it does not authorize production deployment, credentials, live writes, or public-claim expansion.

## Supported clean-machine baseline

The checked-in clean-machine preflight runs on current Ubuntu, macOS, and Windows GitHub-hosted runners with Node.js 20. Use Node.js 20 or later locally; the repository declares the same minimum in `package.json`.

Install Node.js from the [official Node.js downloads page](https://nodejs.org/en/download), then verify both tools before cloning:

```sh
node --version
npm --version
```

On macOS/Linux, a version manager such as `nvm` or `fnm` is convenient. On Windows, use the official installer or a Windows-compatible version manager. Do not mix Node installations in the same shell session: open a new terminal after changing versions and rerun the two checks above.

## First checkout

```sh
git clone <approved-repository-url>
cd agent
npm ci
npm run check
npm run test:onboarding
npm test
npm run build
```

`npm ci` is intentional: it installs exactly from `package-lock.json` and is the clean-machine command used by CI. Do not replace it with `npm install` during normal onboarding, because that can rewrite the lockfile and hide a reproducibility problem.

The expected result is that all commands exit with status `0`, and the build reports that it wrote `dist/`. `dist/` is generated output and is not committed.

## Daily contributor workflow

1. Start with the portal's public workflow surfaces: `/llms.txt`, `/agents.json`, `/onboarding.json`, and `/opportunities.json`.
2. Read the source-aware and launch-gate rules in the repository `README.md` before editing a claim, route, or contributor flow.
3. Create a focused change, then run `npm run check`, `npm run test:onboarding`, `npm test`, and `npm run build` before requesting review.
4. For route changes, run the local server and exercise only the relevant documented route. Keep write-like routes review-gated; a passing local test is not production approval.
5. Include the commands and results in the review packet. Optional improvements belong in the backlog rather than being folded into an unrelated change.

The canonical workflow contract is described in [agent onboarding interface contracts](agent-onboarding-interface-contracts.md). It covers discovery, registration, opportunity selection, submission, and status tracking. This setup guide covers repository access and local verification only.

## Run locally

```sh
npm start
```

The default URL is `http://0.0.0.0:3000`. To use a different port:

| Shell | Command |
| --- | --- |
| macOS/Linux shell | `PORT=4000 npm start` |
| PowerShell | `$env:PORT=4000; npm start` |
| Windows Command Prompt | `set PORT=4000 && npm start` |

Use `npm run dev` for automatic restart while editing. Use `npm run start:dist` after `npm run build` to serve the generated static copy.

## Updating an existing checkout

Before pulling changes, preserve or commit your own work. Then use the fast-forward-only update and reinstall from the lockfile:

```sh
git status
git pull --ff-only
npm ci
npm run check
npm test
npm run build
```

If `git pull --ff-only` stops because the history diverged, do not force-reset the checkout. Resolve the branch situation with the change owner before continuing. If `npm ci` reports that the lockfile is out of sync, inspect the pending package changes and update the lockfile only as part of the intended dependency change.

## Troubleshooting

### Node or npm is not the expected version

Run `node --version` and `npm --version` in the same terminal that will run the project. Select Node.js 20 or later, reopen the terminal, and run `npm ci` again. CI uses Node 20, so reproduce failures there first.

### `npm ci` fails

First check `git status`. A clean checkout with the committed `package-lock.json` should install without modifying project files. For registry or proxy errors, confirm the network configuration required by your organization; do not add credentials or tokens to the repository. For a lockfile mismatch, coordinate the intended dependency update instead of running an unreviewed install.

### Windows reports `EPERM` or a file is locked

Stop local Node processes, editors, and terminals that may hold files in `node_modules`, then reopen a terminal and rerun `npm ci`. If antivirus software quarantines a package, use the organization-approved developer environment rather than disabling security controls.

### Port 3000 is already in use

Use one of the cross-platform port commands in [Run locally](#run-locally), or stop the local process that owns the port. Do not expose a local development server beyond the intended machine/network scope.

### A check or test fails

Run the smallest relevant command first:

```sh
npm run test:onboarding
npm run check
npm test
```

Record the command, Node version, operating system, and complete failure output in the review packet. Do not suppress, skip, or weaken a test just to make a preflight pass.

## CI contract

`.github/workflows/clean-machine.yml` is the checked-in GitHub Actions preflight. Every pull request and push to `main` installs with `npm ci` on Ubuntu, macOS, and Windows using Node 20, then runs syntax validation, the focused onboarding contract test, the full test suite, and the static build. It has read-only repository permissions and performs no deploy or credentialed operation.
