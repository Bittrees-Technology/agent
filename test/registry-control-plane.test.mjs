import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  JsonFileRegistryStore,
  MemoryRegistryStore,
  RegistryConflictError,
  RegistryControlPlane,
  RegistryRejectedError,
  buildRegistryWriteSigningBytes,
  buildSignedHeartbeatSigningBytes,
  parseJsonEnvelope,
  signRegistryWrite,
  signSignedHeartbeat,
} from '../src/registry-control-plane.mjs';

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' });
  const now = Date.parse('2026-07-10T23:00:00.000Z');
  return { privateKey, publicKeyPem, now };
}

async function makePlane() {
  const keys = fixture();
  const plane = new RegistryControlPlane({ store: new MemoryRegistryStore(), clock: () => keys.now });
  await plane.bootstrapAgent({
    agentId: 'agent-one',
    controllerId: 'controller-one',
    controllerPublicKey: keys.publicKeyPem,
    displayName: 'Agent One',
  });
  return { plane, ...keys };
}

function heartbeat({ privateKey, now, sequence = 1, requestId = randomUUID(), keyId = 'controller', status = 'online' }) {
  const value = {
    schema_version: 'signed-heartbeat.v1',
    request_id: requestId,
    agent_id: 'agent-one',
    key_id: keyId,
    heartbeat_seq: sequence,
    sent_at: new Date(now).toISOString(),
    payload: { status, expires_at: new Date(now + 60_000).toISOString() },
  };
  return { ...value, signature: signSignedHeartbeat(value, privateKey) };
}

function registryWrite({ privateKey, publicKeyPem, now, expectedVersion = 1, requestId = randomUUID(), nonce = 'abcdefghijklmnop', extraRecord = {} }) {
  const value = {
    schema_version: 'registry-write.v1',
    request_id: requestId,
    agent_id: 'agent-one',
    expected_version: expectedVersion,
    record: {
      display_name: 'Agent One Updated',
      description: 'A safe staged profile',
      profile_uri: 'https://example.com/agent-one',
      public_keys: [{ key_id: 'controller', algorithm: 'Ed25519', public_key: publicKeyPem }],
      status: 'active',
      ...extraRecord,
    },
    auth: {
      key_id: 'controller',
      algorithm: 'Ed25519',
      signed_at: new Date(now).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
      nonce,
    },
  };
  return { ...value, auth: { ...value.auth, signature: signRegistryWrite(value, privateKey) } };
}

test('rejects duplicate JSON keys before canonicalization', () => {
  assert.throws(
    () => parseJsonEnvelope('{"agent_id":"agent-one","agent_id":"agent-two"}'),
    (error) => error.code === 'duplicate_json_key',
  );
  assert.deepEqual(parseJsonEnvelope('{"ok":true,"nested":{"value":1}}'), { ok: true, nested: { value: 1 } });
});

test('signed heartbeat accepts camelCase aliases, updates liveness only, and is idempotent', async () => {
  const { plane, privateKey, now } = await makePlane();
  const value = heartbeat({ privateKey, now });
  const result = await plane.ingestSignedHeartbeat({
    schemaVersion: value.schema_version,
    requestId: value.request_id,
    agentId: value.agent_id,
    keyId: value.key_id,
    heartbeatSeq: value.heartbeat_seq,
    sentAt: value.sent_at,
    payload: { status: 'online', expiresAt: value.payload.expires_at },
    signature: value.signature,
  });
  assert.equal(result.status, 'accepted');
  const replay = await plane.ingestSignedHeartbeat(value);
  assert.equal(replay.status, 'idempotent');
  const record = await plane.getRecord('agent-one');
  assert.equal(record.sequence, 1);
  assert.equal(record.health, 'online');
  assert.equal(record.authority_state.execution_allowed, false);
  assert.equal(record.authority_state.spend_allowed, false);
  assert.equal(record.authority_state.authority_changes_allowed, false);
  assert.equal(record.controller_id, 'controller-one');
});

test('invalid heartbeat is quarantined and cannot mutate identity or authority', async () => {
  const { plane, privateKey, now } = await makePlane();
  const value = heartbeat({ privateKey, now });
  value.payload.status = 'online';
  value.signature = value.signature.endsWith('A')
    ? `${value.signature.slice(0, -1)}B`
    : `${value.signature.slice(0, -1)}A`;
  await assert.rejects(() => plane.ingestSignedHeartbeat(value), (error) => error instanceof RegistryRejectedError);
  const record = await plane.getRecord('agent-one');
  assert.equal(record.sequence, 0);
  assert.equal(record.controller_id, 'controller-one');
  assert.equal((await plane.quarantineRecords()).length, 1);
  assert.equal((await plane.auditEvents()).at(-1).event_type, 'heartbeat.quarantined');
});

