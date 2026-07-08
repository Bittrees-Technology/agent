import assert from 'node:assert/strict';
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
  ROUTE_DEFINITIONS,
  buildJsonResponse,
  buildLlmsTxt,
  buildPortalManifest,
  buildStaticAssets,
  renderIdentityKeysPage,
} from '../src/portal.mjs';

test('llms.txt is a plain-text agent entry point', () => {
  const llms = buildLlmsTxt();

  assert.match(llms, /^# agent\.bittrees\.org/);
  assert.match(llms, /\/sources\.json/);
  assert.match(llms, /\/templates\.json/);
  assert.match(llms, /\/identity-keys/);
  assert.match(llms, /\/identity-keys\.json/);
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
  assert.ok(assetPaths.has('identity-keys.json'));
  assert.ok(assetPaths.has('monitoring.json'));
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
  assert.ok(response.data.monitoring.schemaValidity.routes.includes('/sources.json'));
  assert.ok(response.data.monitoring.claimDrift.baselineApprovedClaimIds.includes(APPROVED_CLAIMS[0].id));
  assert.ok(response.data.monitoring.claimDrift.baselineExcludedClaimIds.includes(EXCLUDED_CLAIM_REVIEW[0].id));
});

test('idacc release snapshot includes verifiable download metadata', () => {
  const releaseRoute = JSON_ROUTE_MAP.get('/idacc/releases.json');
  const response = buildJsonResponse(releaseRoute, '2026-07-06T00:00:00.000Z');
  const [asset] = IDACC_RELEASE_SNAPSHOT.latest.assets;

  assert.equal(response.status, 'release-snapshot-ready');
  assert.equal(IDACC_RELEASE_SNAPSHOT.latest.tag, 'v0.1.619');
  assert.match(IDACC_RELEASE_SNAPSHOT.latest.releaseUrl, /^https:\/\/github\.com\/bobofbuilding\/idacc\/releases\/tag\//);
  assert.match(asset.url, /^https:\/\/github\.com\/bobofbuilding\/idacc\/releases\/download\//);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  assert.equal(response.data.releases.length, 1);
});
