import assert from 'node:assert/strict';
import test from 'node:test';

import { IDENTITY_KEYS_PUBLIC_CONTRACT, JSON_ROUTE_MAP, LIVE_AGENT_REGISTRY, buildJsonResponse } from '../src/portal.mjs';

const GENERATED_AT = '2026-07-06T00:00:00.000Z';
const SECRET_FIELD_PATTERNS = [
  /rawPrivateKey/i,
  /secretKey/i,
  /mnemonic/i,
  /seedPhrase/i,
];

test('registry security controls redact secret material from public contract text', () => {
  const agentsResponse = buildJsonResponse(JSON_ROUTE_MAP.get('/agents.json'), GENERATED_AT);
  const identityResponse = buildJsonResponse(JSON_ROUTE_MAP.get('/identity-keys.json'), GENERATED_AT);
  const serialized = JSON.stringify({ agentsResponse, identityResponse }, null, 2);

  for (const pattern of SECRET_FIELD_PATTERNS) {
    assert.doesNotMatch(serialized, pattern);
  }

  assert.ok(IDENTITY_KEYS_PUBLIC_CONTRACT.redactionPolicy.publicOnly.includes('public keys'));
  assert.ok(IDENTITY_KEYS_PUBLIC_CONTRACT.redactionPolicy.publicOnly.includes('fingerprints'));
  assert.ok(IDENTITY_KEYS_PUBLIC_CONTRACT.redactionPolicy.neverExpose.includes('private keys'));
  assert.ok(IDENTITY_KEYS_PUBLIC_CONTRACT.redactionPolicy.neverExpose.includes('recovery phrases'));
  assert.ok(LIVE_AGENT_REGISTRY.safetyInvariants.some((line) => line.includes('never published')));
});

test('registry security controls keep authority changes explicitly approval-gated', () => {
  const agentsResponse = buildJsonResponse(JSON_ROUTE_MAP.get('/agents.json'), GENERATED_AT);
  const identityResponse = buildJsonResponse(JSON_ROUTE_MAP.get('/identity-keys.json'), GENERATED_AT);

  assert.ok(
    agentsResponse.data.registryManagement.automatedManagement.allowedWithoutHumanReview.some((rule) =>
      rule.includes('signed heartbeats'),
    ),
  );
  assert.ok(
    agentsResponse.data.registryManagement.automatedManagement.requiresExplicitApproval.some((rule) =>
      rule.includes('spending'),
    ),
  );
  assert.ok(
    identityResponse.data.identityKeys.launchGate.blockersBeforeFullyAutomatedRegistry.some((rule) =>
      rule.includes('redaction tests'),
    ),
  );
  assert.ok(
    identityResponse.data.identityKeys.launchGate.blockersBeforeFullyAutomatedRegistry.some((rule) =>
      rule.includes('control-plane tooling'),
    ),
  );
});
