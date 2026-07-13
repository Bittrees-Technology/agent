import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APPROVED_AGENT_PROFILES,
  IDENTITY_KEYS_PUBLIC_CONTRACT,
  JSON_ROUTE_MAP,
  LIVE_AGENT_REGISTRY,
  buildJsonResponse,
} from '../src/portal.mjs';

const GENERATED_AT = '2026-07-06T00:00:00.000Z';

test('registry control plane stays fail-closed for public agent inclusion', () => {
  const agentsRoute = JSON_ROUTE_MAP.get('/agents.json');
  const response = buildJsonResponse(agentsRoute, GENERATED_AT);

  assert.equal(response.status, 'prelaunch-registry-under-review');
  assert.equal(response.data.registryManagement.status, LIVE_AGENT_REGISTRY.status);
  assert.equal(response.data.registryManagement.mode, LIVE_AGENT_REGISTRY.mode);
  assert.deepEqual(
    response.data.registryManagement.automatedManagement.allowedWithoutHumanReview,
    LIVE_AGENT_REGISTRY.automatedManagement.allowedWithoutHumanReview,
  );
  assert.deepEqual(
    response.data.registryManagement.automatedManagement.requiresExplicitApproval,
    LIVE_AGENT_REGISTRY.automatedManagement.requiresExplicitApproval,
  );
  assert.equal(response.data.agents.length, APPROVED_AGENT_PROFILES.length);

  for (const agent of response.data.agents) {
    assert.equal(agent.authorization.executionAllowed, false, `${agent.id} unexpectedly allows execution`);
    assert.equal(agent.signedProfile.status, 'registry-reviewed-profile-record', `${agent.id} should remain review-only`);
    assert.ok(agent.identity, `${agent.id} should publish identity evidence`);
    assert.ok(agent.trustEvidence, `${agent.id} should publish trust evidence`);
    assert.ok(agent.authority, `${agent.id} should publish authority boundaries`);
    assert.ok(agent.authorization.blockedActions.includes('spend funds'), `${agent.id} should block spending`);
  }
});

test('registry identity launch gate keeps backup and restore evidence no-go', () => {
  const identityRoute = JSON_ROUTE_MAP.get('/identity-keys.json');
  const response = buildJsonResponse(identityRoute, GENERATED_AT);
  const rolloutGates = response.data.identityKeys.launchGate.rolloutGates;
  const backupRestoreGate = rolloutGates.find((gate) => gate.id === 'backup-restore');

  assert.equal(response.status, IDENTITY_KEYS_PUBLIC_CONTRACT.status);
  assert.equal(rolloutGates.length, 5);
  assert.ok(backupRestoreGate);
  assert.equal(backupRestoreGate.status, 'no-go');
  assert.match(backupRestoreGate.blocker, /backup and restore drill evidence/i);
  assert.ok(response.data.identityKeys.launchGate.rolloutTargets.includes('https://gov.bittrees.org/'));
  assert.ok(response.data.identityKeys.launchGate.rolloutTargets.includes('https://research.bittrees.org/'));
  assert.match(response.data.identityKeys.launchGate.rolloutSummary, /NO-GO/);
});
