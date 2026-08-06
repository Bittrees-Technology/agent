import { createHash, createPublicKey, randomUUID, sign, verify } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const REGISTRY_STATE_SCHEMA_VERSION = 'agent.registry.state.v1';
export const REGISTRY_RECORD_SCHEMA_VERSION = 'agent.registry.record.v1';
export const EMITTED_RECORD_SCHEMA_VERSION = 'agent.registry.record.public.v1';
export const HEARTBEAT_SCHEMA_VERSION = 'agent.registry.heartbeat.v1';
export const HEARTBEAT_DOMAIN = 'bittrees.agent.registry.heartbeat.v1';
export const REGISTRY_WRITE_SCHEMA_VERSION = 'registry-write.v1';
export const SIGNED_HEARTBEAT_SCHEMA_VERSION = 'signed-heartbeat.v1';
export const REGISTRY_WRITE_DOMAIN = 'bittrees.agent.registry.write.v1';
export const IDENTITY_WALLET_AUTHORITY_SCHEMA_VERSION = 'agent.identity-wallet.authority.v1';
export const IDENTITY_WALLET_PROOF_SCHEMA_VERSION = 'agent.identity-wallet.proof.v1';
export const IDENTITY_WALLET_VERIFICATION_RECORD_SCHEMA_VERSION = 'agent.identity-wallet.verification.v1';
export const IDENTITY_WALLET_PROOF_DOMAIN = 'bittrees.agent.identity.wallet.proof.v1';
export const IDENTITY_WALLET_PROOF_METHODS = Object.freeze(['siwe-equivalent', 'siws-equivalent', 'erc1271-equivalent']);
export const SUPPORTED_IDENTITY_WALLET_CHAIN_IDS = Object.freeze([8453, 84532, 11155111, 17000, 31337]);

const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_HEARTBEAT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_IDENTITY_PROOF_LIFETIME_MS = 15 * 60 * 1000;
const EIP155_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const MUTABLE_FIELDS = new Set([
  'description',
  'display_name',
  'health',
  'last_seen',
  'last_verified_at',
  'metadata',
  'profile_uri',
  'status',
  'tags',
]);
const AUTHORITY_FIELDS = new Set([
  'authority', 'authority_state', 'controller', 'controller_id',
  'controller_public_key', 'endpoint', 'execution', 'execution_scope',
  'manifest_hash', 'owner', 'private_key', 'public_key', 'resolver',
  'signer', 'spend', 'spend_limit', 'wallet', 'wallet_address',
  'executionAllowed', 'executionScope', 'manifestHash', 'publicKey',
  'spendLimit', 'walletAddress',
]);

export const REGISTRY_RECORD_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: REGISTRY_RECORD_SCHEMA_VERSION,
  type: 'object',
  required: [
    'schema_version', 'agent_id', 'controller_id', 'controller_public_key',
    'sequence', 'status', 'health', 'last_seen', 'revoked', 'record_version',
    'updated_at', 'authority_state',
  ],
  properties: {
    schema_version: { const: REGISTRY_RECORD_SCHEMA_VERSION },
    agent_id: { type: 'string', minLength: 1 },
    controller_id: { type: 'string', minLength: 1 },
    controller_public_key: { type: 'string', minLength: 1 },
    controller_key_id: { type: 'string', minLength: 1, maxLength: 128 },
    sequence: { type: 'integer', minimum: 0 },
    status: { type: 'string', minLength: 1 },
    health: { type: 'string', minLength: 1 },
    last_seen: { type: 'string', format: 'date-time' },
    last_verified_at: { type: 'string', format: 'date-time' },
    revoked: { type: 'boolean' },
    record_version: { type: 'integer', minimum: 1 },
    updated_at: { type: 'string', format: 'date-time' },
    public_safe: { type: 'boolean' },
    display_name: { type: 'string', minLength: 1, maxLength: 160 },
    description: { type: 'string', maxLength: 4000 },
    profile_uri: { type: 'string', minLength: 1, maxLength: 2048 },
    public_keys: {
      type: 'array', minItems: 1, maxItems: 16,
      items: {
        type: 'object', additionalProperties: false,
        required: ['key_id', 'algorithm', 'public_key'],
        properties: {
          key_id: { type: 'string', minLength: 1, maxLength: 128 },
          algorithm: { const: 'Ed25519' },
          public_key: { type: 'string', minLength: 1 },
          revoked_at: { type: ['string', 'null'], format: 'date-time' },
        },
      },
    },
    tags: { type: 'array', maxItems: 64 },
    metadata: { type: 'object' },
    revocation_reason: { type: 'string', maxLength: 256 },
    revoked_by: { type: 'string', maxLength: 128 },
    authority_state: {
      type: 'object',
      additionalProperties: false,
      required: ['authority_changes_allowed', 'spend_allowed', 'execution_allowed', 'reason'],
      properties: {
        authority_changes_allowed: { const: false },
        spend_allowed: { const: false },
        execution_allowed: { const: false },
        reason: { type: 'string', minLength: 1 },
      },
    },
  },
  additionalProperties: false,
});

export const REGISTRY_STATE_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: REGISTRY_STATE_SCHEMA_VERSION,
  type: 'object',
  required: ['schema_version', 'version', 'records', 'seen_nonces', 'idempotency', 'quarantine', 'audit'],
  properties: {
    schema_version: { const: REGISTRY_STATE_SCHEMA_VERSION },
    version: { type: 'integer', minimum: 0 },
    records: { type: 'object' },
    seen_nonces: { type: 'object' },
    idempotency: { type: 'object' },
    quarantine: { type: 'array' },
    audit: { type: 'array' },
    identity_authorities: { type: 'object' },
    identity_wallet_verifications: { type: 'object' },
  },
  additionalProperties: false,
});

export const EMITTED_RECORD_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: EMITTED_RECORD_SCHEMA_VERSION,
  type: 'object',
  required: [
    'schemaVersion', 'agentId', 'controllerId', 'sequence', 'status', 'health',
    'lastSeen', 'revoked', 'recordVersion', 'updatedAt', 'authorityState',
  ],
  properties: {
    schemaVersion: { const: EMITTED_RECORD_SCHEMA_VERSION },
    agentId: { type: 'string', minLength: 1 },
    controllerId: { type: 'string', minLength: 1 },
    sequence: { type: 'integer', minimum: 0 },
    status: { type: 'string', minLength: 1 },
    health: { type: 'string', minLength: 1 },
    lastSeen: { type: 'string', format: 'date-time' },
    lastVerifiedAt: { type: 'string', format: 'date-time' },
    revoked: { type: 'boolean' },
    recordVersion: { type: 'integer', minimum: 1 },
    updatedAt: { type: 'string', format: 'date-time' },
    authorityState: { type: 'object' },
  },
  additionalProperties: false,
});

export const CANONICAL_EMITTED_RECORD_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'agent.registry.record.canonical.v1',
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'agent_id', 'controller_id', 'sequence', 'status', 'health', 'last_seen', 'revoked', 'record_version', 'updated_at', 'authority_state'],
  properties: {
    schema_version: { const: EMITTED_RECORD_SCHEMA_VERSION },
    agent_id: { type: 'string', minLength: 1 },
    controller_id: { type: 'string', minLength: 1 },
    sequence: { type: 'integer', minimum: 0 },
    status: { type: 'string', minLength: 1 },
    health: { type: 'string', minLength: 1 },
    last_seen: { type: 'string', format: 'date-time' },
    last_verified_at: { type: 'string', format: 'date-time' },
    display_name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    profile_uri: { type: 'string' },
    metadata: { type: 'object' },
    tags: { type: 'array' },
    public_safe: { type: 'boolean' },
    revoked: { type: 'boolean' },
    record_version: { type: 'integer', minimum: 1 },
    updated_at: { type: 'string', format: 'date-time' },
    authority_state: { type: 'object', additionalProperties: false },
  },
});

export const REGISTRY_WRITE_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: REGISTRY_WRITE_SCHEMA_VERSION,
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'request_id', 'agent_id', 'expected_version', 'record', 'auth'],
  properties: {
    schema_version: { const: REGISTRY_WRITE_SCHEMA_VERSION },
    request_id: { type: 'string', format: 'uuid' },
    agent_id: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]{0,127}$' },
    expected_version: { type: 'integer', minimum: 0 },
    record: {
      type: 'object',
      additionalProperties: false,
      required: ['display_name', 'description', 'profile_uri', 'public_keys', 'status'],
      properties: {
        display_name: { type: 'string', minLength: 1, maxLength: 160 },
        description: { type: 'string', maxLength: 4000 },
        profile_uri: { type: 'string', minLength: 1, maxLength: 2048 },
        public_keys: { type: 'array', minItems: 1, maxItems: 16 },
        status: { enum: ['active', 'suspended'] },
      },
    },
    auth: {
      type: 'object',
      additionalProperties: false,
      required: ['key_id', 'algorithm', 'signed_at', 'expires_at', 'nonce', 'signature'],
      properties: {
        key_id: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,128}$' },
        algorithm: { const: 'Ed25519' },
        signed_at: { type: 'string', format: 'date-time' },
        expires_at: { type: 'string', format: 'date-time' },
        nonce: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,128}$' },
        signature: { type: 'string', pattern: '^[A-Za-z0-9_-]{86}$' },
      },
    },
  },
});

export const SIGNED_HEARTBEAT_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: SIGNED_HEARTBEAT_SCHEMA_VERSION,
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'request_id', 'agent_id', 'key_id', 'heartbeat_seq', 'sent_at', 'payload', 'signature'],
  properties: {
    schema_version: { const: SIGNED_HEARTBEAT_SCHEMA_VERSION },
    request_id: { type: 'string', format: 'uuid' },
    agent_id: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]{0,127}$' },
    key_id: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,128}$' },
    heartbeat_seq: { type: 'integer', minimum: 0 },
    sent_at: { type: 'string', format: 'date-time' },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'expires_at'],
      properties: {
        status: { enum: ['online', 'degraded'] },
        expires_at: { type: 'string', format: 'date-time' },
      },
    },
    signature: { type: 'string', pattern: '^[A-Za-z0-9_-]{86}$' },
  },
});

export class RegistryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RegistryError';
    this.code = code;
    this.details = details;
  }
}

export class RegistryRejectedError extends RegistryError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'RegistryRejectedError';
    this.quarantined = true;
  }
}

export class RegistryConflictError extends RegistryError {
  constructor(message, details = {}) {
    super('version_conflict', message, details);
    this.name = 'RegistryConflictError';
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RegistryError('invalid_record', `${field} must be a non-empty string`, { field });
  }
}

function assertInteger(value, field, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RegistryError('invalid_record', `${field} must be an integer >= ${minimum}`, { field });
  }
}

function assertDateTime(value, field) {
  assertString(value, field);
  if (!Number.isFinite(Date.parse(value))) {
    throw new RegistryError('invalid_record', `${field} must be an ISO date-time`, { field });
  }
}

function assertObject(value, field) {
  if (!isPlainObject(value)) {
    throw new RegistryError('invalid_record', `${field} must be an object`, { field });
  }
}

function assertUuid(value, field) {
  assertString(value, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new RegistryError('invalid_schema', `${field} must be a UUID`, { field });
  }
}

function assertNoUnknown(value, allowed, code = 'invalid_schema') {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new RegistryError(code, `unknown field: ${key}`, { field: key });
  }
}

function assertSafeMetadata(value, field = 'metadata', depth = 0) {
  if (depth > 8) throw new RegistryError('invalid_record', `${field} is too deeply nested`, { field });
  if (Array.isArray(value)) {
    if (value.length > 128) throw new RegistryError('invalid_record', `${field} has too many items`, { field });
    value.forEach((item, index) => assertSafeMetadata(item, `${field}[${index}]`, depth + 1));
    return;
  }
  if (!isPlainObject(value)) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
    throw new RegistryError('invalid_record', `${field} contains an unsupported value`, { field });
  }
  for (const [key, nested] of Object.entries(value)) {
    const sensitiveKey = /authority|execution|spend|wallet|private|secret|signer|controller|public[_-]?key|endpoint|resolver/i.test(key);
    if (sensitiveKey && nested === '[REDACTED]') {
      continue;
    }
    if (sensitiveKey) {
      throw new RegistryError('authority_boundary_violation', `${field}.${key} is not permitted`, { field: `${field}.${key}` });
    }
    assertSafeMetadata(nested, `${field}.${key}`, depth + 1);
  }
}

function assertSafeJson(value, field = 'value', depth = 0) {
  if (depth > 12) throw new RegistryError('invalid_state', `${field} is too deeply nested`, { field });
  if (Array.isArray(value)) return value.forEach((item, index) => assertSafeJson(item, `${field}[${index}]`, depth + 1));
  if (isPlainObject(value)) return Object.entries(value).forEach(([key, nested]) => assertSafeJson(nested, `${field}.${key}`, depth + 1));
  if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new RegistryError('invalid_state', `${field} is not JSON serializable`, { field });
}

