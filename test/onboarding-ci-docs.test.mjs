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
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /node:\s*\[20\]/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run check/);
  assert.match(workflow, /run: npm run test:onboarding/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build/);
  assert.equal(packageJson.engines.node, '>=20.0.0');
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
