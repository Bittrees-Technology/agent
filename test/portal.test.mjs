import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import {
  APPROVED_CONTENT_PACKAGE,
  APPROVED_CLAIMS,
  APPROVED_AGENT_PROFILES,
  CONTRIBUTION_PRIVACY_NOTICE,
  CONTRIBUTION_LANES,
  CONTRIBUTION_WORKFLOW,
  EXTERNAL_MCP_SAFEGUARD_INDEX,
  EXCLUDED_CLAIMS,
  EXCLUDED_CLAIM_REVIEW,
  IDENTITY_KEYS_PUBLIC_CONTRACT,
  IDACC_RELEASE_SNAPSHOT,
  INTERNAL_OPPORTUNITY_REVIEW_NOTICE,
  JSON_ROUTE_MAP,
  LAUNCH_FRESHNESS_MONITORING,
  LAUNCH_STATUS,
  LIVE_AGENT_REGISTRY,
  MCP_CONTRIBUTION_TOOLS,
  MCP_GATEWAY,
  MCP_HARNESS_IMPORT_TABS,
  NO_RIGHTS_CREATED_DISCLAIMER,
  PORTAL_SECURITY_HEADERS,
  PRIVACY_LEGAL_STATUS,
  REGISTRY_PROFILE_PUBLICATION_NOTICE,
  ROUTE_DEFINITIONS,
  SOURCE_REGISTRY,
  TERMS_OF_USE_LEGAL_STATUS,
  UNIVERSAL_PORTAL_DISCLAIMER,
  buildJsonResponse,
  buildLlmsTxt,
  buildPortalManifest,
  buildPublicRegistryFeed,
  buildStaticAssets,
  callMcpTool,
  createRequestHandler,
  getMcpAuditEvents,
  getSecurityAuditEvents,
  handleRegistryRequest,
  PUBLIC_STATUS_VOCABULARY,
  renderIdentityKeysPage,
  renderLandingPage,
  renderMcpDocsPage,
  renderMcpGatewayPage,
  renderNotFoundPage,
  renderOnboardingPage,
  renderPrivacyPage,
  renderReputationPage,
  renderSubmissionStatusPage,
  renderTermsOfUsePage,
  verifySecurityAuditChain,
} from '../src/portal.mjs';
import { createContributionService } from '../src/contributions/service.mjs';
import { ONBOARDING_FLOW_CONTRACTS } from '../src/onboarding-contracts.mjs';

const EXPECTED_ENV_EXAMPLE_NAMES = Object.freeze([
  'AGENT_DEPLOYMENT_ID',
  'AGENT_RELEASE_COMMIT_SHA',
  'AGENT_RELEASE_TAG',
  'AGENT_RELEASE_VERSION',
  'BASE_URL',
  'BITTREES_AGENT_MCP_URL',
  'BITTREES_MCP_HTTP_URL',
  'BRAIN_AGENT_ID',
  'BRAIN_MCP_BASE_URL',
  'BRAIN_URL',
  'CONTRIBUTION_INTENTS_DATA_DIR',
  'CONTRIBUTION_INTENTS_ENABLED',
  'CONTRIBUTION_INTENTS_WRITE_ENABLED',
  'CONTRIBUTION_POST_RATE_LIMIT_MAX',
  'CONTRIBUTION_POST_RATE_LIMIT_WINDOW_MS',
  'EXPECTED_RELEASE_COMMIT',
  'EXPECTED_RELEASE_TAG',
  'EXPECTED_RELEASE_VERSION',
  'GATEWAY_ALLOWED_ORIGINS',
  'GITHUB_REF_NAME',
  'GITHUB_REF_TYPE',
  'GITHUB_SHA',
  'HOST',
  'ID_AGENT_NAME',
  'ID_AGENT_TEAM',
  'ID_TEAM',
  'MANAGER_URL',
  'MCP_ALLOWED_ORIGINS',
  'MCP_HTTP_TIMEOUT_MS',
  'MCP_HTTP_URL',
  'MCP_POST_RATE_LIMIT_MAX',
  'MCP_POST_RATE_LIMIT_WINDOW_MS',
  'MCP_PROTOCOL_VERSION',
  'MCP_TARGET_URL',
  'MCP_WRITE_TOKENS',
  'PORT',
  'PORTAL_ENABLE_CONTRIBUTION_INTENTS',
  'PORTAL_RELEASE_COMMIT_SHA',
  'PORTAL_RELEASE_TAG',
  'PORTAL_RELEASE_VERSION',
  'PORTAL_WORKFLOW_STATE_PATH',
  'RELEASE_TAG',
  'REGISTRY_STATE_PATH',
  'ROLLBACK_BASE_URL',
  'SOURCE_VERSION',
  'VERCEL',
  'VERCEL_DEPLOYMENT_ID',
  'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_REF',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_ORG_ID',
  'VERCEL_PROJECT',
  'VERCEL_PROJECT_ID',
  'VERCEL_SCOPE',
  'VERCEL_TOKEN',
]);

async function withPortalServer(callback, handlerOptions = {}) {
  const server = createServer(createRequestHandler(handlerOptions));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function mcpPost(baseUrl, body, headers = {}) {
  const response = await fetch(`${baseUrl}${MCP_GATEWAY.path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': MCP_GATEWAY.protocolVersion,
      ...headers,
    },
    body: JSON.stringify(body),
  });

  return {
    response,
    json: await response.json(),
  };
}

const CANONICAL_CONTENT_PATHS_FOR_TEST = new Map(
  TERMS_OF_USE_LEGAL_STATUS.aliasRoutes.map((aliasRoute) => [aliasRoute, TERMS_OF_USE_LEGAL_STATUS.pageRoute]),
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canonicalPortalDestination(destination) {
  const methodMatch = destination.match(/^([A-Z]+)\s+(.+)$/);
  if (methodMatch) {
    return `${methodMatch[1]} ${canonicalPortalDestination(methodMatch[2])}`;
  }

  const [path] = destination.split(/[?#]/);
  return CANONICAL_CONTENT_PATHS_FOR_TEST.get(path) ?? path;
}

function assertNoDuplicateCanonicalDestinations(scope, destinations) {
  const seen = new Map();

  for (const destination of destinations) {
    const canonicalDestination = canonicalPortalDestination(destination);
    assert.equal(
      seen.has(canonicalDestination),
      false,
      `${scope} links ${seen.get(canonicalDestination)} and ${destination} to ${canonicalDestination}`,
    );
    seen.set(canonicalDestination, destination);
  }
}

function extractNavByAriaLabel(html, ariaLabel) {
  const navMatch = html.match(new RegExp(`<nav\\b(?=[^>]*aria-label="${escapeRegExp(ariaLabel)}")[^>]*>([\\s\\S]*?)<\\/nav>`));
  assert.ok(navMatch, `expected nav landmark "${ariaLabel}"`);
  return navMatch[1];
}

function extractHrefValues(html) {
  return [...html.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]);
}

function extractRouteCardDestinations(html) {
  return [...html.matchAll(/<article class="route-card">([\s\S]*?)<\/article>/g)].map((match) => {
    const [, cardHtml] = match;
    const linkedHeading = cardHtml.match(/<h2><a href="([^"]+)">/);
    if (linkedHeading) return linkedHeading[1];

    const codedHeading = cardHtml.match(/<h2><code>([^<]+)<\/code><\/h2>/);
    assert.ok(codedHeading, `expected route-card destination heading in ${cardHtml}`);
    return codedHeading[1];
  });
}

const CONTRIBUTION_INTENT_WRITE_FLAG_NAMES_FOR_TEST = [
  'CONTRIBUTION_INTENTS_WRITE_ENABLED',
  'CONTRIBUTION_INTENTS_ENABLED',
  'PORTAL_ENABLE_CONTRIBUTION_INTENTS',
];
const CONTRIBUTION_INTENT_ENV_NAMES_FOR_TEST = [
  ...CONTRIBUTION_INTENT_WRITE_FLAG_NAMES_FOR_TEST,
  'CONTRIBUTION_INTENTS_DATA_DIR',
  'CONTRIBUTION_POST_RATE_LIMIT_MAX',
  'CONTRIBUTION_POST_RATE_LIMIT_WINDOW_MS',
  'GATEWAY_ALLOWED_ORIGINS',
  'MCP_ALLOWED_ORIGINS',
  'MCP_POST_RATE_LIMIT_MAX',
  'MCP_POST_RATE_LIMIT_WINDOW_MS',
  'MCP_WRITE_TOKENS',
];

function withContributionIntentWriteFlags(envOverrides, callback) {
  const previousValues = new Map(
    CONTRIBUTION_INTENT_ENV_NAMES_FOR_TEST.map((flagName) => [flagName, process.env[flagName]]),
  );

  function restore() {
    for (const [flagName, value] of previousValues) {
      if (value === undefined) {
        delete process.env[flagName];
      } else {
        process.env[flagName] = value;
      }
    }
  }

  for (const flagName of CONTRIBUTION_INTENT_ENV_NAMES_FOR_TEST) {
    delete process.env[flagName];
  }

  for (const [flagName, value] of Object.entries(envOverrides)) {
    process.env[flagName] = value;
  }

  try {
    const result = callback();
    if (result && typeof result.then === 'function') return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function buildValidContributionIntentPayload(overrides = {}) {
  return {
    schema: 'agent.bittrees.contribution-intent.v1',
    intentId: `intent-2026-07-12-${Math.random().toString(16).slice(2, 14)}`,
    submittedAt: '2026-07-12T12:00:00.000Z',
    contributor: {
      kind: 'agent',
      name: 'Negative Control Agent',
      contactRoute: 'https://example.invalid/contact',
    },
    targetLane: 'inc-ops-governance',
    summary: 'Prepare a source-grounded review packet for owner validation only.',
    proposedTemplate: 'contribution-task',
    handoff: {
      requestedOwnerRoute: 'approved review contact',
      expectedOutput: 'Review packet with source ids and bounded acceptance evidence.',
      acceptanceCriteria: ['Public route evidence is cited'],
      outOfScope: ['Production mutation'],
      backlogPolicy: 'Park optional improvements until owner review accepts the packet.',
    },
    safety: {
      noSecretsIncluded: true,
      noLiveWriteAcknowledged: true,
      noOnchainActionRequested: true,
    },
    ...overrides,
  };
}

const CONTRIBUTOR_SIGNING_ROLLOUT_GATE_IDS = [
  'staging',
  'backupRestore',
  'canaryFlag',
  'observability',
  'rollback',
];

const PUBLIC_ROLLOUT_GATE_REDACTION_PATTERN = /rawPrivateKey|privateKey|private key|secretKey|secret key|mnemonic|seedPhrase|seed phrase|bearerToken|bearer token|oauthToken|sessionCookie|rawSignature/i;
const RAW_BRAIN_MEMORY_ID_PATTERN = /\bmemory:\d+\b/;

function assertContributorSigningRolloutGates(gates) {
  assert.ok(gates && typeof gates === 'object' && !Array.isArray(gates), 'rolloutGates must be an object');
  assert.deepEqual(
    Object.keys(gates).sort(),
    [...CONTRIBUTOR_SIGNING_ROLLOUT_GATE_IDS].sort(),
    'rolloutGates must expose the complete contributor-signing gate set',
  );

  for (const gateId of CONTRIBUTOR_SIGNING_ROLLOUT_GATE_IDS) {
    const serializedGate = JSON.stringify(gates[gateId]);
    assert.equal(typeof gates[gateId], 'object', `${gateId} rollout gate must be an object`);
    assert.match(serializedGate, /gov\.bittrees\.org/, `${gateId} must reference gov.bittrees.org`);
    assert.match(serializedGate, /research\.bittrees\.org/, `${gateId} must reference research.bittrees.org`);
    assert.doesNotMatch(serializedGate, PUBLIC_ROLLOUT_GATE_REDACTION_PATTERN, `${gateId} must not expose secret/key material`);
  }
}

async function readRequestText(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }
  return body;
}

async function withProxyTargetServer(callback) {
  const received = [];
  const server = createServer(async (req, res) => {
    if (req.url !== MCP_GATEWAY.path || req.method !== 'POST') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    const message = JSON.parse(await readRequestText(req));
    received.push({
      headers: req.headers,
      message,
    });

    if (message.method === 'notifications/initialized') {
      res.writeHead(202, { 'Content-Length': '0' });
      res.end();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        forwardedMethod: message.method,
        protocolVersionHeader: req.headers['mcp-protocol-version'],
        acceptHeader: req.headers.accept,
      },
    }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await callback({ baseUrl, received });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function nextLine(iterator, stderr) {
  const result = await Promise.race([
    iterator.next(),
    delay(5_000).then(() => ({ timeout: true })),
  ]);

  assert.equal(result.timeout, undefined, `timed out waiting for proxy stdout; stderr: ${stderr()}`);
  assert.equal(result.done, false, `proxy stdout closed early; stderr: ${stderr()}`);
  return result.value;
}

async function waitForCondition(condition, stderr) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await delay(20);
  }

  assert.fail(`timed out waiting for proxy condition; stderr: ${stderr()}`);
}

function collectReviewGateRecords(value, records = []) {
  if (!value || typeof value !== 'object') return records;

  if (
    !Array.isArray(value) &&
    value.reviewGate &&
    typeof value.reviewGate === 'object' &&
    Object.hasOwn(value.reviewGate, 'productionMutationAllowed') &&
    Object.hasOwn(value.reviewGate, 'persistenceMode') &&
    Object.hasOwn(value.reviewGate, 'policy')
  ) {
    records.push(value.reviewGate);
  }

  for (const nestedValue of Object.values(value)) {
    collectReviewGateRecords(nestedValue, records);
  }

  return records;
}

const PUBLIC_CONTENT_FORBIDDEN_PATTERNS = [
  ['default-team dispatch route', /default\/(?:lead|coder|researcher)/i],
  ['default validator role pair', /default coder\/researcher/i],
  ['default team label', /\bdefault team\b/i],
  ['team lead slug', /\b(?:research|ops|engineering)-lead\b/i],
  ['security route slug', /technology-security\/security-router/i],
  ['manager route placeholder', /\bM:[a-z0-9-]+\/[a-z0-9-]+\b/i],
  ['team slash route', /\b(?:engineering-team|technology-security)\/[a-z0-9-]+\b/i],
  ['raw owner/reviewer lead field', /"(?:owner|reviewer|operator|requestedOwnerRoute|opportunityOwner)"\s*:\s*"lead"/i],
];

function assertPublicContentSafe(label, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

  for (const [name, pattern] of PUBLIC_CONTENT_FORBIDDEN_PATTERNS) {
    assert.doesNotMatch(text, pattern, `${label} exposed ${name}`);
  }
}

function schemaTypeMatches(expectedType, value) {
  if (expectedType === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (expectedType === 'array') return Array.isArray(value);
  if (expectedType === 'integer') return Number.isInteger(value);
  return typeof value === expectedType;
}

function validateSchemaValue(schema, value, path = '$') {
  const errors = [];

  if (!schema || typeof schema !== 'object') return errors;

  if (schema.anyOf) {
    const branchErrors = schema.anyOf.map((branch) => validateSchemaValue(branch, value, path));
    if (branchErrors.some((branch) => branch.length === 0)) return errors;
    return [`${path} did not match any allowed schema branch: ${branchErrors.flat().join('; ')}`];
  }

  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    errors.push(`${path} expected const ${JSON.stringify(schema.const)} but received ${JSON.stringify(value)}`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} expected one of ${JSON.stringify(schema.enum)} but received ${JSON.stringify(value)}`);
  }

  if (schema.type) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowedTypes.some((type) => schemaTypeMatches(type, value))) {
      errors.push(`${path} expected type ${allowedTypes.join('|')} but received ${Array.isArray(value) ? 'array' : typeof value}`);
      return errors;
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path} shorter than minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path} longer than maxLength ${schema.maxLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path} did not match pattern ${schema.pattern}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} shorter than minItems ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path} longer than maxItems ${schema.maxItems}`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateSchemaValue(schema.items, item, `${path}[${index}]`));
      });
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const requiredField of schema.required ?? []) {
      if (!Object.hasOwn(value, requiredField)) errors.push(`${path}.${requiredField} is required`);
    }

    const properties = schema.properties ?? {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (properties[key]) {
        errors.push(...validateSchemaValue(properties[key], nestedValue, `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}.${key} is not an allowed property`);
      }
    }
  }

  return errors;
}

test('llms.txt is a plain-text agent entry point', () => {
  const llms = buildLlmsTxt();

  assert.match(llms, /^# agent\.bittrees\.org/);
  assert.match(llms, /\/sources\.json/);
  assert.match(llms, /\/templates\.json/);
  assert.match(llms, /\/identity-keys/);
  assert.match(llms, /\/identity-keys\.json/);
  assert.match(llms, /\/submission-status/);
  assert.match(llms, /\/reputation/);
  assert.match(llms, /\/mcp/);
  assert.match(llms, /\/mcp-docs/);
  assert.match(llms, /list_contribution_opportunities/);
  assert.match(llms, /submit_contribution/);
  assert.match(llms, /Contribution Workflow/);
  assert.match(llms, /\/monitoring\.json/);
  assert.match(llms, /signed heartbeats/);
  assert.doesNotMatch(llms, /JSON-encoded/);
});

test('json routes are not placeholder success payloads', () => {
  for (const definition of JSON_ROUTE_MAP.values()) {
    const response = buildJsonResponse(definition, '2026-07-06T00:00:00.000Z');

    assert.equal(Object.hasOwn(response, 'stub'), false, definition.path);
    assert.notEqual(response.status, 'placeholder', definition.path);
    assert.notEqual(response.data.status, 'placeholder', definition.path);
    assert.equal(response.route, definition.path);
  }
});

test('onboarding route publishes schemas and validating example requests for all flows', () => {
  const onboardingRoute = JSON_ROUTE_MAP.get('/onboarding.json');
  const response = buildJsonResponse(onboardingRoute, '2026-07-06T00:00:00.000Z');

  assert.equal(response.status, 'prelaunch-onboarding-contract-ready');
  assert.equal(response.data.goalId, 'goal_plan_rzit49');
  assert.equal(response.data.capabilityDescriptionSchema.$id.endsWith('/capability-description.v1.json'), true);
  assert.equal(response.data.contributionWorkflowItemSchema.$id.endsWith('/contribution-workflow-item.v1.json'), true);
  assert.equal(response.data.roleApplicationLinkSchema.$id.endsWith('/role-application-link.v1.json'), true);
  assert.equal(response.data.flows.length, 7);
  assert.equal(response.data.guardBehavior.contributionIntents.writeGate.liveWritesEnabled, false);
  assert.equal(response.data.guardBehavior.contributionIntents.writeGate.accepted, false);
  assert.equal(response.data.guardBehavior.mcpReviewGate.productionMutationAllowed, false);
  assert.equal(response.data.guardBehavior.mcpProductionMutationAllowed, false);
  assert.ok(response.data.guardBehavior.internalOnlyFieldNotes.some((note) => note.includes('internal-route')));
  assert.ok(response.data.guardBehavior.internalOnlyFieldNotes.some((note) => note.includes('handoff.goalId')));

  const flowById = new Map(response.data.flows.map((flow) => [flow.id, flow]));
  assert.deepEqual(flowById.get('identity-registration').routes, ['/identity-keys.json', '/v1/workflow/registrations', '/mcp']);
  assert.deepEqual(
    flowById.get('available-work-listing').routes,
    ['/v1/workflow/opportunities', '/v1/workflow/opportunities/:opportunityId', '/opportunities.json', '/mcp'],
  );
  assert.deepEqual(
    flowById.get('status-tracking').routes,
    ['/v1/workflow/status', '/submission-status', '/submission-status.json', '/mcp'],
  );
  assert.deepEqual(
    flowById.get('identity-registration').requestSchema.required,
    ['channel', 'path', 'method', 'action', 'agentId', 'displayName', 'operator', 'contact', 'capabilities', 'evidencePolicy', 'reviewGateAcknowledged'],
  );
  assert.deepEqual(flowById.get('status-tracking').requestSchema.required, ['channel', 'reviewGateAcknowledged']);
  assert.deepEqual(flowById.get('status-tracking').requestSchema.properties.query.required, ['id']);
  assert.equal(flowById.get('status-tracking').requestSchema.properties.query.properties.kind.default, 'any');

  for (const flow of response.data.flows) {
    assert.equal(flow.exampleRequests.length, 2, `${flow.id} should ship exactly two example requests`);
    assert.ok(flow.requestSchema.$id, `${flow.id} should publish a request schema id`);
    assert.ok(flow.failureStates.length > 0, `${flow.id} should document failure states`);
  }
});

test('onboarding example requests validate against committed flow schemas', () => {
  assert.equal(ONBOARDING_FLOW_CONTRACTS.length, 7);

  for (const flow of ONBOARDING_FLOW_CONTRACTS) {
    assert.equal(flow.exampleRequests.length, 2, `${flow.id} should have two validation examples`);

    for (const example of flow.exampleRequests) {
      const errors = validateSchemaValue(flow.requestSchema, example.request);

      assert.deepEqual(errors, [], `${flow.id}/${example.id} failed schema validation`);
    }
  }
});

test('source guardrails include approved and excluded Bittrees claims', () => {
  assert.ok(
    APPROVED_CLAIMS.some((claim) => claim.claim.includes('three-arm ecosystem')),
    'expected approved three-arm ecosystem claim',
  );
  assert.ok(
    EXCLUDED_CLAIMS.some((claim) => claim.includes('AI-agent blockchain platform')),
    'expected explicit excluded AI-agent-platform claim',
  );
});

test('sources JSON only serves explicitly public-safe source records', async () => {
  const sourcesRoute = JSON_ROUTE_MAP.get('/sources.json');
  const expectedPublicSources = SOURCE_REGISTRY.filter((source) => source.publicSafe === true);

  assert.deepEqual(sourcesRoute.data.sources, expectedPublicSources);

  await withPortalServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/sources.json`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(
      body.data.sources.map((source) => source.id),
      expectedPublicSources.map((source) => source.id),
    );
    assert.ok(body.data.sources.every((source) => source.publicSafe === true));
    assert.doesNotMatch(JSON.stringify(body), /bittrees-research-executive-summary|ops-guide-1-5-1/);
    assert.doesNotMatch(JSON.stringify(body), RAW_BRAIN_MEMORY_ID_PATTERN);
  });
});

