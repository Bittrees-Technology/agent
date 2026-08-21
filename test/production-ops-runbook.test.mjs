import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildVercelCurlArgs } from '../scripts/request-url.mjs';

const root = new URL('..', import.meta.url);

function readRepositoryFile(path) {
  return readFileSync(fileURLToPath(new URL(path, root)), 'utf8');
}

test('production operations runbook covers staging, rollback, backup, and alert procedures', () => {
  const runbook = readRepositoryFile('docs/production-operations-runbook.md');

  for (const expected of [
    'agent.bittrees.org',
    'agent-staging.bittrees.org',
    'agent-staging-rollback.bittrees.org',
    '.github/workflows/production-observability.yml',
    '.github/workflows/clean-machine.yml',
    '*.bittrees.org ALIAS',
    'npm run rollout:rollback-target',
    'npm run backup:production',
    '--expected-release-commit=0000000000000000000000000000000000000000',
    'meta.gitDirty: "1"',
    'SEV-1',
    'SEV-2',
    'SEV-3',
    'env -u VERCEL_TOKEN',
  ]) {
    assert.match(runbook, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(runbook, /First-response checklist:/);
  assert.match(runbook, /Evidence and reference anchors/);
  assert.match(runbook, /production-observability-backups\.md/);
});

test('production observability alert bodies remain valid YAML block content', () => {
  const workflow = readRepositoryFile('.github/workflows/production-observability.yml');

  assert.doesNotMatch(workflow, /^Production (?:monitoring|backup) failed/m);
  assert.doesNotMatch(workflow, /^EOF$/m);
  assert.equal((workflow.match(/printf '%s\\n'/g) ?? []).length, 2);
});

test('protected Vercel checks confirm linking without forwarding the flag to curl', () => {
  const args = buildVercelCurlArgs({
    requestPath: '/api/health',
    deploymentTarget: 'https://preview.example.vercel.app',
    method: 'GET',
    headerPath: '/tmp/headers',
    bodyPath: '/tmp/body',
    headers: { Accept: 'application/json' },
  });
  const separator = args.indexOf('--');

  assert.ok(separator > 0);
  assert.ok(args.indexOf('--yes') > 0);
  assert.ok(args.indexOf('--yes') < separator);
  assert.deepEqual(args.slice(0, separator), [
    'curl',
    '/api/health',
    '--deployment',
    'https://preview.example.vercel.app',
    '--yes',
  ]);
  assert.deepEqual(args.slice(-2), ['--header', 'Accept: application/json']);
});
