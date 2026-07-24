import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);

function readRepositoryFile(path) {
  return readFileSync(fileURLToPath(new URL(path, root)), 'utf8');
}

test('production release control workflow is manual, production-scoped, and uses the guarded alias helper', () => {
  const workflow = readRepositoryFile('.github/workflows/production-release-control.yml');

  for (const expected of [
    'workflow_dispatch:',
    'publish',
    'rollback',
    'environment: production',
    'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
    'node scripts/production-alias-control.mjs',
    '--confirm-alias=${PRODUCTION_ALIAS}',
    'npm run health -- --base-url=https://${PRODUCTION_ALIAS}',
    'npm run smoke -- --base-url=https://${PRODUCTION_ALIAS}',
    'production-release-control-${{ github.run_id }}',
  ]) {
    assert.match(workflow, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
