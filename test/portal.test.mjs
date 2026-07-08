import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  APPROVED_CLAIMS,
  APPROVED_AGENT_PROFILES,
  CONTRIBUTION_WORKFLOW,
  EXCLUDED_CLAIMS,
  EXCLUDED_CLAIM_REVIEW,
  IDENTITY_KEYS_PUBLIC_CONTRACT,
  IDACC_RELEASE_SNAPSHOT,
  JSON_ROUTE_MAP,
  LAUNCH_FRESHNESS_MONITORING,
  LIVE_AGENT_REGISTRY,
  MCP_CONTRIBUTION_TOOLS,
  MCP_GATEWAY,
  PORTAL_SECURITY_HEADERS,
  ROUTE_DEFINITIONS,
  buildJsonResponse,
  buildLlmsTxt,
  buildPortalManifest,
  buildStaticAssets,
  callMcpTool,
  createRequestHandler,
  renderIdentityKeysPage,
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

test('llms.txt is a plain-text agent entry point', () => {
  const llms = buildLlmsTxt();

  assert.match(llms, /^# agent\.bittrees\.org/);
  assert.match(llms, /\/sources\.json/);
  assert.match(llms, /\/templates\.json/);
  assert.match(llms, /\/identity-keys/);
  assert.match(llms, /\/identity-keys\.json/);
  assert.match(llms, /\/mcp/);
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
  assert.ok(assetPaths.has('llms.txt'));
  assert.ok(assetPaths.has('sources.json'));
  assert.ok(assetPaths.has('opportunities.json'));
  assert.ok(assetPaths.has('contribution-intents'));
  assert.ok(assetPaths.has('gateway/contribution-intents'));
  assert.ok(assetPaths.has('mcp/index.html'));
  assert.ok(assetPaths.has('mcp.json'));
  assert.ok(assetPaths.has('identity-keys.json'));
  assert.ok(assetPaths.has('monitoring.json'));
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

test('identity and keys page renders the live-readiness contract', () => {
  const html = renderIdentityKeysPage();

  assert.match(html, /Identity and keys\./);
  assert.match(html, /agent-signed-live-state-with-guarded-authority-changes/);
  assert.match(html, /blocked-without-explicit-controller-or-safe-approval/);
  assert.doesNotMatch(html, /rawPrivateKey|secretKey|mnemonic|seedPhrase/);
});

test('identity and keys route exposes public contract without secret fields', () => {
  const identityRoute = JSON_ROUTE_MAP.get('/identity-keys.json');
  const response = buildJsonResponse(identityRoute, '2026-07-06T00:00:00.000Z');
  const serialized = JSON.stringify(response);

  assert.equal(response.status, 'live-contract-ready');
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

test('agents route advertises live registry management rather than manual-only intake', () => {
  const agentsRoute = JSON_ROUTE_MAP.get('/agents.json');
  const response = buildJsonResponse(agentsRoute, '2026-07-06T00:00:00.000Z');

  assert.equal(response.status, 'live-registry-contract-ready');
  assert.equal(response.data.registryManagement.status, 'live-management-contract-ready');
  assert.equal(response.data.identityKeys.route, '/identity-keys.json');
  assert.equal(response.data.contributionWorkflow.length, CONTRIBUTION_WORKFLOW.length);
  assert.equal(response.data.agents.length, APPROVED_AGENT_PROFILES.length);
  assert.ok(response.data.agents.length > 0);
  for (const agent of response.data.agents) {
    assert.ok(agent.identity, `${agent.id} should separate identity`);
    assert.ok(agent.trustEvidence, `${agent.id} should separate trust evidence`);
    assert.ok(agent.authority, `${agent.id} should separate authority`);
    assert.ok(agent.authorization, `${agent.id} should separate authorization`);
    assert.equal(agent.authorization.executionAllowed, false);
    assert.equal(agent.signedProfile.status, 'approved-signed-profile');
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
  assert.ok(response.data.monitoring.routeStatusChecks.includes('/gateway/contribution-intents'));
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/sources.json'));
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
              value: 'engineering-team/backend-engineer',
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
  assert.equal(IDACC_RELEASE_SNAPSHOT.latest.tag, 'v0.1.623');
  assert.match(IDACC_RELEASE_SNAPSHOT.latest.releaseUrl, /^https:\/\/github\.com\/bobofbuilding\/idacc\/releases\/tag\//);
  assert.match(asset.url, /^https:\/\/github\.com\/bobofbuilding\/idacc\/releases\/download\//);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  assert.equal(IDACC_RELEASE_SNAPSHOT.latest.tagCommitSha, '063da5374dd79515af13d7ba803d923bc5187630');
  assert.match(asset.sha256Provenance.localVerification, /GitHub Releases API asset digest/);
  assert.equal(response.data.releases.length, 1);
});