test('sources JSON exposes the approved content package with provenance', () => {
  const sourcesRoute = JSON_ROUTE_MAP.get('/sources.json');
  const response = buildJsonResponse(sourcesRoute, '2026-07-06T00:00:00.000Z');
  const approvedPackage = response.data.approvedContentPackage;

  assert.equal(approvedPackage.schema, 'agent.bittrees.approved-content-package.v1');
  assert.equal(approvedPackage.sourceOfTruthRoute, '/sources.json');
  assert.equal(approvedPackage.agentEntryRoute, '/llms.txt');
  assert.equal(approvedPackage.provenance.publicSafeFilter, 'SOURCE_REGISTRY.publicSafe === true');
  assert.deepEqual(
    approvedPackage.sources.map((source) => source.id),
    SOURCE_REGISTRY.filter((source) => source.publicSafe === true).map((source) => source.id),
  );
  assert.deepEqual(
    approvedPackage.approvedClaims.map((claim) => claim.id),
    APPROVED_CLAIMS.map((claim) => claim.id),
  );
  assert.ok(approvedPackage.agentInstructions.some((instruction) => instruction.links.includes('/sources.json')));
  assert.doesNotMatch(JSON.stringify(approvedPackage), RAW_BRAIN_MEMORY_ID_PATTERN);
});

test('landing page renders approved content package instructions, links, and provenance', () => {
  const html = renderLandingPage();

  assert.match(html, /Approved content package/);
  assert.match(html, new RegExp(APPROVED_CONTENT_PACKAGE.packageId));
  assert.match(html, /Agent instructions/);
  assert.match(html, /Source links and provenance/);
  assert.match(html, /Approved claim guardrails/);
  assert.match(html, /Excluded public claims/);
  assert.match(html, /href="\/sources\.json"/);
  assert.match(html, /href="\/llms\.txt"/);
  assert.match(html, /href="https:\/\/gov\.bittrees\.org"/);
  assert.match(html, /href="https:\/\/research\.bittrees\.org"/);
  assert.match(html, /href="https:\/\/capital\.bittrees\.org"/);
  assert.match(html, /three-arm ecosystem/);
  assert.match(html, /Do not describe Bittrees primarily as an AI-agent blockchain platform/);
  assert.match(html, /SOURCE_REGISTRY\.publicSafe === true/);
  assert.doesNotMatch(html, RAW_BRAIN_MEMORY_ID_PATTERN);
});

test('static build includes all advertised routes', () => {
  const manifest = buildPortalManifest('2026-07-06T00:00:00.000Z');
  const assets = buildStaticAssets('2026-07-06T00:00:00.000Z');
  const assetPaths = new Set(assets.map((asset) => asset.path));
  const termsAliasRoute = ROUTE_DEFINITIONS.find((route) => route.path === '/terms');

  assert.deepEqual(
    manifest.routes.map((route) => route.path),
    ROUTE_DEFINITIONS.map((route) => route.path),
  );
  assert.ok(termsAliasRoute);
  assert.equal(termsAliasRoute.canonicalPath, '/terms-of-use');
  assert.equal(manifest.sourceSnapshotEvidence.label, 'SOURCE SNAPSHOT evidence');
  assert.equal(manifest.sourceSnapshotEvidence.sourceSnapshot.termsRoute, '/terms');
  assert.ok(manifest.sourceSnapshotEvidence.sourceSnapshot.evidenceRoutes.includes('/terms'));
  assert.equal(manifest.sourceSnapshotEvidence.liveTarget.relationship, 'independently deployed live target');
  assert.equal(manifest.sourceSnapshotEvidence.liveTarget.rolloutStatus, 'not-asserted-by-source-snapshot');
  assert.ok(manifest.sourceSnapshotEvidence.routeEvidence.some((route) => (
    route.path === '/terms'
    && route.status === TERMS_OF_USE_LEGAL_STATUS.status
    && route.source === 'ROUTE_DEFINITIONS'
  )));

  assert.ok(assetPaths.has('index.html'));
  assert.ok(assetPaths.has('identity-keys/index.html'));
  // This query-driven page must remain dynamic. A generated index.html shadows
  // the Vercel function route and can self-refresh instead of loading status.
  assert.equal(assetPaths.has('submission-status/index.html'), false);
  assert.ok(assetPaths.has('reputation/index.html'));
  assert.ok(assetPaths.has('terms/index.html'));
  assert.ok(assetPaths.has('terms-of-use/index.html'));
  assert.ok(assetPaths.has('privacy/index.html'));
  assert.ok(assetPaths.has('onboarding/index.html'));
  assert.ok(assetPaths.has('tou/index.html'));
  assert.ok(assetPaths.has('llms.txt'));
  assert.ok(assetPaths.has('sources.json'));
  assert.ok(assetPaths.has('opportunities.json'));
  assert.ok(assetPaths.has('onboarding.json'));
  assert.equal(assetPaths.has('contribution-intents'), false);
  assert.equal(assetPaths.has('gateway/contribution-intents'), false);
  assert.equal(assetPaths.has('mcp/index.html'), false);
  assert.ok(assetPaths.has('mcp-docs/index.html'));
  assert.ok(assetPaths.has('mcp.json'));
  assert.ok(assetPaths.has('submission-status.json'));
  assert.ok(assetPaths.has('reputation.json'));
  assert.ok(assetPaths.has('terms-of-use.json'));
  assert.ok(assetPaths.has('privacy.json'));
  assert.ok(assetPaths.has('identity-keys.json'));
  assert.ok(assetPaths.has('monitoring.json'));
});

test('html pages emit description and Open Graph metadata', () => {
  const htmlByRoute = new Map([
    ['/', renderLandingPage()],
    ['/identity-keys', renderIdentityKeysPage()],
    ['/submission-status', renderSubmissionStatusPage()],
    ['/reputation', renderReputationPage()],
    ['/terms-of-use', renderTermsOfUsePage()],
    ['/privacy', renderPrivacyPage()],
    ['/onboarding', renderOnboardingPage()],
    ['/mcp', renderMcpGatewayPage()],
    ['/mcp-docs', renderMcpDocsPage()],
  ]);

  for (const [route, html] of htmlByRoute) {
    assert.match(html, /<title>[^<]+<\/title>/, route);
    assert.match(html, /<meta name="description" content="[^"]+" \/>/, route);
    assert.match(html, /<meta name="robots" content="noindex,nofollow" \/>/, route);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://agent\\.bittrees\\.org${route === '/' ? '/' : route}" \\/>`), route);
    assert.match(html, /<meta property="og:title" content="[^"]+" \/>/, route);
    assert.match(html, /<meta property="og:description" content="[^"]+" \/>/, route);
    assert.match(html, /<meta property="og:url" content="https:\/\/agent\.bittrees\.org[^"]*" \/>/, route);
    assert.match(html, /<meta name="twitter:card" content="summary" \/>/, route);
    assert.match(html, /<meta name="twitter:title" content="[^"]+" \/>/, route);
    assert.match(html, /<meta name="twitter:description" content="[^"]+" \/>/, route);
  }
});

