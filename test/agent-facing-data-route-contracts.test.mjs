import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';

import { createRequestHandler, OPPORTUNITIES } from '../src/portal.mjs';
import {
  ContributorPortalWorkflow,
  InMemoryPortalWorkflowStore,
} from '../src/contributor-signing/portal-workflow.mjs';

const fixture = JSON.parse(readFileSync(
  new URL('./fixtures/agent-facing-data-routes.v1.json', import.meta.url),
  'utf8',
));

const FIXED_NOW = Date.parse('2026-07-17T00:00:00.000Z');

function newWorkflow() {
  return new ContributorPortalWorkflow({
    opportunities: OPPORTUNITIES,
    store: new InMemoryPortalWorkflowStore({ opportunities: OPPORTUNITIES }),
    clock: () => FIXED_NOW,
  });
}

async function withServer(callback) {
  const server = createServer(createRequestHandler({ workflow: newWorkflow() }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    return await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function jsonRequest(baseUrl, path, {
  method = 'GET',
  token,
  body,
  rawBody,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...((body !== undefined || rawBody !== undefined) ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...((body !== undefined || rawBody !== undefined)
      ? { body: rawBody ?? JSON.stringify(body) }
      : {}),
  });
  return { response, body: await response.json() };
}

function assertHasKeys(value, keys, label) {
  assert.equal(value !== null && typeof value === 'object' && !Array.isArray(value), true, `${label} must be an object`);
  for (const key of keys) {
    assert.equal(Object.hasOwn(value, key), true, `${label} must include ${key}`);
  }
}

function assertFailClosedReviewGate(reviewGate, label) {
  assertHasKeys(reviewGate, [
    'productionMutationAllowed',
    'contributorCapabilityGranted',
    'walletAuthorityGranted',
    'transactionSubmissionAllowed',
    'registryMutationAllowed',
  ], label);
  assert.equal(reviewGate.productionMutationAllowed, false);
  assert.equal(reviewGate.contributorCapabilityGranted, false);
  assert.equal(reviewGate.walletAuthorityGranted, false);
  assert.equal(reviewGate.transactionSubmissionAllowed, false);
  assert.equal(reviewGate.registryMutationAllowed, false);
}

function pathFor(template, opportunityId) {
  return template.replace(':opportunityId', encodeURIComponent(opportunityId));
}

test('fixture records the completed design, OpenAPI, and schema sources used by this route slice', () => {
  assert.equal(fixture.schema, 'agent.bittrees.agent-facing-data-route-contract-fixture.v1');
  assert.deepEqual(Object.keys(fixture.sources).sort(), [
    'design',
    'errorSchema',
    'identityResponseSchema',
    'openapi',
    'registrationRequestSchema',
    'registrationResponseSchema',
    'workflowDesign',
  ]);
  assert.equal(fixture.routes.requirement, '/v1/workflow/opportunities/:opportunityId');
  assert.equal(fixture.routes.registration, '/v1/workflow/registrations');
});

test('opportunity discovery returns the success contract and a graceful empty match', async () => {
  await withServer(async (baseUrl) => {
    const listed = await jsonRequest(
      baseUrl,
      `${fixture.routes.discovery}?lane=${encodeURIComponent(fixture.opportunity.lane)}&priority=${encodeURIComponent(fixture.opportunity.priority)}`,
    );

    assert.equal(listed.response.status, 200);
    assert.equal(listed.body.$schema, fixture.schemaUrl);
    assert.equal(listed.body.status, fixture.successStatus.discovery);
    assert.deepEqual(listed.body.filters, {
      lane: fixture.opportunity.lane,
      priority: fixture.opportunity.priority,
      status: null,
    });
    assert.equal(Array.isArray(listed.body.opportunities), true);
    assert.equal(listed.body.opportunities.length >= 1, true);
    for (const opportunity of listed.body.opportunities) {
      assertHasKeys(opportunity, fixture.opportunity.requiredKeys, 'opportunity');
    }
    assert.equal(listed.body.opportunities.some(({ id }) => id === fixture.opportunity.id), true);
    assert.equal(Array.isArray(listed.body.workflow) && listed.body.workflow.length > 0, true);
    assert.equal(Array.isArray(listed.body.roleApplicationLinks) && listed.body.roleApplicationLinks.length > 0, true);
    assertFailClosedReviewGate(listed.body.reviewGate, 'discovery reviewGate');

    const empty = await jsonRequest(
      baseUrl,
      `${fixture.routes.discovery}?lane=${encodeURIComponent(fixture.opportunity.emptyFilter.lane)}`,
    );
    assert.equal(empty.response.status, 200);
    assert.equal(empty.body.status, fixture.successStatus.discovery);
    assert.deepEqual(empty.body.opportunities, []);
    assert.deepEqual(empty.body.filters, {
      lane: fixture.opportunity.emptyFilter.lane,
      priority: null,
      status: null,
    });
  });
});

test('requirement inspection exposes both projections and rejects unknown opportunities', async () => {
  await withServer(async (baseUrl) => {
    const requirement = await jsonRequest(
      baseUrl,
      pathFor(fixture.routes.requirement, fixture.opportunity.id),
    );
    assert.equal(requirement.response.status, 200);
    assert.equal(requirement.body.$schema, fixture.schemaUrl);
    assert.equal(requirement.body.status, fixture.successStatus.requirement);
    assertHasKeys(requirement.body.opportunity, fixture.opportunity.requiredKeys, 'requirement opportunity');
    assert.equal(requirement.body.opportunity.id, fixture.opportunity.id);
    assert.equal(requirement.body.mcpTool, 'get_contribution_brief');
    assert.equal(requirement.body.mcpResult.status, 'brief-ready');
    assert.equal(Array.isArray(requirement.body.authorizedSubmissionRoutes), true);
    assertFailClosedReviewGate(requirement.body.reviewGate, 'requirement reviewGate');

    const brief = await jsonRequest(
      baseUrl,
      pathFor(fixture.routes.brief, fixture.opportunity.id),
    );
    assert.equal(brief.response.status, 200);
    assert.equal(brief.body.status, fixture.successStatus.brief);
    assert.equal(brief.body.brief.opportunity.id, fixture.opportunity.id);
    assert.deepEqual(
      brief.body.brief.acceptanceCriteria,
      brief.body.brief.opportunity.acceptanceCriteria,
    );
    assert.equal(brief.body.brief.context.status, fixture.successStatus.context);
    assertFailClosedReviewGate(brief.body.brief.reviewGate, 'brief reviewGate');

    for (const route of [fixture.routes.requirement, fixture.routes.brief]) {
      const unknown = await jsonRequest(
        baseUrl,
        pathFor(route, fixture.opportunity.unknownId),
      );
      assert.equal(unknown.response.status, fixture.errors.unknownOpportunity.statusCode);
      assert.equal(unknown.body.$schema, fixture.schemaUrl);
      assert.equal(unknown.body.error, fixture.errors.unknownOpportunity.error);
      assert.match(unknown.body.message, /opportunity/i);

      const malformed = await jsonRequest(
        baseUrl,
        route.replace(':opportunityId', fixture.opportunity.malformedId),
      );
      assert.equal(malformed.response.status, fixture.errors.malformedOpportunity.statusCode);
      assert.equal(malformed.body.$schema, fixture.schemaUrl);
      assert.equal(malformed.body.error, fixture.errors.malformedOpportunity.error);
    }
  });
});

test('identity and workflow context resolution are public-safe and fail closed for unknown context', async () => {
  await withServer(async (baseUrl) => {
    const identity = await jsonRequest(baseUrl, fixture.routes.identity);
    assert.equal(identity.response.status, 200);
    assert.equal(identity.body.$schema, fixture.schemaUrl);
    assert.equal(identity.body.route, fixture.routes.identity);
    assert.equal(identity.body.status, fixture.successStatus.identity);
    assertHasKeys(identity.body.data, [
      'status',
      'launchStatus',
      'registryManagement',
      'identityKeys',
    ], 'identity contract data');
    assertHasKeys(identity.body.data.identityKeys, [
      'status',
      'purpose',
      'publicationPolicy',
      'sections',
      'proofStates',
      'onchainExecutionReadiness',
      'rolloutGates',
      'redactionPolicy',
    ], 'identityKeys');
    assert.doesNotMatch(
      JSON.stringify(identity.body),
      /rawPrivateKey|secretKey|mnemonic|seedPhrase|bearerToken/i,
    );

    const context = await jsonRequest(
      baseUrl,
      `${fixture.routes.context}?opportunityId=${encodeURIComponent(fixture.opportunity.id)}`,
    );
    assert.equal(context.response.status, 200);
    assert.equal(context.body.$schema, fixture.schemaUrl);
    assert.equal(context.body.status, fixture.successStatus.context);
    assert.equal(context.body.opportunity.id, fixture.opportunity.id);
    assert.equal(context.body.lane, fixture.opportunity.lane);
    assert.deepEqual(context.body.workflow, ['registered', 'claimed', 'submitted', 'reviewed', 'terminal']);
    assert.deepEqual(context.body.policy, {
      noSecrets: true,
      noAuthorityGrant: true,
      noProductionMutation: true,
      noPayoutOrCompensation: true,
    });
    assertFailClosedReviewGate(context.body.reviewGate, 'context reviewGate');

    const unknown = await jsonRequest(
      baseUrl,
      `${fixture.routes.context}?opportunityId=${encodeURIComponent(fixture.opportunity.unknownId)}`,
    );
    assert.equal(unknown.response.status, fixture.errors.unknownOpportunity.statusCode);
    assert.equal(unknown.body.error, fixture.errors.unknownOpportunity.error);
  });
});

test('workflow start validates identity, JSON, authorization, and the queued success schema', async () => {
  const previousTokens = process.env.MCP_WRITE_TOKENS;
  process.env.MCP_WRITE_TOKENS = JSON.stringify(fixture.registration.tokenConfig);
  try {
    await withServer(async (baseUrl) => {
      const accepted = await jsonRequest(baseUrl, fixture.routes.registration, {
        method: 'POST',
        token: fixture.registration.token,
        body: fixture.registration.validPayload,
      });
      assert.equal(accepted.response.status, 202);
      assertHasKeys(accepted.body, fixture.registration.requiredResponseKeys, 'registration response');
      assert.equal(accepted.body.$schema, fixture.schemaUrl);
      assert.equal(accepted.body.status, fixture.successStatus.registration);
      assert.equal(accepted.body.kind, 'registration');
      assert.equal(accepted.body.registration.agentId, fixture.registration.validPayload.agentId);
      assert.equal(accepted.body.authorizedRoute, fixture.routes.registration);
      assert.equal(accepted.body.statusLookup, fixture.routes.status);
      assertFailClosedReviewGate(accepted.body.reviewGate, 'registration reviewGate');
      const serializedRegistration = JSON.stringify(accepted.body);
      assert.equal(serializedRegistration.includes(fixture.registration.token), false);
      assert.equal(serializedRegistration.includes(fixture.registration.validPayload.contact.value), false);

      const missingIdentity = await jsonRequest(baseUrl, fixture.routes.registration, {
        method: 'POST',
        body: fixture.registration.validPayload,
      });
      assert.equal(missingIdentity.response.status, fixture.errors.missingIdentity.statusCode);
      assert.equal(missingIdentity.body.error, fixture.errors.missingIdentity.error);

      const invalidIdentity = await jsonRequest(baseUrl, fixture.routes.registration, {
        method: 'POST',
        token: fixture.registration.unknownToken,
        body: fixture.registration.validPayload,
      });
      assert.equal(invalidIdentity.response.status, fixture.errors.invalidIdentity.statusCode);
      assert.equal(invalidIdentity.body.error, fixture.errors.invalidIdentity.error);

      const missingAgentIdPayload = { ...fixture.registration.validPayload };
      delete missingAgentIdPayload.agentId;
      const missingAgentId = await jsonRequest(baseUrl, fixture.routes.registration, {
        method: 'POST',
        token: fixture.registration.token,
        body: missingAgentIdPayload,
      });
      assert.equal(missingAgentId.response.status, fixture.errors.missingAgentId.statusCode);
      assert.equal(missingAgentId.body.error, fixture.errors.missingAgentId.error);
      assert.match(missingAgentId.body.message, new RegExp(fixture.errors.missingAgentId.messagePattern, 'i'));

      const invalidAgentId = await jsonRequest(baseUrl, fixture.routes.registration, {
        method: 'POST',
        token: fixture.registration.invalidIdentityToken,
        body: fixture.registration.invalidIdentityPayload,
      });
      assert.equal(invalidAgentId.response.status, fixture.errors.invalidAgentId.statusCode);
      assert.equal(invalidAgentId.body.error, fixture.errors.invalidAgentId.error);
      assert.match(invalidAgentId.body.message, new RegExp(fixture.errors.invalidAgentId.messagePattern, 'i'));

      const malformed = await jsonRequest(baseUrl, fixture.routes.registration, {
        method: 'POST',
        token: fixture.registration.token,
        rawBody: fixture.registration.malformedJson,
      });
      assert.equal(malformed.response.status, fixture.errors.malformedJson.statusCode);
      assert.equal(malformed.body.error, fixture.errors.malformedJson.error);
      assert.equal(typeof malformed.body.message, 'string');
    });
  } finally {
    if (previousTokens === undefined) delete process.env.MCP_WRITE_TOKENS;
    else process.env.MCP_WRITE_TOKENS = previousTokens;
  }
});

test('agent-facing data routes reject unsupported methods with the shared error envelope', async () => {
  await withServer(async (baseUrl) => {
    const cases = [
      ['POST', fixture.routes.discovery],
      ['POST', pathFor(fixture.routes.requirement, fixture.opportunity.id)],
      ['POST', pathFor(fixture.routes.brief, fixture.opportunity.id)],
      ['POST', fixture.routes.context],
      ['POST', fixture.routes.identity],
      ['PUT', fixture.routes.registration],
    ];

    for (const [method, path] of cases) {
      const unsupported = await jsonRequest(baseUrl, path, { method });
      assert.equal(unsupported.response.status, fixture.errors.unsupportedMethod.statusCode, `${method} ${path}`);
      assert.equal(unsupported.body.$schema, fixture.schemaUrl, `${method} ${path}`);
      assert.equal(unsupported.body.error, fixture.errors.unsupportedMethod.error, `${method} ${path}`);
      assert.deepEqual(unsupported.body.allowedMethods, fixture.errors.unsupportedMethod.allowedMethods, `${method} ${path}`);
    }
  });
});
