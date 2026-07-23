// One production rollout command.
//
//   node scripts/rollout.mjs --action=publish --target=<deployment-url> [--confirm]
//   node scripts/rollout.mjs --action=rollback [--target=<ready-prod-url>] [--confirm]
//
// Consolidates the previously inline release-control steps into a single
// operator/CI entry point:
//
//   1. plan            — production-alias-control.mjs (dry-run) selects+validates the target
//   2. preview smoke   — rollout-check.mjs (health + full smoke) against the target
//   3. promote         — production-alias-control.mjs --apply moves the alias   (only with --confirm)
//   4. post-verify     — rollout-check.mjs --health-only + smoke against the live alias
//   5. rollback verify — select-rollback-target.mjs records a ready fallback
//   6. manifest        — write-release-manifest.mjs writes the immutable evidence manifest
//
// FAIL-CLOSED: without --confirm the alias is never moved. A dry-run still runs
// the plan + preview smoke and reports what would happen, so operators can
// verify safely. Steps 3-6 require --confirm and Vercel credentials.

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_ALIAS = 'agent.bittrees.org';
const OUTPUT_DIR = join(rootDir, 'output', 'production-release-control');

function readArg(name, fallback = '') {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const action = readArg('--action').trim();
const target = readArg('--target').trim();
const expectedCommit = readArg('--expected-commit').trim();
const alias = readArg('--alias', DEFAULT_ALIAS).trim();
const allowDirty = process.argv.includes('--allow-dirty-target');
const confirm = process.argv.includes('--confirm');

if (process.argv.includes('--help') || !['publish', 'rollback'].includes(action)) {
  console.log('Usage: node scripts/rollout.mjs --action=publish|rollback [--target=<url>] [--expected-commit=<sha>] [--allow-dirty-target] [--confirm]');
  console.log('Without --confirm the alias is not moved (dry-run plan + preview smoke only).');
  process.exit(action ? 1 : 0);
}

if (action === 'publish' && !target && confirm) {
  console.error('publish requires --target=<deployment-url>.');
  process.exit(1);
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: rootDir, env: process.env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolvePromise() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`))));
  });
}

function aliasControlArgs(extra = []) {
  const args = ['scripts/production-alias-control.mjs', `--action=${action}`];
  if (target) args.push(`--target=${target}`);
  if (expectedCommit) args.push(`--expected-commit=${expectedCommit}`);
  if (allowDirty) args.push('--allow-dirty-target');
  return [...args, ...extra];
}

function rolloutCheckArgs(baseUrl, extra = []) {
  const args = ['scripts/rollout-check.mjs', `--base-url=${baseUrl}`];
  if (expectedCommit) args.push(`--expected-release-commit=${expectedCommit}`);
  return [...args, ...extra];
}

await mkdir(OUTPUT_DIR, { recursive: true });
const node = process.execPath;
const planPath = join(OUTPUT_DIR, 'alias-plan.json');

// 1. Plan (dry-run) — validates target selection and writes the plan.
console.log('\n=== rollout: plan (dry-run) ===');
await run(node, aliasControlArgs([`--summary-file=${planPath}`]));

// Derive the selected target URL from the plan for preview smoke.
const { readFile } = await import('node:fs/promises');
let selectedUrl = target;
try {
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  selectedUrl = plan?.selected?.url ?? target;
} catch {
  // plan may be unavailable in a pure offline dry-run; fall back to --target.
}

// 2. Preview smoke against the target (if we know its URL).
if (selectedUrl) {
  console.log('\n=== rollout: preview smoke ===');
  await run(node, rolloutCheckArgs(selectedUrl, [`--summary-file=${join(OUTPUT_DIR, 'pre-release-rollout.json')}`]));
} else {
  console.log('\n=== rollout: preview smoke skipped (no target URL resolved) ===');
}

if (!confirm) {
  console.log('\nrollout DRY-RUN complete — alias NOT moved. Re-run with --confirm to promote.');
  process.exit(0);
}

// 3. Promote — move the production alias.
console.log('\n=== rollout: promote ===');
await run(node, aliasControlArgs(['--apply', `--confirm-alias=${alias}`, `--summary-file=${join(OUTPUT_DIR, 'alias-result.json')}`]));

// 4. Post-promote verification against the live alias.
console.log('\n=== rollout: post-promote verify ===');
await run(node, rolloutCheckArgs(`https://${alias}`, ['--health-only', `--summary-file=${join(OUTPUT_DIR, 'post-release-health.json')}`]));
await run(node, ['scripts/smoke-check.mjs', `--base-url=https://${alias}`, ...(expectedCommit ? [`--expected-release-commit=${expectedCommit}`] : [])]);

// 5. Rollback verification — record a ready fallback target.
console.log('\n=== rollout: rollback target ===');
await run(node, ['scripts/select-rollback-target.mjs', `--exclude-url=https://${alias}`]).catch((error) => {
  console.warn(`rollback target selection warning: ${error.message}`);
});

// 6. Immutable release manifest.
console.log('\n=== rollout: manifest ===');
await run(node, [
  'scripts/write-release-manifest.mjs',
  `--output=${join(OUTPUT_DIR, 'release-manifest.json')}`,
  `--action=${action}`,
  `--alias=${alias}`,
  `--plan=${planPath}`,
  `--preview=${join(OUTPUT_DIR, 'pre-release-rollout.json')}`,
  `--result=${join(OUTPUT_DIR, 'alias-result.json')}`,
  `--post=${join(OUTPUT_DIR, 'post-release-health.json')}`,
  ...(expectedCommit ? [`--expected-commit=${expectedCommit}`] : []),
]);

console.log(`\nrollout ${action} complete — evidence in output/production-release-control/`);