function validateAuthorityState(value, field = 'authority_state') {
  assertObject(value, field);
  assertNoUnknown(value, new Set(['authority_changes_allowed', 'spend_allowed', 'execution_allowed', 'reason']), 'authority_boundary_violation');
  if (value.authority_changes_allowed !== false
    || value.spend_allowed !== false
    || value.execution_allowed !== false) {
    throw new RegistryError('authority_boundary_violation', 'registry records must keep authority, spend, and execution blocked');
  }
  assertString(value.reason, `${field}.reason`);
}

function validatePublicKey(key, field = 'public_keys') {
  assertObject(key, field);
  assertNoUnknown(key, new Set(['key_id', 'algorithm', 'public_key', 'revoked_at']), 'invalid_schema');
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(key.key_id ?? '')) throw new RegistryError('invalid_schema', `${field}.key_id is invalid`);
  if (key.algorithm !== 'Ed25519') throw new RegistryError('invalid_schema', `${field}.algorithm must be Ed25519`);
  assertString(key.public_key, `${field}.public_key`);
  if (key.revoked_at !== undefined && key.revoked_at !== null) assertDateTime(key.revoked_at, `${field}.revoked_at`);
  try { toPublicKeyObject(key.public_key); } catch { throw new RegistryError('invalid_schema', `${field}.public_key is not a public key`); }
}

function toPublicKeyObject(value) {
  try { return createPublicKey(value); } catch {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('unsupported public key');
    const raw = Buffer.from(value, 'base64url');
    if (raw.byteLength !== 32) throw new Error('unsupported public key');
    return createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
      format: 'der',
      type: 'spki',
    });
  }
}

function validateRecord(record) {
  assertObject(record, 'record');
  assertNoUnknown(record, new Set([
    'schema_version', 'agent_id', 'controller_id', 'controller_public_key', 'controller_key_id',
    'sequence', 'status', 'health', 'last_seen', 'last_verified_at', 'revoked', 'record_version',
    'updated_at', 'display_name', 'description', 'profile_uri', 'public_keys', 'metadata', 'tags',
    'authority_state', 'revocation_reason', 'revoked_by', 'public_safe',
  ]));
  if (record.schema_version !== REGISTRY_RECORD_SCHEMA_VERSION) {
    throw new RegistryError('invalid_record_schema', 'stored record has an unsupported schema version');
  }
  for (const field of ['agent_id', 'controller_id', 'controller_public_key', 'status', 'health']) assertString(record[field], field);
  assertInteger(record.sequence, 'sequence');
  assertDateTime(record.last_seen, 'last_seen');
  if (record.last_verified_at !== undefined) assertDateTime(record.last_verified_at, 'last_verified_at');
  if (typeof record.revoked !== 'boolean') throw new RegistryError('invalid_record', 'revoked must be boolean');
  if (record.public_safe !== undefined && typeof record.public_safe !== 'boolean') {
    throw new RegistryError('invalid_record', 'public_safe must be boolean');
  }
  assertInteger(record.record_version, 'record_version', 1);
  assertDateTime(record.updated_at, 'updated_at');
  if (record.controller_key_id !== undefined) assertString(record.controller_key_id, 'controller_key_id');
  if (record.display_name !== undefined) assertString(record.display_name, 'display_name');
  if (record.description !== undefined && typeof record.description !== 'string') throw new RegistryError('invalid_record', 'description must be a string');
  if (record.profile_uri !== undefined) assertString(record.profile_uri, 'profile_uri');
  if (record.public_keys !== undefined) {
    if (!Array.isArray(record.public_keys) || record.public_keys.length < 1 || record.public_keys.length > 16) throw new RegistryError('invalid_record', 'public_keys must contain 1-16 keys');
    record.public_keys.forEach((key, index) => validatePublicKey(key, `public_keys[${index}]`));
  }
  if (record.metadata !== undefined) {
    assertObject(record.metadata, 'metadata');
    assertSafeMetadata(record.metadata);
  }
  if (record.tags !== undefined && (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== 'string'))) throw new RegistryError('invalid_record', 'tags must be strings');
  validateAuthorityState(record.authority_state);
  return true;
}

function normalizeAddress(value, field) {
  assertString(value, field);
  if (!EIP155_ADDRESS_PATTERN.test(value)) throw new RegistryError('invalid_schema', `${field} must be an EIP-155 address`, { field });
  return value.toLowerCase();
}

function normalizeChainId(value, field) {
  assertInteger(value, field, 1);
  return value;
}

function canonicalIdentityPrincipal(agentId) {
  return `${String(agentId).toLowerCase()}.agent.bittrees.eth`;
}

function verificationKey(agentId, walletAddress) {
  return `${agentId}:${normalizeAddress(walletAddress, 'wallet_address')}`;
}

function ensureIdentityStateMaps(state) {
  state.identity_authorities ??= {};
  state.identity_wallet_verifications ??= {};
  return state;
}

function validateAuthoritySigner(value, field, { revocable = false } = {}) {
  assertObject(value, field);
  const allowed = revocable
    ? new Set([
      'address', 'key_id', 'public_key', 'authority_class', 'scopes', 'methods',
      'chain_ids', 'expires_at', 'revoked_at', 'revocation_epoch', 'safe_root_revision',
    ])
    : new Set(['address', 'key_id', 'public_key']);
  assertNoUnknown(value, allowed, 'invalid_schema');
  normalizeAddress(value.address, `${field}.address`);
  assertString(value.key_id, `${field}.key_id`);
  assertString(value.public_key, `${field}.public_key`);
  try { toPublicKeyObject(value.public_key); } catch { throw new RegistryError('invalid_schema', `${field}.public_key is not a public key`); }
  if (!revocable) return true;
  if (!['revocable_signer', 'session_key'].includes(value.authority_class)) throw new RegistryError('invalid_schema', `${field}.authority_class is invalid`);
  for (const arrayField of ['scopes', 'methods', 'chain_ids']) {
    if (!Array.isArray(value[arrayField]) || value[arrayField].length === 0) throw new RegistryError('invalid_schema', `${field}.${arrayField} must be a non-empty array`);
  }
  if (value.scopes.some((item) => typeof item !== 'string' || item.length === 0)) throw new RegistryError('invalid_schema', `${field}.scopes must contain strings`);
  if (value.methods.some((item) => typeof item !== 'string' || item.length === 0)) throw new RegistryError('invalid_schema', `${field}.methods must contain strings`);
  value.chain_ids.forEach((chainId, index) => normalizeChainId(chainId, `${field}.chain_ids[${index}]`));
  assertDateTime(value.expires_at, `${field}.expires_at`);
  if (value.revoked_at !== null && value.revoked_at !== undefined) assertDateTime(value.revoked_at, `${field}.revoked_at`);
  assertInteger(value.revocation_epoch, `${field}.revocation_epoch`);
  assertString(value.safe_root_revision, `${field}.safe_root_revision`);
  return true;
}

function validateIdentityAuthorityRecord(value, field = 'identity_authority') {
  assertObject(value, field);
  assertNoUnknown(value, new Set([
    'schema_version', 'agent_id', 'identity_principal', 'safe_address', 'safe_chain_id',
    'supported_chain_ids', 'safe_threshold', 'owner_signers', 'revocable_signers',
    'root_revision', 'observed_at', 'updated_at',
  ]), 'invalid_schema');
  if (value.schema_version !== IDENTITY_WALLET_AUTHORITY_SCHEMA_VERSION) throw new RegistryError('invalid_schema', `${field}.schema_version is unsupported`);
  assertString(value.agent_id, `${field}.agent_id`);
  if (value.identity_principal !== canonicalIdentityPrincipal(value.agent_id)) throw new RegistryError('identity_binding_mismatch', `${field}.identity_principal must be the canonical agent.bittrees.eth name`);
  normalizeAddress(value.safe_address, `${field}.safe_address`);
  normalizeChainId(value.safe_chain_id, `${field}.safe_chain_id`);
  if (!SUPPORTED_IDENTITY_WALLET_CHAIN_IDS.includes(value.safe_chain_id)) throw new RegistryError('unsupported_network', `${field}.safe_chain_id is not supported`);
  if (!Array.isArray(value.supported_chain_ids) || value.supported_chain_ids.length === 0) throw new RegistryError('invalid_schema', `${field}.supported_chain_ids must be non-empty`);
  value.supported_chain_ids.forEach((chainId, index) => normalizeChainId(chainId, `${field}.supported_chain_ids[${index}]`));
  if (!value.supported_chain_ids.includes(value.safe_chain_id)) throw new RegistryError('unsupported_network', `${field}.supported_chain_ids must include safe_chain_id`);
  assertInteger(value.safe_threshold, `${field}.safe_threshold`, 1);
  if (!Array.isArray(value.owner_signers) || value.owner_signers.length === 0) throw new RegistryError('invalid_schema', `${field}.owner_signers must be non-empty`);
  if (value.safe_threshold > value.owner_signers.length) throw new RegistryError('invalid_schema', `${field}.safe_threshold cannot exceed owner signer count`);
  value.owner_signers.forEach((signer, index) => validateAuthoritySigner(signer, `${field}.owner_signers[${index}]`));
  if (!Array.isArray(value.revocable_signers)) throw new RegistryError('invalid_schema', `${field}.revocable_signers must be an array`);
  value.revocable_signers.forEach((signer, index) => validateAuthoritySigner(signer, `${field}.revocable_signers[${index}]`, { revocable: true }));
  assertString(value.root_revision, `${field}.root_revision`);
  assertDateTime(value.observed_at, `${field}.observed_at`);
  assertDateTime(value.updated_at, `${field}.updated_at`);
  const ownerAddresses = new Set(value.owner_signers.map((signer) => normalizeAddress(signer.address, `${field}.owner_signers.address`)));
  if (ownerAddresses.size !== value.owner_signers.length) throw new RegistryError('invalid_schema', `${field}.owner_signers must be unique by address`);
  const delegateAddresses = new Set(value.revocable_signers.map((signer) => normalizeAddress(signer.address, `${field}.revocable_signers.address`)));
  if (delegateAddresses.size !== value.revocable_signers.length) throw new RegistryError('invalid_schema', `${field}.revocable_signers must be unique by address`);
  return true;
}

function validateVerificationRecord(value, field = 'identity_wallet_verification') {
  assertObject(value, field);
  assertNoUnknown(value, new Set([
    'schema_version', 'verification_id', 'agent_id', 'subject_kind', 'identity_principal',
    'wallet_address', 'wallet_chain_id', 'safe_address', 'verification_status',
    'verification_method', 'proof_digest', 'proof_subject', 'proof_signer',
    'signer_authority_class', 'session_key_scope', 'safe_authority', 'verified_at',
    'expires_at', 'revoked_at', 'conflict_code', 'source_event_uids', 'record_version',
    'updated_at',
  ]), 'invalid_schema');
  if (value.schema_version !== IDENTITY_WALLET_VERIFICATION_RECORD_SCHEMA_VERSION) throw new RegistryError('invalid_schema', `${field}.schema_version is unsupported`);
  for (const key of ['verification_id', 'agent_id', 'identity_principal', 'verification_method', 'proof_digest', 'signer_authority_class']) assertString(value[key], `${field}.${key}`);
  normalizeAddress(value.wallet_address, `${field}.wallet_address`);
  normalizeAddress(value.safe_address, `${field}.safe_address`);
  normalizeAddress(value.proof_subject, `${field}.proof_subject`);
  normalizeAddress(value.proof_signer, `${field}.proof_signer`);
  normalizeChainId(value.wallet_chain_id, `${field}.wallet_chain_id`);
  if (value.subject_kind !== 'agent') throw new RegistryError('invalid_schema', `${field}.subject_kind is invalid`);
  if (!['verified', 'expired', 'revoked', 'conflict'].includes(value.verification_status)) throw new RegistryError('invalid_schema', `${field}.verification_status is invalid`);
  assertObject(value.session_key_scope, `${field}.session_key_scope`);
  assertObject(value.safe_authority, `${field}.safe_authority`);
  assertDateTime(value.verified_at, `${field}.verified_at`);
  assertDateTime(value.expires_at, `${field}.expires_at`);
  if (value.revoked_at !== null && value.revoked_at !== undefined) assertDateTime(value.revoked_at, `${field}.revoked_at`);
  if (value.conflict_code !== null && value.conflict_code !== undefined) assertString(value.conflict_code, `${field}.conflict_code`);
  if (!Array.isArray(value.source_event_uids)) throw new RegistryError('invalid_schema', `${field}.source_event_uids must be an array`);
  assertInteger(value.record_version, `${field}.record_version`, 1);
  assertDateTime(value.updated_at, `${field}.updated_at`);
  return true;
}

