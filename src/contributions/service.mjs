import { createHash, randomUUID } from 'node:crypto';

import { INTEGRATION_OUTBOX_SCHEMA } from './outbox-worker.mjs';
import {
  buildContributionAttestation,
  contributionAttestationStatusForReviewStatus,
  contributionIdFromAttestationId,
} from './attestation.mjs';

export const CONTRIBUTION_SUBMISSION_SCHEMA = 'agent.bittrees.contribution-submission.v1';
export const CONTRIBUTION_STATUS_PROJECTION_SCHEMA = 'agent.bittrees.contribution-status-projection.v1';
export const CONTRIBUTION_REVIEW_SCHEMA = 'agent.bittrees.contribution-review.v1';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;
const SAFE_SCOPE = 'contributor:submit';
const REVIEW_SCOPE = 'contributor:review';
const REVIEWER_ROLES = new Set([
  'owner',
  'reviewer',
  'review-admin',
  'owning-reviewer',
  'engineering-lead',
  'lead',
]);
const TERMINAL_STATES = new Set(['approved', 'rejected']);
const SUBMISSION_STATES = new Set(['queued_for_review', 'under_review', 'approved', 'rejected']);
const SENSITIVE_KEY = /private|secret|mnemonic|seed|bearer|oauth|token|cookie|password|credential|wallet|signer|transaction|authority|execution/i;
const SENSITIVE_TEXT = /\b(?:private\s+key|seed\s+phrase|mnemonic|bearer\s+token|oauth\s+token|api\s+key|session\s+cookie|raw\s+signature|signed\s+transaction|broadcast\s+(?:a\s+)?transaction|spend\s+(?:funds|tokens|assets)|grant\s+(?:authority|execution|spending|signing))\b/i;

function bounded(value, limit, fallback = '') {
  return (typeof value === 'string' ? value : fallback)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, limit)
    .trim();
}

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

function subjectOf(actor) {
  if (typeof actor === 'string') return bounded(actor, 180);
  return bounded(actor?.subject ?? actor?.agentId ?? actor?.agent_id, 180);
}

function scopesOf(actor) {
  if (typeof actor === 'string') return [SAFE_SCOPE];
  return Array.isArray(actor?.scopes) ? actor.scopes.filter((scope) => typeof scope === 'string') : [];
}

function roleOf(actor) {
  if (typeof actor === 'string') return '';
  return bounded(actor?.role ?? actor?.reviewerRole ?? actor?.reviewer_role, 80).toLowerCase();
}

function throwServiceError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  throw error;
}

function assertSafePayload(value, path = 'payload', depth = 0) {
  if (depth > 10) throwServiceError(`${path} is too deeply nested`, 'payload_too_deep', 422);
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (
      SENSITIVE_TEXT.test(value)
      || normalized.includes('private key')
      || normalized.includes('seed phrase')
      || normalized.includes('api key')
      || normalized.includes('bearer token')
      || normalized.includes('signed transaction')
      || normalized.includes('grant authority')
    ) {
      throwServiceError(`${path} contains prohibited sensitive or authority material`, 'sensitive_payload', 422);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) throwServiceError(`${path}.${key} is prohibited`, 'sensitive_payload', 422);
    assertSafePayload(nested, `${path}.${key}`, depth + 1);
  }
}

function normalizeIdempotencyKey(value) {
  const key = bounded(value, 180);
  if (!key) throwServiceError('idempotencyKey is required', 'idempotency_key_required', 400);
  if (!SAFE_ID.test(key)) throwServiceError('idempotencyKey has an invalid format', 'invalid_idempotency_key', 422);
  return key;
}

function normalizeSubmissionPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throwServiceError('submission payload must be an object', 'invalid_submission', 422);
  }
  assertSafePayload(payload);
  const title = bounded(payload.title, 180);
  if (!title) throwServiceError('title is required', 'invalid_submission', 422);
  const summary = bounded(payload.summary ?? payload.description, 2200);
  const opportunityId = bounded(payload.opportunityId ?? payload.opportunity_id, 180, 'contribution');
  const sourceIds = Array.isArray(payload.sourceIds ?? payload.source_ids)
    ? [...new Set((payload.sourceIds ?? payload.source_ids).filter((source) => typeof source === 'string').map((source) => bounded(source, 160)).filter(Boolean))].slice(0, 40)
    : [];
  return {
    title,
    summary,
    opportunityId,
    sourceIds,
    artifactCount: Array.isArray(payload.artifacts) ? Math.min(20, payload.artifacts.length) : 0,
    metadata: {
      lane: bounded(payload.lane, 100),
      claimId: bounded(payload.claimId ?? payload.claim_id, 180),
    },
  };
}

export class ContributionServiceError extends Error {
  constructor(message, { code = 'contribution_service_error', status = 400, details } = {}) {
    super(message);
    this.name = 'ContributionServiceError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ContributionConflictError extends ContributionServiceError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? 'concurrent_review', status: options.status ?? 409 });
    this.name = 'ContributionConflictError';
  }
}