test('Terms of Use routes are blocked pending legal-approved content', async () => {
  const termsRoute = JSON_ROUTE_MAP.get('/terms-of-use.json');
  const termsContract = buildJsonResponse(termsRoute, '2026-07-10T00:00:00.000Z');
  const termsPage = renderTermsOfUsePage();

  assert.ok(termsRoute);
  assert.equal(termsContract.status, TERMS_OF_USE_LEGAL_STATUS.status);
  assert.equal(termsContract.data.contentStatus, 'pending-legal-approved-content');
  assert.equal(termsContract.data.publicationStatus, 'not-published');
  assert.equal(termsContract.data.legalContentOwner, 'legal/general-counsel');
  assert.deepEqual(termsContract.data.aliasRoutes, ['/terms', '/tou']);
  assert.match(termsContract.data.requiredNextAction, /Legal\/general-counsel must author and approve/);
  assert.match(termsPage, /Terms of Use are pending legal approval/);
  assert.match(termsPage, /not a legal agreement, acceptance flow, or substitute/);
  assert.match(termsPage, /<meta name="robots" content="noindex,nofollow" \/>/);

  await withPortalServer(async (baseUrl) => {
    const publicRouteResponse = await fetch(`${baseUrl}/terms`);
    const publicRouteSlashResponse = await fetch(`${baseUrl}/terms/`);
    const publicRouteAssetResponse = await fetch(`${baseUrl}/terms/index.html`);
    const pageResponse = await fetch(`${baseUrl}/terms-of-use`);
    const shortRouteResponse = await fetch(`${baseUrl}/tou`);
    const contractResponse = await fetch(`${baseUrl}/terms-of-use.json`);
    const contractBody = await contractResponse.json();

    assert.equal(publicRouteResponse.status, 200);
    assert.match(publicRouteResponse.headers.get('content-type') ?? '', /^text\/html/);
    assert.equal(publicRouteResponse.headers.get('x-robots-tag'), 'noindex, nofollow');
    const publicRouteBody = await publicRouteResponse.text();
    assert.match(publicRouteBody, /Terms of Use are pending legal approval/);

    assert.equal(publicRouteSlashResponse.status, 200);
    assert.equal(publicRouteSlashResponse.url, `${baseUrl}/terms`);
    const publicRouteSlashBody = await publicRouteSlashResponse.text();
    assert.match(publicRouteSlashBody, /Terms of Use are pending legal approval/);

    assert.equal(publicRouteAssetResponse.status, 200);
    assert.equal(publicRouteAssetResponse.url, `${baseUrl}/terms`);
    const publicRouteAssetBody = await publicRouteAssetResponse.text();
    assert.match(publicRouteAssetBody, /Terms of Use are pending legal approval/);

    assert.equal(pageResponse.status, 200);
    assert.match(pageResponse.headers.get('content-type') ?? '', /^text\/html/);
    assert.equal(pageResponse.headers.get('x-robots-tag'), 'noindex, nofollow');
    const pageBody = await pageResponse.text();
    assert.match(pageBody, /pending legal approval/);

    assert.equal(shortRouteResponse.status, 200);
    assert.match(shortRouteResponse.headers.get('content-type') ?? '', /^text\/html/);
    assert.equal(shortRouteResponse.headers.get('x-robots-tag'), 'noindex, nofollow');
    const shortRouteBody = await shortRouteResponse.text();
    assert.match(shortRouteBody, /Terms of Use are pending legal approval/);
    assert.equal(publicRouteBody, pageBody);
    assert.equal(publicRouteSlashBody, pageBody);
    assert.equal(publicRouteAssetBody, pageBody);
    assert.equal(shortRouteBody, pageBody);

    assert.equal(contractResponse.status, 200);
    assert.match(contractResponse.headers.get('content-type') ?? '', /^application\/json/);
    assert.equal(contractResponse.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(contractBody.status, TERMS_OF_USE_LEGAL_STATUS.status);
    assert.equal(contractBody.data.contentStatus, 'pending-legal-approved-content');
  });
});

test('privacy routes expose an accurate prelaunch status without inventing approved policy text', async () => {
  const privacyRoute = JSON_ROUTE_MAP.get('/privacy.json');
  const privacyContract = buildJsonResponse(privacyRoute, '2026-07-13T00:00:00.000Z');
  const privacyPage = renderPrivacyPage();

  assert.ok(privacyRoute);
  assert.equal(privacyContract.status, PRIVACY_LEGAL_STATUS.status);
  assert.equal(privacyContract.data.contentStatus, 'pending-legal-approved-content');
  assert.equal(privacyContract.data.publicationStatus, 'not-published');
  assert.equal(privacyContract.data.currentIntakeNotice, CONTRIBUTION_PRIVACY_NOTICE);
  assert.match(privacyPage, /Privacy policy and contact are pending legal approval/);
  assert.match(privacyPage, /not a substitute for a final policy/);
  assert.match(privacyPage, /<meta name="robots" content="noindex,nofollow" \/>/);

  await withPortalServer(async (baseUrl) => {
    const pageResponse = await fetch(`${baseUrl}/privacy`);
    const contractResponse = await fetch(`${baseUrl}/privacy.json`);
    const contractBody = await contractResponse.json();

    assert.equal(pageResponse.status, 200);
    assert.match(pageResponse.headers.get('content-type') ?? '', /^text\/html/);
    assert.equal(pageResponse.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(await pageResponse.text(), /pending legal approval/);

    assert.equal(contractResponse.status, 200);
    assert.match(contractResponse.headers.get('content-type') ?? '', /^application\/json/);
    assert.equal(contractBody.data.contentStatus, 'pending-legal-approved-content');
  });
});

test('landing contribution intent CTA copy follows write flag posture', () => {
  withContributionIntentWriteFlags({}, () => {
    const html = renderLandingPage();

    assert.match(html, /Live contribution-intent writes are disabled/);
    assert.match(html, /does not create a live submission or review record/);
    assert.match(html, /<button type="submit">Prepare offline contribution packet<\/button>/);
    assert.doesNotMatch(html, /<button type="submit">Submit contribution intent<\/button>/);
  });

  withContributionIntentWriteFlags({ CONTRIBUTION_INTENTS_WRITE_ENABLED: 'true' }, () => {
    const html = renderLandingPage();

    assert.match(html, /Non-production contribution-intent writes are enabled/);
    assert.match(html, /local review record and receipt/);
    assert.match(html, /<button type="submit">Submit contribution intent<\/button>/);
    assert.doesNotMatch(html, /<button type="submit">Prepare offline contribution packet<\/button>/);
  });
});

test('landing page stacks route cards before tablet overflow widths', () => {
  const html = renderLandingPage();

  assert.match(html, /@media \(max-width: 900px\)/);
  assert.match(html, /\.route-card \{ align-items: flex-start; flex-direction: column; \}/);
  assert.match(html, /\.route-card span \{ white-space: normal; text-align: left; \}/);
});

test('contribution intent form exposes accessible labels instructions and mobile touch targets', () => {
  const html = renderLandingPage();
  const requiredFieldIds = [
    ['intent-contributor-kind', 'contributor.kind'],
    ['intent-contributor-name', 'contributor.name'],
    ['intent-contributor-contactRoute', 'contributor.contactRoute'],
    ['intent-targetLane', 'targetLane'],
    ['intent-proposedTemplate', 'proposedTemplate'],
    ['intent-summary', 'summary'],
    ['intent-handoff-requestedOwnerRoute', 'handoff.requestedOwnerRoute'],
    ['intent-handoff-expectedOutput', 'handoff.expectedOutput'],
    ['intent-handoff-acceptanceCriteria', 'handoff.acceptanceCriteria'],
    ['intent-handoff-outOfScope', 'handoff.outOfScope'],
    ['intent-handoff-backlogPolicy', 'handoff.backlogPolicy'],
  ];

  assert.match(html, /<form class="intent-form"[^>]+aria-describedby="intent-rights-notice intent-privacy-notice intent-write-notice"/);
  assert.match(html, /\.intent-form input,\n\s+\.intent-form select,\n\s+\.intent-form textarea \{\n\s+width: 100%;\n\s+min-height: 44px;/);
  assert.match(html, /\.intent-form \.checkbox-label \{\n\s+grid-template-columns: 44px 1fr;\n\s+align-items: center;\n\s+min-height: 44px;/);
  assert.match(html, /\.intent-form input\[type="checkbox"\] \{\n\s+width: 44px;\n\s+min-height: 44px;/);
  assert.match(html, /\.intent-form button \{\n\s+justify-self: start;\n\s+min-height: 44px;/);
  assert.match(html, /@media \(max-width: 900px\) \{\n\s+\.form-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /\.intent-form button \{\n\s+justify-self: stretch;\n\s+width: 100%;/);

  for (const [id, name] of requiredFieldIds) {
    assert.match(html, new RegExp(`<label[^>]+for="${id}"`), `${name} label is explicitly associated`);
    assert.match(html, new RegExp(`id="${id}"[^>]+name="${name.replace('.', '\\.')}"`), `${name} control has stable id`);
    assert.match(html, new RegExp(`id="${id}-hint" class="field-help"`), `${name} has field help`);
    assert.match(html, new RegExp(`aria-describedby="${id}-hint"`), `${name} references field help`);
  }

  for (const id of [
    'intent-safety-noSecretsIncluded',
    'intent-safety-noLiveWriteAcknowledged',
    'intent-safety-noOnchainActionRequested',
  ]) {
    assert.match(html, new RegExp(`<label class="checkbox-label" for="${id}">`));
    assert.match(html, new RegExp(`<input id="${id}" type="checkbox"`));
  }
});

test('contribution intent form ships a transparent-signing island inside the form', () => {
  const html = renderLandingPage();

  assert.match(html, /<form class="intent-form" id="intent-form"[^>]*>[\s\S]*<section class="signing-island" id="intent-signing-island"[\s\S]*<\/section>\s*<button type="submit">/);
});

test('contribution intent form exposes a server-rendered no-JS fallback path', () => {
  const html = renderLandingPage();

  assert.match(html, /<div class="signing-server-fallback" role="note" aria-labelledby="intent-server-fallback-title">/);
  assert.match(html, /<h3 id="intent-server-fallback-title">Offline packet path<\/h3>/);
  assert.match(html, /submitting this form returns a server-rendered offline contribution packet/);
  assert.match(html, /does not create an assignment, approval, public attestation, onchain action, or wallet grant/);
  assert.match(html, /<noscript>Client scripting is unavailable, so this form will use the offline packet path\.<\/noscript>/);
});

test('signing island shows the exact wallet message preview before any wallet prompt', () => {
  const html = renderLandingPage();

  assert.match(
    html,
    /<code id="intent-signing-message">Bittrees — application encryption key \(v1\)\n\nSign to derive your private decryption key for contributor applications\. No gas; this only proves wallet ownership\.<\/code>/,
  );
  assert.match(
    html,
    /This wallet signature derives a local encryption key\. It is not a transaction, does not spend funds, and does not grant Bittrees, IDACC, or this portal authority over your wallet\./,
  );
  assert.match(
    html,
    /The wallet prompt signs only the key-derivation message above\. Your form contents are shown here for review and are handled by the portal write gate separately\./,
  );
});

test('signing island shows the review package preview, chain/domain/context row, and wallet account display', () => {
  const html = renderLandingPage();

  assert.match(html, /<p class="signing-context-row" id="intent-context-row">Base \(8453\) - agent\.bittrees\.org - contributor review intake<\/p>/);
  assert.match(html, /<button type="button" class="signing-connect-button" id="intent-connect-wallet">Connect wallet<\/button>/);
  assert.match(html, /<p class="signing-account" id="intent-connected-account" hidden><\/p>/);
  assert.match(html, /<summary>Review package preview<\/summary>/);
  assert.match(html, /<dt>Purpose<\/dt><dd>Contributor application \/ contribution review intake<\/dd>/);
  assert.match(html, /<dt>Portal<\/dt><dd>agent\.bittrees\.org<\/dd>/);
  assert.match(html, /<dt>Network<\/dt><dd>Base \(8453\)<\/dd>/);
  assert.match(html, /<dt>Account<\/dt><dd id="intent-payload-account">Not connected<\/dd>/);
  assert.match(html, /<dt>Review gate<\/dt><dd>review_required_before_publication_or_assignment<\/dd>/);
  assert.match(html, /<dd id="intent-payload-form-summary">Lane: [^<]+ \| Name: \(not set\) \| Summary length: 0 chars \| Source IDs: 0<\/dd>/);
});

test('signing island write posture reflects the fail-closed gate by default and the enabled flag when set', () => {
  withContributionIntentWriteFlags({}, () => {
    const html = renderLandingPage();
    assert.match(html, /<dd id="intent-payload-write-posture">read-only public launch default<\/dd>/);
  });

  withContributionIntentWriteFlags({ CONTRIBUTION_INTENTS_WRITE_ENABLED: 'true' }, () => {
    const html = renderLandingPage();
    assert.match(html, /<dd id="intent-payload-write-posture">non-production write-enabled<\/dd>/);
  });
});

test('signing island exposes the four accessible state regions and gate-closed retry copy', () => {
  const html = renderLandingPage();

  assert.match(html, /<section class="signing-island" id="intent-signing-island" data-signing-state="pending" aria-live="polite">/);
  assert.match(html, /<p class="caveat" id="intent-chain-warning" role="alert" hidden><\/p>/);
  assert.match(html, /<p class="caveat" id="intent-signing-failure" role="alert" hidden><\/p>/);
  assert.match(html, /<div class="signing-success" id="intent-signing-success" hidden>/);
  assert.match(html, /Contribution package received for review\./);
  assert.match(html, /Reviewer acceptance is required before publication, assignment, reputation credit, authority, or any public attestation\./);
  assert.match(html, /<div class="signing-retry" id="intent-signing-retry" hidden>/);
  assert.match(html, /<button type="button" id="intent-retry-button">Try again<\/button>/);
  assert.match(html, /<button type="button" id="intent-edit-button">Edit application<\/button>/);

  const script = html.match(/<script>\n\(function \(\) \{[\s\S]*?\}\)\(\);\n<\/script>/)?.[0];
  assert.ok(script, 'signing island inline script is present');
  assert.match(
    script,
    /var GATE_CLOSED_RETRY_COPY = "Live contribution writes are not enabled on this portal yet\. Nothing was submitted on-chain or accepted as a public attestation\. You can review the packet and try again after intake is enabled\.";/,
  );
  assert.match(script, /var BASE_CHAIN_HEX = "0x2105";/);
  assert.match(script, /response\.status === 501 \|\| \(body && body\.error === 'write_disabled'\)/);
  assert.match(script, /provider\.request\(\{\s*method: 'personal_sign',\s*params: \[SIGNING_MESSAGE, account\],/);
  assert.doesNotMatch(script, /writeContract/);
  assert.doesNotMatch(script, /rawSignature/i);
});

test('human lookup forms expose mobile accessible labels and instructions', () => {
  const statusHtml = renderSubmissionStatusPage();
  const reputationHtml = renderReputationPage();

  assert.match(statusHtml, /<label for="status-record-id">/);
  assert.match(statusHtml, /id="status-record-id-hint" class="field-help"/);
  assert.match(statusHtml, /<input id="status-record-id" type="search" name="id"[^>]+aria-describedby="status-record-id-hint"/);
  assert.match(statusHtml, /<label for="status-kind">/);
  assert.match(statusHtml, /<select id="status-kind" name="kind" aria-describedby="status-kind-hint">/);
  assert.match(statusHtml, /input,\n\s+select \{\n\s+width: 100%;\n\s+min-height: 44px;/);
  assert.match(statusHtml, /button \{\n\s+min-height: 44px;/);
  assert.match(statusHtml, /@media \(max-width: 820px\)[\s\S]+button \{ width: 100%; \}/);

  assert.match(reputationHtml, /<label for="reputation-agent-id">/);
  assert.match(reputationHtml, /id="reputation-agent-id-hint" class="field-help"/);
  assert.match(reputationHtml, /<input id="reputation-agent-id" type="search" name="agentId"[^>]+aria-describedby="reputation-agent-id-hint"/);
});

test('landing route links use working examples or documentation for templates and POST-only APIs', () => {
  const html = renderLandingPage();

  assert.doesNotMatch(html, /href="\/v1\/workflow\/opportunities\/:opportunityId"/);
  assert.doesNotMatch(html, /href="\/v1\/workflow\/registrations"/);
  assert.match(html, /href="\/v1\/workflow\/opportunities\/contribution-template-pilot"/);
  assert.match(html, /href="\/onboarding">Read the authenticated POST request contract<\/a>/);
  assert.match(html, /<code>POST \/v1\/workflow\/registrations<\/code>/);
});

test('visible route lists collapse canonical alias destinations', () => {
  const html = renderLandingPage();
  const actionGrid = extractNavByAriaLabel(html, 'Portal route directory');
  const routeCardDestinations = extractRouteCardDestinations(actionGrid);
  const primaryNavHrefs = extractHrefValues(extractNavByAriaLabel(html, 'Primary portal routes'));
  const footerNavHrefs = extractHrefValues(extractNavByAriaLabel(html, 'Footer routes'));
  const notFoundHtml = renderNotFoundPage();
  const notFoundRoutesMatch = notFoundHtml.match(
    /<h2 id="notfound-routes-title">Portal pages<\/h2>\s*<ul>([\s\S]*?)<\/ul>/,
  );

  assert.ok(notFoundRoutesMatch, 'expected not-found portal route list');
  const notFoundRouteHrefs = extractHrefValues(notFoundRoutesMatch[1]);

  assert.equal(routeCardDestinations.includes('/terms'), false);
  assert.equal(routeCardDestinations.includes('/tou'), false);
  assert.ok(routeCardDestinations.includes('/terms-of-use'));
  assert.doesNotMatch(actionGrid, /Terms status page alias/);
  assert.equal(notFoundRouteHrefs.includes('/terms'), false);
  assert.equal(notFoundRouteHrefs.includes('/tou'), false);
  assert.ok(notFoundRouteHrefs.includes('/terms-of-use'));
  assertNoDuplicateCanonicalDestinations('landing route cards', routeCardDestinations);
  assertNoDuplicateCanonicalDestinations('primary portal nav', primaryNavHrefs);
  assertNoDuplicateCanonicalDestinations('footer nav', footerNavHrefs);
  assertNoDuplicateCanonicalDestinations('not-found portal route list', notFoundRouteHrefs);
  assertNoDuplicateCanonicalDestinations('JSON routes', [...JSON_ROUTE_MAP.keys()]);
});

test('landing route directory groups human pages contracts and workflow APIs', () => {
  const html = renderLandingPage();
  const actionGrid = extractNavByAriaLabel(html, 'Portal route directory');

  assert.match(actionGrid, /<h2 id="route-group-portal-pages">Portal pages<\/h2>/);
  assert.match(actionGrid, /Human-readable pages for onboarding, status, reputation, legal gates, and documentation\./);
  assert.match(actionGrid, /<h2 id="route-group-agent-contracts">Agent-readable contracts<\/h2>/);
  assert.match(actionGrid, /Text and JSON contracts for crawlers, agent clients, release checks, and source verification\./);
  assert.match(actionGrid, /<h2 id="route-group-workflow-apis">Workflow APIs<\/h2>/);
  assert.match(actionGrid, /Review-gated HTTP and MCP routes for contribution discovery, submission, and status lookup\./);

  const portalGroup = actionGrid.match(/id="route-group-portal-pages"[\s\S]*?<\/section>/)?.[0] ?? '';
  const contractsGroup = actionGrid.match(/id="route-group-agent-contracts"[\s\S]*?<\/section>/)?.[0] ?? '';
  const workflowGroup = actionGrid.match(/id="route-group-workflow-apis"[\s\S]*?<\/section>/)?.[0] ?? '';

  assert.match(portalGroup, /href="\/onboarding"/);
  assert.match(portalGroup, /href="\/submission-status"/);
  assert.doesNotMatch(portalGroup, /href="\/agents\.json"/);

  assert.match(contractsGroup, /href="\/agents\.json"/);
  assert.match(contractsGroup, /href="\/llms\.txt"/);
  assert.match(contractsGroup, /href="\/api\/health"/);
  assert.doesNotMatch(contractsGroup, /href="\/v1\/workflow\/opportunities"/);

  assert.match(workflowGroup, /href="\/mcp"/);
  assert.match(workflowGroup, /href="\/v1\/workflow\/opportunities"/);
  assert.match(workflowGroup, /href="\/gateway\/contribution-intents"/);
});

test('contribution intent contract security gate tracks the write flag', () => {
  const contributionIntentRoute = JSON_ROUTE_MAP.get('/contribution-intents');

  withContributionIntentWriteFlags({}, () => {
    const response = buildJsonResponse(contributionIntentRoute, '2026-07-06T00:00:00.000Z');

    assert.equal(response.data.contract.securityGate.accepted, false);
    assert.equal(response.data.contract.securityGate.liveWritesEnabled, false);
  });

  withContributionIntentWriteFlags({ CONTRIBUTION_INTENTS_WRITE_ENABLED: 'true' }, () => {
    const response = buildJsonResponse(contributionIntentRoute, '2026-07-06T00:00:00.000Z');

    assert.equal(response.data.contract.securityGate.accepted, true);
    assert.equal(response.data.contract.securityGate.liveWritesEnabled, true);
  });
});

test('legal disclaimers and privacy notice are present across public route outputs', () => {
  const llms = buildLlmsTxt();
  const htmlAsset = buildStaticAssets('2026-07-06T00:00:00.000Z').find((asset) => asset.path === 'index.html');
  const jsonResponses = Array.from(JSON_ROUTE_MAP.values()).map((definition) =>
    buildJsonResponse(definition, '2026-07-06T00:00:00.000Z'),
  );
  const contributionContract = buildJsonResponse(
    JSON_ROUTE_MAP.get('/contribution-intents'),
    '2026-07-06T00:00:00.000Z',
  );
  const gatewayContract = buildJsonResponse(
    JSON_ROUTE_MAP.get('/gateway/contribution-intents'),
    '2026-07-06T00:00:00.000Z',
  );
  const opportunitiesContract = buildJsonResponse(
    JSON_ROUTE_MAP.get('/opportunities.json'),
    '2026-07-06T00:00:00.000Z',
  );
  const discoveryLane = CONTRIBUTION_LANES.find((lane) => lane.id === 'discovery');

  assert.equal(
    UNIVERSAL_PORTAL_DISCLAIMER,
    'Informational staging material only. Nothing on this portal is legal, tax, accounting, investment, trading, treasury, governance, employment, or other professional advice. Nothing here is an offer to sell or a solicitation to buy any security, token, digital asset, or other financial instrument. Nothing on this portal grants authority, authorization, approval, or permission to act on behalf of Bittrees, IDACC, or any wallet, Safe, signer, controller, registry owner, or governance body.',
  );
  assert.equal(
    NO_RIGHTS_CREATED_DISCLAIMER,
    'Submitting through this portal does not create employment, contractor status, agency, partnership, fiduciary duties, onboarding approval, compensation rights, token rights, equity rights, grant rights, revenue-share rights, confidentiality obligations, or acceptance into any program or workflow. Any formal contributor relationship, compensated work, token program, grant, or authority delegation requires separate written terms and explicit owner approval.',
  );
  assert.equal(
    CONTRIBUTION_PRIVACY_NOTICE,
    'Submit non-confidential information only. Do not submit private keys, seed phrases, raw signatures, bearer tokens, session secrets, API keys, identity documents, tax forms, sanctions materials, wallet secrets, privileged legal material, regulated personal data, or third-party confidential information through this portal. Submission data is used for staged contribution-intent routing and review, may be visible to operators, reviewers, infrastructure providers, and audit logs used to run the service, and may be retained in internal review records for audit purposes. A public privacy-contact route is pending legal approval; privacy, correction, and deletion requests are not yet accepted.',
  );
  assert.equal(
    LAUNCH_STATUS.publicLaunchGate,
    'Prelaunch review surface. Public launch remains blocked until lead approves claims, registry controls, identity/key publication status, intake safeguards, source scope, and route-contract behavior.',
  );
  assert.equal(
    REGISTRY_PROFILE_PUBLICATION_NOTICE,
    'Starter IDACC-managed agent profile records are staged for review with private material redacted. Public signatures, fingerprints, and controller-signed manifest publication remain pending where marked. Listing, review, or publication status is evidence of review only and does not grant authority, delegation, or execution approval.',
  );
  assert.ok(htmlAsset.body.includes(UNIVERSAL_PORTAL_DISCLAIMER));
  assert.ok(htmlAsset.body.includes(NO_RIGHTS_CREATED_DISCLAIMER));
  assert.ok(htmlAsset.body.includes(CONTRIBUTION_PRIVACY_NOTICE));
  assert.ok(llms.includes(UNIVERSAL_PORTAL_DISCLAIMER));
  assert.ok(llms.includes(NO_RIGHTS_CREATED_DISCLAIMER));

  for (const response of jsonResponses) {
    assert.equal(response.disclaimer, UNIVERSAL_PORTAL_DISCLAIMER, response.route);
  }

  assert.equal(contributionContract.privacyNotice, CONTRIBUTION_PRIVACY_NOTICE);
  assert.equal(contributionContract.data.privacyNotice, CONTRIBUTION_PRIVACY_NOTICE);
  assert.equal(gatewayContract.privacyNotice, CONTRIBUTION_PRIVACY_NOTICE);
  assert.equal(gatewayContract.data.privacyNotice, CONTRIBUTION_PRIVACY_NOTICE);
  assert.equal(opportunitiesContract.noRightsCreatedDisclaimer, NO_RIGHTS_CREATED_DISCLAIMER);
  assert.equal(opportunitiesContract.data.noRightsCreatedDisclaimer, NO_RIGHTS_CREATED_DISCLAIMER);
  assert.equal(opportunitiesContract.data.internalReviewNotice, INTERNAL_OPPORTUNITY_REVIEW_NOTICE);
  assert.ok(discoveryLane.description.includes('not a public job offer'));
  assert.ok(discoveryLane.description.includes('does not by itself create compensation'));
});

test('portal outputs do not emit old readiness or approved-profile labels', () => {
  const serialized = [
    buildLlmsTxt(),
    ...buildStaticAssets('2026-07-06T00:00:00.000Z').map((asset) => asset.body),
    ...Array.from(JSON_ROUTE_MAP.values()).map((definition) =>
      JSON.stringify(buildJsonResponse(definition, '2026-07-06T00:00:00.000Z')),
    ),
  ].join('\n');

  assert.doesNotMatch(serialized, new RegExp(`\\b${'live'}-[a-z0-9-]+`));
  assert.doesNotMatch(serialized, new RegExp(`approved-${'signed'}-profile`));
  assert.doesNotMatch(serialized, new RegExp(`Contract is ready for ${'live'} publication`));
  assert.doesNotMatch(serialized, new RegExp(`Starter IDACC-managed agent profiles are ${'published'}`));
});

test('post-capable routes stay dynamic and return disabled responses for POST', async () => {
  const assets = buildStaticAssets('2026-07-06T00:00:00.000Z');
  const assetPaths = new Set(assets.map((asset) => asset.path));

  assert.equal(assetPaths.has('contribution-intents'), false);
  assert.equal(assetPaths.has('gateway/contribution-intents'), false);
  assert.equal(assetPaths.has('mcp/index.html'), false);

  await withPortalServer(async (baseUrl) => {
    for (const path of ['/contribution-intents', '/gateway/contribution-intents']) {
      const getResponse = await fetch(`${baseUrl}${path}`);
      const getBody = await getResponse.json();

      assert.equal(getResponse.status, 200);
      assert.equal(getBody.route, path);
      assert.equal(getBody.privacyNotice, CONTRIBUTION_PRIVACY_NOTICE);

      const postResponse = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const postBody = await postResponse.json();

      assert.equal(postResponse.status, 501);
      assert.equal(postBody.status, 'not_implemented');
      assert.equal(postBody.accepted, false);
      assert.equal(postBody.route, path);
      assert.match(postBody.message, /disabled/);
    }

    const mcpGetResponse = await fetch(`${baseUrl}/mcp`);
    const mcpGetBody = await mcpGetResponse.text();

    assert.equal(mcpGetResponse.status, 200);
    assert.match(mcpGetBody, /Streamable HTTP JSON-RPC endpoint/);

    const mcpPostResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'asset-shadow-smoke', version: '0.1.0' },
        },
      }),
    });
    const mcpPostBody = await mcpPostResponse.json();

    assert.equal(mcpPostResponse.status, 200);
    assert.equal(mcpPostBody.result?.protocolVersion, '2025-06-18');
  });
});

test('disabled contribution intent gate exposes discovery but never reaches the domain service', async () => {
  let submitCalls = 0;
  const contributionService = {
    submit() {
      submitCalls += 1;
      throw new Error('disabled gate must not reach contributionService.submit');
    },
  };

  await withContributionIntentWriteFlags({}, async () => {
    await withPortalServer(async (baseUrl) => {
      const discovery = await fetch(`${baseUrl}/contribution-intents`);
      const discoveryBody = await discovery.json();
      assert.equal(discovery.status, 200);
      assert.equal(discoveryBody.data.contract.securityGate.accepted, false);

      const response = await fetch(`${baseUrl}/contribution-intents`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer disabled-gate-token',
        },
        body: JSON.stringify(buildValidContributionIntentPayload()),
      });
      const body = await response.json();

      assert.equal(response.status, 501);
      assert.equal(body.error, 'write_disabled');
      assert.equal(body.accepted, false);
      assert.equal(body.liveWrite, false);
      assert.equal(body.reviewGate.productionMutationAllowed, false);
      assert.equal(body.reviewGate.walletAuthorityGranted, false);
      assert.equal(body.reviewGate.transactionSubmissionAllowed, false);
      assert.equal(body.reviewGate.registryMutationAllowed, false);
      assert.equal(submitCalls, 0);
    }, { contributionService });
  });
});

test('enabled contribution intent routes expose idempotent receipt, private status, and recoverable retry matrix', async () => {
  const agentId = 'intent-route-matrix-agent';
  const token = 'intent-route-matrix-token';
  const contributionService = createContributionService();

  await withContributionIntentWriteFlags({
    CONTRIBUTION_INTENTS_WRITE_ENABLED: 'true',
    CONTRIBUTION_POST_RATE_LIMIT_MAX: '20',
    MCP_WRITE_TOKENS: JSON.stringify({
      [token]: { subject: agentId, scopes: ['contributor:submit'] },
    }),
  }, async () => {
    await withPortalServer(async (baseUrl) => {
      const discovery = await fetch(`${baseUrl}/gateway/contribution-intents`);
      const discoveryBody = await discovery.json();
      assert.equal(discovery.status, 200);
      assert.equal(discoveryBody.data.contract.securityGate.accepted, true);

      const payload = buildValidContributionIntentPayload({
        intentId: `intent-route-${Date.now()}`,
        contributor: {
          kind: 'agent',
          name: 'Intent Route Matrix Agent',
          agentId,
          contactRoute: 'https://example.invalid/intent-route-agent',
        },
        handoff: {
          requestedOwnerRoute: 'engineering review owner',
          goalId: 'goal_plan_1fgpnd5',
          expectedOutput: 'Review-queued contribution receipt with private status lookup.',
          acceptanceCriteria: ['Receipt replay returns the original submission id'],
          outOfScope: ['Wallet authority or transaction broadcast'],
          backlogPolicy: 'Park optional work until the owning reviewer accepts the packet.',
          sourceIds: ['memory:7517'],
        },
      });
      const idempotencyKey = `route-retry-${Date.now()}`;
      const headers = {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-Forwarded-For': `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
      };

      const unauthorizedResponse = await fetch(`${baseUrl}/gateway/contribution-intents`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Forwarded-For': headers['X-Forwarded-For'],
        },
        body: JSON.stringify(payload),
      });
      const unauthorized = await unauthorizedResponse.json();
      assert.equal(unauthorizedResponse.status, 401);
      assert.equal(unauthorized.error, 'unauthorized');
      assert.equal(unauthorized.code, 'unauthorized');
      assert.equal(unauthorized.accepted, false);
      assert.equal(unauthorized.receiptId, undefined);
      assert.equal(unauthorized.reviewGate.walletAuthorityGranted, false);
      assert.equal(unauthorized.reviewGate.transactionSubmissionAllowed, false);
      assert.equal(unauthorized.reviewGate.registryMutationAllowed, false);

      const firstResponse = await fetch(`${baseUrl}/gateway/contribution-intents`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const first = await firstResponse.json();

      assert.equal(firstResponse.status, 202);
      assert.equal(first.accepted, true);
      assert.equal(first.submission.status, 'queued_for_review');
      assert.equal(first.submission.created, true);
      assert.equal(first.submission.replayed, false);
      assert.equal(first.receiptId, first.submission.receiptId);
      assert.match(first.receiptId, /^sub_/);
      assert.equal(first.statusLookup, `/v1/workflow/status?id=${encodeURIComponent(first.receiptId)}&kind=submission`);

      for (const gate of [first.reviewGate, first.submission.projection.reviewGate]) {
        assert.equal(gate.productionMutationAllowed, false);
        assert.equal(gate.walletAuthorityGranted, false);
        assert.equal(gate.transactionSubmissionAllowed, false);
        assert.equal(gate.registryMutationAllowed, false);
      }

      const replayResponse = await fetch(`${baseUrl}/contribution-intents`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const replay = await replayResponse.json();
      assert.equal(replayResponse.status, 202);
      assert.equal(replay.submission.created, false);
      assert.equal(replay.submission.replayed, true);
      assert.equal(replay.receiptId, first.receiptId);
      assert.match(replay.message, /no duplicate/i);

      const anonymousStatusResponse = await fetch(`${baseUrl}${first.statusLookup}`);
      const anonymousStatus = await anonymousStatusResponse.json();
      assert.equal(anonymousStatusResponse.status, 200);
      assert.equal(anonymousStatus.lookup.status, 'not_found');
      assert.equal(anonymousStatus.lookup.result, null);

      const ownerStatusResponse = await fetch(`${baseUrl}${first.statusLookup}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ownerStatus = await ownerStatusResponse.json();
      assert.equal(ownerStatusResponse.status, 200);
      assert.equal(ownerStatus.lookup.status, 'status_found');
      assert.equal(ownerStatus.lookup.result.submissionId, first.receiptId);
      assert.equal(ownerStatus.lookup.result.status, 'queued_for_review');
      assert.equal(ownerStatus.lookup.result.reviewGate.walletAuthorityGranted, false);
      assert.equal(ownerStatus.lookup.result.reviewGate.transactionSubmissionAllowed, false);
      assert.equal(ownerStatus.lookup.result.reviewGate.registryMutationAllowed, false);

      const conflictResponse = await fetch(`${baseUrl}/gateway/contribution-intents`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...payload, summary: `${payload.summary} Changed after the first receipt.` }),
      });
      const conflict = await conflictResponse.json();
      assert.equal(conflictResponse.status, 409);
      assert.equal(conflict.error, 'conflict');
      assert.equal(conflict.code, 'idempotency_conflict');
      assert.equal(conflict.accepted, false);
      assert.equal(conflict.reviewGate.walletAuthorityGranted, false);

      const recoveredResponse = await fetch(`${baseUrl}/gateway/contribution-intents`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': `${idempotencyKey}-recovered` },
        body: JSON.stringify({ ...payload, summary: `${payload.summary} Changed after the first receipt.` }),
      });
      const recovered = await recoveredResponse.json();
      assert.equal(recoveredResponse.status, 202);
      assert.equal(recovered.submission.created, true);
      assert.equal(recovered.submission.replayed, false);
      assert.notEqual(recovered.receiptId, first.receiptId);
      assert.equal(recovered.reviewGate.transactionSubmissionAllowed, false);
    }, { contributionService });
  });
});

test('contribution intent POST rejects unsupported media types when writes are enabled', async () => {
  await withContributionIntentWriteFlags({
    CONTRIBUTION_INTENTS_WRITE_ENABLED: 'true',
    CONTRIBUTION_INTENTS_DATA_DIR: fileURLToPath(new URL(`../test-results/contribution-media-${Date.now()}`, import.meta.url)),
  }, async () => {
    await withPortalServer(async (baseUrl) => {
      const requestId = 'intent-media-test-01';
      const response = await fetch(`${baseUrl}/gateway/contribution-intents`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'text/plain',
          'X-Request-Id': requestId,
        },
        body: JSON.stringify(buildValidContributionIntentPayload()),
      });
      const body = await response.json();

      assert.equal(response.status, 415);
      assert.equal(response.headers.get('x-request-id'), requestId);
      assert.equal(body.accepted, false);
      assert.equal(body.status, 'rejected');
      assert.equal(body.requestId, requestId);
      assert.equal(body.error, 'unsupported_media_type');
      assert.match(body.errors.join('\n'), /Content-Type must be application\/json/);
    });
  });
});

test('contribution intent POST rejects wallet transaction and authority escalation text', async () => {
  await withContributionIntentWriteFlags({
    CONTRIBUTION_INTENTS_WRITE_ENABLED: 'true',
    CONTRIBUTION_INTENTS_DATA_DIR: fileURLToPath(new URL(`../test-results/contribution-authority-${Date.now()}`, import.meta.url)),
  }, async () => {
    await withPortalServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/contribution-intents`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildValidContributionIntentPayload({
          summary: 'Please broadcast transaction approval after this packet is reviewed.',
        })),
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.accepted, false);
      assert.equal(body.status, 'rejected');
      assert.match(body.errors.join('\n'), /live transaction request/);
    });
  });
});

test('contribution intent POST rate limits repeated write attempts', async () => {
  await withContributionIntentWriteFlags({
    CONTRIBUTION_INTENTS_WRITE_ENABLED: 'true',
    CONTRIBUTION_INTENTS_DATA_DIR: fileURLToPath(new URL(`../test-results/contribution-rate-${Date.now()}`, import.meta.url)),
    CONTRIBUTION_POST_RATE_LIMIT_MAX: '2',
    CONTRIBUTION_POST_RATE_LIMIT_WINDOW_MS: '60000',
    MCP_WRITE_TOKENS: JSON.stringify({
      'contribution-rate-token': { subject: 'contribution-rate-agent', scopes: ['contributor:submit'] },
    }),
  }, async () => {
    await withPortalServer(async (baseUrl) => {
      const headers = {
        Accept: 'application/json',
        Authorization: 'Bearer contribution-rate-token',
        'Content-Type': 'application/json',
        'X-Forwarded-For': `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
      };

      for (let index = 0; index < 2; index += 1) {
        const response = await fetch(`${baseUrl}/gateway/contribution-intents`, {
          method: 'POST',
          headers,
          body: JSON.stringify(buildValidContributionIntentPayload()),
        });
        const body = await response.json();
        assert.equal(response.status, 202);
        assert.equal(body.accepted, true);
      }

      const limited = await fetch(`${baseUrl}/gateway/contribution-intents`, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildValidContributionIntentPayload()),
      });
      const limitedBody = await limited.json();

      assert.equal(limited.status, 429);
      assert.equal(limitedBody.accepted, false);
      assert.equal(limited.headers.has('retry-after'), true);
      assert.match(limitedBody.message, /rate limit/);
    });
  });
});

test('contribution intent POST rejects cross-origin writes without CORS allow headers', async () => {
  await withContributionIntentWriteFlags({
    CONTRIBUTION_INTENTS_WRITE_ENABLED: 'true',
    CONTRIBUTION_INTENTS_DATA_DIR: fileURLToPath(new URL(`../test-results/contribution-origin-${Date.now()}`, import.meta.url)),
  }, async () => {
    await withPortalServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/gateway/contribution-intents`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: 'https://not-bittrees.example',
        },
        body: JSON.stringify(buildValidContributionIntentPayload()),
      });
      const body = await response.json();

      assert.equal(response.status, 403);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.equal(body.accepted, false);
      assert.equal(body.status, 'rejected');
      assert.match(body.message, /Origin is not allowed/);
    });
  });
});

test('contribution intent HTML validation response exposes focusable error summary', async () => {
  await withContributionIntentWriteFlags({
    CONTRIBUTION_INTENTS_WRITE_ENABLED: 'true',
    CONTRIBUTION_INTENTS_DATA_DIR: fileURLToPath(new URL(`../test-results/contribution-html-validation-${Date.now()}`, import.meta.url)),
  }, async () => {
    await withPortalServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/gateway/contribution-intents`, {
        method: 'POST',
        headers: {
          Accept: 'text/html',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          schema: 'agent.bittrees.contribution-intent.v1',
          'contributor.kind': 'agent',
        }).toString(),
      });
      const html = await response.text();

      assert.equal(response.status, 400);
      assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
      assert.match(html, /<section class="error-summary"[^>]*id="intent-error-summary"/);
      assert.match(html, /<section class="error-summary"[^>]*role="alert"/);
      assert.match(html, /<section class="error-summary"[^>]*aria-labelledby="intent-error-title"/);
      assert.match(html, /<section class="error-summary"[^>]*tabindex="-1"/);
      assert.match(html, /<h2 id="intent-error-title">There is a problem with the submission<\/h2>/);
      assert.match(html, /displayName|body\.contributor\.name|body\.summary|body\.handoff/);
      assert.match(html, /<form class="intent-form"[^>]+aria-describedby="intent-rights-notice intent-privacy-notice intent-write-notice"/);
      assert.match(html, /<form class="intent-form"[^>]+aria-invalid="true"/);
      assert.match(html, /<form class="intent-form"[^>]+aria-errormessage="intent-error-summary"/);
      assert.match(html, /id="intent-summary" name="summary" required/);
      assert.match(html, /id="intent-summary-hint" class="field-help"/);
    });
  });
});

test('portal security headers enforce browser launch gate', () => {
  assert.match(PORTAL_SECURITY_HEADERS['Content-Security-Policy'], /default-src 'none'/);
  assert.match(PORTAL_SECURITY_HEADERS['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(PORTAL_SECURITY_HEADERS['Strict-Transport-Security'], 'max-age=63072000; includeSubDomains');
  assert.equal(PORTAL_SECURITY_HEADERS['X-Frame-Options'], 'DENY');
  assert.equal(PORTAL_SECURITY_HEADERS['Referrer-Policy'], 'no-referrer');
  assert.equal(PORTAL_SECURITY_HEADERS['Permissions-Policy'], 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
  assert.equal(PORTAL_SECURITY_HEADERS['X-DNS-Prefetch-Control'], 'off');
  assert.equal(PORTAL_SECURITY_HEADERS['X-Permitted-Cross-Domain-Policies'], 'none');
  assert.equal(PORTAL_SECURITY_HEADERS['Origin-Agent-Cluster'], '?1');
  assert.equal(PORTAL_SECURITY_HEADERS['Cross-Origin-Opener-Policy'], 'same-origin');
  assert.equal(PORTAL_SECURITY_HEADERS['Cross-Origin-Resource-Policy'], 'same-origin');
});

test('.env.example tracks the names-only portal env inventory', () => {
  const names = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=/)?.[1] ?? null)
    .filter(Boolean)
    .sort();
  assert.deepEqual(names, [...EXPECTED_ENV_EXAMPLE_NAMES].sort());
});

test('human pages expose a keyboard skip target and visible focus treatment', () => {
  const pages = [
    renderLandingPage(),
    renderMcpGatewayPage(),
    renderSubmissionStatusPage(),
    renderReputationPage(),
    renderNotFoundPage(),
    renderIdentityKeysPage(),
    renderTermsOfUsePage(),
    renderPrivacyPage(),
    renderOnboardingPage(),
  ];

  for (const html of pages) {
    assert.match(html, /class="skip-link" href="#page-content"/);
    assert.match(html, /<header class="topline">[\s\S]*?<\/header>\s*<main>/);
    assert.match(html, /<section id="page-content" class="hero"/);
    assert.match(html, /:where\(a, button, input, select, textarea\):focus-visible/);
  }
});

test('vercel catch-all headers mirror the portal launch gate', () => {
  const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const catchAllHeaders = vercelConfig.headers.find((entry) => entry.source === '/(.*)')?.headers ?? [];
  const configuredHeaders = Object.fromEntries(catchAllHeaders.map((header) => [header.key, header.value]));

  for (const [header, value] of Object.entries(PORTAL_SECURITY_HEADERS)) {
    assert.equal(configuredHeaders[header], value);
  }

  assert.equal(configuredHeaders['CDN-Cache-Control'], 'no-store');
  assert.equal(configuredHeaders['Vercel-CDN-Cache-Control'], 'no-store');
  assert.equal(configuredHeaders.Pragma, 'no-cache');
  assert.equal(configuredHeaders['X-Content-Type-Options'], 'nosniff');
  assert.equal(configuredHeaders['X-Robots-Tag'], 'noindex, nofollow');
});

test('identity and keys page renders the prelaunch readiness contract', () => {
  const html = renderIdentityKeysPage();

  assert.match(html, /Identity and keys\./);
  assert.match(html, /agent-signed-staged-state-with-guarded-authority-changes/);
  // The HTML surface shows the five-state public status vocabulary; the precise
  // machine slugs remain asserted on the JSON contract below. Both keep the
  // truthful "identity/keys not operational, rollout not complete" state
  // visible: the public label collapses to "Coming soon" while the execution
  // evidence (0/68 executed, uncreated names, required gates) stays.
  assert.match(html, /Coming soon/);
  assert.match(html, /0\/68 executed/);
  assert.match(html, /0 transaction hashes/);
  assert.match(html, /67 names uncreated/);
  assert.match(html, /onchainlead wallet-record mismatch/);
  assert.match(html, /authorized-controller-signer/);
  assert.match(html, /isolated-custody-attestations/);
  assert.match(html, /numeric-spend-cap/);
  assert.match(html, /broadcaster-authority/);
  // The human identity page humanizes rollout/gate status slugs to the public
  // vocabulary. The raw machine slug `future-agent-provisioning-required` stays
  // on /identity-keys.json only (asserted in the JSON contract test below), so
  // the human page renders it as "Coming soon" while keeping the truthful
  // fail-closed requirement prose visible — the page never overstates readiness.
  assert.doesNotMatch(html, /future-agent-provisioning-required/);
  assert.match(html, /Future-agent provisioning:\s*<code>Coming soon<\/code>/);
  assert.match(html, /fail closed/);
  assert.doesNotMatch(html, /live-contract-ready|staging-ready|rollout complete|68\/68 executed|completed successfully|ready to execute/i);
  assert.doesNotMatch(html, /rawPrivateKey|secretKey|mnemonic|seedPhrase/);
});

test('identity and keys route exposes public contract without secret fields', () => {
  const identityRoute = JSON_ROUTE_MAP.get('/identity-keys.json');
  const response = buildJsonResponse(identityRoute, '2026-07-06T00:00:00.000Z');
  const serialized = JSON.stringify(response);

  assert.equal(response.status, IDENTITY_KEYS_PUBLIC_CONTRACT.status);
  assert.equal(response.data.registryManagement.mode, LIVE_AGENT_REGISTRY.mode);
  assert.ok(
    IDENTITY_KEYS_PUBLIC_CONTRACT.onchainExecutionReadiness.some((level) => level.level === 'simulate'),
    'expected simulation readiness level',
  );
  assert.ok(
    response.data.identityKeys.sections.some((section) => section.id === 'public-operational-keys'),
    'expected public key section',
  );
  assert.equal(response.data.identityKeys.ensPrimaryNameRollout.status, 'blocked-not-completed');
  assert.equal(response.data.identityKeys.ensPrimaryNameRollout.completionEvidence.executedAgentCount, 0);
  assert.equal(response.data.identityKeys.ensPrimaryNameRollout.completionEvidence.cohortAgentCount, 68);
  assert.equal(response.data.identityKeys.ensPrimaryNameRollout.completionEvidence.executionProgress, '0/68 executed');
  assert.equal(response.data.identityKeys.ensPrimaryNameRollout.completionEvidence.transactionHashCount, 0);
  assert.deepEqual(response.data.identityKeys.ensPrimaryNameRollout.completionEvidence.transactionHashes, []);
  assert.equal(response.data.identityKeys.ensPrimaryNameRollout.completionEvidence.uncreatedNameCount, 67);
  assert.equal(response.data.identityKeys.ensPrimaryNameRollout.walletRecordMismatch.id, 'onchainlead-wallet-record-mismatch');
  assert.deepEqual(
    response.data.identityKeys.ensPrimaryNameRollout.requiredExecutionGates.map((gate) => gate.id),
    [
      'authorized-controller-signer',
      'isolated-custody-attestations',
      'numeric-spend-cap',
      'broadcaster-authority',
    ],
  );
  assert.equal(
    response.data.identityKeys.ensPrimaryNameRollout.futureAgentProvisioning.status,
    'future-agent-provisioning-required',
  );
  assert.doesNotMatch(serialized, /rawPrivateKey|secretKey|mnemonic|seedPhrase/);
  assert.match(serialized, /controller-signed challenge/);
  assert.match(serialized, /blocked-without-explicit-controller-or-safe-approval/);
  assert.doesNotMatch(serialized, /live-contract-ready|staging-ready|rollout complete|68\/68 executed|completed successfully|ready to execute/i);
});

test('identity and keys JSON exposes the contributor-signing rollout gates with public references', () => {
  const identityRoute = JSON_ROUTE_MAP.get('/identity-keys.json');
  const response = buildJsonResponse(identityRoute, '2026-07-06T00:00:00.000Z');
  const rolloutGates = response.data.identityKeys.rolloutGates;

  assertContributorSigningRolloutGates(rolloutGates);
});

test('identity and keys HTML renders rollout-gate summary and blocker state without secret material', () => {
  const html = renderIdentityKeysPage();

  assert.match(html, /rollout[- ]gate|gate summary/i);
  assert.match(html, /blocker[- ]state/i);

  for (const gateId of CONTRIBUTOR_SIGNING_ROLLOUT_GATE_IDS) {
    const renderedGateLabel = gateId.replace(/[A-Z]/g, (letter) => `[- /_]?${letter.toLowerCase()}`);
    assert.match(html, new RegExp(renderedGateLabel, 'i'), `${gateId} gate should be rendered`);
  }

  // Gate summaries humanize the machine status slug: the human page renders the
  // public "Coming soon" state, never the raw `status: blocked` gate slug. The
  // raw slug stays on /identity-keys.json (asserted in the JSON contract test).
  // Truthful blocker prose is retained as a documented human-view exemption.
  assert.doesNotMatch(html, /status:\s*blocked/i);
  assert.match(html, /status: Coming soon/);
  assert.match(html, /blocker: Pending public staging validation/);

  assert.doesNotMatch(html, PUBLIC_ROLLOUT_GATE_REDACTION_PATTERN);
});

test('agents route advertises prelaunch registry management rather than manual-only intake', () => {
  const agentsRoute = JSON_ROUTE_MAP.get('/agents.json');
  const response = buildJsonResponse(agentsRoute, '2026-07-06T00:00:00.000Z');
  const submitStep = response.data.contributionWorkflow.find((step) => step.id === 'submit-review-packet');
  const serializedResponse = JSON.stringify(response);

  assert.equal(response.status, 'prelaunch-registry-under-review');
  assert.doesNotMatch(serializedResponse, RAW_BRAIN_MEMORY_ID_PATTERN);
  assert.equal(response.data.registryManagement.status, LIVE_AGENT_REGISTRY.status);
  assert.equal(response.data.registryManagement.currentState, REGISTRY_PROFILE_PUBLICATION_NOTICE);
  assert.equal(response.data.intakePolicy.currentState, REGISTRY_PROFILE_PUBLICATION_NOTICE);
  assert.equal(response.data.identityKeys.route, '/identity-keys.json');
  assert.equal(response.data.contributionWorkflow.length, CONTRIBUTION_WORKFLOW.length);
  assert.equal(submitStep.route, '/contribution-intents');
  assert.deepEqual(submitStep.alternateRoutes, ['/gateway/contribution-intents', '/mcp']);
  assert.equal(response.data.agents.length, APPROVED_AGENT_PROFILES.length);
  assert.ok(response.data.agents.length > 0);
  assert.ok(
    response.data.agentProfileSchema.properties.contact.properties.kind.enum.includes('internal-route'),
    'schema should still describe review-gated internal-route contact records',
  );
  for (const agent of response.data.agents) {
    assert.ok(agent.identity, `${agent.id} should separate identity`);
    assert.ok(agent.trustEvidence, `${agent.id} should separate trust evidence`);
    assert.ok(agent.authority, `${agent.id} should separate authority`);
    assert.ok(agent.authorization, `${agent.id} should separate authorization`);
    assert.equal(agent.authorization.executionAllowed, false);
    assert.equal(agent.signedProfile.status, 'registry-reviewed-profile-record');
    assert.deepEqual(agent.contact, {
      kind: 'url',
      value: 'https://agent.bittrees.org/contribution-intents',
    });
    assert.doesNotMatch(JSON.stringify(agent), /default\/(?:lead|coder|researcher)/);
  }
  assert.ok(
    response.data.registryManagement.automatedManagement.allowedWithoutHumanReview.some((rule) =>
      rule.includes('signed heartbeats'),
    ),
    'expected signed heartbeat automation',
  );
  assert.ok(
    response.data.registryManagement.automatedManagement.requiresExplicitApproval.some((rule) =>
      rule.includes('spending'),
    ),
    'expected guarded authority changes',
  );
});

test('source registry is review-ready with citation and freshness metadata', () => {
  const sourcesRoute = JSON_ROUTE_MAP.get('/sources.json');
  const response = buildJsonResponse(sourcesRoute, '2026-07-06T00:00:00.000Z');
  const serializedResponse = JSON.stringify(response);

  assert.equal(response.status, 'ready-for-review');
  assert.doesNotMatch(serializedResponse, RAW_BRAIN_MEMORY_ID_PATTERN);
  assert.ok(response.data.reviewRegistry.requiredFields.includes('citationTargets'));
  for (const source of response.data.sources) {
    assert.ok(source.citationTargets.length > 0, `${source.id} should have citation targets`);
    assert.ok(source.owner, `${source.id} should have owner`);
    assert.ok(source.reviewer, `${source.id} should have reviewer`);
    assert.ok(source.freshnessWindow, `${source.id} should have freshness window`);
    assert.ok(source.lastReviewedAt, `${source.id} should have last reviewed date`);
    assert.equal(typeof source.mutable, 'boolean', `${source.id} should have mutable flag`);
    assert.ok(source.publicPrivateStatus, `${source.id} should have public/private status`);
  }
  for (const claim of response.data.approvedClaims) {
    assert.ok(claim.citationTargets.length > 0, `${claim.id} should have citation targets`);
    assert.ok(claim.owner, `${claim.id} should have owner`);
    assert.ok(claim.reviewer, `${claim.id} should have reviewer`);
  }
  assert.equal(response.data.excludedClaimReview.length, EXCLUDED_CLAIM_REVIEW.length);
});

test('opportunities are actionable work items', () => {
  const opportunitiesRoute = JSON_ROUTE_MAP.get('/opportunities.json');
  const response = buildJsonResponse(opportunitiesRoute, '2026-07-06T00:00:00.000Z');

  for (const opportunity of response.data.opportunities) {
    assert.ok(opportunity.owner, `${opportunity.id} should have owner`);
    assert.ok(opportunity.status, `${opportunity.id} should have status`);
    assert.ok(opportunity.nextAction, `${opportunity.id} should have next action`);
    assert.ok(opportunity.priorityReason, `${opportunity.id} should have priority reason`);
    assert.match(opportunity.opportunityType, /^(internal|public|paid|research-only)$/);
  }
});

test('homepage and monitoring expose contribution workflow', () => {
  const htmlAsset = buildStaticAssets('2026-07-06T00:00:00.000Z').find((asset) => asset.path === 'index.html');
  const monitoringRoute = JSON_ROUTE_MAP.get('/monitoring.json');
  const response = buildJsonResponse(monitoringRoute, '2026-07-06T00:00:00.000Z');

  assert.match(htmlAsset.body, /Contribution workflow/);
  assert.match(htmlAsset.body, /Agent discovery/);
  assert.match(htmlAsset.body, /Status tracking/);
  assert.match(htmlAsset.body, /Discovery is read-only/);
  assert.match(htmlAsset.body, /Contributor application submission/);
  assert.equal(response.status, LAUNCH_FRESHNESS_MONITORING.status);
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/identity-keys'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/submission-status'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/reputation'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/terms'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/terms-of-use'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/privacy'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/onboarding'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/tou'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/api/health'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/mcp-docs'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/onboarding.json'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/gateway/contribution-intents'));
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/sources.json'));
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/onboarding.json'));
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/submission-status.json'));
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/reputation.json'));
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/terms-of-use.json'));
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/privacy.json'));
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/gateway/contribution-intents'));
  assert.ok(response.data.monitoring.claimDrift.baselineApprovedClaimIds.includes(APPROVED_CLAIMS[0].id));
  assert.ok(response.data.monitoring.claimDrift.baselineExcludedClaimIds.includes(EXCLUDED_CLAIM_REVIEW[0].id));
  assert.equal(response.data.monitoring.observability.responseHeaders.includes('X-Request-Id'), true);
  assert.equal(response.data.monitoring.observability.telemetryFields.includes('requestId'), true);
  assert.ok(response.data.monitoring.errorPathChecks.some((check) => (
    check.method === 'POST'
    && check.path === '/v1/registry/heartbeats'
    && check.expectedStatus === 400
    && check.forbiddenResponseText.includes('/var/task')
  )));
});

test('runtime health route exposes rollout and observability contracts', async () => {
  await withPortalServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { Accept: 'application/json' },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
    assert.ok(response.headers.get('x-request-id'));
    assert.equal(body.route, '/api/health');
    assert.equal(body.status, 'ok');
    assert.equal(body.health.overall, 'ok');
    assert.equal(body.observability.requestIdHeader, 'X-Request-Id');
    assert.ok(body.observability.telemetryFields.includes('requestId'));
    assert.equal(body.rollback.smokeContract, '/monitoring.json');
    assert.match(body.rollback.verificationCommand, /npm run rollout:check -- --base-url=<candidate-url> --rollback-url=<ready-production-url>/);
    assert.equal(body.reviewGate.publicAuthority, 'health status does not grant authority or approval');
    assert.ok(body.health.checks.some((check) => check.id === 'release-metadata'));
    assert.ok(body.health.checks.some((check) => check.id === 'request-correlation'));
    assert.ok(body.health.checks.some((check) => check.id === 'monitoring-contract'));
  });
});

test('workflow API supports discovery brief and status journeys', async () => {
  await withPortalServer(async (baseUrl) => {
    const listResponse = await fetch(`${baseUrl}/v1/workflow/opportunities?priority=high`);
    const listBody = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.equal(listBody.status, 'ready-for-triage');
    assert.ok(listBody.workflow.some((item) => item.id === 'available-work-listing'));
    assert.ok(listBody.workflow.some((item) => item.route === '/v1/workflow/opportunities'));
    assert.ok(listBody.workflow.some((item) => item.route === '/v1/workflow/opportunities/:opportunityId'));
    assert.ok(listBody.roleApplicationLinks.some((link) => link.rel === 'submission-intake'));
    assert.ok(listBody.roleApplicationLinks.some((link) => link.href === 'https://agent.bittrees.org/v1/workflow/opportunities'));
    assert.ok(listBody.roleApplicationLinks.some((link) => link.href === 'https://agent.bittrees.org/v1/workflow/registrations'));
    assert.ok(listBody.roleApplicationLinks.some((link) => link.href === 'https://agent.bittrees.org/v1/workflow/status'));
    assert.ok(listBody.opportunities.length >= 1);
    assert.equal(
      listBody.opportunities.some((opportunity) => ['lead', 'research-lead', 'ops-lead'].includes(opportunity.owner)),
      false,
    );

    const opportunityId = listBody.opportunities[0].id;
    const briefResponse = await fetch(`${baseUrl}/v1/workflow/opportunities/${opportunityId}`);
    const briefBody = await briefResponse.json();

    assert.equal(briefResponse.status, 200);
    assert.equal(briefBody.status, 'opportunity_brief_ready');
    assert.equal(briefBody.opportunity.id, opportunityId);
    assert.equal(['lead', 'research-lead', 'ops-lead'].includes(briefBody.opportunity.owner), false);
    assert.equal(briefBody.mcpTool, 'get_contribution_brief');
    assert.ok(briefBody.authorizedSubmissionRoutes.some((link) => link.href === '/contribution-intents'));
    assert.ok(briefBody.authorizedSubmissionRoutes.some((link) => link.href === '/v1/workflow/status'));

    const statusResponse = await fetch(`${baseUrl}/v1/workflow/status?id=${opportunityId}&kind=opportunity`);
    const statusBody = await statusResponse.json();

    assert.equal(statusResponse.status, 200);
    assert.equal(statusBody.status, 'status_found');
    assert.equal(statusBody.lookup.result.kind, 'opportunity');
    assert.equal(statusBody.humanRoute, '/submission-status');

    const invalidStatusResponse = await fetch(`${baseUrl}/v1/workflow/status?id=${opportunityId}&kind=wat`);
    const invalidStatusBody = await invalidStatusResponse.json();

    assert.equal(invalidStatusResponse.status, 400);
    assert.equal(invalidStatusBody.error, 'invalid_status_kind');
    assert.ok(invalidStatusBody.acceptedKinds.includes('opportunity'));
  });
});

test('onboarding page and registry feed are mounted routes', async () => {
  await withPortalServer(async (baseUrl) => {
    const onboardingResponse = await fetch(`${baseUrl}/onboarding`);
    const onboardingBody = await onboardingResponse.text();

    assert.equal(onboardingResponse.status, 200);
    assert.match(onboardingResponse.headers.get('content-type') ?? '', /^text\/html/);
    assert.match(onboardingBody, /Agent onboarding/);
    assert.match(onboardingBody, /\/onboarding\.json/);

    const registryResponse = await fetch(`${baseUrl}/v1/registry/agents`);
    const registryBody = await registryResponse.json();

    assert.equal(registryResponse.status, 200);
    assert.equal(registryBody.$schema, 'agent.bittrees.registry-feed.public.v1');
    assert.equal(registryBody.route, '/v1/registry/agents');
    assert.ok(Array.isArray(registryBody.records));
  });
});

test('public registry feed omits controller, contact, and arbitrary record metadata', () => {
  const response = buildPublicRegistryFeed({
    generated_at: '2026-07-13T00:00:00.000Z',
    records: [{
      schema_version: 'agent.registry.record.public.v1',
      agent_id: 'public-agent',
      controller_id: 'private-controller',
      sequence: 2,
      status: 'active',
      health: 'online',
      last_seen: '2026-07-13T00:00:00.000Z',
      last_verified_at: '2026-07-13T00:00:00.000Z',
      display_name: 'Public Agent',
      profile_uri: 'https://example.invalid/private-profile',
      metadata: { contact: 'private@example.invalid' },
      tags: ['internal'],
      revoked: false,
      record_version: 2,
      updated_at: '2026-07-13T00:00:00.000Z',
      public_safe: true,
      authority_state: {
        authority_changes_allowed: false,
        spend_allowed: false,
        execution_allowed: false,
      },
    }, {
      schema_version: 'agent.registry.record.public.v1',
      agent_id: 'private-agent',
      sequence: 1,
      status: 'active',
      health: 'online',
      last_seen: '2026-07-13T00:00:00.000Z',
      revoked: false,
      record_version: 1,
      updated_at: '2026-07-13T00:00:00.000Z',
      public_safe: false,
      authority_state: {
        authority_changes_allowed: false,
        spend_allowed: false,
        execution_allowed: false,
      },
    }],
  });

  assert.equal(response.route, '/v1/registry/agents');
  assert.deepEqual(response.records, [{
    schemaVersion: 'agent.registry.record.public.v1',
    agentId: 'public-agent',
    sequence: 2,
    status: 'active',
    health: 'online',
    lastSeen: '2026-07-13T00:00:00.000Z',
    lastVerifiedAt: '2026-07-13T00:00:00.000Z',
    displayName: 'Public Agent',
    revoked: false,
    recordVersion: 2,
    updatedAt: '2026-07-13T00:00:00.000Z',
    authorityState: {
      authorityChangesAllowed: false,
      spendAllowed: false,
      executionAllowed: false,
    },
  }]);
  assert.doesNotMatch(JSON.stringify(response), /private-agent/);
});

test('public registry feed route is readable and keeps registry writes unavailable', async () => {
  await withPortalServer(async (baseUrl) => {
    const feedResponse = await fetch(`${baseUrl}/v1/registry/agents`);
    const feed = await feedResponse.json();

    assert.equal(feedResponse.status, 200);
    assert.equal(feed.route, '/v1/registry/agents');
    assert.equal(feed.status, 'prelaunch-registry-under-review');
    assert.deepEqual(feed.records, []);
    assert.deepEqual(feed.privacy.omittedFields, [
      'controller identifiers',
      'public keys',
      'profile URIs',
      'descriptions',
      'metadata',
      'tags',
      'contact details',
    ]);
    assert.equal(feed.reviewGate.status, 'review_required_before_publication_or_assignment');
    assert.equal(feed.reviewGate.registryMutationAllowed, false);

    const writeResponse = await fetch(`${baseUrl}/v1/registry/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const writeBody = await writeResponse.json();

    assert.equal(writeResponse.status, 405);
    assert.equal(writeBody.error, 'method_not_allowed');
  });
});

test('registry export handler filters private records and projects approved records safely', async () => {
  const controlPlane = {
    async registryFeed() {
      return {
        generated_at: '2026-07-13T00:00:00.000Z',
        records: [{
          agent_id: 'public-agent',
          controller_id: 'private-controller',
          sequence: 2,
          status: 'active',
          health: 'online',
          last_seen: '2026-07-13T00:00:00.000Z',
          display_name: 'Public Agent',
          profile_uri: 'https://example.invalid/private-profile',
          metadata: { contact: 'private@example.invalid' },
          revoked: false,
          record_version: 2,
          updated_at: '2026-07-13T00:00:00.000Z',
          public_safe: true,
        }, {
          agent_id: 'private-agent',
          sequence: 1,
          status: 'active',
          health: 'online',
          last_seen: '2026-07-13T00:00:00.000Z',
          revoked: false,
          record_version: 1,
          updated_at: '2026-07-13T00:00:00.000Z',
          public_safe: false,
        }],
      };
    },
  };
  const req = {
    method: 'GET',
    url: '/v1/registry/agents',
    headers: { host: 'agent.bittrees.org' },
  };
  const res = {
    statusCode: 200,
    body: '',
    writeHead(statusCode) { this.statusCode = statusCode; },
    end(chunk) { if (chunk) this.body += chunk; },
  };

  await handleRegistryRequest(req, res, undefined, controlPlane);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body).records.map((record) => record.agentId), ['public-agent']);
  assert.doesNotMatch(res.body, /private-agent|private-controller|private-profile|private@example\.invalid/);
});

