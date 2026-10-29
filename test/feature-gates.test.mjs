import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isDurableContributionWritesEnabled,
  isPublicIndexingEnabled,
  resolveFeatureGates,
  robotsTagFor,
  robotsTxtBodyFor,
  INDEXABLE_HUB_PATHS,
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
  assert.match(robotsTxtBodyFor(enabled), /Sitemap: https:\/\/agent.bittrees.org\/sitemap.xml/);
  assert.match(robotsTxtBodyFor(enabled), /Disallow: \/api\//);
  for (const path of INDEXABLE_HUB_PATHS) assert.equal(robotsTagFor(enabled, path), 'index, follow');
  for (const path of ['/tools.json', '/tools/private', '/administration', '/api/health', '/mcp', '/projects', '/privacy', null]) {
    assert.equal(robotsTagFor(enabled, path), 'noindex, nofollow');
  }
  assert.equal(robotsTagFor({ ...enabled, VERCEL_ENV: 'preview' }), 'noindex, nofollow');
  assert.equal(robotsTxtBodyFor({ ...enabled, VERCEL_ENV: 'preview' }), 'User-agent: *\nDisallow: /\n');
});

test('durable writes gate honors every historical alias', () => {
  assert.equal(isDurableContributionWritesEnabled({ CONTRIBUTION_INTENTS_WRITE_ENABLED: '1' }), true);
  assert.equal(isDurableContributionWritesEnabled({ CONTRIBUTION_INTENTS_ENABLED: 'yes' }), true);
  assert.equal(isDurableContributionWritesEnabled({ PORTAL_ENABLE_CONTRIBUTION_INTENTS: 'on' }), true);
  assert.equal(isDurableContributionWritesEnabled({ CONTRIBUTION_INTENTS_WRITE_ENABLED: 'false' }), false);
});