export function validateStoredState(state) {
  assertObject(state, 'state');
  if (state.schema_version !== REGISTRY_STATE_SCHEMA_VERSION) {
    throw new RegistryError('invalid_state_schema', 'stored state has an unsupported schema version');
  }
  assertInteger(state.version, 'version');
  for (const field of ['records', 'seen_nonces', 'idempotency']) assertObject(state[field], field);
  if (!Array.isArray(state.quarantine) || !Array.isArray(state.audit)) {
    throw new RegistryError('invalid_state', 'quarantine and audit must be arrays');
  }
  for (const [agentId, record] of Object.entries(state.records)) {
    if (record.agent_id !== agentId) throw new RegistryError('invalid_state', 'record key does not match agent_id');
    validateRecord(record);
  }
  for (const event of state.audit) {
    assertObject(event, 'audit event');
    assertString(event.event_id, 'audit.event_id');
    assertString(event.event_type, 'audit.event_type');
    assertDateTime(event.occurred_at, 'audit.occurred_at');
    if (event.event_hash !== undefined) assertString(event.event_hash, 'audit.event_hash');
    if (event.previous_hash !== undefined && event.previous_hash !== null) assertString(event.previous_hash, 'audit.previous_hash');
  }
  for (const item of state.quarantine) {
    assertObject(item, 'quarantine record');
    assertString(item.quarantine_id, 'quarantine.quarantine_id');
    assertString(item.reason_code, 'quarantine.reason_code');
    assertDateTime(item.received_at, 'quarantine.received_at');
    if (item.input !== undefined) assertSafeJson(item.input, 'quarantine.input');
  }
  if (state.identity_authorities !== undefined) {
    assertObject(state.identity_authorities, 'identity_authorities');
    for (const [agentId, authority] of Object.entries(state.identity_authorities)) {
      if (authority.agent_id !== agentId) throw new RegistryError('invalid_state', 'identity authority key does not match agent_id');
      validateIdentityAuthorityRecord(authority, `identity_authorities.${agentId}`);
    }
  }
  if (state.identity_wallet_verifications !== undefined) {
    assertObject(state.identity_wallet_verifications, 'identity_wallet_verifications');
    for (const [key, record] of Object.entries(state.identity_wallet_verifications)) {
      if (key !== verificationKey(record.agent_id, record.wallet_address)) throw new RegistryError('invalid_state', 'identity wallet verification key does not match record subject');
      validateVerificationRecord(record, `identity_wallet_verifications.${key}`);
    }
  }
  return true;
}

export function validateEmittedRecord(record) {
  assertObject(record, 'emitted record');
  if (record.schemaVersion !== EMITTED_RECORD_SCHEMA_VERSION) {
    throw new RegistryError('invalid_emitted_schema', 'emitted record has an unsupported schema version');
  }
  for (const field of ['agentId', 'controllerId', 'status', 'health']) assertString(record[field], field);
  assertInteger(record.sequence, 'sequence');
  assertDateTime(record.lastSeen, 'lastSeen');
  if (record.lastVerifiedAt !== undefined) assertDateTime(record.lastVerifiedAt, 'lastVerifiedAt');
  if (typeof record.revoked !== 'boolean') throw new RegistryError('invalid_emitted_record', 'revoked must be boolean');
  assertInteger(record.recordVersion, 'recordVersion', 1);
  assertDateTime(record.updatedAt, 'updatedAt');
  assertObject(record.authorityState, 'authorityState');
  assertNoUnknown(record.authorityState, new Set(['authorityChangesAllowed', 'spendAllowed', 'executionAllowed']), 'authority_boundary_violation');
  if (record.authorityState.authorityChangesAllowed !== false
    || record.authorityState.spendAllowed !== false
    || record.authorityState.executionAllowed !== false) {
    throw new RegistryError('authority_boundary_violation', 'emitted records must keep authority, spend, and execution blocked');
  }
  const allowed = new Set([
    'schemaVersion', 'agentId', 'controllerId', 'sequence', 'status', 'health',
    'lastSeen', 'lastVerifiedAt', 'metadata', 'displayName', 'tags', 'revoked',
    'recordVersion', 'updatedAt', 'authorityState',
  ]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new RegistryError('invalid_emitted_record', `unexpected emitted field: ${key}`);
  }
  if (record.metadata !== undefined) {
    assertObject(record.metadata, 'metadata');
    assertSafeMetadata(record.metadata);
  }
  if (record.tags !== undefined && (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== 'string'))) throw new RegistryError('invalid_emitted_record', 'tags must be strings');
  return true;
}

function emptyState() {
  return {
    schema_version: REGISTRY_STATE_SCHEMA_VERSION,
    version: 0,
    records: {},
    seen_nonces: {},
    idempotency: {},
    quarantine: [],
    audit: [],
    identity_authorities: {},
    identity_wallet_verifications: {},
  };
}

export class MemoryRegistryStore {
  #state;

  constructor(state = emptyState()) {
    ensureIdentityStateMaps(state);
    validateStoredState(state);
    this.#state = clone(state);
  }

