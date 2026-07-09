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
  APPROVED_CLAIMS,
  APPROVED_AGENT_PROFILES,
  CONTRIBUTION_PRIVACY_NOTICE,
  CONTRIBUTION_LANES,
  CONTRIBUTION_WORKFLOW,
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
  REGISTRY_PROFILE_PUBLICATION_NOTICE,
  ROUTE_DEFINITIONS,
  UNIVERSAL_PORTAL_DISCLAIMER,
  buildJsonResponse,
  buildLlmsTxt,
  buildPortalManifest,
  buildStaticAssets,
  callMcpTool,
  createRequestHandler,
  renderIdentityKeysPage,
  renderLandingPage,
  renderMcpDocsPage,
  renderMcpGatewayPage,
  renderReputationPage,
  renderSubmissionStatusPage,
} from '../src/portal.mjs';

async function withPortalServer(callback) {
  const server = createServer(createRequestHandler());
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

async function mcpPost(baseUrl, body) {
  const response = await fetch(`${baseUrl}${MCP_GATEWAY.path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': MCP_GATEWAY.protocolVersion,
    },
    body: JSON.stringify(body),
  });

  return {
    response,
    json: await response.json(),
  };
}

const CONTRIBUTION_INTENT_WRITE_FLAG_NAMES_FOR_TEST = [
  'CONTRIBUTION_INTENTS_WRITE_ENABLED',
  'CONTRIBUTION_INTENTS_ENABLED',
  'PORTAL_ENABLE_CONTRIBUTION_INTENTS',
];

function withContributionIntentWriteFlags(envOverrides, callback) {
  const previousValues = new Map(
    CONTRIBUTION_INTENT_WRITE_FLAG_NAMES_FOR_TEST.map((flagName) => [flagName, process.env[flagName]]),
  );

  try {
    for (const flagName of CONTRIBUTION_INTENT_WRITE_FLAG_NAMES_FOR_TEST) {
      delete process.env[flagName];
    }

    for (const [flagName, value] of Object.entries(envOverrides)) {
      process.env[flagName] = value;
    }

    return callback();
  } finally {
    for (const [flagName, value] of previousValues) {
      if (value === undefined) {
        delete process.env[flagName];
      } else {
        process.env[flagName] = value;
      }
    }
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

test('static build includes all advertised routes', () => {
  const manifest = buildPortalManifest('2026-07-06T00:00:00.000Z');
  const assets = buildStaticAssets('2026-07-06T00:00:00.000Z');
  const assetPaths = new Set(assets.map((asset) => asset.path));

  assert.deepEqual(
    manifest.routes.map((route) => route.path),
    ROUTE_DEFINITIONS.map((route) => route.path),
  );

  assert.ok(assetPaths.has('index.html'));
  assert.ok(assetPaths.has('identity-keys/index.html'));
  assert.ok(assetPaths.has('submission-status/index.html'));
  assert.ok(assetPaths.has('reputation/index.html'));
  assert.ok(assetPaths.has('llms.txt'));
  assert.ok(assetPaths.has('sources.json'));
  assert.ok(assetPaths.has('opportunities.json'));
  assert.equal(assetPaths.has('contribution-intents'), false);
  assert.equal(assetPaths.has('gateway/contribution-intents'), false);
  assert.equal(assetPaths.has('mcp/index.html'), false);
  assert.ok(assetPaths.has('mcp-docs/index.html'));
  assert.ok(assetPaths.has('mcp.json'));
  assert.ok(assetPaths.has('submission-status.json'));
  assert.ok(assetPaths.has('reputation.json'));
  assert.ok(assetPaths.has('identity-keys.json'));
  assert.ok(assetPaths.has('monitoring.json'));
});

test('html pages emit description and Open Graph metadata', () => {
  const htmlByRoute = new Map([
    ['/', renderLandingPage()],
    ['/identity-keys', renderIdentityKeysPage()],
    ['/submission-status', renderSubmissionStatusPage()],
    ['/reputation', renderReputationPage()],
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
    'Submit non-confidential information only. Do not submit private keys, seed phrases, raw signatures, bearer tokens, session secrets, API keys, identity documents, tax forms, sanctions materials, wallet secrets, privileged legal material, regulated personal data, or third-party confidential information through this portal. Submission data is used for staged contribution-intent routing and review, may be visible to operators, reviewers, infrastructure providers, and audit logs used to run the service, and may be retained in internal review records for audit purposes. Use `[approved privacy contact route]` for privacy questions, correction requests, or deletion requests.',
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

test('portal security headers enforce browser launch gate', () => {
  assert.match(PORTAL_SECURITY_HEADERS['Content-Security-Policy'], /default-src 'none'/);
  assert.match(PORTAL_SECURITY_HEADERS['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(PORTAL_SECURITY_HEADERS['X-Frame-Options'], 'DENY');
  assert.equal(PORTAL_SECURITY_HEADERS['Referrer-Policy'], 'no-referrer');
});

test('vercel catch-all headers mirror the portal launch gate', () => {
  const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const catchAllHeaders = vercelConfig.headers.find((entry) => entry.source === '/(.*)')?.headers ?? [];
  const configuredHeaders = Object.fromEntries(catchAllHeaders.map((header) => [header.key, header.value]));

  for (const [header, value] of Object.entries(PORTAL_SECURITY_HEADERS)) {
    assert.equal(configuredHeaders[header], value);
  }

  assert.equal(configuredHeaders['X-Content-Type-Options'], 'nosniff');
  assert.equal(configuredHeaders['X-Robots-Tag'], 'noindex, nofollow');
});

test('identity and keys page renders the prelaunch readiness contract', () => {
  const html = renderIdentityKeysPage();

  assert.match(html, /Identity and keys\./);
  assert.match(html, /agent-signed-staged-state-with-guarded-authority-changes/);
  assert.match(html, /blocked-without-explicit-controller-or-safe-approval/);
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
  assert.doesNotMatch(serialized, /rawPrivateKey|secretKey|mnemonic|seedPhrase/);
  assert.match(serialized, /controller-signed challenge/);
  assert.match(serialized, /blocked-without-explicit-controller-or-safe-approval/);
});

test('agents route advertises prelaunch registry management rather than manual-only intake', () => {
  const agentsRoute = JSON_ROUTE_MAP.get('/agents.json');
  const response = buildJsonResponse(agentsRoute, '2026-07-06T00:00:00.000Z');

  assert.equal(response.status, 'prelaunch-registry-under-review');
  assert.equal(response.data.registryManagement.status, LIVE_AGENT_REGISTRY.status);
  assert.equal(response.data.registryManagement.currentState, REGISTRY_PROFILE_PUBLICATION_NOTICE);
  assert.equal(response.data.intakePolicy.currentState, REGISTRY_PROFILE_PUBLICATION_NOTICE);
  assert.equal(response.data.identityKeys.route, '/identity-keys.json');
  assert.equal(response.data.contributionWorkflow.length, CONTRIBUTION_WORKFLOW.length);
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

  assert.equal(response.status, 'ready-for-review');
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
  assert.match(htmlAsset.body, /Choose lane/);
  assert.equal(response.status, LAUNCH_FRESHNESS_MONITORING.status);
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/identity-keys'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/submission-status'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/reputation'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/mcp-docs'));
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/gateway/contribution-intents'));
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/sources.json'));
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/submission-status.json'));
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/reputation.json'));
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/gateway/contribution-intents'));
  assert.ok(response.data.monitoring.claimDrift.baselineApprovedClaimIds.includes(APPROVED_CLAIMS[0].id));
  assert.ok(response.data.monitoring.claimDrift.baselineExcludedClaimIds.includes(EXCLUDED_CLAIM_REVIEW[0].id));
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
  assert.match(docsHtml, /<title>MCP docs - agent\.bittrees\.org<\/title>/);
  assert.match(docsHtml, /Human-readable setup documentation/);
  assert.match(docsHtml, /mcp-tab-codex/);
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
  assert.equal(submitResult.structuredContent.attestation.publicAttestation, false);

  const statusResult = callMcpTool('check_contribution_status', {
    id: submitResult.structuredContent.submission.id,
  });
  assert.equal(statusResult.structuredContent.status, 'status_found');
  assert.equal(statusResult.structuredContent.result.kind, 'submission');
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

    const sseRejected = await fetch(`${baseUrl}${MCP_GATEWAY.path}`, {
      headers: {
        Accept: 'text/event-stream',
      },
    });
    assert.equal(sseRejected.status, 405);
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
  assert.equal(IDACC_RELEASE_SNAPSHOT.latest.tag, 'v0.1.627');
  assert.match(IDACC_RELEASE_SNAPSHOT.latest.releaseUrl, /^https:\/\/github\.com\/bobofbuilding\/idacc\/releases\/tag\//);
  assert.match(asset.url, /^https:\/\/github\.com\/bobofbuilding\/idacc\/releases\/download\//);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  assert.equal(IDACC_RELEASE_SNAPSHOT.latest.tagCommitSha, 'fc181ae0a9672539da54d69508b6af12c43087a1');
  assert.match(asset.sha256Provenance.localVerification, /GitHub Releases API asset digest/);
  assert.equal(response.data.releases.length, 1);
});
