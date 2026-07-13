import { JSON_ROUTE_MAP, buildJsonResponse, IDENTITY_KEYS_PUBLIC_CONTRACT, LIVE_AGENT_REGISTRY } from '../src/portal.mjs';

const GENERATED_AT = '2026-07-06T00:00:00.000Z';
const SECRET_FIELD_PATTERNS = [
  /rawPrivateKey/i,
  /secretKey/i,
  /mnemonic/i,
  /seedPhrase/i,
];

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function checkNoSecretFields(label, value) {
  const serialized = JSON.stringify(value, null, 2);

  for (const pattern of SECRET_FIELD_PATTERNS) {
    check(!pattern.test(serialized), `${label} exposed ${pattern}`);
  }
}

const agentsRoute = JSON_ROUTE_MAP.get('/agents.json');
const identityRoute = JSON_ROUTE_MAP.get('/identity-keys.json');

if (!agentsRoute) {
  failures.push('missing /agents.json route definition');
}

if (!identityRoute) {
  failures.push('missing /identity-keys.json route definition');
}

if (agentsRoute) {
  const agentsResponse = buildJsonResponse(agentsRoute, GENERATED_AT);

  check(agentsResponse.status === 'prelaunch-registry-under-review', '/agents.json should remain prelaunch-registry-under-review');
  check(agentsResponse.data.registryManagement.status === LIVE_AGENT_REGISTRY.status, '/agents.json registry status drifted');
  check(agentsResponse.data.registryManagement.mode === LIVE_AGENT_REGISTRY.mode, '/agents.json registry mode drifted');
  check(agentsResponse.data.agents.length > 0, '/agents.json should publish at least one approved profile');
  checkNoSecretFields('/agents.json', agentsResponse);
}

if (identityRoute) {
  const identityResponse = buildJsonResponse(identityRoute, GENERATED_AT);
  const backupRestoreGate = identityResponse.data.identityKeys.launchGate.rolloutGates.find((gate) => gate.id === 'backup-restore');

  check(identityResponse.status === IDENTITY_KEYS_PUBLIC_CONTRACT.status, '/identity-keys.json should remain prelaunch-contract-under-review');
  check(identityResponse.data.identityKeys.launchGate.rolloutGates.length === 5, '/identity-keys.json should keep five rollout gates');
  check(backupRestoreGate?.status === 'no-go', '/identity-keys.json backup-restore gate should remain no-go');
  check(
    /backup and restore drill evidence/i.test(backupRestoreGate?.blocker ?? ''),
    '/identity-keys.json backup-restore gate should explain the missing drill evidence',
  );
  check(
    identityResponse.data.identityKeys.launchGate.blockersBeforeFullyAutomatedRegistry.some((rule) =>
      rule.includes('control-plane tooling'),
    ),
    '/identity-keys.json should still require authenticated control-plane tooling',
  );
  check(
    identityResponse.data.identityKeys.redactionPolicy.neverExpose.includes('private keys'),
    '/identity-keys.json should continue to publish redaction policy',
  );
  checkNoSecretFields('/identity-keys.json', identityResponse);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }

  process.exitCode = 1;
} else {
  console.log('Registry recovery drill checks passed.');
}
