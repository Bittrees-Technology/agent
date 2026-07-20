import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);

function readRepositoryFile(path) {
  return readFileSync(fileURLToPath(new URL(path, root)), 'utf8');
}

test('clean-machine workflow validates every supported platform with the documented commands', () => {
  const workflow = readRepositoryFile('.github/workflows/clean-machine.yml');
  const packageJson = JSON.parse(readRepositoryFile('package.json'));

  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /push:\r?\n\s+branches: \[main\]/);
  assert.match(workflow, /node:\s*\[20\]/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run check/);
  assert.match(workflow, /run: npm run test:onboarding/);
  assert.match(workflow, /if: matrix\.os != 'windows-latest'/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build/);
  assert.equal(packageJson.engines.node, '>=20.0.0');
  assert.equal(packageJson.scripts.test, 'node scripts/run-tests.mjs');
  assert.equal(packageJson.scripts['test:onboarding'], 'node --test test/onboarding-ci-docs.test.mjs');
});

test('contributor onboarding is linked from the README and documents reproducible recovery', () => {
  const readme = readRepositoryFile('README.md');
  const guide = readRepositoryFile('docs/contributor-onboarding.md');

  assert.match(readme, /docs\/contributor-onboarding\.md/);
  assert.match(guide, /npm ci/);
  assert.match(guide, /Ubuntu, macOS, and Windows/);
  assert.match(guide, /Node\.js 20/);
  assert.match(guide, /Updating an existing checkout/);
  assert.match(guide, /Troubleshooting/);
  assert.match(guide, /agent-onboarding-interface-contracts\.md/);
  assert.match(guide, /does not authorize production deployment/i);
});

test('capability catalog avoids unresolved generated copy defects', () => {
  const catalogText = readRepositoryFile('data/agent-onboarding/capability-descriptions.json');
  const catalog = JSON.parse(catalogText);

  assert.doesNotMatch(catalogText, /version undefined/);
  assert.doesNotMatch(catalogText, /1 demand signals/);
  assert.equal(catalog.capabilities.length, catalog.counts.total);
});

test('interface contract documents every mounted workflow mutation and bounds registry control-plane routes', () => {
  const contract = readRepositoryFile('docs/agent-onboarding-interface-contracts.md');

  for (const route of [
    'POST /v1/workflow/registrations',
    'POST /v1/workflow/claims',
    'POST /v1/workflow/submissions',
    'POST /v1/workflow/reviews',
    'POST /v1/workflow/feedback',
    'GET /v1/workflow/status?id=<id>&kind=<kind>',
  ]) {
    assert.match(contract, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(contract, /Mounted control-plane routes that are deliberately not part of the public\s+onboarding workflow:/);
  assert.match(contract, /GET `?\/v1\/registry\/agents\/:agentId`? returns only the same public-safe staged/);
  assert.match(contract, /PUT `?\/v1\/registry\/agents\/:agentId`? accepts a signed, versioned registry/);
  assert.match(contract, /POST `?\/v1\/registry\/heartbeats`? accepts a signed heartbeat envelope/);
  assert.doesNotMatch(contract, /registry write APIs still exist only in code/);
});
