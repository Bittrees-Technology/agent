import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  RELEASE_METADATA_SCHEMA,
  SMOKE_ROUTES,
  healthContractFailures,
  securityHeaderFailures,
} from '../scripts/smoke-policy.mjs';

const HEALTHY_BODY = {
  route: '/api/health',
  status: 'ok',
  health: { overall: 'ok', checks: [{ id: 'release-metadata', status: 'ok' }] },
  observability: { requestIdHeader: 'X-Request-Id' },
  releaseMetadata: { schemaVersion: RELEASE_METADATA_SCHEMA, version: '0.1.0', tag: null, commitSha: 'abc123' },
};

test('the canonical smoke route list covers the health route', () => {
  const paths = SMOKE_ROUTES.map((route) => route.path);
  assert.ok(paths.includes('/api/health'));
  assert.ok(paths.includes('/monitoring.json'));
  assert.ok(SMOKE_ROUTES.length > 20);
});

test('healthContractFailures accepts a well-formed health body', () => {
  assert.deepEqual(healthContractFailures(HEALTHY_BODY), []);
});

test('healthContractFailures flags a missing release-metadata schema', () => {
  const failures = healthContractFailures({ ...HEALTHY_BODY, releaseMetadata: { schemaVersion: 'wrong' } });
  assert.ok(failures.some((message) => message.includes('deployed release metadata')));
});

test('healthContractFailures honors pinned expectations', () => {
  const failures = healthContractFailures(HEALTHY_BODY, 'primary', { expectedReleaseCommit: 'deadbeef' });
  assert.ok(failures.some((message) => message.includes('release commit')));
});

test('securityHeaderFailures requires the restrictive header set', () => {
  const goodHeaders = new Map([
    ['content-security-policy', "default-src 'none'; frame-ancestors 'none'"],
    ['x-frame-options', 'DENY'],
    ['referrer-policy', 'no-referrer'],
  ]);
  assert.deepEqual(securityHeaderFailures({ get: (name) => goodHeaders.get(name) }, '/'), []);
  const failures = securityHeaderFailures({ get: () => '' }, '/');
  assert.ok(failures.length >= 3);
});