test('heartbeats route sanitizes unexpected filesystem failures instead of leaking them', async () => {
  const filesystemFailure = Object.assign(
    new Error("ENOENT: no such file or directory, mkdir '/var/task/var'"),
    { code: 'ENOENT', errno: -2, syscall: 'mkdir', path: '/var/task/var' },
  );
  const brokenControlPlane = {
    ingestSignedHeartbeat() {
      throw filesystemFailure;
    },
  };

  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/v1/registry/heartbeats';
  req.headers = {
    host: 'agent.bittrees.org',
    'content-type': 'application/json',
    'x-request-id': 'registry-heartbeat-test-01',
  };
  req.body = {};
  req.resume = () => req;

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      res.statusCode = statusCode;
      Object.assign(res.headers, headers);
    },
    end(chunk) {
      if (chunk) res.body += chunk;
    },
  };

  const errorLogs = [];
  const originalConsoleError = console.error;
  console.error = (line) => errorLogs.push(JSON.parse(line));
  try {
    await handleRegistryRequest(req, res, undefined, brokenControlPlane);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(res.body, /ENOENT/);
  assert.doesNotMatch(res.body, /var\/task/);
  assert.doesNotMatch(res.body, /mkdir/);

  const body = JSON.parse(res.body);
  assert.equal(res.headers['X-Request-Id'], 'registry-heartbeat-test-01');
  assert.equal(body.$schema, 'agent.registry.error.v1');
  assert.equal(body.error, 'internal_error');
  assert.equal(body.requestId, 'registry-heartbeat-test-01');
  assert.doesNotMatch(body.message, /ENOENT|var\/task|mkdir/);
  assert.equal(errorLogs.length, 1);
  assert.equal(errorLogs[0].requestId, 'registry-heartbeat-test-01');
  assert.equal(errorLogs[0].message, 'Registry request failed unexpectedly.');
  assert.match(errorLogs[0].errorMessage, /ENOENT/);
  assert.match(errorLogs[0].errorStack, /ENOENT/);
});

