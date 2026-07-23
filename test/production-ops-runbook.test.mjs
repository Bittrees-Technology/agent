import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