  async read() {
    ensureIdentityStateMaps(this.#state);
    return clone(this.#state);
  }

  async write(next, expectedVersion) {
    ensureIdentityStateMaps(next);
    validateStoredState(next);
    if (this.#state.version !== expectedVersion) {
      throw new RegistryConflictError('registry state changed while writing', { expectedVersion, actualVersion: this.#state.version });
    }
    this.#state = clone(next);
  }
}

export class JsonFileRegistryStore {
  #filePath;
  #lockPath;
  #lockWaitMs;

  constructor(filePath, { lockWaitMs = 2000 } = {}) {
    this.#filePath = filePath;
    this.#lockPath = `${filePath}.lock`;
    this.#lockWaitMs = lockWaitMs;
  }

  async read() {
    try {
      const state = parseJsonEnvelope(await readFile(this.#filePath, 'utf8'));
      ensureIdentityStateMaps(state);
      validateStoredState(state);
      return state;
    } catch (error) {
      if (error.code === 'ENOENT') return emptyState();
      throw error;
    }
  }

  async #lock() {
    const started = Date.now();
    while (Date.now() - started <= this.#lockWaitMs) {
      try {
        return await open(this.#lockPath, 'wx');
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    throw new RegistryConflictError('timed out waiting for registry persistence lock');
  }

  async write(next, expectedVersion) {
    validateStoredState(next);
    await mkdir(dirname(this.#filePath), { recursive: true });
    const lock = await this.#lock();
    try {
      const current = await this.read();
      ensureIdentityStateMaps(current);
      if (current.version !== expectedVersion) {
        throw new RegistryConflictError('registry file changed while writing', { expectedVersion, actualVersion: current.version });
      }
      const temporary = join(dirname(this.#filePath), `.${this.#filePath.split('/').pop()}.${process.pid}.${Date.now()}.tmp`);
      const handle = await open(temporary, 'w');
      try {
        await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.#filePath);
    } finally {
      await lock.close();
      await unlink(this.#lockPath).catch(() => {});
    }
  }
}

// JSON.parse silently keeps the last duplicate member. Registry signatures must
// never depend on that ordering, so API callers use this parser before any
// normalization or authentication step.
export function parseJsonEnvelope(text) {
  if (typeof text !== 'string') throw new RegistryError('invalid_json', 'request body must be JSON text');
  let index = 0;
  const whitespace = () => { while (/\s/.test(text[index] ?? '')) index += 1; };
  const parseString = () => {
    const start = index;
    if (text[index] !== '"') throw new RegistryError('invalid_json', `expected string at offset ${index}`);
    index += 1;
    let escaped = false;
    while (index < text.length) {
      const character = text[index++];
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === '"') return JSON.parse(text.slice(start, index));
      if (character < ' ') throw new RegistryError('invalid_json', `control character in string at offset ${index - 1}`);
    }
    throw new RegistryError('invalid_json', 'unterminated JSON string');
  };
  const parseValue = (path) => {
    whitespace();
    const character = text[index];
    if (character === '"') { parseString(); return; }
    if (character === '{') {
      index += 1;
      whitespace();
      const keys = new Set();
      if (text[index] === '}') { index += 1; return; }
      while (index < text.length) {
        whitespace();
        const key = parseString();
        if (keys.has(key)) throw new RegistryError('duplicate_json_key', `duplicate JSON key at ${path}.${key}`, { field: `${path}.${key}` });
        keys.add(key);
        whitespace();
        if (text[index++] !== ':') throw new RegistryError('invalid_json', `expected ':' at offset ${index - 1}`);
        parseValue(`${path}.${key}`);
        whitespace();
        if (text[index] === '}') { index += 1; return; }
        if (text[index++] !== ',') throw new RegistryError('invalid_json', `expected ',' at offset ${index - 1}`);
      }
      throw new RegistryError('invalid_json', 'unterminated JSON object');
    }
    if (character === '[') {
      index += 1;
      whitespace();
      if (text[index] === ']') { index += 1; return; }
      let item = 0;
      while (index < text.length) {
        parseValue(`${path}[${item}]`);
        item += 1;
        whitespace();
        if (text[index] === ']') { index += 1; return; }
        if (text[index++] !== ',') throw new RegistryError('invalid_json', `expected ',' at offset ${index - 1}`);
      }
      throw new RegistryError('invalid_json', 'unterminated JSON array');
    }
    const start = index;
    while (index < text.length && !/[\s,\]}]/.test(text[index])) index += 1;
    if (start === index || !/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)$/.test(text.slice(start, index))) {
      throw new RegistryError('invalid_json', `invalid JSON value at offset ${start}`);
    }
  };
  parseValue('$');
  whitespace();
  if (index !== text.length) throw new RegistryError('invalid_json', `trailing JSON at offset ${index}`);
  try { return JSON.parse(text); } catch { throw new RegistryError('invalid_json', 'request body is not valid JSON'); }
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (value === null) return 'null';
  throw new RegistryError('invalid_heartbeat', 'heartbeat contains an unsupported value');
}

export function buildHeartbeatSigningBytes(input) {
  const normalized = normalizeHeartbeat(input, { signatureRequired: false });
  return Buffer.from(canonicalize({
    domain: HEARTBEAT_DOMAIN,
    schema_version: normalized.schema_version,
    agent_id: normalized.agent_id,
    controller_id: normalized.controller_id,
    nonce: normalized.nonce,
    issued_at: normalized.issued_at,
    expires_at: normalized.expires_at,
    sequence: normalized.sequence,
    payload: normalized.payload,
  }));
}

export function signHeartbeat(input, privateKey) {
  return sign(null, buildHeartbeatSigningBytes(input), privateKey).toString('base64url');
}

function alias(input, snake, camel, { required = true, defaultValue } = {}) {
  const snakePresent = Object.prototype.hasOwnProperty.call(input, snake);
  const camelPresent = Object.prototype.hasOwnProperty.call(input, camel);
  if (snake !== camel && snakePresent && camelPresent) {
    throw new RegistryError('normalization_collision', `${snake} and ${camel} cannot both be supplied`, { field: snake });
  }
  const value = snakePresent ? input[snake] : camelPresent ? input[camel] : defaultValue;
  if (required && value === undefined) throw new RegistryError('invalid_heartbeat', `missing ${snake}`, { field: snake });
  return value;
}

function normalizePayload(payload) {
  if (!isPlainObject(payload)) throw new RegistryError('invalid_heartbeat', 'payload must be an object');
  const normalized = {};
  const consumed = new Set();
  const fields = [
    ['description', 'description'],
    ['display_name', 'displayName'],
    ['last_seen', 'lastSeen'],
    ['last_verified_at', 'lastVerifiedAt'],
    ['metadata', 'metadata'],
    ['profile_uri', 'profileUri'],
    ['status', 'status'],
    ['health', 'health'],
    ['tags', 'tags'],
  ];
  for (const [snake, camel] of fields) {
    if (Object.prototype.hasOwnProperty.call(payload, snake) || Object.prototype.hasOwnProperty.call(payload, camel)) {
      normalized[snake] = snake === 'metadata' ? redact(alias(payload, snake, camel), 'metadata') : alias(payload, snake, camel);
      consumed.add(snake);
      consumed.add(camel);
    }
  }
  for (const [key, value] of Object.entries(payload)) {
    if (consumed.has(key)) continue;
    const canonicalKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    if (AUTHORITY_FIELDS.has(key) || AUTHORITY_FIELDS.has(canonicalKey) || !MUTABLE_FIELDS.has(canonicalKey)) {
      throw new RegistryError('authority_mutation', `heartbeat field ${key} is not a mutable registry field`, { field: key });
    }
    normalized[canonicalKey] = value;
  }
  return normalized;
}

export function normalizeHeartbeat(input, { signatureRequired = true } = {}) {
  if (!isPlainObject(input)) throw new RegistryError('invalid_heartbeat', 'heartbeat must be an object');
  const normalized = {
    schema_version: alias(input, 'schema_version', 'schemaVersion', { defaultValue: HEARTBEAT_SCHEMA_VERSION }),
    agent_id: alias(input, 'agent_id', 'agentId'),
    controller_id: alias(input, 'controller_id', 'controllerId'),
    nonce: alias(input, 'nonce', 'nonce'),
    issued_at: alias(input, 'issued_at', 'issuedAt'),
    expires_at: alias(input, 'expires_at', 'expiresAt'),
    sequence: alias(input, 'sequence', 'sequence'),
    payload: normalizePayload(alias(input, 'payload', 'payload')),
    signature: alias(input, 'signature', 'signature', { required: signatureRequired, defaultValue: '' }),
  };
  if (normalized.schema_version !== HEARTBEAT_SCHEMA_VERSION) throw new RegistryError('unsupported_schema', 'unsupported heartbeat schema version');
  assertString(normalized.agent_id, 'agent_id');
  assertString(normalized.controller_id, 'controller_id');
  assertString(normalized.nonce, 'nonce');
  assertString(normalized.issued_at, 'issued_at');
  assertString(normalized.expires_at, 'expires_at');
  assertInteger(normalized.sequence, 'sequence', 1);
  if (signatureRequired) assertString(normalized.signature, 'signature');
  if (!Number.isFinite(Date.parse(normalized.issued_at)) || !Number.isFinite(Date.parse(normalized.expires_at))) {
    throw new RegistryError('invalid_time_window', 'issued_at and expires_at must be ISO date-times');
  }
  if (Date.parse(normalized.expires_at) <= Date.parse(normalized.issued_at)) {
    throw new RegistryError('invalid_time_window', 'expires_at must be after issued_at');
  }
  return normalized;
}

function normalizePublicKey(input, field) {
  if (!isPlainObject(input)) throw new RegistryError('invalid_schema', `${field} must be an object`, { field });
  const normalized = {
    key_id: alias(input, 'key_id', 'keyId'),
    algorithm: input.algorithm,
    public_key: alias(input, 'public_key', 'publicKey'),
    ...(Object.hasOwn(input, 'revoked_at') || Object.hasOwn(input, 'revokedAt')
      ? { revoked_at: alias(input, 'revoked_at', 'revokedAt', { required: false }) }
      : {}),
  };
  assertNoUnknown(input, new Set(['key_id', 'keyId', 'algorithm', 'public_key', 'publicKey', 'revoked_at', 'revokedAt']));
  validatePublicKey(normalized, field);
  return normalized;
}

function normalizeRegistryRecord(input) {
  if (!isPlainObject(input)) throw new RegistryError('invalid_schema', 'record must be an object');
  assertNoUnknown(input, new Set([
    'display_name', 'displayName', 'description', 'profile_uri', 'profileUri',
    'public_keys', 'publicKeys', 'status', 'authority', 'authority_state', 'authorityState',
    'spend', 'spend_limit', 'spendLimit', 'execution', 'execution_scope', 'executionScope',
    'wallet', 'wallet_address', 'walletAddress', 'controller', 'controller_id', 'controllerId',
  ]));
  for (const key of ['authority', 'authority_state', 'authorityState', 'spend', 'spend_limit', 'spendLimit', 'execution', 'execution_scope', 'executionScope', 'wallet', 'wallet_address', 'walletAddress', 'controller', 'controller_id', 'controllerId']) {
    if (Object.hasOwn(input, key)) throw new RegistryError('authority_mutation', `record field ${key} is not permitted`, { field: key });
  }
  const publicKeys = alias(input, 'public_keys', 'publicKeys');
  if (!Array.isArray(publicKeys)) throw new RegistryError('invalid_schema', 'record.public_keys must be an array');
  const normalized = {
    display_name: alias(input, 'display_name', 'displayName'),
    description: alias(input, 'description', 'description'),
    profile_uri: alias(input, 'profile_uri', 'profileUri'),
    public_keys: publicKeys.map((key, index) => normalizePublicKey(key, `record.public_keys[${index}]`)),
    status: alias(input, 'status', 'status'),
  };
  if (!['active', 'suspended'].includes(normalized.status)) throw new RegistryError('invalid_schema', 'record.status must be active or suspended');
  if (normalized.display_name.length > 160 || normalized.description.length > 4000 || normalized.profile_uri.length > 2048) {
    throw new RegistryError('invalid_schema', 'record field exceeds its maximum length');
  }
  return normalized;
}

export function normalizeRegistryWrite(input, { signatureRequired = true } = {}) {
  if (!isPlainObject(input)) throw new RegistryError('invalid_schema', 'registry write must be an object');
  assertNoUnknown(input, new Set(['schema_version', 'schemaVersion', 'request_id', 'requestId', 'agent_id', 'agentId', 'expected_version', 'expectedVersion', 'record', 'auth']));
  const authInput = input.auth;
  if (!isPlainObject(authInput)) throw new RegistryError('invalid_schema', 'auth must be an object');
  assertNoUnknown(authInput, new Set(['key_id', 'keyId', 'algorithm', 'signed_at', 'signedAt', 'expires_at', 'expiresAt', 'nonce', 'signature']));
  const normalizedAuth = {
    key_id: alias(authInput, 'key_id', 'keyId'),
    algorithm: authInput.algorithm,
    signed_at: alias(authInput, 'signed_at', 'signedAt'),
    expires_at: alias(authInput, 'expires_at', 'expiresAt'),
    nonce: authInput.nonce,
    ...(signatureRequired || Object.hasOwn(authInput, 'signature') ? { signature: authInput.signature ?? '' } : {}),
  };
  const normalized = {
    schema_version: alias(input, 'schema_version', 'schemaVersion'),
    request_id: alias(input, 'request_id', 'requestId'),
    agent_id: alias(input, 'agent_id', 'agentId'),
    expected_version: alias(input, 'expected_version', 'expectedVersion'),
    record: normalizeRegistryRecord(input.record),
    auth: normalizedAuth,
  };
  if (normalized.schema_version !== REGISTRY_WRITE_SCHEMA_VERSION) throw new RegistryError('unsupported_schema', 'unsupported registry write schema version');
  assertUuid(normalized.request_id, 'request_id');
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized.agent_id)) throw new RegistryError('invalid_schema', 'agent_id is invalid');
  assertInteger(normalized.expected_version, 'expected_version');
  if (normalized.auth.algorithm !== 'Ed25519') throw new RegistryError('invalid_schema', 'auth.algorithm must be Ed25519');
  assertDateTime(normalized.auth.signed_at, 'auth.signed_at');
  assertDateTime(normalized.auth.expires_at, 'auth.expires_at');
  if (Date.parse(normalized.auth.expires_at) <= Date.parse(normalized.auth.signed_at)) throw new RegistryError('invalid_time_window', 'auth.expires_at must be after auth.signed_at');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(normalized.auth.nonce ?? '')) throw new RegistryError('invalid_schema', 'auth.nonce is invalid');
  if (signatureRequired && !/^[A-Za-z0-9_-]{86}$/.test(normalized.auth.signature ?? '')) throw new RegistryError('invalid_signature', 'auth.signature is invalid');
  return normalized;
}

export function buildRegistryWriteSigningBytes(input) {
  const normalized = normalizeRegistryWrite(input, { signatureRequired: false });
  return Buffer.from(canonicalize({
    domain: REGISTRY_WRITE_DOMAIN,
    schema_version: normalized.schema_version,
    request_id: normalized.request_id,
    agent_id: normalized.agent_id,
    expected_version: normalized.expected_version,
    record: normalized.record,
    auth: {
      key_id: normalized.auth.key_id,
      algorithm: normalized.auth.algorithm,
      signed_at: normalized.auth.signed_at,
      expires_at: normalized.auth.expires_at,
      nonce: normalized.auth.nonce,
    },
  }));
}

export function signRegistryWrite(input, privateKey) {
  return sign(null, buildRegistryWriteSigningBytes(input), privateKey).toString('base64url');
}

export function normalizeSignedHeartbeat(input, { signatureRequired = true } = {}) {
  if (!isPlainObject(input)) throw new RegistryError('invalid_schema', 'signed heartbeat must be an object');
  assertNoUnknown(input, new Set(['schema_version', 'schemaVersion', 'request_id', 'requestId', 'agent_id', 'agentId', 'key_id', 'keyId', 'heartbeat_seq', 'heartbeatSeq', 'sent_at', 'sentAt', 'payload', 'signature']));
  if (!isPlainObject(input.payload)) throw new RegistryError('invalid_schema', 'payload must be an object');
  assertNoUnknown(input.payload, new Set(['status', 'expires_at', 'expiresAt']));
  const normalized = {
    schema_version: alias(input, 'schema_version', 'schemaVersion'),
    request_id: alias(input, 'request_id', 'requestId'),
    agent_id: alias(input, 'agent_id', 'agentId'),
    key_id: alias(input, 'key_id', 'keyId'),
    heartbeat_seq: alias(input, 'heartbeat_seq', 'heartbeatSeq'),
    sent_at: alias(input, 'sent_at', 'sentAt'),
    payload: {
      status: input.payload.status,
      expires_at: alias(input.payload, 'expires_at', 'expiresAt'),
    },
    ...(signatureRequired || Object.hasOwn(input, 'signature') ? { signature: input.signature ?? '' } : {}),
  };
  if (normalized.schema_version !== SIGNED_HEARTBEAT_SCHEMA_VERSION) throw new RegistryError('unsupported_schema', 'unsupported signed heartbeat schema version');
  assertUuid(normalized.request_id, 'request_id');
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized.agent_id)) throw new RegistryError('invalid_schema', 'agent_id is invalid');
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(normalized.key_id)) throw new RegistryError('invalid_schema', 'key_id is invalid');
  assertInteger(normalized.heartbeat_seq, 'heartbeat_seq');
  assertDateTime(normalized.sent_at, 'sent_at');
  assertDateTime(normalized.payload.expires_at, 'payload.expires_at');
  if (!['online', 'degraded'].includes(normalized.payload.status)) throw new RegistryError('invalid_schema', 'payload.status is invalid');
  if (Date.parse(normalized.payload.expires_at) <= Date.parse(normalized.sent_at)) throw new RegistryError('invalid_time_window', 'payload.expires_at must be after sent_at');
  if (signatureRequired && !/^[A-Za-z0-9_-]{86}$/.test(normalized.signature ?? '')) throw new RegistryError('invalid_signature', 'signature is invalid');
  return normalized;
}

export function buildSignedHeartbeatSigningBytes(input) {
  const normalized = normalizeSignedHeartbeat(input, { signatureRequired: false });
  return Buffer.from(canonicalize({
    domain: HEARTBEAT_DOMAIN,
    schema_version: normalized.schema_version,
    request_id: normalized.request_id,
    agent_id: normalized.agent_id,
    key_id: normalized.key_id,
    heartbeat_seq: normalized.heartbeat_seq,
    sent_at: normalized.sent_at,
    payload: normalized.payload,
  }));
}

export function signSignedHeartbeat(input, privateKey) {
  return sign(null, buildSignedHeartbeatSigningBytes(input), privateKey).toString('base64url');
}

function optionalAlias(input, snake, camel) {
  return Object.hasOwn(input, snake) || Object.hasOwn(input, camel)
    ? alias(input, snake, camel, { required: false })
    : undefined;
}

function normalizeStringSet(values, field) {
  if (!Array.isArray(values) || values.length === 0) throw new RegistryError('invalid_schema', `${field} must be a non-empty array`, { field });
  const normalized = values.map((value, index) => {
    assertString(value, `${field}[${index}]`);
    return value;
  });
  return [...new Set(normalized)].sort();
}

function normalizeChainSet(values, field) {
  if (!Array.isArray(values) || values.length === 0) throw new RegistryError('invalid_schema', `${field} must be a non-empty array`, { field });
  return [...new Set(values.map((value, index) => normalizeChainId(value, `${field}[${index}]`)))].sort((a, b) => a - b);
}

function normalizeOwnerSigner(input, field) {
  assertObject(input, field);
  assertNoUnknown(input, new Set(['address', 'key_id', 'keyId', 'public_key', 'publicKey']), 'invalid_schema');
  const signer = {
    address: normalizeAddress(alias(input, 'address', 'address'), `${field}.address`),
    key_id: alias(input, 'key_id', 'keyId'),
    public_key: alias(input, 'public_key', 'publicKey'),
  };
  validateAuthoritySigner(signer, field);
  return signer;
}

function normalizeRevocableSigner(input, field, rootRevision) {
  assertObject(input, field);
  assertNoUnknown(input, new Set([
    'address', 'key_id', 'keyId', 'public_key', 'publicKey', 'authority_class', 'authorityClass',
    'scopes', 'methods', 'chain_ids', 'chainIds', 'expires_at', 'expiresAt', 'revoked_at',
    'revokedAt', 'revocation_epoch', 'revocationEpoch', 'safe_root_revision', 'safeRootRevision',
  ]), 'invalid_schema');
  const signer = {
    address: normalizeAddress(alias(input, 'address', 'address'), `${field}.address`),
    key_id: alias(input, 'key_id', 'keyId'),
    public_key: alias(input, 'public_key', 'publicKey'),
    authority_class: alias(input, 'authority_class', 'authorityClass'),
    scopes: normalizeStringSet(alias(input, 'scopes', 'scopes'), `${field}.scopes`),
    methods: normalizeStringSet(alias(input, 'methods', 'methods'), `${field}.methods`),
    chain_ids: normalizeChainSet(alias(input, 'chain_ids', 'chainIds'), `${field}.chain_ids`),
    expires_at: alias(input, 'expires_at', 'expiresAt'),
    revoked_at: optionalAlias(input, 'revoked_at', 'revokedAt') ?? null,
    revocation_epoch: optionalAlias(input, 'revocation_epoch', 'revocationEpoch') ?? 0,
    safe_root_revision: optionalAlias(input, 'safe_root_revision', 'safeRootRevision') ?? rootRevision,
  };
  validateAuthoritySigner(signer, field, { revocable: true });
  return signer;
}

export function normalizeIdentityWalletAuthority(input) {
  if (!isPlainObject(input)) throw new RegistryError('invalid_schema', 'identity authority must be an object');
  assertNoUnknown(input, new Set([
    'schema_version', 'schemaVersion', 'request_id', 'requestId', 'agent_id', 'agentId',
    'identity_principal', 'identityPrincipal', 'safe_address', 'safeAddress',
    'safe_chain_id', 'safeChainId', 'supported_chain_ids', 'supportedChainIds',
    'safe_threshold', 'safeThreshold', 'owner_signers', 'ownerSigners',
    'revocable_signers', 'revocableSigners', 'root_revision', 'rootRevision',
    'observed_at', 'observedAt',
  ]), 'invalid_schema');
  const agentId = alias(input, 'agent_id', 'agentId');
  const rootRevision = optionalAlias(input, 'root_revision', 'rootRevision') ?? `safe-root:${digest({
    agent_id: agentId,
    safe_address: optionalAlias(input, 'safe_address', 'safeAddress'),
    safe_chain_id: optionalAlias(input, 'safe_chain_id', 'safeChainId'),
    owner_signers: optionalAlias(input, 'owner_signers', 'ownerSigners') ?? [],
  }).slice(0, 24)}`;
  const authority = {
    schema_version: alias(input, 'schema_version', 'schemaVersion', { defaultValue: IDENTITY_WALLET_AUTHORITY_SCHEMA_VERSION }),
    agent_id: agentId,
    identity_principal: optionalAlias(input, 'identity_principal', 'identityPrincipal') ?? canonicalIdentityPrincipal(agentId),
    safe_address: normalizeAddress(alias(input, 'safe_address', 'safeAddress'), 'safe_address'),
    safe_chain_id: normalizeChainId(alias(input, 'safe_chain_id', 'safeChainId'), 'safe_chain_id'),
    supported_chain_ids: normalizeChainSet(alias(input, 'supported_chain_ids', 'supportedChainIds'), 'supported_chain_ids'),
    safe_threshold: alias(input, 'safe_threshold', 'safeThreshold'),
    owner_signers: alias(input, 'owner_signers', 'ownerSigners').map((signer, index) => normalizeOwnerSigner(signer, `owner_signers[${index}]`)),
    revocable_signers: (optionalAlias(input, 'revocable_signers', 'revocableSigners') ?? []).map((signer, index) => normalizeRevocableSigner(signer, `revocable_signers[${index}]`, rootRevision)),
    root_revision: rootRevision,
    observed_at: alias(input, 'observed_at', 'observedAt'),
    updated_at: alias(input, 'observed_at', 'observedAt'),
  };
  validateIdentityAuthorityRecord(authority);
  return authority;
}

function normalizeProofSigner(input, field) {
  assertObject(input, field);
  assertNoUnknown(input, new Set([
    'address', 'authority_class', 'authorityClass', 'key_id', 'keyId',
    'safe_root_revision', 'safeRootRevision',
  ]), 'invalid_schema');
  const signer = {
    address: normalizeAddress(alias(input, 'address', 'address'), `${field}.address`),
    authority_class: alias(input, 'authority_class', 'authorityClass'),
    key_id: optionalAlias(input, 'key_id', 'keyId') ?? '',
    safe_root_revision: optionalAlias(input, 'safe_root_revision', 'safeRootRevision') ?? '',
  };
  if (!['safe_owner', 'revocable_signer', 'session_key'].includes(signer.authority_class)) {
    throw new RegistryError('invalid_schema', `${field}.authority_class is invalid`);
  }
  return signer;
}

function normalizeProofDetails(input, field, { signatureRequired }) {
  assertObject(input, field);
  assertNoUnknown(input, new Set([
    'method', 'domain', 'uri', 'audience', 'nonce', 'issued_at', 'issuedAt',
    'expires_at', 'expiresAt', 'statement', 'signature',
  ]), 'invalid_schema');
  const proof = {
    method: alias(input, 'method', 'method'),
    domain: alias(input, 'domain', 'domain'),
    uri: alias(input, 'uri', 'uri'),
    audience: alias(input, 'audience', 'audience'),
    nonce: alias(input, 'nonce', 'nonce'),
    issued_at: alias(input, 'issued_at', 'issuedAt'),
    expires_at: alias(input, 'expires_at', 'expiresAt'),
    statement: optionalAlias(input, 'statement', 'statement') ?? '',
    ...(signatureRequired || Object.hasOwn(input, 'signature') ? { signature: input.signature ?? '' } : {}),
  };
  if (!IDENTITY_WALLET_PROOF_METHODS.includes(proof.method)) throw new RegistryError('invalid_schema', 'proof.method is unsupported');
  if (proof.domain !== 'agent.bittrees.org') throw new RegistryError('domain_mismatch', 'proof.domain must be agent.bittrees.org');
  if (proof.audience !== 'agent.bittrees.org') throw new RegistryError('audience_mismatch', 'proof.audience must be agent.bittrees.org');
  if (!/^https:\/\/agent\.bittrees\.org(?:\/|$)/.test(proof.uri)) throw new RegistryError('domain_mismatch', 'proof.uri must be on agent.bittrees.org');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(proof.nonce ?? '')) throw new RegistryError('invalid_schema', 'proof.nonce is invalid');
  assertDateTime(proof.issued_at, 'proof.issued_at');
  assertDateTime(proof.expires_at, 'proof.expires_at');
  if (Date.parse(proof.expires_at) <= Date.parse(proof.issued_at)) throw new RegistryError('invalid_time_window', 'proof.expires_at must be after proof.issued_at');
  if (signatureRequired && !/^[A-Za-z0-9_-]{86}$/.test(proof.signature ?? '')) throw new RegistryError('invalid_signature', 'proof.signature is invalid');
  return proof;
}

export function normalizeIdentityWalletProof(input, { signatureRequired = true } = {}) {
  if (!isPlainObject(input)) throw new RegistryError('invalid_schema', 'identity wallet proof must be an object');
  assertNoUnknown(input, new Set([
    'schema_version', 'schemaVersion', 'request_id', 'requestId', 'agent_id', 'agentId',
    'expected_version', 'expectedVersion', 'identity_principal', 'identityPrincipal',
    'wallet_address', 'walletAddress', 'wallet_chain_id', 'walletChainId',
    'safe_address', 'safeAddress', 'requested_scope', 'requestedScope', 'proof',
    'signer', 'source_event_uids', 'sourceEventUids',
  ]), 'invalid_schema');
  const normalized = {
    schema_version: alias(input, 'schema_version', 'schemaVersion'),
    request_id: alias(input, 'request_id', 'requestId'),
    agent_id: alias(input, 'agent_id', 'agentId'),
    expected_version: alias(input, 'expected_version', 'expectedVersion'),
    identity_principal: alias(input, 'identity_principal', 'identityPrincipal'),
    wallet_address: normalizeAddress(alias(input, 'wallet_address', 'walletAddress'), 'wallet_address'),
    wallet_chain_id: normalizeChainId(alias(input, 'wallet_chain_id', 'walletChainId'), 'wallet_chain_id'),
    safe_address: normalizeAddress(alias(input, 'safe_address', 'safeAddress'), 'safe_address'),
    requested_scope: optionalAlias(input, 'requested_scope', 'requestedScope') ?? 'identity.verify',
    signer: normalizeProofSigner(alias(input, 'signer', 'signer'), 'signer'),
    proof: normalizeProofDetails(alias(input, 'proof', 'proof'), 'proof', { signatureRequired }),
    source_event_uids: optionalAlias(input, 'source_event_uids', 'sourceEventUids') ?? [],
  };
  if (normalized.schema_version !== IDENTITY_WALLET_PROOF_SCHEMA_VERSION) throw new RegistryError('unsupported_schema', 'unsupported identity wallet proof schema version');
  assertUuid(normalized.request_id, 'request_id');
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized.agent_id)) throw new RegistryError('invalid_schema', 'agent_id is invalid');
  assertInteger(normalized.expected_version, 'expected_version');
  if (normalized.identity_principal !== canonicalIdentityPrincipal(normalized.agent_id)) throw new RegistryError('identity_binding_mismatch', 'identity_principal must be canonical agent.bittrees.eth name');
  assertString(normalized.requested_scope, 'requested_scope');
  if (!Array.isArray(normalized.source_event_uids) || normalized.source_event_uids.some((uid) => typeof uid !== 'string')) throw new RegistryError('invalid_schema', 'source_event_uids must be strings');
  return normalized;
}

export function buildIdentityWalletProofSigningBytes(input) {
  const normalized = normalizeIdentityWalletProof(input, { signatureRequired: false });
  return Buffer.from(canonicalize({
    domain: IDENTITY_WALLET_PROOF_DOMAIN,
    schema_version: normalized.schema_version,
    request_id: normalized.request_id,
    agent_id: normalized.agent_id,
    expected_version: normalized.expected_version,
    identity_principal: normalized.identity_principal,
    wallet_address: normalized.wallet_address,
    wallet_chain_id: normalized.wallet_chain_id,
    safe_address: normalized.safe_address,
    requested_scope: normalized.requested_scope,
    signer: normalized.signer,
    proof: {
      method: normalized.proof.method,
      domain: normalized.proof.domain,
      uri: normalized.proof.uri,
      audience: normalized.proof.audience,
      nonce: normalized.proof.nonce,
      issued_at: normalized.proof.issued_at,
      expires_at: normalized.proof.expires_at,
      statement: normalized.proof.statement,
    },
    source_event_uids: normalized.source_event_uids,
  }));
}

export function signIdentityWalletProof(input, privateKey) {
  return sign(null, buildIdentityWalletProofSigningBytes(input), privateKey).toString('base64url');
}

function digest(value) {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

function decodeSignature(value) {
  try {
    return Buffer.from(value, /^[A-Za-z0-9_-]+$/.test(value) ? 'base64url' : 'base64');
  } catch {
    throw new RegistryError('invalid_signature', 'signature is not valid base64');
  }
}

function redact(value, key = '') {
  const sensitiveKey = /secret|private|token|password|credential|authorization|signature|wallet|seed|bearer/i.test(key);
  if (sensitiveKey) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item, key));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  if (typeof value === 'string' && /(?:bearer\s+|sk[-_]|-----begin|private[_ -]?key)/i.test(value)) return '[REDACTED]';
  return value;
}