test('unexpected server-error logs redact secret-bearing exception text', async () => {
  const rawSecret = `Bearer sk-log-redaction-regression-${Math.random().toString(16).slice(2)}abcdef`;
  const brokenControlPlane = {
    ingestSignedHeartbeat() {
      throw new Error(`backend rejected credential ${rawSecret}`);
    },
  };

  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/v1/registry/heartbeats';
  req.headers = {
    host: 'agent.bittrees.org',
    'content-type': 'application/json',
    'x-request-id': 'registry-secret-log-test-01',
  };
  req.body = {};
  req.resume = () => req;

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      res.statusCode = statusCode;
      Object.assign(res.headers, headers);
    },
    end(chunk) {
      if (chunk) res.body += chunk;
    },
  };

  const errorLogs = [];
  const originalConsoleError = console.error;
  console.error = (line) => errorLogs.push(String(line));
  try {
    await handleRegistryRequest(req, res, undefined, brokenControlPlane);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(res.body, new RegExp(rawSecret));
  assert.equal(errorLogs.length, 1);
  assert.doesNotMatch(errorLogs.join('\n'), new RegExp(rawSecret));
  assert.match(errorLogs[0], /Registry request failed unexpectedly/);
});

test('portal telemetry logs request ids and stable error metadata for not found responses', async () => {
  const handler = createRequestHandler();
  const req = new EventEmitter();
  req.method = 'GET';
  req.url = '/does-not-exist';
  req.headers = {
    host: 'agent.bittrees.org',
    'x-request-id': 'portal-telemetry-test-01',
  };
  req.resume = () => req;

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      res.statusCode = statusCode;
      Object.assign(res.headers, headers);
    },
    end(chunk) {
      if (chunk) res.body += chunk;
    },
  };

  const entries = [];
  const originalConsoleLog = console.log;
  console.log = (line) => entries.push(JSON.parse(line));
  try {
    await handler(req, res);
  } finally {
    console.log = originalConsoleLog;
  }

  assert.equal(res.statusCode, 404);
  assert.equal(res.headers['X-Request-Id'], 'portal-telemetry-test-01');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].requestId, 'portal-telemetry-test-01');
  assert.equal(entries[0].status, 404);
  assert.equal(entries[0].error, 'not_found');
});

