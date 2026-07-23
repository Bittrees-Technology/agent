import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isDurableContributionWritesEnabled,
  isPublicIndexingEnabled,
  resolveFeatureGates,
  robotsTagFor,
  robotsTxtBodyFor,
} from '../src/feature-gates.mjs';

test('both gates are default-off with an empty environment', () => {
  const env = {};
  assert.equal(isPublicIndexingEnabled(env), false);
  assert.equal(isDurableContributionWritesEnabled(env), false);
  const gates = resolveFeatureGates(env);
  assert.equal(gates.publicIndexing.enabled, false);
  assert.equal(gates.publicIndexing.default, false);
  assert.equal(gates.durableContributionWrites.enabled, false);
  assert.equal(gates.durableContributionWrites.default, false);
});

test('public indexing gate is fail-closed to noindex until enabled', () => {
  assert.equal(robotsTagFor({}), 'noindex, nofollow');
  assert.equal(robotsTxtBodyFor({}), 'User-agent: *\nDisallow: /\n');
  const enabled = { PUBLIC_INDEXING_ENABLED: 'true' };
  assert.equal(isPublicIndexingEnabled(enabled), true);
  assert.equal(robotsTagFor(enabled), 'index, follow');
  assert.equal(robotsTxtBodyFor(enabled), 'User-agent: *\nAllow: /\n');
});

test('durable writes gate honors every historical alias', () => {
  assert.equal(isDurableContributionWritesEnabled({ CONTRIBUTION_INTENTS_WRITE_ENABLED: '1' }), true);
  assert.equal(isDurableContributionWritesEnabled({ CONTRIBUTION_INTENTS_ENABLED: 'yes' }), true);
  assert.equal(isDurableContributionWritesEnabled({ PORTAL_ENABLE_CONTRIBUTION_INTENTS: 'on' }), true);
  assert.equal(isDurableContributionWritesEnabled({ CONTRIBUTION_INTENTS_WRITE_ENABLED: 'false' }), false);
});
