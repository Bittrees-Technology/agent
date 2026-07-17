import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ROUTE_DEFINITIONS } from '../src/portal.mjs';

const contract = readFileSync(
  new URL('../docs/agent-onboarding-interface-contracts.md', import.meta.url),
  'utf8',
);

const WORKFLOW_WRITE_ROUTES = new Set([
  '/v1/workflow/registrations',
  '/v1/workflow/claims',
  '/v1/workflow/submissions',
  '/v1/workflow/reviews',
  '/v1/workflow/feedback',
]);

function documentedWorkflowRoute(path) {
  if (path === '/v1/workflow/context') {
    return 'GET /v1/workflow/context?opportunityId=<id>&lane=<lane>';
  }

  if (path === '/v1/workflow/status') {
    return 'GET /v1/workflow/status?id=<id>&kind=<kind>';
  }

  return `${WORKFLOW_WRITE_ROUTES.has(path) ? 'POST' : 'GET'} ${path}`;
}

test('onboarding interface contract documents every canonical workflow API route', () => {
  const canonicalSection = contract.match(
    /## Canonical Workflow HTTP Routes\n\n([\s\S]*?)\n## Internal-Only Fields/,
  )?.[1];

  assert.ok(canonicalSection, 'expected the canonical workflow routes section');

  const workflowRoutes = ROUTE_DEFINITIONS
    .map(({ path }) => path)
    .filter((path) => path.startsWith('/v1/workflow/'));

  assert.deepEqual(workflowRoutes, [
    '/v1/workflow/opportunities',
    '/v1/workflow/opportunities/:opportunityId',
    '/v1/workflow/context',
    '/v1/workflow/brief/:opportunityId',
    '/v1/workflow/registrations',
    '/v1/workflow/claims',
    '/v1/workflow/submissions',
    '/v1/workflow/reviews',
    '/v1/workflow/feedback',
    '/v1/workflow/status',
  ]);

  for (const path of workflowRoutes) {
    const route = documentedWorkflowRoute(path);
    assert.ok(
      canonicalSection.includes(`- \`${route}\``),
      `expected canonical documentation for ${route}`,
    );
  }
});