test('workflow registration route requires authorized bearer token and queues review records', async () => {
  const previousTokens = process.env.MCP_WRITE_TOKENS;
  process.env.MCP_WRITE_TOKENS = JSON.stringify({
    'test-workflow-token': {
      subject: 'external-workflow-agent',
      scopes: ['contributor:register'],
    },
  });

  try {
    await withPortalServer(async (baseUrl) => {
      const payload = {
        agentId: 'external-workflow-agent',
        displayName: 'External Workflow Agent',
        operator: 'External operator',
        contact: {
          kind: 'url',
          value: 'https://example.invalid/contact',
        },
        capabilities: ['source review'],
        evidencePolicy: 'Cite public route and source ids.',
      };

      const blocked = await fetch(`${baseUrl}/v1/workflow/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const blockedBody = await blocked.json();

      assert.equal(blocked.status, 401);
      assert.equal(blockedBody.requiredScope, 'contributor:register');

      const accepted = await fetch(`${baseUrl}/v1/workflow/registrations`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-workflow-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const acceptedBody = await accepted.json();

      assert.equal(accepted.status, 202);
      assert.equal(acceptedBody.status, 'queued_for_review');
      assert.equal(acceptedBody.registration.agentId, payload.agentId);
      assert.equal(acceptedBody.authorizedRoute, '/v1/workflow/registrations');
      assert.equal(acceptedBody.statusLookup, '/v1/workflow/status');
    });
  } finally {
    if (previousTokens === undefined) {
      delete process.env.MCP_WRITE_TOKENS;
    } else {
      process.env.MCP_WRITE_TOKENS = previousTokens;
    }
  }
});

test('workflow registration route rejects invalid payloads with a validation error', async () => {
  const previousTokens = process.env.MCP_WRITE_TOKENS;
  process.env.MCP_WRITE_TOKENS = JSON.stringify({
    'test-workflow-token': {
      subject: 'external-workflow-agent',
      scopes: ['contributor:register'],
    },
  });

  try {
    await withPortalServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/workflow/registrations`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-workflow-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: 'external-workflow-agent',
          operator: 'External operator',
          contact: {
            kind: 'url',
            value: 'https://example.invalid/contact',
          },
          capabilities: ['source review'],
          evidencePolicy: 'Cite public route evidence and source ids.',
        }),
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.error, 'registration_rejected');
      assert.equal(body.requiredScope, 'contributor:register');
      assert.match(body.message, /displayName is required/);
    });
  } finally {
    if (previousTokens === undefined) {
      delete process.env.MCP_WRITE_TOKENS;
    } else {
      process.env.MCP_WRITE_TOKENS = previousTokens;
    }
  }
});

test('mcp gateway contract exposes required contribution tools', () => {
  const mcpRoute = JSON_ROUTE_MAP.get('/mcp.json');
  const response = buildJsonResponse(mcpRoute, '2026-07-06T00:00:00.000Z');
  const toolNames = new Set(MCP_CONTRIBUTION_TOOLS.map((tool) => tool.name));

  for (const toolName of [
    'list_contribution_opportunities',
    'get_contribution_brief',
    'get_bittrees_context',
    'register_external_agent',
    'claim_contribution',
    'submit_contribution',
    'check_contribution_status',
    'respond_to_review_feedback',
    'get_agent_reputation',
    'lookup_contribution_attestation',
  ]) {
    assert.ok(toolNames.has(toolName), `missing ${toolName}`);
  }

  assert.equal(response.status, MCP_GATEWAY.status);
  assert.equal(response.data.gateway.path, '/mcp');
  assert.equal(response.data.reviewGate.productionMutationAllowed, false);
  assert.deepEqual(
    response.data.harnessImportTabs.map((tab) => tab.id),
    MCP_HARNESS_IMPORT_TABS.map((tab) => tab.id),
  );
  assert.deepEqual(
    response.data.externalMcpSafeguardIndex.map((entry) => entry.integrationId),
    EXTERNAL_MCP_SAFEGUARD_INDEX.map((entry) => entry.integrationId),
  );
  for (const entry of response.data.externalMcpSafeguardIndex) {
    assert.equal(entry.enforcementStatus, 'enforced-prelaunch');
    assert.equal(entry.verdict, 'ALLOW read-only; GATE write-like; BLOCK production authority');
    assert.ok(entry.enforcement.some((control) => control.surface === 'gateway audit trail'));
  }
});

test('public MCP review gates use role labels without internal reviewer routes', () => {
  const mcpRoute = JSON_ROUTE_MAP.get('/mcp.json');
  const mcpResponse = buildJsonResponse(mcpRoute, '2026-07-06T00:00:00.000Z');
  const listResult = callMcpTool('list_contribution_opportunities', { priority: 'high' });
  const briefResult = callMcpTool('get_contribution_brief', {
    opportunityId: 'source-registry-hardening',
  });
  const submitResult = callMcpTool('submit_contribution', {
    agentId: 'external-review-gate-test',
    opportunityId: 'source-registry-hardening',
    title: 'Review gate label regression packet',
    artifact: {
      kind: 'markdown',
      value: 'Confirm public review gate labels do not expose internal reviewer routes.',
    },
    evidence: ['portal-route:/mcp.json'],
  });

  const reviewGates = collectReviewGateRecords([mcpResponse, listResult, briefResult, submitResult]);

  assert.ok(reviewGates.length >= 4, 'expected public MCP route and tool review gate records');

  for (const reviewGate of reviewGates) {
    assert.equal(reviewGate.productionMutationAllowed, MCP_GATEWAY.productionMutationAllowed);
    assert.equal(reviewGate.persistenceMode, MCP_GATEWAY.persistenceMode);
    assert.equal(reviewGate.status, 'review_required_before_publication_or_assignment');
    assert.equal(reviewGate.policy, MCP_GATEWAY.reviewGate);
    assert.deepEqual(reviewGate.reviewers, [
      'owning lead',
      'implementation validator',
      'evidence and claims validator',
    ]);

    for (const label of reviewGate.reviewers) {
      assert.doesNotMatch(label, /default\/(?:coder|researcher)/);
      assert.doesNotMatch(label, /^M:/);
      assert.doesNotMatch(label, /^[a-z0-9-]+\/[a-z0-9-]+/);
    }
  }
});

test('public contribution surfaces hide internal role and route literals', () => {
  const publicSamples = [
    ['/', renderLandingPage()],
    ['/llms.txt', buildLlmsTxt()],
    ['/terms-of-use', renderTermsOfUsePage()],
    ['/privacy', renderPrivacyPage()],
    [
      '/submission-status',
      renderSubmissionStatusPage(new URLSearchParams('id=source-registry-hardening&kind=opportunity')),
    ],
    ['/reputation', renderReputationPage(new URLSearchParams('agentId=idacc-default-lead'))],
  ];

  for (const [path, routeDefinition] of JSON_ROUTE_MAP) {
    publicSamples.push([path, buildJsonResponse(routeDefinition, '2026-07-06T00:00:00.000Z')]);
  }

  const registrationResult = callMcpTool('register_external_agent', {
    agentId: 'external-public-safety-test',
    displayName: 'External Public Safety Test',
    operator: 'engineering-lead',
    contact: {
      kind: 'internal-route',
      value: 'engineering-team/backend-engineer',
    },
    capabilities: ['public response verification'],
    evidencePolicy: 'Cite public route evidence and keep internal routes out of public responses.',
  });
  const claimResult = callMcpTool('claim_contribution', {
    agentId: 'external-public-safety-test',
    opportunityId: 'source-registry-hardening',
    contributionSummary: 'Verify public contribution gateway responses are scrubbed before publication.',
    evidencePlan: ['portal-route:/mcp.json'],
  });
  const submissionResult = callMcpTool('submit_contribution', {
    agentId: 'external-public-safety-test',
    opportunityId: 'source-registry-hardening',
    title: 'Public content safety regression packet',
    artifact: {
      kind: 'markdown',
      value: 'Check public route and MCP responses for internal route-shaped literals.',
    },
    evidence: ['portal-route:/templates.json'],
    requestedReviewers: ['research-lead', 'ops-lead'],
  });

  publicSamples.push(
    ['mcp:list_contribution_opportunities', callMcpTool('list_contribution_opportunities', { priority: 'high' })],
    ['mcp:get_contribution_brief', callMcpTool('get_contribution_brief', { opportunityId: 'source-registry-hardening' })],
    ['mcp:get_bittrees_context', callMcpTool('get_bittrees_context', {})],
    ['mcp:register_external_agent', registrationResult],
    ['mcp:claim_contribution', claimResult],
    ['mcp:submit_contribution', submissionResult],
    [
      'mcp:check_contribution_status',
      callMcpTool('check_contribution_status', {
        id: submissionResult.structuredContent.submission.id,
        kind: 'submission',
      }),
    ],
    ['mcp:get_agent_reputation', callMcpTool('get_agent_reputation', { agentId: 'idacc-default-lead' })],
    [
      'mcp:lookup_contribution_attestation',
      callMcpTool('lookup_contribution_attestation', { contributionId: 'missing-submission' }),
    ],
  );

  for (const [label, value] of publicSamples) {
    assertPublicContentSafe(label, value);
  }
});

