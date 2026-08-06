import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);

function readRepositoryFile(path) {
  return readFileSync(fileURLToPath(new URL(path, root)), 'utf8');
}

test('clean-machine workflow validates the documented onboarding and CI commands', () => {
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

test('README keeps the onboarding setup commands stable', () => {
  const readme = readRepositoryFile('README.md');

  assert.match(readme, /npm install/);
  assert.match(readme, /npm run build/);
});

test('README front section stays visitor-first and points at approved trust links', () => {
  const readme = readRepositoryFile('README.md');
  const frontSection = readme.split('## What is included')[0];

  assert.match(frontSection, /Release status: the public artifact is a dated IDACC release snapshot\./);
  assert.match(frontSection, /Primary CTA: open `\/contribution-intents`/);
  assert.match(frontSection, /Trust links: `\/sources\.json`/);
  assert.match(frontSection, /Created by Bittrees\./);
});

test('README independence gate keeps the local first-value path standalone', () => {
  const readme = readRepositoryFile('README.md');

  assert.match(readme, /## Independence gate/);
  assert.match(readme, /The standalone first-value path is `npm install`, `npm run check`, `npm test`, `npm run build`, and `npm start`\./);
  assert.match(readme, /No sibling repository, Bittrees shared control plane, or external release pipeline is required for the local first-value path\./);
  assert.match(readme, /Release approval stays product-owned\./);
  assert.match(readme, /Support escalation stays product-owned\./);
  assert.match(readme, /Sepolia is currently documented by ethereum\.org as a maintained public Ethereum testnet/);
  assert.match(readme, /does not imply production launch, mainnet support, or a required runtime dependency\./);
});
