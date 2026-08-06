import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const draft = readFileSync(
  new URL('../docs/agent-independence-product-draft.md', import.meta.url),
  'utf8',
);

test('agent independence product draft states the required independence gates', () => {
  assert.match(draft, /Status: draft only/);
  assert.match(draft, /## User Value/);
  assert.match(draft, /## In Scope/);
  assert.match(draft, /## Out of Scope/);
  assert.match(draft, /## Onboarding and First Value/);
  assert.match(draft, /## Release Status/);
  assert.match(draft, /## Product-Owned Trust and Support Placeholders/);
  assert.match(draft, /## Standalone Entry and Runtime/);
  assert.match(draft, /## No Sibling or Bittrees Dependency/);
  assert.match(draft, /## Optional-Only Integration Boundaries/);
  assert.match(draft, /npm start/);
  assert.match(draft, /npm run start:dist/);
  assert.match(draft, /\/llms\.txt/);
  assert.match(draft, /must not be treated as runtime prerequisites/);
});