test('mcp docs render Codex Claude Desktop and Cursor import tabs', () => {
  const html = renderMcpGatewayPage();
  const docsHtml = renderMcpDocsPage();

  assert.match(html, /Harness imports/);
  assert.match(html, /mcp-tab-codex/);
  assert.match(html, /\[mcp_servers\.bittrees\]/);
  assert.match(html, /Claude Desktop/);
  assert.match(html, /mcp-stdio-proxy\.mjs/);
  assert.match(html, /Cursor/);
  assert.match(html, /\.cursor\/mcp\.json/);
  assert.match(html, /clip-path: inset\(50%\)/);
  assert.match(html, /#mcp-tab-codex:focus-visible/);
  assert.match(html, /aria-controls="mcp-panel-codex"/);
  assert.match(docsHtml, /<title>MCP docs - agent\.bittrees\.org<\/title>/);
  assert.match(docsHtml, /Human-readable setup documentation/);
  assert.match(docsHtml, /mcp-tab-codex/);
});

test('html pages constrain wide tables and code blocks', () => {
  const pages = [
    renderLandingPage(),
    renderMcpGatewayPage(),
    renderSubmissionStatusPage(),
    renderReputationPage(),
    renderIdentityKeysPage(),
  ];

  for (const html of pages) {
    assert.match(html, /table-layout: fixed/);
    assert.match(html, /overflow-wrap: anywhere/);
    assert.match(html, /pre code \{/);
  }
});

test('human pages expose shared primary navigation and route metadata', () => {
  const pages = [
    { path: '/', label: 'Home', html: renderLandingPage() },
    { path: '/mcp', label: 'Gateway', html: renderMcpGatewayPage() },
    { path: '/mcp-docs', label: 'Docs', html: renderMcpDocsPage() },
    { path: '/identity-keys', label: 'Identity', html: renderIdentityKeysPage() },
    { path: '/submission-status', label: 'Status', html: renderSubmissionStatusPage() },
    { path: '/reputation', label: 'Reputation', html: renderReputationPage() },
    { path: '/terms-of-use', label: 'Terms', html: renderTermsOfUsePage() },
    { path: '/privacy', label: 'Privacy', html: renderPrivacyPage() },
    { path: '/onboarding', label: 'Onboarding', html: renderOnboardingPage() },
  ];
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const page of pages) {
    assert.match(page.html, /aria-label="Primary portal routes"/);
    assert.match(
      page.html,
      new RegExp(`<a href="${escapeRegex(page.path)}" aria-current="page">${escapeRegex(page.label)}<\\/a>`),
    );
    assert.match(page.html, /<meta name="theme-color" content="#f6f7f2" \/>/);
  }
});

test('public status badges and route cards only use the five-state public vocabulary', () => {
  const allowed = new Set(Object.values(PUBLIC_STATUS_VOCABULARY));
  assert.deepEqual(
    [...allowed].sort(),
    ['Available', 'Coming soon', 'Legal review pending', 'Preview', 'Under review'],
  );

  const pages = [
    renderLandingPage(),
    renderMcpGatewayPage(),
    renderMcpDocsPage(),
    renderIdentityKeysPage(),
    renderSubmissionStatusPage(),
    renderReputationPage(),
    renderTermsOfUsePage(),
    renderPrivacyPage(),
    renderOnboardingPage(),
  ].join('\n');

  // Every header status badge collapses to one of the five public states.
  const badgeValues = [...pages.matchAll(/<span class="status">([^<]*)<\/span>/g)].map(
    (match) => match[1].trim(),
  );
  assert.ok(badgeValues.length > 0, 'expected at least one status badge');
  for (const value of badgeValues) {
    assert.ok(allowed.has(value), `status badge "${value}" is not in the public vocabulary`);
  }

  // Route-card status labels (the machine-route action grid) collapse too.
  const routeCardStatuses = [
    ...renderLandingPage().matchAll(/<article class="route-card">[\s\S]*?<span>([^<]*)<\/span>\s*<\/article>/g),
  ].map((match) => match[1].trim());
  assert.ok(routeCardStatuses.length > 0, 'expected route-card status labels');
  for (const value of routeCardStatuses) {
    assert.ok(allowed.has(value), `route-card status "${value}" leaks internal vocabulary`);
  }

  // Internal queue vocabulary must not appear in any status badge or route-card
  // status label. (Detailed technical evidence in page bodies is exempt.)
  const publicStatusLabels = [...badgeValues, ...routeCardStatuses].join(' | ').toLowerCase();
  for (const leak of [
    'ready-for-triage',
    'review-gated queue',
    'source-grounded-context-ready',
    'daily-smoke-ready',
    'prelaunch',
    'human-view-ready',
    'brief-ready',
  ]) {
    assert.ok(
      !publicStatusLabels.includes(leak.toLowerCase()),
      `internal label "${leak}" leaked into a public status label`,
    );
  }

  // The four honest blockers keep truthful public wording.
  assert.match(renderTermsOfUsePage(), /Legal review pending/);
  assert.match(renderPrivacyPage(), /Legal review pending/);
  assert.match(renderIdentityKeysPage(), /Coming soon/);
});

test('human status and reputation views render lookup results and caveats', () => {
  const statusHtml = renderSubmissionStatusPage(
    new URLSearchParams('id=source-registry-hardening&kind=opportunity'),
  );
  const reputationHtml = renderReputationPage(new URLSearchParams('agentId=idacc-default-lead'));
  const statusRoute = JSON_ROUTE_MAP.get('/submission-status.json');
  const reputationRoute = JSON_ROUTE_MAP.get('/reputation.json');
  const statusResponse = buildJsonResponse(statusRoute, '2026-07-06T00:00:00.000Z');
  const reputationResponse = buildJsonResponse(reputationRoute, '2026-07-06T00:00:00.000Z');

  assert.match(statusHtml, /Submission status/);
  assert.match(statusHtml, /check_contribution_status/);
  assert.match(statusHtml, /status_found/);
  assert.match(statusHtml, /source-registry-hardening/);
  assert.match(statusHtml, /from assignments, approvals, publication, and public attestations/);

  assert.match(reputationHtml, /Agent reputation/);
  assert.match(reputationHtml, /get_agent_reputation/);
  assert.match(reputationHtml, /reviewed_profile_found/);
  assert.match(reputationHtml, /Reputation is an evidence signal only/);
  assert.doesNotMatch(reputationHtml, /rawPrivateKey|secretKey|mnemonic|seedPhrase/);

  assert.equal(statusResponse.status, 'human-view-ready');
  assert.equal(statusResponse.data.lookupTool, 'check_contribution_status');
  assert.ok(statusResponse.data.acceptedKinds.includes('submission'));
  assert.equal(reputationResponse.status, 'human-view-ready');
  assert.equal(reputationResponse.data.lookupTool, 'get_agent_reputation');
  assert.ok(reputationResponse.data.knownAgentIds.includes('idacc-default-lead'));
});

test('mcp tool calls are review-gated and structured', () => {
  const listResult = callMcpTool('list_contribution_opportunities', { priority: 'high' });
  assert.equal(listResult.isError, false);
  assert.ok(listResult.structuredContent.count >= 1);

  const contextResult = callMcpTool('get_bittrees_context', {});
  assert.equal(contextResult.structuredContent.status, 'source-grounded-context-ready');
  assert.doesNotMatch(JSON.stringify(contextResult), RAW_BRAIN_MEMORY_ID_PATTERN);

  const submitResult = callMcpTool('submit_contribution', {
    agentId: 'external-agent-test',
    opportunityId: 'source-registry-hardening',
    title: 'Source registry review packet',
    artifact: {
      kind: 'markdown',
      value: 'Reviewed source registry entries with citation and freshness notes.',
    },
    evidence: ['memory:54', 'portal-route:/sources.json'],
  });

  assert.equal(submitResult.structuredContent.status, 'submission_queued_for_review');
  assert.equal(submitResult.structuredContent.reviewGate.productionMutationAllowed, false);
  assert.equal('attestation' in submitResult.structuredContent, false);

  const statusResult = callMcpTool('check_contribution_status', {
    id: submitResult.structuredContent.submission.id,
  });
  assert.equal(statusResult.structuredContent.status, 'not_found');
  assert.equal(statusResult.structuredContent.result, null);
});

test('mcp write-like tools reject authority wallet and transaction material', () => {
  assert.throws(
    () => callMcpTool('register_external_agent', {
      agentId: 'authority-escalation-test',
      displayName: 'Authority Escalation Test',
      operator: 'external operator',
      contact: {
        kind: 'url',
        value: 'https://example.invalid/contact',
      },
      capabilities: ['source review'],
      evidencePolicy: 'Cite sources and keep authority separate.',
      identityProof: {
        walletAddress: '0x0000000000000000000000000000000000000000',
      },
    }),
    /walletAddress is authority, wallet, signer, transaction, or controller material/,
  );

  assert.throws(
    () => callMcpTool('submit_contribution', {
      agentId: 'authority-escalation-test',
      opportunityId: 'source-registry-hardening',
      title: 'Unsafe transaction packet',
      artifact: {
        kind: 'markdown',
        value: 'Please execute governance action after review.',
      },
      evidence: ['portal-route:/sources.json'],
    }),
    /live transaction request/,
  );
});

test('mcp streamable http endpoint initializes and serves tools', async () => {
  await withPortalServer(async (baseUrl) => {
    const initialized = await mcpPost(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_GATEWAY.protocolVersion,
        capabilities: {},
        clientInfo: {
          name: 'portal-test-client',
          version: '0.1.0',
        },
      },
    });
    assert.equal(initialized.response.status, 200);
    assert.equal(initialized.json.result.protocolVersion, MCP_GATEWAY.protocolVersion);
    assert.ok(initialized.json.result.capabilities.tools);

    const listed = await mcpPost(baseUrl, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    assert.equal(listed.response.status, 200);
    assert.ok(listed.json.result.tools.some((tool) => tool.name === 'submit_contribution'));

    const called = await mcpPost(baseUrl, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_bittrees_context',
        arguments: {
          includeSources: false,
        },
      },
    });
    assert.equal(called.response.status, 200);
    assert.equal(called.json.result.structuredContent.status, 'source-grounded-context-ready');
  });
});

test('mcp status lookup rejects unsupported kinds at runtime', async () => {
  await withPortalServer(async (baseUrl) => {
    const rejected = await mcpPost(baseUrl, {
      jsonrpc: '2.0',
      id: 'unsupported-status-kind',
      method: 'tools/call',
      params: {
        name: 'check_contribution_status',
        arguments: {
          id: 'source-registry-hardening',
          kind: 'bogus',
        },
      },
    });

    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.json.id, 'unsupported-status-kind');
    assert.equal(rejected.json.error.code, -32602);
    assert.equal(rejected.json.error.message, 'Unsupported status lookup kind: bogus');
  });
});

test('MCP service fallback keeps anonymous and register-only status lookups opaque', async () => {
  const legacyTitle = 'Legacy MCP privacy regression fixture';
  const legacyArtifactValue = 'legacy-private-artifact-marker';
  const legacySubmission = callMcpTool('submit_contribution', {
    agentId: 'legacy-status-fixture-agent',
    opportunityId: 'source-registry-hardening',
    title: legacyTitle,
    artifact: { kind: 'markdown', value: legacyArtifactValue },
    evidence: ['portal-route:/sources.json'],
  }).structuredContent.submission;

  await withContributionIntentWriteFlags({
    MCP_WRITE_TOKENS: JSON.stringify({
      'token-status-owner': { subject: 'status-owner', scopes: ['contributor:submit'] },
      'token-status-owner-register-only': { subject: 'status-owner', scopes: ['contributor:register'] },
    }),
  }, async () => {
    await withPortalServer(async (baseUrl) => {
      const anonymous = await mcpPost(baseUrl, {
        jsonrpc: '2.0',
        id: 'anonymous-legacy-status',
        method: 'tools/call',
        params: {
          name: 'check_contribution_status',
          arguments: { id: legacySubmission.id, kind: 'submission' },
        },
      });

      assert.equal(anonymous.response.status, 200);
      assert.equal(anonymous.json.result.structuredContent.status, 'not_found');
      assert.equal(anonymous.json.result.structuredContent.result, null);
      assert.doesNotMatch(JSON.stringify(anonymous.json), new RegExp(`${legacyTitle}|${legacyArtifactValue}`));

      const submitted = await mcpPost(baseUrl, {
        jsonrpc: '2.0',
        id: 'authenticated-owner-submit',
        method: 'tools/call',
        params: {
          name: 'submit_contribution',
          arguments: {
            agentId: 'status-owner',
            opportunityId: 'source-registry-hardening',
            idempotencyKey: 'status-owner-regression-1',
            title: 'Authenticated owner status regression fixture',
            artifact: { kind: 'markdown', value: 'owner-visible-review-packet' },
            evidence: ['portal-route:/sources.json'],
          },
        },
      }, { Authorization: 'Bearer token-status-owner' });

      assert.equal(submitted.response.status, 200);
      const ownerSubmission = submitted.json.result.structuredContent.submission;
      const registerOnlyLookup = await mcpPost(baseUrl, {
        jsonrpc: '2.0',
        id: 'same-subject-register-only-status',
        method: 'tools/call',
        params: {
          name: 'check_contribution_status',
          arguments: { id: ownerSubmission.id, kind: 'submission' },
        },
      }, { Authorization: 'Bearer token-status-owner-register-only' });

      assert.equal(registerOnlyLookup.response.status, 200);
      assert.equal(registerOnlyLookup.json.result.structuredContent.status, 'not_found');
      assert.equal(registerOnlyLookup.json.result.structuredContent.result, null);

      const ownerLookup = await mcpPost(baseUrl, {
        jsonrpc: '2.0',
        id: 'authenticated-owner-status',
        method: 'tools/call',
        params: {
          name: 'check_contribution_status',
          arguments: { id: ownerSubmission.id, kind: 'submission' },
        },
      }, { Authorization: 'Bearer token-status-owner' });

      assert.equal(ownerLookup.response.status, 200);
      assert.equal(ownerLookup.json.result.structuredContent.status, 'status_found');
      assert.equal(ownerLookup.json.result.structuredContent.result.id, ownerSubmission.id);
    });
  });
});

test('mcp gateway audit trail structurally redacts bearer and nested secret payload fields', async () => {
  const headerSecret = 'audit-header-secret-5f8f3c';
  const apiKeySecret = 'audit-api-key-secret-72c1b8';
  const nestedSecret = 'audit-nested-token-secret-91d0a4';
  const bearerBodySecret = 'audit-bearer-body-secret-cc843d';

  await withPortalServer(async (baseUrl) => {
    const result = await mcpPost(baseUrl, {
      jsonrpc: '2.0',
      id: 'audit-redaction-regression',
      method: 'tools/call',
      params: {
        name: 'get_bittrees_context',
        arguments: {
          apiKey: apiKeySecret,
          nested: {
            accessToken: nestedSecret,
          },
          note: `Bearer ${bearerBodySecret}`,
        },
      },
    }, {
      Authorization: `Bearer ${headerSecret}`,
    });

    assert.equal(result.response.status, 200);
  });

  const auditEvent = getMcpAuditEvents().find(
    (event) => event.request?.jsonRpc?.id === 'audit-redaction-regression',
  );
  assert.ok(auditEvent, 'expected the MCP request to create an audit event');
  assert.equal(auditEvent.request.headers.authorization, '[REDACTED]');
  assert.equal(auditEvent.request.jsonRpc.params.arguments.apiKey, '[REDACTED]');
  assert.equal(auditEvent.request.jsonRpc.params.arguments.nested.accessToken, '[REDACTED]');
  assert.equal(auditEvent.request.jsonRpc.params.arguments.note, '[REDACTED]');

  const serializedAuditEvent = JSON.stringify(auditEvent);
  for (const secret of [headerSecret, apiKeySecret, nestedSecret, bearerBodySecret]) {
    assert.doesNotMatch(serializedAuditEvent, new RegExp(secret));
  }
});

test('security audit entries are tamper-evident and include authorization denials', async () => {
  await withContributionIntentWriteFlags({
    MCP_WRITE_TOKENS: JSON.stringify({
      'token-a-submit-only': {
        subject: 'agent-a',
        scopes: ['contributor:submit'],
        expiresAt: '2999-01-01T00:00:00.000Z',
      },
    }),
  }, async () => {
    await withPortalServer(async (baseUrl) => {
      const denied = await mcpPost(baseUrl, {
        jsonrpc: '2.0',
        id: 'audit-authz-denial',
        method: 'tools/call',
        params: {
          name: 'claim_contribution',
          arguments: {
            agentId: 'agent-a',
            opportunityId: 'source-registry-hardening',
            contributionSummary: 'Authorization denial audit coverage.',
            evidencePlan: ['portal-route:/sources.json'],
          },
        },
      }, {
        Authorization: 'Bearer token-a-submit-only',
      });

      assert.equal(denied.response.status, 403);
      assert.equal(denied.json.error.data.requiredScope, 'contributor:claim');
    });
  });

  const events = getSecurityAuditEvents();
  const denial = events.find((event) => (
    event.event_name === 'authz.check.deny'
    && event.action === 'claim_contribution'
    && event.reason.code === 'scope_forbidden'
  ));
  assert.ok(denial, 'expected an authz denial audit event');
  assert.equal(denial.actor.id, 'agent-a');
  assert.equal(denial.resource.type, 'mcp_tool');
  assert.equal(denial.decision, 'deny');
  assert.match(denial.integrity.event_hash, /^[a-f0-9]{64}$/);
  assert.match(denial.integrity.prev_hash, /^[a-f0-9]{64}$/);
  assert.match(denial.integrity.signature, /^sha256:[a-f0-9]{64}$/);
  assert.equal(verifySecurityAuditChain(events).ok, true);
  assert.equal(verifySecurityAuditChain(events.slice(1)).ok, true);

  const tampered = JSON.parse(JSON.stringify(events));
  tampered[tampered.length - 1].reason.code = 'tampered';
  const tamperedResult = verifySecurityAuditChain(tampered);
  assert.equal(tamperedResult.ok, false);
  assert.equal(tamperedResult.reason, 'event_hash_mismatch');
});