function safeIdentity(input, field) {
  const value = input?.[field] ?? input?.[field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())];
  return typeof value === 'string' && value.length <= 256 ? value : undefined;
}

function authorityState() {
  return {
    authority_changes_allowed: false,
    spend_allowed: false,
    execution_allowed: false,
    reason: 'registry refresh state is evidence only; explicit operator approval is required for authority, spend, or execution changes',
  };
}

function makeSeedRecord({ agent_id, controller_id, controller_public_key, controller_key_id = 'controller', description = '', profile_uri = '', now, metadata = {}, display_name = agent_id, public_safe = false }) {
  return {
    schema_version: REGISTRY_RECORD_SCHEMA_VERSION,
    agent_id,
    controller_id,
    controller_public_key,
    controller_key_id,
    public_keys: [{ key_id: controller_key_id, algorithm: 'Ed25519', public_key: controller_public_key }],
    sequence: 0,
    status: 'registered',
    health: 'unknown',
    display_name,
    description,
    metadata: clone(metadata),
    tags: [],
    last_seen: new Date(now).toISOString(),
    public_safe,
    revoked: false,
    record_version: 1,
    updated_at: new Date(now).toISOString(),
    authority_state: authorityState(),
    ...(profile_uri ? { profile_uri } : {}),
  };
}

function eventId(version, event) {
  return `audit-${version}-${digest(event).slice(0, 16)}`;
}

export class RegistryControlPlane {
  #store;
  #clock;
  #maxClockSkewMs;
  #maxHeartbeatLifetimeMs;
  #queue = Promise.resolve();

  constructor({
    store = new MemoryRegistryStore(),
    clock = () => Date.now(),
    maxClockSkewMs = DEFAULT_CLOCK_SKEW_MS,
    maxHeartbeatLifetimeMs = DEFAULT_MAX_HEARTBEAT_LIFETIME_MS,
  } = {}) {
    this.#store = store;
    this.#clock = clock;
    this.#maxClockSkewMs = maxClockSkewMs;
    this.#maxHeartbeatLifetimeMs = maxHeartbeatLifetimeMs;
  }

  async #withLock(operation) {
    const previous = this.#queue;
    let release;
    this.#queue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async #commit(state, mutate, audit) {
    const next = ensureIdentityStateMaps(clone(state));
    next.version += 1;
    mutate(next, next.version);
    if (next.audit.length < state.audit.length
      || canonicalize(next.audit.slice(0, state.audit.length)) !== canonicalize(state.audit)
      || next.quarantine.length < state.quarantine.length
      || canonicalize(next.quarantine.slice(0, state.quarantine.length)) !== canonicalize(state.quarantine)) {
      throw new RegistryError('append_only_violation', 'audit and quarantine records are append-only');
    }
    const previous = next.audit.at(-1);
    const event = {
      event_id: eventId(next.version, audit),
      event_type: audit.event_type,
      agent_id: audit.agent_id,
      controller_id: audit.controller_id,
      request_id: audit.request_id,
      reason: audit.reason,
      envelope_digest: audit.envelope_digest,
      record_version: audit.record_version ?? next.version,
      occurred_at: new Date(this.#clock()).toISOString(),
      previous_hash: previous?.event_hash ?? null,
    };
    event.event_hash = digest(event);
    next.audit.push(redact(event));
    validateStoredState(next);
    await this.#store.write(next, state.version);
    return { next, event };
  }