export class ContributionAuthorizationError extends ContributionServiceError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? 'unauthorized', status: options.status ?? 403 });
    this.name = 'ContributionAuthorizationError';
  }
}

/**
 * Small synchronous repository used by the portal and acceptance tests. The
 * service only depends on this interface, so production can replace it with a
 * transactional repository without changing the HTTP projection contract.
 */
export class InMemoryContributionRepository {
  #rows = new Map();
  #idempotency = new Map();

  create(row, { actorId, idempotencyKey, payloadDigest }) {
    const key = `${actorId}:${idempotencyKey}`;
    const existingId = this.#idempotency.get(key);
    if (existingId) {
      const existing = this.#rows.get(existingId);
      if (existing?.payloadDigest !== payloadDigest) {
        throw new ContributionConflictError('idempotency key was already used for a different submission', {
          code: 'idempotency_conflict',
          details: { submissionId: existingId },
        });
      }
      return { row: clone(existing), replayed: true };
    }
    this.#rows.set(row.id, clone(row));
    this.#idempotency.set(key, row.id);
    return { row: clone(row), replayed: false };
  }

  get(id) { return clone(this.#rows.get(id)); }

  update(id, updater) {
    const current = this.#rows.get(id);
    if (!current) return undefined;
    const next = updater(clone(current));
    this.#rows.set(id, clone(next));
    return clone(next);
  }

  list() { return [...this.#rows.values()].map(clone); }
}

export class InMemoryContributionOutbox {
  #rows = new Map();
  #sequence = 0;

  enqueue(kind, payload, { id = `${kind}-${++this.#sequence}` } = {}) {
    const existing = this.#rows.get(id);
    if (existing) return clone(existing);
    const row = {
      schema: INTEGRATION_OUTBOX_SCHEMA,
      id,
      kind,
      payload: clone(payload),
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    this.#rows.set(id, row);
    return clone(row);
  }

  rows() { return [...this.#rows.values()].map(clone); }
}

function reviewGate() {
  return {
    productionMutationAllowed: false,
    contributorCapabilityGranted: false,
    walletAuthorityGranted: false,
    transactionSubmissionAllowed: false,
    registryMutationAllowed: false,
    status: 'review_required_before_publication_or_assignment',
  };
}

function publicProjection(row) {
  return {
    schema: CONTRIBUTION_STATUS_PROJECTION_SCHEMA,
    kind: 'submission',
    id: row.id,
    submissionId: row.id,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    reviewVersion: row.reviewVersion,
    reviewGate: reviewGate(),
    privacy: {
      redacted: true,
      omittedFields: ['actor', 'payload', 'reviewer', 'managerTask', 'brainEvent'],
      access: 'opaque receipt or authenticated owner lookup',
    },
    nextAction: TERMINAL_STATES.has(row.status)
      ? 'Review outcome is recorded; publication, assignment, and authority remain separately gated.'
      : 'An authorized reviewer must review this submission before any terminal outcome or integration delivery.',
  };
}

function publicAttestation(row) {
  return buildContributionAttestation({
    contributionId: row.id,
    submissionId: row.id,
    agentId: row.actorId,
    opportunityId: row.payload?.opportunityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: contributionAttestationStatusForReviewStatus(row.status),
  });
}

export class ContributionService {
  #repository;
  #outbox;
  #clock;

  constructor({ repository = new InMemoryContributionRepository(), outbox = new InMemoryContributionOutbox(), clock = () => Date.now() } = {}) {
    if (!repository || typeof repository.create !== 'function' || typeof repository.get !== 'function' || typeof repository.update !== 'function') {
      throw new TypeError('repository must implement create, get, and update');
    }
    this.#repository = repository;
    this.#outbox = outbox;
    this.#clock = clock;
  }

  #authorizeSubmit(actor) {
    const subject = subjectOf(actor);
    if (!subject) throw new ContributionAuthorizationError('authenticated contributor subject is required');
    const scopes = scopesOf(actor);
    if (scopes.length && !scopes.includes(SAFE_SCOPE)) {
      throw new ContributionAuthorizationError('actor lacks contributor submission scope', { code: 'scope_forbidden' });
    }
    return subject;
  }

  #authorizeReview(actor) {
    const subject = subjectOf(actor);
    const scopes = scopesOf(actor);
    const role = roleOf(actor);
    if (!subject) throw new ContributionAuthorizationError('authenticated reviewer subject is required');
    if ((scopes.length && scopes.includes(REVIEW_SCOPE)) || REVIEWER_ROLES.has(role)) return subject;
    throw new ContributionAuthorizationError('reviewer authorization is required', { code: 'review_forbidden' });
  }

  submit({ actor, idempotencyKey, payload }) {
    const actorId = this.#authorizeSubmit(actor);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const normalized = normalizeSubmissionPayload(payload);
    const payloadDigest = digest(normalized);
    const timestamp = nowIso(this.#clock);
    const row = {
      schema: CONTRIBUTION_SUBMISSION_SCHEMA,
      id: `sub_${randomUUID()}`,
      actorId,
      idempotencyKey: key,
      payloadDigest,
      payload: normalized,
      status: 'queued_for_review',
      reviewVersion: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const result = this.#repository.create(row, { actorId, idempotencyKey: key, payloadDigest });
    return {
      created: !result.replayed,
      replayed: result.replayed,
      receiptId: result.row.id,
      status: result.row.status,
      projection: publicProjection(result.row),
      attestation: publicAttestation(result.row),
    };
  }

  review({ actor, submissionId, decision, expectedVersion = undefined }) {
    const reviewerId = this.#authorizeReview(actor);
    const id = bounded(submissionId, 180);
    const normalizedDecision = bounded(decision, 32).toLowerCase();
    if (!id || !SAFE_ID.test(id)) throw new ContributionServiceError('submissionId is required', { code: 'invalid_submission', status: 422 });
    if (!['approved', 'rejected'].includes(normalizedDecision)) throw new ContributionServiceError('review decision must be approved or rejected', { code: 'invalid_review', status: 422 });
    const current = this.#repository.get(id);
    if (!current) throw new ContributionServiceError('submission not found', { code: 'submission_not_found', status: 404 });
    if (expectedVersion !== undefined && Number(expectedVersion) !== current.reviewVersion) {
      throw new ContributionConflictError('submission was reviewed concurrently', {
        code: 'concurrent_review',
        details: { currentVersion: current.reviewVersion },
      });
    }
    if (TERMINAL_STATES.has(current.status)) {
      if (current.status === normalizedDecision) return { replayed: true, projection: publicProjection(current) };
      throw new ContributionConflictError('terminal submission cannot be reviewed again', { code: 'review_already_terminal' });
    }
    const updated = this.#repository.update(id, (row) => ({
      ...row,
      status: normalizedDecision,
      reviewVersion: row.reviewVersion + 1,
      updatedAt: nowIso(this.#clock),
      reviewerId,
      reviewDecision: normalizedDecision,
    }));
    const integrationPayload = {
      submissionId: updated.id,
      title: updated.payload.title,
      summary: updated.payload.summary,
      reviewOutcome: normalizedDecision,
      managerStatus: 'not_created',
      sourceIds: updated.payload.sourceIds,
      artifactCount: updated.payload.artifactCount,
    };
    if (normalizedDecision === 'approved') {
      this.#outbox?.enqueue?.('idacc_task_create', integrationPayload, { id: `idacc:${updated.id}` });
    }
    this.#outbox?.enqueue?.('brain_terminal_summary', integrationPayload, { id: `brain:${updated.id}:${normalizedDecision}` });
    return { replayed: false, projection: publicProjection(updated) };
  }

  loadStatusProjection({ id, kind = 'any', actor = undefined } = {}) {
    const queryId = bounded(id, 180);
    const queryKind = bounded(kind, 32, 'any');
    const contributionId = queryId && (queryKind === 'attestation' || queryId.startsWith('att_'))
      ? contributionIdFromAttestationId(queryId)
      : queryId;
    const row = contributionId ? this.#repository.get(contributionId) : undefined;
    const viewer = subjectOf(actor);
    const scopes = scopesOf(actor);
    const reviewer = actor && (scopes.includes(REVIEW_SCOPE) || REVIEWER_ROLES.has(roleOf(actor)));
    const allowedKind = queryKind === 'any' || queryKind === 'submission' || queryKind === 'attestation';
    const owner = Boolean(viewer && row && row.actorId === viewer && scopes.includes(SAFE_SCOPE));
    const visible = Boolean(row && allowedKind && (owner || reviewer));
    const attestationLookup = queryKind === 'attestation' || queryId.startsWith('att_');
    return {
      schema: CONTRIBUTION_STATUS_PROJECTION_SCHEMA,
      status: visible ? 'status_found' : 'not_found',
      query: { id: queryId, kind: queryKind },
      result: visible ? (attestationLookup ? publicAttestation(row) : publicProjection(row)) : null,
      reviewGate: reviewGate(),
      privacy: {
        redacted: true,
        notFoundForUnauthorizedOwner: true,
        omittedFields: ['actor', 'payload', 'reviewer', 'managerTask', 'brainEvent'],
      },
    };
  }

  getSubmission(id) { return this.#repository.get(id); }
  getContributionAttestation(id) {
    const contributionId = contributionIdFromAttestationId(id);
    const row = contributionId ? this.#repository.get(contributionId) : undefined;
    return row ? publicAttestation(row) : undefined;
  }
  listSubmissions() { return this.#repository.list?.() ?? []; }
  outboxRows() { return this.#outbox?.rows?.() ?? []; }
}

export function createContributionService(options) {
  return new ContributionService(options);
}

export function loadStatusProjection(service, options) {
  if (!service || typeof service.loadStatusProjection !== 'function') throw new TypeError('service.loadStatusProjection is required');
  return service.loadStatusProjection(options);
}

export default ContributionService;
