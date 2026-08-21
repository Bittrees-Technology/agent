import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LAUNCH_READINESS_SCHEMA, buildLaunchReadiness } from '../src/launch-readiness.mjs';

test('default posture is no-go with named legal, security, and ops decisions', () => {
  const readiness = buildLaunchReadiness({ env: {}, now: new Date('2026-07-23T00:00:00Z') });
  assert.equal(readiness.schema, LAUNCH_READINESS_SCHEMA);
  assert.equal(readiness.overallStatus, 'no-go');
  assert.equal(readiness.generatedAt, '2026-07-23T00:00:00.000Z');

  const domains = new Set(readiness.decisions.map((decision) => decision.domain));
  assert.ok(domains.has('legal'));
  assert.ok(domains.has('security'));
  assert.ok(domains.has('ops'));

  for (const decision of readiness.decisions) {
    assert.ok(decision.id, 'decision has an id');
    assert.ok(decision.owner, 'decision names an owner');
    assert.ok(decision.gate, 'decision names its gate');
  }

  assert.ok(readiness.blockers.length > 0);
  assert.ok(readiness.blockers.some((blocker) => blocker.id === 'ops-durable-shared-storage'));
  assert.equal(readiness.summary.total, readiness.decisions.length);
});

test('gate decisions flip to accepted when the underlying gate is enabled', () => {
  const readiness = buildLaunchReadiness({
    env: { PUBLIC_INDEXING_ENABLED: '1', CONTRIBUTION_INTENTS_WRITE_ENABLED: '1' },
  });
  const indexing = readiness.decisions.find((decision) => decision.id === 'ops-public-indexing-default-off');
  const writes = readiness.decisions.find((decision) => decision.id === 'security-durable-writes-default-off');
  assert.equal(indexing.status, 'accepted');
  assert.equal(writes.status, 'accepted');
  assert.equal(readiness.featureGates.publicIndexing.enabled, true);
});