test('mcp error responses redact secret-looking request fields before logging', async () => {
  const rawSecret = `sk-mcp-error-redaction-${Math.random().toString(16).slice(2)}abcdef`;

  await withPortalServer(async (baseUrl) => {
    const result = await mcpPost(baseUrl, {
      jsonrpc: '2.0',
      id: 'mcp-error-secret-redaction',
      method: rawSecret,
    });

    assert.equal(result.response.status, 200);
    assert.equal(result.json.error.message, 'MCP request rejected.');
    assert.doesNotMatch(JSON.stringify(result.json), new RegExp(rawSecret));
  });

  const serializedMcpAudit = JSON.stringify(getMcpAuditEvents().filter(
    (event) => event.request?.jsonRpc?.id === 'mcp-error-secret-redaction',
  ));
  const serializedSecurityAudit = JSON.stringify(getSecurityAuditEvents().filter(
    (event) => event.request?.jsonRpc?.id === 'mcp-error-secret-redaction',
  ));
  assert.doesNotMatch(serializedMcpAudit, new RegExp(rawSecret));
  assert.doesNotMatch(serializedSecurityAudit, new RegExp(rawSecret));
});

test('contribution intent rejects value-level secrets without log or audit leakage', async () => {
  const rawSecret = `sk-secret-redaction-regression-${Math.random().toString(16).slice(2)}abcdef`;
  const logLines = [];
  const originalConsoleLog = console.log;

  await withContributionIntentWriteFlags({
    CONTRIBUTION_INTENTS_WRITE_ENABLED: 'true',
    CONTRIBUTION_INTENTS_DATA_DIR: fileURLToPath(new URL(`../test-results/contribution-secret-${Date.now()}`, import.meta.url)),
    MCP_WRITE_TOKENS: JSON.stringify({
      'secret-reject-token': { subject: 'secret-reject-agent', scopes: ['contributor:submit'] },
    }),
  }, async () => {
    console.log = (line) => logLines.push(String(line));
    try {
      await withPortalServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/gateway/contribution-intents`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer secret-reject-token',
            'Content-Type': 'application/json',
            'X-Request-Id': 'secret-redaction-regression-01',
          },
          body: JSON.stringify(buildValidContributionIntentPayload({
            contributor: {
              kind: 'agent',
              name: 'Secret Rejection Agent',
              agentId: 'secret-reject-agent',
              contactRoute: 'https://example.invalid/contact',
            },
            summary: `Prepare a review packet. Internal credential ${rawSecret} must be blocked.`,
          })),
        });
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.accepted, false);
        assert.equal(body.status, 'rejected');
        assert.equal(body.error, 'invalid_request');
        assert.match(body.errors.join('\n'), /API key|credential/i);
        assert.doesNotMatch(JSON.stringify(body), new RegExp(rawSecret));
      });
    } finally {
      console.log = originalConsoleLog;
    }
  });

  assert.doesNotMatch(logLines.join('\n'), new RegExp(rawSecret));
  const serializedAudit = JSON.stringify(getSecurityAuditEvents());
  assert.doesNotMatch(serializedAudit, new RegExp(rawSecret));
  assert.ok(getSecurityAuditEvents().some((event) => (
    event.event_name === 'admin.secret_access.blocked'
    && event.request_id === 'secret-redaction-regression-01'
  )));
});

test('mcp HTTP write-like tools require active scoped bearer tokens bound to agentId', async () => {
  await withContributionIntentWriteFlags({
    MCP_WRITE_TOKENS: JSON.stringify({
      'token-agent-a-claim': {
        subject: 'agent-a',
        scopes: ['contributor:claim'],
        issuedAt: '2026-07-14T00:00:00.000Z',
        expiresAt: '2999-01-01T00:00:00.000Z',
      },
      'token-agent-a-expired': {
        subject: 'agent-a',
        scopes: ['contributor:claim'],
        expiresAt: '2000-01-01T00:00:00.000Z',
      },
      'token-agent-a-revoked': {
        subject: 'agent-a',
        scopes: ['contributor:claim'],
        revoked: true,
      },
      'token-agent-a-register': { subject: 'agent-a', scopes: ['contributor:register'] },
    }),
  }, async () => {
    await withPortalServer(async (baseUrl) => {
      const claimMessage = {
        jsonrpc: '2.0',
        id: 'claim-auth',
        method: 'tools/call',
        params: {
          name: 'claim_contribution',
          arguments: {
            agentId: 'agent-a',
            opportunityId: 'source-registry-hardening',
            contributionSummary: 'Review the source registry without requesting production mutation.',
            evidencePlan: ['portal-route:/sources.json'],
          },
        },
      };

      const missing = await mcpPost(baseUrl, claimMessage);
      assert.equal(missing.response.status, 401);
      assert.equal(missing.json.error.code, -32001);

      const wrongScope = await mcpPost(baseUrl, claimMessage, {
        Authorization: 'Bearer token-agent-a-register',
      });
      assert.equal(wrongScope.response.status, 403);
      assert.equal(wrongScope.json.error.code, -32003);

      const expired = await mcpPost(baseUrl, claimMessage, {
        Authorization: 'Bearer token-agent-a-expired',
      });
      assert.equal(expired.response.status, 401);
      assert.equal(expired.json.error.code, -32001);
      assert.match(expired.json.error.message, /expired/);

      const revoked = await mcpPost(baseUrl, claimMessage, {
        Authorization: 'Bearer token-agent-a-revoked',
      });
      assert.equal(revoked.response.status, 401);
      assert.equal(revoked.json.error.code, -32001);
      assert.match(revoked.json.error.message, /revoked/);

      const mismatch = await mcpPost(baseUrl, {
        ...claimMessage,
        params: {
          ...claimMessage.params,
          arguments: {
            ...claimMessage.params.arguments,
            agentId: 'agent-b',
          },
        },
      }, {
        Authorization: 'Bearer token-agent-a-claim',
      });
      assert.equal(mismatch.response.status, 403);
      assert.match(mismatch.json.error.message, /subject must match/);

      const expiredStatusLookup = await fetch(`${baseUrl}/v1/workflow/status?id=source-registry-hardening&kind=opportunity`, {
        headers: {
          Authorization: 'Bearer token-agent-a-expired',
        },
      });
      const expiredStatusLookupBody = await expiredStatusLookup.json();
      assert.equal(expiredStatusLookup.status, 401);
      assert.equal(expiredStatusLookupBody.error, 'unauthorized');
      assert.equal(expiredStatusLookupBody.code, 'credential_expired');

      const accepted = await mcpPost(baseUrl, claimMessage, {
        Authorization: 'Bearer token-agent-a-claim',
      });
      const reviewGate = accepted.json.result.structuredContent.reviewGate;

      assert.equal(accepted.response.status, 200);
      assert.equal(accepted.json.result.structuredContent.status, 'claim_pending_owner_review');
      assert.equal(accepted.json.result.structuredContent.claim.authenticatedSubject, 'agent-a');
      assert.equal(reviewGate.contributorCapabilityGranted, false);
      assert.equal(reviewGate.walletAuthorityGranted, false);
      assert.equal(reviewGate.transactionSubmissionAllowed, false);
      assert.equal(reviewGate.registryMutationAllowed, false);
    });
  });
});

test('authenticated MCP submissions create the workflow-owned pending attestation', async () => {
  await withContributionIntentWriteFlags({
    MCP_WRITE_TOKENS: JSON.stringify({
      'token-attestation-agent': { subject: 'attestation-agent', scopes: ['contributor:submit'] },
    }),
  }, async () => {
    await withPortalServer(async (baseUrl) => {
      const submitted = await mcpPost(baseUrl, {
        jsonrpc: '2.0',
        id: 'mcp-attestation-submit',
        method: 'tools/call',
        params: {
          name: 'submit_contribution',
          arguments: {
            agentId: 'attestation-agent',
            opportunityId: 'source-registry-hardening',
            title: 'Attestation mapping regression packet',
            idempotencyKey: 'mcp-attestation-submit-1',
            artifact: { kind: 'markdown', value: 'A review-only submission.' },
            evidence: ['portal-route:/sources.json'],
          },
        },
      }, { Authorization: 'Bearer token-attestation-agent' });

      assert.equal(submitted.response.status, 200);
      const result = submitted.json.result.structuredContent;
      assert.equal(result.attestation.publicAttestation, false);
      assert.equal(result.attestation.attestationStatus, 'review_pending_not_publicly_attested');
      assert.equal(result.attestation.submissionId, result.submission.id);

      const replayed = await mcpPost(baseUrl, {
        jsonrpc: '2.0',
        id: 'mcp-attestation-submit-replay',
        method: 'tools/call',
        params: {
          name: 'submit_contribution',
          arguments: {
            agentId: 'attestation-agent',
            opportunityId: 'source-registry-hardening',
            title: 'Attestation mapping regression packet',
            idempotencyKey: 'mcp-attestation-submit-1',
            artifact: { kind: 'markdown', value: 'A review-only submission.' },
            evidence: ['portal-route:/sources.json'],
          },
        },
      }, { Authorization: 'Bearer token-attestation-agent' });
      assert.equal(replayed.response.status, 200);
      assert.equal(replayed.json.result.structuredContent.submission.id, result.submission.id);
      assert.equal(replayed.json.result.structuredContent.attestation.id, result.attestation.id);

      const status = await fetch(`${baseUrl}/v1/workflow/status?id=${encodeURIComponent(result.attestation.id)}&kind=attestation`, {
        headers: { Authorization: 'Bearer token-attestation-agent' },
      });
      const statusBody = await status.json();
      assert.equal(status.status, 200);
      assert.equal(statusBody.lookup.status, 'status_found');
      assert.equal(statusBody.lookup.result.id, result.attestation.id);
      assert.equal(statusBody.lookup.result.submissionId, result.submission.id);
      assert.equal(statusBody.lookup.result.publicAttestation, false);
    });
  });
});

test('mcp stdio proxy forwards JSON-RPC lines to streamable http gateway', async () => {
  await withProxyTargetServer(async ({ baseUrl, received }) => {
    const scriptPath = fileURLToPath(new URL('../scripts/mcp-stdio-proxy.mjs', import.meta.url));
    const child = spawn(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        BITTREES_AGENT_MCP_URL: `${baseUrl}${MCP_GATEWAY.path}`,
        MCP_PROTOCOL_VERSION: MCP_GATEWAY.protocolVersion,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const output = createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
      terminal: false,
    });
    const lines = output[Symbol.asyncIterator]();

    try {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 'stdio-list', method: 'tools/list', params: {} })}\n`);
      const listed = JSON.parse(await nextLine(lines, () => stderr));

      assert.equal(listed.id, 'stdio-list');
      assert.equal(listed.result.forwardedMethod, 'tools/list');
      assert.equal(listed.result.protocolVersionHeader, MCP_GATEWAY.protocolVersion);
      assert.match(listed.result.acceptHeader, /application\/json/);

      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
      await waitForCondition(() => received.length === 2, () => stderr);
      assert.equal(received[1].message.method, 'notifications/initialized');

      child.stdin.write('not-json\n');
      const parseError = JSON.parse(await nextLine(lines, () => stderr));
      assert.equal(parseError.id, null);
      assert.equal(parseError.error.code, -32700);

      child.stdin.end();
      const [exitCode] = await once(child, 'exit');
      assert.equal(exitCode, 0, stderr);
    } finally {
      output.close();
      if (child.exitCode === null) {
        child.kill('SIGTERM');
      }
    }
  });
});

test('mcp endpoint rejects browser-origin mismatch and server-initiated sse get', async () => {
  await withPortalServer(async (baseUrl) => {
    const originRejected = await fetch(`${baseUrl}${MCP_GATEWAY.path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        Origin: 'https://not-bittrees.example',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    assert.equal(originRejected.status, 403);
    assert.equal(originRejected.headers.get('access-control-allow-origin'), null);

    const sseRejected = await fetch(`${baseUrl}${MCP_GATEWAY.path}`, {
      headers: {
        Accept: 'text/event-stream',
      },
    });
    assert.equal(sseRejected.status, 405);
  });
});

test('sensitive JSON routes never use wildcard CORS', async () => {
  await withPortalServer(async (baseUrl) => {
    const mcpPreflight = await fetch(`${baseUrl}${MCP_GATEWAY.path}`, {
      method: 'OPTIONS',
      headers: { Origin: baseUrl },
    });
    assert.equal(mcpPreflight.status, 204);
    assert.equal(mcpPreflight.headers.get('access-control-allow-origin'), baseUrl);
    assert.notEqual(mcpPreflight.headers.get('access-control-allow-origin'), '*');

    const workflowStatus = await fetch(`${baseUrl}/v1/workflow/status?id=source-registry-hardening&kind=opportunity`, {
      headers: { Origin: baseUrl },
    });
    assert.equal(workflowStatus.status, 200);
    assert.equal(workflowStatus.headers.get('access-control-allow-origin'), null);
  });
});

test('mcp endpoint rate limits repeated POSTs before body handling', async () => {
  await withContributionIntentWriteFlags({
    MCP_POST_RATE_LIMIT_MAX: '2',
    MCP_POST_RATE_LIMIT_WINDOW_MS: '60000',
  }, async () => {
    await withPortalServer(async (baseUrl) => {
      const headers = {
        'X-Forwarded-For': `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
      };

      for (let index = 0; index < 2; index += 1) {
        const { response, json } = await mcpPost(baseUrl, {
          jsonrpc: '2.0',
          id: `rate-${index}`,
          method: 'tools/list',
          params: {},
        }, headers);

        assert.equal(response.status, 200);
        assert.ok(Array.isArray(json.result.tools));
      }

      const limited = await mcpPost(baseUrl, {
        jsonrpc: '2.0',
        id: 'rate-limited',
        method: 'tools/list',
        params: {},
      }, headers);

      assert.equal(limited.response.status, 429);
      assert.equal(limited.response.headers.has('retry-after'), true);
      assert.equal(limited.json.error, 'rate_limited');
    });
  });
});

test('mcp endpoint accepts pre-parsed JSON request bodies', async () => {
  const handler = createRequestHandler();
  const req = new EventEmitter();
  req.method = 'POST';
  req.url = MCP_GATEWAY.path;
  req.headers = {
    host: 'agent.bittrees.org',
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'mcp-protocol-version': MCP_GATEWAY.protocolVersion,
  };
  req.body = {
    jsonrpc: '2.0',
    id: 'pre-parsed-body',
    method: 'initialize',
    params: {
      protocolVersion: MCP_GATEWAY.protocolVersion,
      capabilities: {},
      clientInfo: { name: 'pre-parsed-test', version: '0.1.0' },
    },
  };
  req.resume = () => req;

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      res.statusCode = statusCode;
      Object.assign(res.headers, headers);
    },
    end(chunk) {
      if (chunk) res.body += chunk;
    },
  };

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['MCP-Protocol-Version'], MCP_GATEWAY.protocolVersion);

  const body = JSON.parse(res.body);
  assert.equal(body.result?.protocolVersion, MCP_GATEWAY.protocolVersion);
});

test('mcp endpoint rejects oversized and deeply nested pre-parsed bodies', async () => {
  async function postPreparsedBody(body) {
    const handler = createRequestHandler();
    const req = new EventEmitter();
    req.method = 'POST';
    req.url = MCP_GATEWAY.path;
    req.headers = {
      host: 'agent.bittrees.org',
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_GATEWAY.protocolVersion,
    };
    req.body = body;
    req.resume = () => req;

    const res = {
      statusCode: 200,
      headers: {},
      body: '',
      writeHead(statusCode, headers) {
        res.statusCode = statusCode;
        Object.assign(res.headers, headers);
      },
      end(chunk) {
        if (chunk) res.body += chunk;
      },
    };

    await handler(req, res);
    return { res, body: JSON.parse(res.body) };
  }

  const oversized = await postPreparsedBody({
    jsonrpc: '2.0',
    id: 'oversized-preparsed-body',
    method: 'tools/call',
    params: {
      name: 'get_bittrees_context',
      arguments: {
        evidencePolicy: 'x'.repeat(1_100_000),
      },
    },
  });
  assert.equal(oversized.res.statusCode, 413);
  assert.match(oversized.body.error.message, /size limit|too deeply nested|too many fields/);

  let nested = { value: true };
  for (let index = 0; index < 20; index += 1) nested = { nested };
  const deep = await postPreparsedBody(nested);
  assert.equal(deep.res.statusCode, 413);
  assert.match(deep.body.error.message, /deeply nested/);
});

test('mcp endpoint rejects oversized request bodies with 413', async () => {
  await withPortalServer(async (baseUrl) => {
    const oversized = await fetch(`${baseUrl}${MCP_GATEWAY.path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': MCP_GATEWAY.protocolVersion,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'oversized-body',
        method: 'tools/call',
        params: {
          name: 'register_external_agent',
          arguments: {
            agentId: 'oversized-test-agent',
            displayName: 'Oversized Test Agent',
            operator: 'backend-engineer',
            contact: {
              kind: 'internal-route',
              value: 'approved-review-contact',
            },
            capabilities: ['schema validation'],
            evidencePolicy: 'x'.repeat(1_100_000),
          },
        },
      }),
    });

    const body = await oversized.json();

    assert.equal(oversized.status, 413);
    assert.equal(body.error.code, -32000);
    assert.match(body.error.message, /1 MiB limit/);
  });
});

test('idacc release snapshot includes verifiable download metadata', () => {
  const releaseRoute = JSON_ROUTE_MAP.get('/idacc/releases.json');
  const response = buildJsonResponse(releaseRoute, '2026-07-06T00:00:00.000Z');
  const [asset] = IDACC_RELEASE_SNAPSHOT.latest.assets;

  assert.equal(response.status, 'release-snapshot-ready');
  assert.equal(IDACC_RELEASE_SNAPSHOT.latest.tag, 'v0.1.645');
  assert.match(IDACC_RELEASE_SNAPSHOT.latest.releaseUrl, /^https:\/\/github\.com\/bobofbuilding\/idacc\/releases\/tag\//);
  assert.match(asset.url, /^https:\/\/github\.com\/bobofbuilding\/idacc\/releases\/download\//);
  assert.equal(asset.sha256, '0c61a123f8d9107bcd1357bd889c57fe2688ded175481f0e958c72dd70ae8736');
  assert.equal(IDACC_RELEASE_SNAPSHOT.latest.tagCommitSha, '0cbd97515b38d46c166c8effbc051ff86091fd7b');
  assert.match(asset.sha256Provenance.localVerification, /118044815-byte asset/);
  assert.equal(response.data.releases.length, 1);
});