test('authenticated registry writes are versioned, idempotent, and fail closed on authority fields', async () => {
  const { plane, privateKey, publicKeyPem, now } = await makePlane();
  const request = registryWrite({ privateKey, publicKeyPem, now });
  const result = await plane.writeRegistry(request);
  assert.equal(result.status, 'accepted');
  assert.equal((await plane.getRecord('agent-one')).display_name, 'Agent One Updated');
  assert.equal((await plane.writeRegistry(request)).status, 'idempotent');

  const unsafe = {
    ...request,
    request_id: randomUUID(),
    record: { ...request.record, execution: { allowed: true } },
    auth: { ...request.auth, nonce: 'qrstuvwxyzabcdef' },
  };
  await assert.rejects(() => plane.writeRegistry(unsafe), (error) => error instanceof RegistryRejectedError && error.code === 'authority_mutation');
  assert.equal((await plane.getRecord('agent-one')).authority_state.execution_allowed, false);
  assert.ok((await plane.quarantineRecords()).some((entry) => entry.reason_code === 'authority_mutation'));
});

test('same expected version yields one commit and one audited conflict', async () => {
  const { plane, privateKey, publicKeyPem, now } = await makePlane();
  const first = registryWrite({ privateKey, publicKeyPem, now, nonce: 'abcdefghijklmnop' });
  const second = registryWrite({ privateKey, publicKeyPem, now, nonce: 'qrstuvwxyzabcdef' });
  const outcomes = await Promise.allSettled([plane.writeRegistry(first), plane.writeRegistry(second)]);
  assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((item) => item.status === 'rejected' && item.reason instanceof RegistryConflictError).length, 1);
  assert.ok((await plane.auditEvents()).some((event) => event.event_type === 'registry.write.conflict'));
});

test('file persistence validates on write and rejects a tampered stored projection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-registry-'));
  const statePath = join(directory, 'state.json');
  try {
    const keys = fixture();
    const plane = new RegistryControlPlane({ store: new JsonFileRegistryStore(statePath), clock: () => keys.now });
    await plane.bootstrapAgent({ agentId: 'agent-one', controllerId: 'controller-one', controllerPublicKey: keys.publicKeyPem });
    const persisted = JSON.parse(await readFile(statePath, 'utf8'));
    persisted.records['agent-one'].authority_state.execution_allowed = true;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(statePath, JSON.stringify(persisted));
    await assert.rejects(() => plane.getRecord('agent-one'), (error) => error.code === 'authority_boundary_violation');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('signing bytes are canonical and do not include the signature member', () => {
  const { privateKey, publicKeyPem, now } = fixture();
  const request = registryWrite({ privateKey, publicKeyPem, now });
  const signedBytes = buildRegistryWriteSigningBytes({ ...request, auth: { ...request.auth, signature: 'not-used' } });
  assert.equal(signedBytes.includes('not-used'), false);
  const heartbeatValue = heartbeat({ privateKey, now });
  const heartbeatBytes = buildSignedHeartbeatSigningBytes(heartbeatValue);
  assert.equal(heartbeatBytes.includes(heartbeatValue.signature), false);
});

test('expiry and replay gates quarantine stale or reused authentication', async () => {
  const { plane, privateKey, publicKeyPem, now } = await makePlane();
  const expired = heartbeat({ privateKey, now });
  expired.sent_at = new Date(now - 60_000).toISOString();
  expired.payload.expires_at = new Date(now - 1).toISOString();
  expired.signature = signSignedHeartbeat(expired, privateKey);
  await assert.rejects(() => plane.ingestSignedHeartbeat(expired), (error) => error.code === 'expired');

  const first = registryWrite({ privateKey, publicKeyPem, now });
  await plane.writeRegistry(first);
  const replay = registryWrite({ privateKey, publicKeyPem, now, expectedVersion: 3, nonce: first.auth.nonce, extraRecord: { description: 'different' } });
  await assert.rejects(() => plane.writeRegistry(replay), (error) => error.code === 'replay');
});

test('revocation blocks later signed heartbeats and quarantine redacts untrusted secrets', async () => {
  const { plane, privateKey, now } = await makePlane();
  const first = heartbeat({ privateKey, now });
  await plane.ingestSignedHeartbeat(first);
  await plane.revokeAgent('agent-one', { reason: 'safety stop' });
  const afterRevoke = heartbeat({ privateKey, now, sequence: 2 });
  await assert.rejects(() => plane.ingestSignedHeartbeat(afterRevoke), (error) => error.code === 'revoked');

  const untrusted = heartbeat({ privateKey, now, sequence: 3 });
  untrusted.secret = 'do-not-persist';
  await assert.rejects(() => plane.ingestSignedHeartbeat(untrusted), (error) => error.code === 'revoked' || error.code === 'invalid_schema');
  const serialized = JSON.stringify(await plane.snapshot());
  assert.doesNotMatch(serialized, /do-not-persist/);
  assert.match(serialized, /\[REDACTED\]/);
});