  async bootstrapAgent({ agentId, controllerId, controllerPublicKey, controllerKeyId = 'controller', metadata, displayName, description = '', profileUri = '', publicSafe = false }) {
    return this.#withLock(async () => {
      assertString(agentId, 'agentId');
      assertString(controllerId, 'controllerId');
      assertString(controllerPublicKey, 'controllerPublicKey');
      if (typeof publicSafe !== 'boolean') throw new RegistryError('invalid_publication_state', 'publicSafe must be boolean');
      try { toPublicKeyObject(controllerPublicKey); } catch { throw new RegistryError('invalid_controller_key', 'controllerPublicKey is not a valid public key'); }
      const state = await this.#store.read();
      if (state.records[agentId]) throw new RegistryError('already_registered', `agent ${agentId} is already registered`);
      const now = this.#clock();
      const record = makeSeedRecord({
        agent_id: agentId,
        controller_id: controllerId,
        controller_public_key: controllerPublicKey,
        controller_key_id: controllerKeyId,
        description,
        profile_uri: profileUri,
        metadata,
        display_name: displayName,
        public_safe: publicSafe,
        now,
      });
      const { event } = await this.#commit(state, (next) => {
        next.records[agentId] = record;
        next.seen_nonces[agentId] = {};
      }, { event_type: 'agent.bootstrapped', agent_id: agentId, controller_id: controllerId, reason: 'explicit bootstrap only' });
      return { status: 'bootstrapped', record: clone(record), audit_event_id: event.event_id };
    });
  }

  async configureIdentityWalletAuthority(input) {
    return this.#withLock(async () => {
      const state = await this.#store.read();
      const authority = normalizeIdentityWalletAuthority(input);
      const record = state.records[authority.agent_id];
      if (!record) throw new RegistryError('unknown_agent', `unknown agent ${authority.agent_id}`);
      const requestId = optionalAlias(input, 'request_id', 'requestId');
      if (requestId !== undefined) assertUuid(requestId, 'request_id');
      const envelopeDigest = digest(authority);
      const { event } = await this.#commit(state, (next) => {
        next.identity_authorities[authority.agent_id] = {
          ...authority,
          updated_at: new Date(this.#clock()).toISOString(),
        };
      }, {
        event_type: 'identity.authority.configured',
        agent_id: authority.agent_id,
        controller_id: record.controller_id,
        request_id: requestId,
        reason: 'operator supplied Safe identity authority snapshot',
        envelope_digest: envelopeDigest,
      });
      return { status: 'configured', agent_id: authority.agent_id, identity_principal: authority.identity_principal, safe_address: authority.safe_address, audit_event_id: event.event_id };
    });
  }

  #resolveIdentitySigner(authority, proof, now) {
    const signerAddress = proof.signer.address;
    if (proof.signer.authority_class === 'safe_owner') {
      const owner = authority.owner_signers.find((candidate) => candidate.address === signerAddress);
      if (!owner) throw new RegistryError('unauthorized_signer', 'proof signer is not a Safe owner for this identity');
      return {
        address: owner.address,
        key_id: owner.key_id,
        public_key: owner.public_key,
        authority_class: 'safe_owner',
        scopes: ['identity.verify'],
        methods: [proof.proof.method],
        chain_ids: [authority.safe_chain_id],
        expires_at: proof.proof.expires_at,
        revocation_epoch: 0,
        safe_root_revision: authority.root_revision,
      };
    }
    const delegate = authority.revocable_signers.find((candidate) => candidate.address === signerAddress);
    if (!delegate) throw new RegistryError('unauthorized_signer', 'proof signer is not an active revocable signer for this identity');
    if (delegate.authority_class !== proof.signer.authority_class) throw new RegistryError('unauthorized_signer', 'proof signer authority class does not match the authority snapshot');
    if (proof.signer.safe_root_revision && proof.signer.safe_root_revision !== authority.root_revision) throw new RegistryError('safe_root_mismatch', 'proof signer is bound to a stale Safe root revision');
    if (delegate.safe_root_revision !== authority.root_revision) throw new RegistryError('safe_root_mismatch', 'revocable signer is bound to a stale Safe root revision');
    if (delegate.revoked_at && Date.parse(delegate.revoked_at) <= now) throw new RegistryError('signer_revoked', 'revocable signer has been revoked');
    if (Date.parse(delegate.expires_at) <= now) throw new RegistryError('signer_expired', 'revocable signer has expired');
    if (!delegate.scopes.includes(proof.requested_scope)) throw new RegistryError('scope_not_authorized', 'revocable signer does not cover the requested scope');
    if (!delegate.methods.includes(proof.proof.method)) throw new RegistryError('method_not_authorized', 'revocable signer does not cover this proof method');
    if (!delegate.chain_ids.includes(proof.wallet_chain_id)) throw new RegistryError('unsupported_network', 'revocable signer does not cover this wallet chain');
    return delegate;
  }

  #assertIdentityProofFresh(proof, now) {
    const issuedAt = Date.parse(proof.proof.issued_at);
    const expiresAt = Date.parse(proof.proof.expires_at);
    if (issuedAt > now + this.#maxClockSkewMs || Math.abs(now - issuedAt) > this.#maxHeartbeatLifetimeMs) {
      throw new RegistryError('stale_signature', 'identity wallet proof is outside the accepted clock window');
    }
    if (expiresAt <= now) throw new RegistryError('expired', 'identity wallet proof has expired');
    if (expiresAt - issuedAt > DEFAULT_MAX_IDENTITY_PROOF_LIFETIME_MS) throw new RegistryError('expiry_window_too_long', 'identity wallet proof expiry window is too long');
  }

  #assertIdentityAuthorityMatches(authority, proof) {
    if (proof.identity_principal !== authority.identity_principal) throw new RegistryError('identity_binding_mismatch', 'proof identity principal does not match authority snapshot');
    if (proof.wallet_address !== authority.safe_address || proof.safe_address !== authority.safe_address) {
      throw new RegistryError('safe_binding_mismatch', 'wallet proof subject must be the configured Safe public identity');
    }
    if (proof.wallet_chain_id !== authority.safe_chain_id || !authority.supported_chain_ids.includes(proof.wallet_chain_id)) {
      throw new RegistryError('unsupported_network', 'wallet proof chain is not supported by this identity authority');
    }
    if (!SUPPORTED_IDENTITY_WALLET_CHAIN_IDS.includes(proof.wallet_chain_id)) throw new RegistryError('unsupported_network', 'wallet proof chain is not supported by the portal verifier');
  }

  async recordIdentityWalletVerification(input) {
    return this.#withLock(async () => {
      const state = await this.#store.read();
      let proof;
      let envelopeDigest;
      try {
        proof = normalizeIdentityWalletProof(input);
        envelopeDigest = digest(proof);
      } catch (error) {
        return this.#quarantine(state, input, error.code ?? 'invalid_schema', error.message, undefined, 'identity.wallet.proof.quarantined');
      }
      const record = state.records[proof.agent_id];
      if (!record || record.revoked) return this.#quarantine(state, proof, record?.revoked ? 'revoked' : 'unknown_agent', record?.revoked ? 'agent is revoked' : `unknown agent ${proof.agent_id}`, envelopeDigest, 'identity.wallet.proof.quarantined');
      const authority = state.identity_authorities?.[proof.agent_id];
      if (!authority) return this.#quarantine(state, proof, 'unknown_identity_authority', 'identity authority snapshot is not configured', envelopeDigest, 'identity.wallet.proof.quarantined');
      const idempotencyKey = `identity-wallet:${proof.request_id}`;
      const previousRequest = state.idempotency[idempotencyKey];
      if (previousRequest) {
        if (previousRequest.envelope_digest !== envelopeDigest) return this.#quarantine(state, proof, 'request_id_reuse', 'request_id was already used for a different identity wallet proof', envelopeDigest, 'identity.wallet.proof.quarantined');
        const { event } = await this.#commit(state, () => {}, {
          event_type: 'identity.wallet.proof.idempotent', agent_id: proof.agent_id, controller_id: record.controller_id,
          request_id: proof.request_id, reason: 'exact identity wallet proof retry', envelope_digest: envelopeDigest,
          record_version: previousRequest.record_version,
        });
        return { status: 'idempotent', verified: true, agent_id: proof.agent_id, record_version: previousRequest.record_version, audit_event_id: event.event_id };
      }
      const key = verificationKey(proof.agent_id, proof.wallet_address);
      const currentVerification = state.identity_wallet_verifications?.[key];
      const currentVersion = currentVerification?.record_version ?? 0;
      if (proof.expected_version !== currentVersion) {
        const { event } = await this.#commit(state, () => {}, {
          event_type: 'identity.wallet.proof.conflict', agent_id: proof.agent_id, controller_id: record.controller_id,
          request_id: proof.request_id, reason: 'expected_version does not match current identity wallet verification version',
          envelope_digest: envelopeDigest, record_version: currentVersion,
        });
        throw new RegistryConflictError('identity wallet verification version conflict', { expectedVersion: proof.expected_version, actualVersion: currentVersion, audit_event_id: event.event_id });
      }
      try {
        const now = this.#clock();
        this.#assertIdentityProofFresh(proof, now);
        this.#assertIdentityAuthorityMatches(authority, proof);
        const signer = this.#resolveIdentitySigner(authority, proof, now);
        const nonceKey = `identity-wallet:${proof.signer.address}:${proof.proof.nonce}`;
        if (state.seen_nonces[proof.agent_id]?.[nonceKey]) throw new RegistryError('replay', 'identity wallet proof nonce was already consumed');
        let signatureValid = false;
        try { signatureValid = verify(null, buildIdentityWalletProofSigningBytes(proof), toPublicKeyObject(signer.public_key), decodeSignature(proof.proof.signature)); } catch { signatureValid = false; }
        if (!signatureValid) throw new RegistryError('invalid_signature', 'identity wallet proof signature did not verify for the authorized signer');
        const expiresAt = new Date(Math.min(Date.parse(proof.proof.expires_at), Date.parse(signer.expires_at))).toISOString();
        const verification = {
          schema_version: IDENTITY_WALLET_VERIFICATION_RECORD_SCHEMA_VERSION,
          verification_id: `iwv-${digest({ key, envelopeDigest }).slice(0, 24)}`,
          agent_id: proof.agent_id,
          subject_kind: 'agent',
          identity_principal: authority.identity_principal,
          wallet_address: proof.wallet_address,
          wallet_chain_id: proof.wallet_chain_id,
          safe_address: authority.safe_address,
          verification_status: 'verified',
          verification_method: proof.proof.method,
          proof_digest: `sha256:${envelopeDigest}`,
          proof_subject: proof.wallet_address,
          proof_signer: proof.signer.address,
          signer_authority_class: signer.authority_class,
          session_key_scope: {
            status: signer.authority_class === 'safe_owner' ? 'none' : 'active',
            authority_class: signer.authority_class,
            scopes: clone(signer.scopes),
            chain_ids: clone(signer.chain_ids),
            methods: clone(signer.methods),
            expires_at: expiresAt,
            revocation_epoch: signer.revocation_epoch,
            safe_root_revision: signer.safe_root_revision,
          },
          safe_authority: {
            safe_address: authority.safe_address,
            safe_chain_id: authority.safe_chain_id,
            threshold: authority.safe_threshold,
            owner_count: authority.owner_signers.length,
            root_revision: authority.root_revision,
            supported_chain_ids: clone(authority.supported_chain_ids),
          },
          verified_at: new Date(now).toISOString(),
          expires_at: expiresAt,
          revoked_at: null,
          conflict_code: null,
          source_event_uids: clone(proof.source_event_uids),
          record_version: state.version + 1,
          updated_at: new Date(now).toISOString(),
        };
        validateVerificationRecord(verification);
        const { event } = await this.#commit(state, (next, version) => {
          next.identity_wallet_verifications[key] = { ...verification, record_version: version };
          next.seen_nonces[proof.agent_id] ??= {};
          next.seen_nonces[proof.agent_id][nonceKey] = { digest: envelopeDigest, request_id: proof.request_id };
          next.idempotency[idempotencyKey] = { envelope_digest: envelopeDigest, record_version: version, agent_id: proof.agent_id };
        }, {
          event_type: 'identity.wallet.proof.accepted', agent_id: proof.agent_id, controller_id: record.controller_id,
          request_id: proof.request_id, reason: 'identity wallet proof verified against Safe authority snapshot',
          envelope_digest: envelopeDigest,
        });
        return { status: 'accepted', verified: true, agent_id: proof.agent_id, wallet_address: proof.wallet_address, record_version: verification.record_version, audit_event_id: event.event_id, verification: clone({ ...verification, record_version: event.record_version }) };
      } catch (error) {
        return this.#quarantine(state, proof, error.code ?? 'identity_wallet_proof_rejected', error.message, envelopeDigest, 'identity.wallet.proof.quarantined');
      }
    });
  }

  async revokeIdentityWalletSigner({ agentId, signerAddress, reason = 'operator signer revocation', revokedAt = new Date(this.#clock()).toISOString() } = {}) {
    return this.#withLock(async () => {
      assertString(agentId, 'agentId');
      const normalizedSigner = normalizeAddress(signerAddress, 'signerAddress');
      assertDateTime(revokedAt, 'revokedAt');
      const state = await this.#store.read();
      const authority = state.identity_authorities?.[agentId];
      if (!authority) throw new RegistryError('unknown_identity_authority', `identity authority is not configured for ${agentId}`);
      const index = authority.revocable_signers.findIndex((signer) => signer.address === normalizedSigner);
      if (index === -1) throw new RegistryError('signer_not_revocable', 'signer is not a revocable signer for this identity');
      const { event } = await this.#commit(state, (next, version) => {
        const nextAuthority = clone(next.identity_authorities[agentId]);
        nextAuthority.revocable_signers[index] = {
          ...nextAuthority.revocable_signers[index],
          revoked_at: revokedAt,
          revocation_epoch: nextAuthority.revocable_signers[index].revocation_epoch + 1,
        };
        nextAuthority.updated_at = new Date(this.#clock()).toISOString();
        next.identity_authorities[agentId] = nextAuthority;
        for (const [key, verification] of Object.entries(next.identity_wallet_verifications)) {
          if (verification.agent_id !== agentId || verification.proof_signer !== normalizedSigner || verification.verification_status !== 'verified') continue;
          next.identity_wallet_verifications[key] = {
            ...verification,
            verification_status: 'revoked',
            revoked_at: revokedAt,
            session_key_scope: {
              ...verification.session_key_scope,
              status: 'revoked',
              revocation_epoch: nextAuthority.revocable_signers[index].revocation_epoch,
            },
            record_version: version,
            updated_at: new Date(this.#clock()).toISOString(),
          };
        }
      }, {
        event_type: 'identity.wallet.signer.revoked',
        agent_id: agentId,
        reason: String(reason).slice(0, 256),
        envelope_digest: digest({ agentId, signerAddress: normalizedSigner, revokedAt, reason }),
      });
      return { status: 'revoked', agent_id: agentId, signer_address: normalizedSigner, audit_event_id: event.event_id };
    });
  }

  #resolvePublicKey(record, keyId) {
    const candidate = record.public_keys?.find((key) => key.key_id === keyId);
    if (candidate) {
      if (candidate.revoked_at && Date.parse(candidate.revoked_at) <= this.#clock()) return undefined;
      return { keyId: candidate.key_id, algorithm: candidate.algorithm, publicKey: candidate.public_key };
    }
    if (record.controller_key_id === keyId || (!record.controller_key_id && keyId === 'controller')) {
      return { keyId, algorithm: 'Ed25519', publicKey: record.controller_public_key };
    }
    return undefined;
  }

  async writeRegistry(input) {
    return this.#withLock(async () => {
      const state = await this.#store.read();
      let request;
      let envelopeDigest;
      try {
        request = normalizeRegistryWrite(input);
        envelopeDigest = digest(request);
      } catch (error) {
        return this.#quarantine(state, input, error.code ?? 'invalid_schema', error.message, undefined, 'registry.write.quarantined');
      }
      const record = state.records[request.agent_id];
      if (!record) return this.#quarantine(state, request, 'unknown_agent', `unknown agent ${request.agent_id}`, envelopeDigest, 'registry.write.quarantined');
      const idempotencyKey = `registry:${request.request_id}`;
      const previousRequest = state.idempotency[idempotencyKey];
      if (previousRequest) {
        if (previousRequest.envelope_digest !== envelopeDigest) return this.#quarantine(state, request, 'request_id_reuse', 'request_id was already used for a different request', envelopeDigest, 'registry.write.quarantined');
        const { event } = await this.#commit(state, () => {}, {
          event_type: 'registry.write.idempotent', agent_id: request.agent_id, controller_id: record.controller_id,
          request_id: request.request_id, reason: 'exact authenticated retry', envelope_digest: envelopeDigest,
          record_version: previousRequest.record_version,
        });
        return { status: 'idempotent', agent_id: request.agent_id, record_version: previousRequest.record_version, audit_event_id: event.event_id };
      }
      if (request.expected_version !== record.record_version) {
        const { event } = await this.#commit(state, () => {}, {
          event_type: 'registry.write.conflict', agent_id: request.agent_id, controller_id: record.controller_id,
          request_id: request.request_id, reason: 'expected_version does not match current record version', envelope_digest: envelopeDigest,
          record_version: record.record_version,
        });
        throw new RegistryConflictError('registry record version conflict', { expectedVersion: request.expected_version, actualVersion: record.record_version, audit_event_id: event.event_id });
      }
      if (record.revoked) return this.#quarantine(state, request, 'revoked', 'agent is revoked', envelopeDigest, 'registry.write.quarantined');
      const key = this.#resolvePublicKey(record, request.auth.key_id);
      if (!key || key.algorithm !== 'Ed25519') return this.#quarantine(state, request, 'unknown_or_revoked_key', 'auth key is not registered or has been revoked', envelopeDigest, 'registry.write.quarantined');
      const now = this.#clock();
      const signedAt = Date.parse(request.auth.signed_at);
      const expiresAt = Date.parse(request.auth.expires_at);
      if (Math.abs(now - signedAt) > this.#maxClockSkewMs) return this.#quarantine(state, request, 'stale_signature', 'auth signature is outside the accepted clock skew', envelopeDigest, 'registry.write.quarantined');
      if (expiresAt <= now) return this.#quarantine(state, request, 'expired', 'registry write authorization has expired', envelopeDigest, 'registry.write.quarantined');
      if (expiresAt - signedAt > this.#maxHeartbeatLifetimeMs) return this.#quarantine(state, request, 'expiry_window_too_long', 'registry write authorization window is too long', envelopeDigest, 'registry.write.quarantined');
      const nonceKey = `registry:${request.auth.key_id}:${request.auth.nonce}`;
      const previousNonce = state.seen_nonces[request.agent_id]?.[nonceKey];
      if (previousNonce) return this.#quarantine(state, request, 'replay', 'auth nonce was already consumed', envelopeDigest, 'registry.write.quarantined');
      let signatureValid = false;
      try { signatureValid = verify(null, buildRegistryWriteSigningBytes(request), toPublicKeyObject(key.publicKey), decodeSignature(request.auth.signature)); } catch { signatureValid = false; }
      if (!signatureValid) return this.#quarantine(state, request, 'invalid_signature', 'registry write signature did not verify', envelopeDigest, 'registry.write.quarantined');
      if (record.public_keys && canonicalize(record.public_keys) !== canonicalize(request.record.public_keys)) {
        return this.#quarantine(state, request, 'key_rotation_requires_approval', 'registry writes cannot rotate controller keys', envelopeDigest, 'registry.write.quarantined');
      }
      const nextRecord = {
        ...record,
        display_name: request.record.display_name,
        description: request.record.description,
        profile_uri: request.record.profile_uri,
        status: request.record.status,
        record_version: state.version + 1,
        updated_at: new Date(now).toISOString(),
        authority_state: authorityState(),
      };
      validateRecord(nextRecord);
      const { event } = await this.#commit(state, (next, version) => {
        next.records[request.agent_id] = { ...nextRecord, record_version: version };
        next.seen_nonces[request.agent_id] ??= {};
        next.seen_nonces[request.agent_id][nonceKey] = { digest: envelopeDigest, request_id: request.request_id };
        next.idempotency[idempotencyKey] = { envelope_digest: envelopeDigest, record_version: version, agent_id: request.agent_id };
      }, {
        event_type: 'registry.write.accepted', agent_id: request.agent_id, controller_id: record.controller_id,
        request_id: request.request_id, reason: 'authenticated registry write', envelope_digest: envelopeDigest,
      });
      return { status: 'accepted', agent_id: request.agent_id, record_version: nextRecord.record_version, audit_event_id: event.event_id, record: clone(nextRecord) };
    });
  }

  async ingestSignedHeartbeat(input) {
    return this.#withLock(async () => {
      const state = await this.#store.read();
      let heartbeat;
      let envelopeDigest;
      try {
        heartbeat = normalizeSignedHeartbeat(input);
        envelopeDigest = digest(heartbeat);
      } catch (error) {
        return this.#quarantine(state, input, error.code ?? 'invalid_schema', error.message, undefined, 'heartbeat.quarantined');
      }
      const record = state.records[heartbeat.agent_id];
      if (!record) return this.#quarantine(state, heartbeat, 'unknown_agent', `unknown agent ${heartbeat.agent_id}`, envelopeDigest, 'heartbeat.quarantined');
      if (record.revoked) return this.#quarantine(state, heartbeat, 'revoked', 'agent is revoked', envelopeDigest, 'heartbeat.quarantined');
      const idempotencyKey = `heartbeat:${heartbeat.request_id}`;
      const previousRequest = state.idempotency[idempotencyKey];
      if (previousRequest) {
        if (previousRequest.envelope_digest !== envelopeDigest) return this.#quarantine(state, heartbeat, 'request_id_reuse', 'request_id was already used for a different heartbeat', envelopeDigest, 'heartbeat.quarantined');
        const { event } = await this.#commit(state, () => {}, {
          event_type: 'heartbeat.idempotent', agent_id: heartbeat.agent_id, controller_id: record.controller_id,
          request_id: heartbeat.request_id, reason: 'exact authenticated retry', envelope_digest: envelopeDigest,
          record_version: previousRequest.record_version,
        });
        return { status: 'idempotent', agent_id: heartbeat.agent_id, heartbeat_seq: heartbeat.heartbeat_seq, record_version: previousRequest.record_version, audit_event_id: event.event_id };
      }
      const key = this.#resolvePublicKey(record, heartbeat.key_id);
      if (!key || key.algorithm !== 'Ed25519') return this.#quarantine(state, heartbeat, 'unknown_or_revoked_key', 'heartbeat key is not registered or has been revoked', envelopeDigest, 'heartbeat.quarantined');
      const now = this.#clock();
      const sentAt = Date.parse(heartbeat.sent_at);
      const expiresAt = Date.parse(heartbeat.payload.expires_at);
      if (sentAt > now + this.#maxClockSkewMs || Math.abs(now - sentAt) > this.#maxClockSkewMs) return this.#quarantine(state, heartbeat, 'stale_heartbeat', 'heartbeat is outside the accepted clock skew', envelopeDigest, 'heartbeat.quarantined');
      if (expiresAt <= now || expiresAt - sentAt > this.#maxHeartbeatLifetimeMs) return this.#quarantine(state, heartbeat, 'expired', 'heartbeat freshness window is invalid', envelopeDigest, 'heartbeat.quarantined');
      if (heartbeat.heartbeat_seq <= record.sequence) return this.#quarantine(state, heartbeat, 'sequence_regression', 'heartbeat sequence is not monotonic', envelopeDigest, 'heartbeat.quarantined');
      let signatureValid = false;
      try { signatureValid = verify(null, buildSignedHeartbeatSigningBytes(heartbeat), toPublicKeyObject(key.publicKey), decodeSignature(heartbeat.signature)); } catch { signatureValid = false; }
      if (!signatureValid) return this.#quarantine(state, heartbeat, 'invalid_signature', 'heartbeat signature did not verify for the registered key', envelopeDigest, 'heartbeat.quarantined');
      const nonceKey = `heartbeat:${heartbeat.key_id}:${heartbeat.heartbeat_seq}`;
      if (state.seen_nonces[heartbeat.agent_id]?.[nonceKey]) return this.#quarantine(state, heartbeat, 'replay', 'heartbeat sequence was already consumed', envelopeDigest, 'heartbeat.quarantined');
      const nextRecord = {
        ...record,
        sequence: heartbeat.heartbeat_seq,
        health: heartbeat.payload.status,
        last_seen: heartbeat.sent_at,
        last_verified_at: new Date(now).toISOString(),
        record_version: state.version + 1,
        updated_at: new Date(now).toISOString(),
        authority_state: authorityState(),
      };
      validateRecord(nextRecord);
      const { event } = await this.#commit(state, (next, version) => {
        next.records[heartbeat.agent_id] = { ...nextRecord, record_version: version };
        next.seen_nonces[heartbeat.agent_id] ??= {};
        next.seen_nonces[heartbeat.agent_id][nonceKey] = { digest: envelopeDigest, request_id: heartbeat.request_id };
        next.idempotency[idempotencyKey] = { envelope_digest: envelopeDigest, record_version: version, agent_id: heartbeat.agent_id };
      }, {
        event_type: 'heartbeat.accepted', agent_id: heartbeat.agent_id, controller_id: record.controller_id,
        request_id: heartbeat.request_id, reason: 'authenticated signed heartbeat', envelope_digest: envelopeDigest,
      });
      return { status: 'accepted', agent_id: heartbeat.agent_id, heartbeat_seq: heartbeat.heartbeat_seq, record_version: nextRecord.record_version, audit_event_id: event.event_id, record: clone(nextRecord) };
    });
  }

  async revokeAgent(agentId, { reason = 'operator safety revocation', actor = 'registry-safety-control' } = {}) {
    return this.#withLock(async () => {
      const state = await this.#store.read();
      const record = state.records[agentId];
      if (!record) throw new RegistryError('unknown_agent', `unknown agent ${agentId}`);
      const { event } = await this.#commit(state, (next, version) => {
        next.records[agentId] = {
          ...next.records[agentId],
          revoked: true,
          revocation_reason: String(reason).slice(0, 256),
          revoked_by: String(actor).slice(0, 128),
          record_version: version,
          updated_at: new Date(this.#clock()).toISOString(),
        };
      }, { event_type: 'agent.revoked', agent_id: agentId, controller_id: record.controller_id, reason: String(reason).slice(0, 256) });
      return { status: 'revoked', audit_event_id: event.event_id };
    });
  }

  async ingestHeartbeat(input) {
    return this.#withLock(async () => {
      const state = await this.#store.read();
      let heartbeat;
      let envelopeDigest;
      try {
        heartbeat = normalizeHeartbeat(input);
        envelopeDigest = digest(heartbeat);
      } catch (error) {
        return this.#quarantine(state, input, error.code ?? 'invalid_heartbeat', error.message);
      }
      const agentId = heartbeat.agent_id;
      const controllerId = heartbeat.controller_id;
      const record = state.records[agentId];
      if (!record) return this.#quarantine(state, heartbeat, 'unknown_agent', `unknown agent ${agentId}`, envelopeDigest);
      if (record.controller_id !== controllerId) return this.#quarantine(state, heartbeat, 'controller_binding_mismatch', 'controller is not bound to agent', envelopeDigest);
      if (record.revoked) return this.#quarantine(state, heartbeat, 'revoked', 'agent is revoked', envelopeDigest);

      const previousIdempotency = state.idempotency[envelopeDigest];
      if (previousIdempotency) {
        const { event } = await this.#commit(state, () => {}, {
          event_type: 'heartbeat.idempotent', agent_id: agentId, controller_id: controllerId,
          reason: 'exact authenticated retry', envelope_digest: envelopeDigest,
          record_version: previousIdempotency.record_version,
        });
        return { status: 'idempotent', agent_id: agentId, sequence: heartbeat.sequence, record_version: previousIdempotency.record_version, audit_event_id: event.event_id };
      }
      const nonceRecord = state.seen_nonces[agentId]?.[heartbeat.nonce];
      if (nonceRecord) return this.#quarantine(state, heartbeat, 'replay', 'nonce was already consumed by a different heartbeat', envelopeDigest);

      const now = this.#clock();
      const issuedAt = Date.parse(heartbeat.issued_at);
      const expiresAt = Date.parse(heartbeat.expires_at);
      if (issuedAt > now + this.#maxClockSkewMs) return this.#quarantine(state, heartbeat, 'issued_at_in_future', 'issued_at is outside the accepted clock skew', envelopeDigest);
      if (expiresAt <= now) return this.#quarantine(state, heartbeat, 'expired', 'heartbeat has expired', envelopeDigest);
      if (expiresAt - issuedAt > this.#maxHeartbeatLifetimeMs) return this.#quarantine(state, heartbeat, 'expiry_window_too_long', 'heartbeat expiry window is too long', envelopeDigest);
      if (heartbeat.sequence <= record.sequence) return this.#quarantine(state, heartbeat, 'sequence_regression', 'heartbeat sequence is not monotonic', envelopeDigest);

      let signatureValid = false;
      try {
        signatureValid = verify(null, buildHeartbeatSigningBytes(heartbeat), toPublicKeyObject(record.controller_public_key), decodeSignature(heartbeat.signature));
      } catch {
        signatureValid = false;
      }
      if (!signatureValid) return this.#quarantine(state, heartbeat, 'invalid_signature', 'heartbeat signature did not verify for the bound controller', envelopeDigest);

      let nextRecord;
      try {
        nextRecord = this.#applyRefresh(record, heartbeat, now, state.version + 1);
      } catch (error) {
        return this.#quarantine(state, heartbeat, error.code ?? 'invalid_refresh', error.message, envelopeDigest);
      }
      const { event } = await this.#commit(state, (next) => {
        next.records[agentId] = nextRecord;
        next.seen_nonces[agentId] ??= {};
        next.seen_nonces[agentId][heartbeat.nonce] = {
          digest: envelopeDigest,
          sequence: heartbeat.sequence,
          expires_at: heartbeat.expires_at,
        };
        next.idempotency[envelopeDigest] = {
          agent_id: agentId,
          sequence: heartbeat.sequence,
          record_version: nextRecord.record_version,
        };
      }, {
        event_type: 'heartbeat.accepted', agent_id: agentId, controller_id: controllerId,
        reason: 'authenticated refresh', envelope_digest: envelopeDigest,
        record_version: nextRecord.record_version,
      });
      return { status: 'accepted', agent_id: agentId, sequence: heartbeat.sequence, record_version: nextRecord.record_version, audit_event_id: event.event_id, record: clone(nextRecord) };
    });
  }

  #applyRefresh(record, heartbeat, now, recordVersion) {
    const payload = heartbeat.payload;
    const next = {
      ...record,
      sequence: heartbeat.sequence,
      status: payload.status ?? record.status,
      health: payload.health ?? record.health,
      display_name: payload.display_name ?? record.display_name,
      metadata: payload.metadata ? { ...record.metadata, ...clone(payload.metadata) } : clone(record.metadata),
      tags: payload.tags ? clone(payload.tags) : clone(record.tags),
      last_seen: payload.last_seen ?? heartbeat.issued_at,
      last_verified_at: payload.last_verified_at ?? heartbeat.issued_at,
      record_version: recordVersion,
      updated_at: new Date(now).toISOString(),
      authority_state: authorityState(),
    };
    validateRecord(next);
    return next;
  }

  async #quarantine(state, input, code, reason, envelopeDigest, eventType = 'heartbeat.quarantined') {
    const safeDigest = envelopeDigest ?? digest({ invalid_input: input === undefined ? null : redact(input) });
    const agentId = safeIdentity(input, 'agent_id');
    const controllerId = safeIdentity(input, 'controller_id');
    const { next, event } = await this.#commit(state, (mutated, version) => {
      mutated.quarantine.push({
        quarantine_id: `quarantine-${version}-${safeDigest.slice(0, 16)}`,
        schema_version: 'agent.registry.quarantine.v1',
        agent_id: agentId,
        controller_id: controllerId,
        reason_code: code,
        reason: String(reason).slice(0, 256),
        envelope_digest: safeDigest,
        received_at: new Date(this.#clock()).toISOString(),
        input: redact(input),
      });
    }, { event_type: eventType, agent_id: agentId, controller_id: controllerId, reason: code, envelope_digest: safeDigest });
    return Promise.reject(new RegistryRejectedError(code, reason, { quarantine_id: next.quarantine.at(-1).quarantine_id, audit_event_id: event.event_id }));
  }

  async getRecord(agentId) {
    const state = await this.#store.read();
    return state.records[agentId] ? clone(state.records[agentId]) : undefined;
  }

  async emitRecord(agentId) {
    const record = await this.getRecord(agentId);
    if (!record) throw new RegistryError('unknown_agent', `unknown agent ${agentId}`);
    const emitted = {
      schemaVersion: EMITTED_RECORD_SCHEMA_VERSION,
      agentId: record.agent_id,
      controllerId: record.controller_id,
      sequence: record.sequence,
      status: record.status,
      health: record.health,
      lastSeen: record.last_seen,
      lastVerifiedAt: record.last_verified_at,
      ...(record.display_name ? { displayName: record.display_name } : {}),
      ...(record.metadata ? { metadata: clone(record.metadata) } : {}),
      ...(record.tags ? { tags: clone(record.tags) } : {}),
      revoked: record.revoked,
      recordVersion: record.record_version,
      updatedAt: record.updated_at,
      authorityState: {
        authorityChangesAllowed: false,
        spendAllowed: false,
        executionAllowed: false,
      },
    };
    validateEmittedRecord(emitted);
    return emitted;
  }

  async emitCanonicalRecord(agentId) {
    const record = await this.getRecord(agentId);
    if (!record) throw new RegistryError('unknown_agent', `unknown agent ${agentId}`);
    const emitted = {
      schema_version: EMITTED_RECORD_SCHEMA_VERSION,
      agent_id: record.agent_id,
      controller_id: record.controller_id,
      sequence: record.sequence,
      status: record.status,
      health: record.health,
      last_seen: record.last_seen,
      ...(record.last_verified_at ? { last_verified_at: record.last_verified_at } : {}),
      ...(record.display_name ? { display_name: record.display_name } : {}),
      ...(record.description ? { description: record.description } : {}),
      ...(record.profile_uri ? { profile_uri: record.profile_uri } : {}),
      ...(record.metadata ? { metadata: clone(record.metadata) } : {}),
      ...(record.tags ? { tags: clone(record.tags) } : {}),
      public_safe: record.public_safe === true,
      revoked: record.revoked,
      record_version: record.record_version,
      updated_at: record.updated_at,
      authority_state: authorityState(),
    };
    validateRecord({ ...record, authority_state: authorityState() });
    assertNoUnknown(emitted, new Set([
      'schema_version', 'agent_id', 'controller_id', 'sequence', 'status', 'health', 'last_seen',
      'last_verified_at', 'display_name', 'description', 'profile_uri', 'metadata', 'tags', 'revoked',
      'record_version', 'updated_at', 'authority_state', 'public_safe',
    ]));
    return emitted;
  }

  async registryFeed() {
    const state = await this.#store.read();
    const records = [];
    for (const agentId of Object.keys(state.records).sort()) {
      const record = state.records[agentId];
      if (record.public_safe === true && record.revoked === false) {
        records.push(await this.emitCanonicalRecord(agentId));
      }
    }
    const feed = {
      schema_version: 'agent.registry.feed.v1',
      generated_at: new Date(this.#clock()).toISOString(),
      records,
    };
    assertSafeJson(feed, 'registry_feed');
    return feed;
  }

  #projectIdentityWalletVerification(record, authority, at = this.#clock()) {
    const expired = Date.parse(record.expires_at) <= at;
    const revoked = Boolean(record.revoked_at) || record.verification_status === 'revoked';
    const conflict = Boolean(record.conflict_code) || record.verification_status === 'conflict';
    let staleRoot = false;
    if (authority && record.session_key_scope?.safe_root_revision) {
      staleRoot = record.session_key_scope.safe_root_revision !== authority.root_revision;
    }
    const verificationStatus = revoked
      ? 'revoked'
      : expired
        ? 'expired'
        : conflict || staleRoot
          ? 'conflict'
          : record.verification_status;
    const verified = verificationStatus === 'verified';
    return {
      schemaVersion: 'agent.identity-wallet.verification.projection.v1',
      verified,
      agentId: record.agent_id,
      walletAddress: record.wallet_address,
      walletChainId: record.wallet_chain_id,
      safeAddress: record.safe_address,
      verificationStatus,
      identityPrincipal: record.identity_principal,
      verificationMethod: record.verification_method,
      proofDigest: record.proof_digest,
      proofSubject: record.proof_subject,
      proofSigner: record.proof_signer,
      signerAuthorityClass: record.signer_authority_class,
      verifiedAt: record.verified_at,
      expiresAt: record.expires_at,
      revokedAt: record.revoked_at,
      conflictCode: staleRoot ? 'safe_root_changed' : record.conflict_code,
      sessionKeyScope: {
        status: verificationStatus === 'verified' ? record.session_key_scope.status : verificationStatus,
        authorityClass: record.session_key_scope.authority_class,
        scopes: clone(record.session_key_scope.scopes),
        chainIds: clone(record.session_key_scope.chain_ids),
        methods: clone(record.session_key_scope.methods),
        expiresAt: record.session_key_scope.expires_at,
        revocationEpoch: record.session_key_scope.revocation_epoch,
        safeRootRevision: record.session_key_scope.safe_root_revision,
      },
      safeAuthority: clone(record.safe_authority),
      authorityState: {
        authorityChangesAllowed: false,
        spendAllowed: false,
        executionAllowed: false,
      },
      recordVersion: record.record_version,
      updatedAt: record.updated_at,
    };
  }

  async getIdentityWalletVerification(agentId, walletAddress, { at = this.#clock() } = {}) {
    assertString(agentId, 'agentId');
    const state = await this.#store.read();
    const record = state.identity_wallet_verifications?.[verificationKey(agentId, walletAddress)];
    if (!record) return undefined;
    return this.#projectIdentityWalletVerification(record, state.identity_authorities?.[agentId], at);
  }

  async isIdentityWalletVerified(agentId, walletAddress, { at = this.#clock(), scope = 'identity.verify' } = {}) {
    const projection = await this.getIdentityWalletVerification(agentId, walletAddress, { at });
    if (!projection?.verified) return false;
    if (scope && !projection.sessionKeyScope.scopes.includes(scope) && projection.signerAuthorityClass !== 'safe_owner') return false;
    return projection.authorityState.authorityChangesAllowed === false
      && projection.authorityState.spendAllowed === false
      && projection.authorityState.executionAllowed === false;
  }

  async snapshot() {
    const state = await this.#store.read();
    return redact(state);
  }

  async auditEvents() {
    const state = await this.#store.read();
    return clone(state.audit);
  }

  async quarantineRecords() {
    const state = await this.#store.read();
    return clone(state.quarantine);
  }
}
