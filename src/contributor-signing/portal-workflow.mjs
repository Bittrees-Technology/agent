import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { InMemoryIntegrationOutboxStore } from '../contributions/outbox-worker.mjs';
import {
  buildContributionAttestation,
  contributionAttestationStatusForReviewStatus,
  contributionAttestationId,
  contributionIdFromAttestationId,
} from '../contributions/attestation.mjs';

export const PORTAL_WORKFLOW_SCHEMA = 'agent.bittrees.contributor-portal-workflow.v1';
export const PORTAL_WORKFLOW_STATUS_SCHEMA = 'agent.bittrees.contributor-portal-status.v1';
export const PORTAL_WORKFLOW_REVIEW_SCHEMA = 'agent.bittrees.contributor-review.v1';
export const CONTRIBUTION_INTAKE_RECEIPT_SCHEMA = 'agent.bittrees.contribution-intake-receipt.v1';
export const CONTRIBUTION_INTAKE_CORRELATION_SCHEMA = 'agent.bittrees.contribution-intake-correlation.v1';
export const CONTRIBUTION_INTAKE_SIGNING_POSTURE_SCHEMA = 'agent.bittrees.contribution-intake-signing-posture.v1';

const CONTRIBUTION_INTAKE_REQUEST_SCHEMA = 'agent.bittrees.contribution-intent.v1';

export const WORKFLOW_SCOPES = Object.freeze({
  register: 'contributor:register',
  claim: 'contributor:claim',
  submit: 'contributor:submit',
  feedback: 'contributor:feedback',
  review: 'contributor:review',
});

const STATUS_SCOPE_BY_KIND = Object.freeze({
  registration: WORKFLOW_SCOPES.register,
  claim: WORKFLOW_SCOPES.claim,
  submission: WORKFLOW_SCOPES.submit,
  feedback: WORKFLOW_SCOPES.feedback,
  review: WORKFLOW_SCOPES.review,
  attestation: WORKFLOW_SCOPES.submit,
});

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;
const TERMINAL_DECISIONS = new Set(['approved', 'rejected']);
const REVIEWER_ROLES = new Set([
  'owner',
  'reviewer',
  'review-admin',
  'owning-reviewer',
  'engineering-lead',
  'research-lead',
  'ops-lead',
  'lead',
]);
const SENSITIVE_KEY = /private|secret|mnemonic|seed|bearer|oauth|token|cookie|password|credential|wallet|signer|signature|signing|transaction|authority|execution/i;
const SENSITIVE_TEXT = /\b(?:private\s+key|seed\s+phrase|mnemonic|bearer\s+token|oauth\s+token|api\s+key|session\s+cookie|raw\s+signature|signed\s+transaction|broadcast\s+(?:a\s+)?transaction|spend\s+(?:funds|tokens|assets)|grant\s+(?:authority|execution|spending|signing))\b/i;

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function bounded(value, limit, fallback = '') {
  return (typeof value === 'string' ? value : fallback)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, limit)
    .trim();
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
  if (typeof actor === 'string') return [];
  return Array.isArray(actor?.scopes) ? actor.scopes.filter((scope) => typeof scope === 'string') : [];
}

function roleOf(actor) {
  return bounded(actor?.role ?? actor?.reviewerRole ?? actor?.reviewer_role, 80).toLowerCase();
}

function workflowError(message, code, status = 400, details = undefined) {
  const error = new ContributorPortalWorkflowError(message, { code, status, details });
  throw error;
}

function assertId(value, field) {
  const id = bounded(value, 180);
  if (!id || !SAFE_ID.test(id)) workflowError(`${field} is required`, 'invalid_identifier', 422);
  return id;
}

function assertSafeKey(value, field = 'idempotencyKey') {
  const key = bounded(value, 180);
  if (!key || !SAFE_KEY.test(key)) workflowError(`${field} is required and must be a safe identifier`, 'invalid_idempotency_key', 422);
  return key;
}

function assertSafePayload(value, path = 'payload', depth = 0) {
  if (depth > 12) workflowError(`${path} is too deeply nested`, 'payload_too_deep', 422);
  if (typeof value === 'string') {
    if (SENSITIVE_TEXT.test(value)) workflowError(`${path} contains prohibited sensitive or authority material`, 'sensitive_payload', 422);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) workflowError(`${path}.${key} is prohibited`, 'sensitive_payload', 422);
    assertSafePayload(nested, `${path}.${key}`, depth + 1);
  }
}

function normalizeList(value, limit, itemLimit = 400) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item) => typeof item === 'string')
    .map((item) => bounded(item, itemLimit))
    .filter(Boolean))].slice(0, limit);
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

function contributionIntakeSigningPosture() {
  return {
    schema: CONTRIBUTION_INTAKE_SIGNING_POSTURE_SCHEMA,
    version: 1,
    status: 'review_intake_only',
    signatureMaterialAccepted: false,
    signatureMaterialStored: false,
    signatureUsedForAuthority: false,
    walletAuthorityGranted: false,
    transactionSubmissionAllowed: false,
    publicAttestationAllowed: false,
  };
}

function normalizeContributionIntakeDescriptor(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    workflowError('intake metadata must be an object', 'invalid_intake_metadata', 422);
  }
  assertSafePayload(value, 'intake');
  const schema = bounded(value.schema, 180, CONTRIBUTION_INTAKE_REQUEST_SCHEMA);
  if (schema !== CONTRIBUTION_INTAKE_REQUEST_SCHEMA) {
    workflowError('unsupported contribution intake schema', 'unsupported_intake_schema', 422);
  }
  const intentId = value.intentId === undefined || value.intentId === null
    ? null
    : assertId(value.intentId, 'intake.intentId');
  const submittedAt = value.submittedAt === undefined || value.submittedAt === null
    ? null
    : bounded(value.submittedAt, 120);

  return {
    schema,
    version: 1,
    ...(intentId ? { intentId } : {}),
    ...(submittedAt ? { submittedAt } : {}),
  };
}

function contributionIntakeCorrelation({ receiptId, submissionId, opportunityId, agentId, payloadDigest }) {
  const correlationId = digest({
    schema: CONTRIBUTION_INTAKE_CORRELATION_SCHEMA,
    receiptId,
    submissionId,
    opportunityId,
    agentId,
    payloadDigest,
  });
  return {
    schema: CONTRIBUTION_INTAKE_CORRELATION_SCHEMA,
    algorithm: 'sha256',
    payloadDigest,
    correlationId,
    containsSecrets: false,
    scope: 'intake_receipt_correlation_only',
  };
}

function publicContributionIntakeReceipt(receipt) {
  if (!receipt) return undefined;
  return {
    schema: CONTRIBUTION_INTAKE_RECEIPT_SCHEMA,
    receiptId: receipt.receiptId,
    submissionId: receipt.submissionId,
    status: 'queued_for_review',
    lifecycleStatus: 'review_pending',
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
    intake: clone(receipt.intake),
    signingPosture: clone(receipt.signingPosture),
    correlation: clone(receipt.correlation),
    reviewGate: reviewGate(),
    privacy: {
      redacted: true,
      omittedFields: ['actor', 'idempotencyKey', 'payload', 'signature', 'signingMaterial'],
    },
  };
}

function defaultState(opportunities) {
  return {
    schema: PORTAL_WORKFLOW_SCHEMA,
    version: 1,
    opportunities: clone(opportunities),
    registrations: {},
    claims: {},
    submissions: {},
    feedback: {},
    reviews: {},
    attestations: {},
    intakeReceipts: {},
    idempotency: {},
  };
}

function normalizeState(value, opportunities) {
  const state = value && typeof value === 'object' ? value : {};
  return {
    ...defaultState(opportunities),
    ...state,
    schema: PORTAL_WORKFLOW_SCHEMA,
    version: 1,
    opportunities: Array.isArray(state.opportunities) && state.opportunities.length
      ? state.opportunities
      : clone(opportunities),
    registrations: state.registrations && typeof state.registrations === 'object' ? state.registrations : {},
    claims: state.claims && typeof state.claims === 'object' ? state.claims : {},
    submissions: state.submissions && typeof state.submissions === 'object' ? state.submissions : {},
    feedback: state.feedback && typeof state.feedback === 'object' ? state.feedback : {},
    reviews: state.reviews && typeof state.reviews === 'object' ? state.reviews : {},
    attestations: state.attestations && typeof state.attestations === 'object' ? state.attestations : {},
    intakeReceipts: state.intakeReceipts && typeof state.intakeReceipts === 'object' ? state.intakeReceipts : {},
    idempotency: state.idempotency && typeof state.idempotency === 'object' ? state.idempotency : {},
  };
}

export class InMemoryPortalWorkflowStore {
  #state;

  constructor({ opportunities = [] } = {}) {
    this.#state = defaultState(opportunities);
  }

  read() { return clone(this.#state); }
  write(state) { this.#state = clone(state); return clone(this.#state); }
}

/**
 * Small atomic JSON store. The workflow repository is deliberately isolated
 * behind this interface so deployments can replace it with a transactional
 * database without changing the HTTP contract.
 */
export class JsonPortalWorkflowStore {
  #path;
  #opportunities;

  constructor({ path, opportunities = [] } = {}) {
    if (!path) throw new TypeError('workflow store path is required');
    this.#path = String(path);
    this.#opportunities = opportunities;
  }

  read() {
    try {
      return JSON.parse(readFileSync(this.#path, 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      return defaultState(this.#opportunities);
    }
  }

  write(state) {
    const directory = dirname(this.#path);
    mkdirSync(directory, { recursive: true });
    const temporary = join(directory, `.${String(this.#path).split('/').pop()}.${process.pid}.tmp`);
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.#path);
    return clone(state);
  }
}

export class ContributorPortalWorkflowError extends Error {
  constructor(message, { code = 'portal_workflow_error', status = 400, details } = {}) {
    super(message);
    this.name = 'ContributorPortalWorkflowError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ContributorPortalAuthorizationError extends ContributorPortalWorkflowError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? 'unauthorized', status: options.status ?? 403 });
    this.name = 'ContributorPortalAuthorizationError';
  }
}

export class ContributorPortalConflictError extends ContributorPortalWorkflowError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? 'workflow_conflict', status: options.status ?? 409 });
    this.name = 'ContributorPortalConflictError';
  }
}

function normalizeActor(actor) {
  if (!actor) return { subject: '', scopes: [], role: '' };
  if (typeof actor === 'string') return { subject: bounded(actor, 180), scopes: [], role: '' };
  return {
    subject: subjectOf(actor),
    scopes: scopesOf(actor),
    role: roleOf(actor),
  };
}

function publicOpportunity(opportunity) {
  if (!opportunity) return null;
  const result = clone(opportunity);
  delete result.private;
  delete result.credentials;
  return result;
}

function publicRecord(record, { kind, includeFeedback = false } = {}) {
  if (!record) return null;
  const projection = {
    schema: PORTAL_WORKFLOW_STATUS_SCHEMA,
    kind,
    id: record.id,
    status: record.status,
    lifecycleStatus: record.lifecycleStatus ?? record.status,
    reviewStatus: record.reviewStatus ?? 'not_started',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.agentId ? { agentId: record.agentId } : {}),
    ...(record.opportunityId ? { opportunityId: record.opportunityId } : {}),
    ...(record.claimId ? { claimId: record.claimId } : {}),
    ...(kind === 'submission' ? { submissionId: record.id } : record.submissionId ? { submissionId: record.submissionId } : {}),
    ...(record.terminalOutcome ? { terminalOutcome: record.terminalOutcome } : {}),
    ...(record.reviewVersion !== undefined ? { reviewVersion: record.reviewVersion } : {}),
    ...(kind === 'attestation'
      ? {
          attestationId: record.id,
          attestationStatus: record.attestationStatus,
          publicAttestation: record.publicAttestation === true,
        }
      : {}),
    reviewGate: reviewGate(),
    privacy: {
      redacted: true,
      omittedFields: ['actor', 'operator', 'contact', 'payload', 'artifact', 'evidence', 'reviewer', 'idempotencyKey'],
    },
  };
  if (includeFeedback && Array.isArray(record.feedbackIds) && record.feedbackIds.length > 0) {
    projection.feedbackIds = [...record.feedbackIds];
  }
  return projection;
}

function publicAttestation(record, { intakeReceipt } = {}) {
  const contributionId = record.submissionId ?? record.id;
  return {
    ...buildContributionAttestation({
    contributionId,
    submissionId: contributionId,
    agentId: record.agentId,
    opportunityId: record.opportunityId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.attestationStatus ?? contributionAttestationStatusForReviewStatus(record.status),
    }),
    ...(intakeReceipt ? { intakeReceipt: publicContributionIntakeReceipt(intakeReceipt) } : {}),
  };
}

function recordEnvelope(status, record, extra = {}) {
  return {
    status,
    reviewGate: reviewGate(),
    ...extra,
    ...(record ? { record: publicRecord(record, { kind: extra.kind }) } : {}),
  };
}

export class ContributorPortalWorkflow {
  #store;
  #opportunities;
  #outbox;
  #clock;
  #state;

  constructor({
    store,
    storePath = process.env.PORTAL_WORKFLOW_STATE_PATH ?? join(process.cwd(), 'var', 'workflow', 'state.json'),
    opportunities = [],
    outbox = new InMemoryIntegrationOutboxStore(),
    clock = () => Date.now(),
  } = {}) {
    this.#opportunities = clone(opportunities);
    this.#store = store ?? new JsonPortalWorkflowStore({ path: storePath, opportunities: this.#opportunities });
    if (!this.#store || typeof this.#store.read !== 'function' || typeof this.#store.write !== 'function') {
      throw new TypeError('workflow store must implement read and write');
    }
    this.#outbox = outbox;
    this.#clock = clock;
    this.#state = normalizeState(this.#store.read(), this.#opportunities);
  }

  #save() {
    this.#state = normalizeState(this.#state, this.#opportunities);
    this.#store.write(this.#state);
  }

  #authorize(actor, scope, subject = undefined, { allowReviewerRole = false } = {}) {
    const normalized = normalizeActor(actor);
    if (!normalized.subject) throw new ContributorPortalAuthorizationError('authenticated identity is required', { status: 401 });
    if (allowReviewerRole && REVIEWER_ROLES.has(normalized.role)) return normalized;
    if (normalized.scopes.length && !normalized.scopes.includes(scope)) {
      throw new ContributorPortalAuthorizationError(`actor lacks ${scope} scope`, { code: 'scope_forbidden', status: 403 });
    }
    if (!normalized.scopes.length && scope !== WORKFLOW_SCOPES.review) {
      throw new ContributorPortalAuthorizationError(`actor lacks ${scope} scope`, { code: 'scope_forbidden', status: 403 });
    }
    if (subject && normalized.subject !== subject) {
      throw new ContributorPortalAuthorizationError('authenticated subject does not match requested agent', {
        code: 'subject_mismatch',
        status: 403,
      });
    }
    return normalized;
  }

  #idempotent(collection, actorId, idempotencyKey, payloadDigest) {
    const key = `${collection}:${actorId}:${idempotencyKey}`;
    const prior = this.#state.idempotency[key];
    if (!prior) return { key, prior: null };
    if (prior.payloadDigest !== payloadDigest) {
      throw new ContributorPortalConflictError('idempotency key was already used for a different request', {
        code: 'idempotency_conflict',
        details: { recordId: prior.recordId },
      });
    }
    return { key, prior };
  }

  #rememberIdempotency(key, payloadDigest, recordId) {
    this.#state.idempotency[key] = { payloadDigest, recordId };
  }

  #findRegistration(agentId) {
    return Object.values(this.#state.registrations).find((record) => record.agentId === agentId);
  }

  #findClaim(claimId) {
    return this.#state.claims[claimId];
  }

  #findSubmission(submissionId) {
    return this.#state.submissions[submissionId];
  }

  #findAttestationBySubmissionId(submissionId) {
    return Object.values(this.#state.attestations)
      .find((record) => record.submissionId === submissionId);
  }

  #findIntakeReceiptBySubmissionId(submissionId) {
    return this.#state.intakeReceipts[submissionId];
  }

  #ensurePendingAttestation({ submissionId, opportunityId, agentId, timestamp }) {
    const existing = this.#findAttestationBySubmissionId(submissionId);
    const canonicalId = contributionAttestationId(submissionId);
    if (!canonicalId) workflowError('submissionId is required', 'invalid_identifier', 422);
    if (existing && existing.id === canonicalId) return existing;

    const record = {
      ...buildContributionAttestation({
        contributionId: submissionId,
        submissionId,
        opportunityId,
        agentId,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: existing?.updatedAt ?? timestamp,
        ...(existing?.attestationStatus ? { status: existing.attestationStatus } : {}),
      }),
      // Keep the workflow state collection's record compatible with its
      // existing review-queue projection while the attestation fields come
      // from the shared canonical mapper above.
      publicAttestation: false,
    };
    if (existing) delete this.#state.attestations[existing.id];
    this.#state.attestations[record.id] = record;
    return record;
  }

  queueContributionIntake({ actor, submissionId, opportunityId, agentId, intake = {}, idempotencyKey } = {}) {
    const safeSubmissionId = assertId(submissionId, 'submissionId');
    const safeOpportunityId = assertId(opportunityId, 'opportunityId');
    const safeAgentId = assertId(agentId, 'agentId');
    const auth = this.#authorize(actor, WORKFLOW_SCOPES.submit, safeAgentId);
    const normalizedIntake = normalizeContributionIntakeDescriptor(intake);
    const requestDigest = digest({
      receiptId: safeSubmissionId,
      submissionId: safeSubmissionId,
      opportunityId: safeOpportunityId,
      agentId: safeAgentId,
      intake: normalizedIntake,
    });
    const key = assertSafeKey(idempotencyKey ?? `intake-${safeSubmissionId}`);
    const idem = this.#idempotent('intake-receipt', auth.subject, key, requestDigest);
    if (idem.prior) {
      const receipt = this.#state.intakeReceipts[idem.prior.recordId];
      if (!receipt) {
        throw new ContributorPortalConflictError('idempotency receipt is unavailable', {
          code: 'idempotency_receipt_missing',
        });
      }
      const attestation = this.#ensurePendingAttestation({
        submissionId: safeSubmissionId,
        opportunityId: safeOpportunityId,
        agentId: safeAgentId,
        timestamp: receipt.createdAt,
      });
      this.#save();
      return {
        created: false,
        replayed: true,
        receipt: publicContributionIntakeReceipt(receipt),
        attestation: publicAttestation(attestation, { intakeReceipt: receipt }),
        reviewGate: reviewGate(),
      };
    }

    const existingReceipt = this.#findIntakeReceiptBySubmissionId(safeSubmissionId);
    if (existingReceipt) {
      throw new ContributorPortalConflictError('submission already has a contribution-intake receipt', {
        code: 'intake_receipt_conflict',
        details: { receiptId: safeSubmissionId },
      });
    }
    const timestamp = nowIso(this.#clock);
    const receipt = {
      schema: CONTRIBUTION_INTAKE_RECEIPT_SCHEMA,
      receiptId: safeSubmissionId,
      submissionId: safeSubmissionId,
      opportunityId: safeOpportunityId,
      agentId: safeAgentId,
      status: 'queued_for_review',
      lifecycleStatus: 'review_pending',
      createdAt: timestamp,
      updatedAt: timestamp,
      intake: normalizedIntake,
      signingPosture: contributionIntakeSigningPosture(),
      correlation: contributionIntakeCorrelation({
        receiptId: safeSubmissionId,
        submissionId: safeSubmissionId,
        opportunityId: safeOpportunityId,
        agentId: safeAgentId,
        payloadDigest: requestDigest,
      }),
      idempotencyKey: key,
      authenticatedSubject: auth.subject,
    };
    this.#state.intakeReceipts[receipt.receiptId] = receipt;
    this.#rememberIdempotency(idem.key, requestDigest, receipt.receiptId);
    const record = this.#ensurePendingAttestation({
      submissionId: safeSubmissionId,
      opportunityId: safeOpportunityId,
      agentId: safeAgentId,
      timestamp,
    });
    this.#save();
    return {
      created: true,
      replayed: false,
      receipt: publicContributionIntakeReceipt(receipt),
      attestation: publicAttestation(record, { intakeReceipt: receipt }),
      reviewGate: reviewGate(),
    };
  }

  recordPendingAttestation({ actor, submissionId, opportunityId, agentId, intake, idempotencyKey } = {}) {
    return this.queueContributionIntake({
      actor,
      submissionId,
      opportunityId,
      agentId,
      intake,
      idempotencyKey,
    }).attestation;
  }

  listOpportunities({ lane = '', priority = '', status = '' } = {}) {
    return this.#state.opportunities
      .filter((item) => (!lane || item.lane === lane) && (!priority || item.priority === priority) && (!status || item.status === status))
      .map(publicOpportunity);
  }

  getOpportunity(opportunityId) {
    return publicOpportunity(this.#state.opportunities.find((item) => item.id === opportunityId));
  }

  getBrief(opportunityId) {
    const opportunity = this.getOpportunity(opportunityId);
    if (!opportunity) workflowError('opportunity not found', 'opportunity_not_found', 404);
    return {
      status: 'brief-ready',
      opportunity,
      context: this.getContext({ opportunityId }),
      acceptanceCriteria: Array.isArray(opportunity.acceptanceCriteria) ? opportunity.acceptanceCriteria : [],
      reviewPath: 'owning reviewer review before production use; technical and evidence validation for substantial work',
      reviewGate: reviewGate(),
    };
  }

  getContext({ opportunityId, lane } = {}) {
    const opportunity = opportunityId ? this.getOpportunity(opportunityId) : null;
    if (opportunityId && !opportunity) workflowError('opportunity not found', 'opportunity_not_found', 404);
    return {
      status: 'source-grounded-context-ready',
      opportunity,
      lane: lane ?? opportunity?.lane ?? null,
      workflow: ['registered', 'claimed', 'submitted', 'reviewed', 'terminal'],
      reviewGate: reviewGate(),
      policy: {
        noSecrets: true,
        noAuthorityGrant: true,
        noProductionMutation: true,
        noPayoutOrCompensation: true,
      },
    };
  }

  register({ actor, payload = {}, idempotencyKey } = {}) {
    assertSafePayload(payload);
    const agentId = assertId(payload.agentId ?? payload.agent_id, 'agentId');
    const auth = this.#authorize(actor, WORKFLOW_SCOPES.register, agentId);
    const normalized = {
      agentId,
      displayName: bounded(payload.displayName ?? payload.display_name, 180),
      operator: bounded(payload.operator, 180),
      contact: payload.contact && typeof payload.contact === 'object'
        ? { kind: bounded(payload.contact.kind, 40), value: bounded(payload.contact.value, 300) }
        : null,
      lanes: normalizeList(payload.lanes, 10, 100),
      capabilities: normalizeList(payload.capabilities, 30, 180),
      evidencePolicy: bounded(payload.evidencePolicy ?? payload.evidence_policy, 1200),
      identityProof: payload.identityProof ?? payload.identity_proof ?? null,
    };
    if (!normalized.displayName) workflowError('displayName is required', 'invalid_registration', 400);
    if (!normalized.operator) workflowError('operator is required', 'invalid_registration', 400);
    if (!normalized.contact?.kind || !normalized.contact?.value) workflowError('contact is required', 'invalid_registration', 400);
    if (!normalized.capabilities.length) workflowError('capabilities are required', 'invalid_registration', 400);
    if (!normalized.evidencePolicy) workflowError('evidencePolicy is required', 'invalid_registration', 400);
    const key = assertSafeKey(idempotencyKey ?? payload.idempotencyKey ?? `registration-${digest(normalized).slice(0, 32)}`);
    const requestDigest = digest(normalized);
    const idem = this.#idempotent('registration', auth.subject, key, requestDigest);
    if (idem.prior) {
      const existing = this.#state.registrations[idem.prior.recordId];
      return { created: false, replayed: true, ...recordEnvelope('queued_for_review', existing, { kind: 'registration', registration: publicRecord(existing, { kind: 'registration' }) }) };
    }
    const timestamp = nowIso(this.#clock);
    const record = {
      schema: PORTAL_WORKFLOW_SCHEMA,
      id: `reg_${randomUUID()}`,
      agentId,
      status: 'registered',
      lifecycleStatus: 'registered',
      reviewStatus: 'queued_for_review',
      createdAt: timestamp,
      updatedAt: timestamp,
      payloadDigest: requestDigest,
      idempotencyKey: key,
      authenticatedSubject: auth.subject,
      ...normalized,
    };
    this.#state.registrations[record.id] = record;
    this.#rememberIdempotency(idem.key, requestDigest, record.id);
    this.#save();
    return {
      created: true,
      replayed: false,
      ...recordEnvelope('queued_for_review', record, {
        kind: 'registration',
        registration: publicRecord(record, { kind: 'registration' }),
        authorizedRoute: '/v1/workflow/registrations',
        statusLookup: '/v1/workflow/status',
      }),
    };
  }

  claim({ actor, payload = {}, idempotencyKey } = {}) {
    assertSafePayload(payload);
    const agentId = assertId(payload.agentId ?? payload.agent_id, 'agentId');
    const auth = this.#authorize(actor, WORKFLOW_SCOPES.claim, agentId);
    const opportunityId = assertId(payload.opportunityId ?? payload.opportunity_id, 'opportunityId');
    const opportunity = this.getOpportunity(opportunityId);
    if (!opportunity) workflowError('opportunity not found', 'opportunity_not_found', 404);
    const registration = this.#findRegistration(agentId);
    if (!registration) workflowError('agent registration is required before claiming an opportunity', 'registration_required', 409);
    const normalized = {
      agentId,
      opportunityId,
      contributionSummary: bounded(payload.contributionSummary ?? payload.summary, 1600),
      evidencePlan: normalizeList(payload.evidencePlan ?? payload.evidence_plan, 30, 400),
      expectedOutput: bounded(payload.expectedOutput ?? payload.expected_output, 1200),
    };
    if (!normalized.contributionSummary || !normalized.evidencePlan.length) workflowError('contributionSummary and evidencePlan are required', 'invalid_claim', 422);
    const key = assertSafeKey(idempotencyKey ?? payload.idempotencyKey ?? `claim-${digest(normalized).slice(0, 32)}`);
    const requestDigest = digest(normalized);
    const idem = this.#idempotent('claim', auth.subject, key, requestDigest);
    if (idem.prior) {
      const existing = this.#findClaim(idem.prior.recordId);
      return { created: false, replayed: true, ...recordEnvelope('claim_pending_owner_review', existing, { kind: 'claim', claim: publicRecord(existing, { kind: 'claim' }), opportunity }) };
    }
    const timestamp = nowIso(this.#clock);
    const record = {
      schema: PORTAL_WORKFLOW_SCHEMA,
      id: `claim_${randomUUID()}`,
      ...normalized,
      status: 'claimed',
      lifecycleStatus: 'claimed',
      reviewStatus: 'queued_for_review',
      createdAt: timestamp,
      updatedAt: timestamp,
      payloadDigest: requestDigest,
      idempotencyKey: key,
      authenticatedSubject: auth.subject,
      registrationId: registration.id,
      opportunityOwner: opportunity.owner,
    };
    this.#state.claims[record.id] = record;
    this.#rememberIdempotency(idem.key, requestDigest, record.id);
    this.#save();
    return {
      created: true,
      replayed: false,
      ...recordEnvelope('claim_pending_owner_review', record, { kind: 'claim', claim: publicRecord(record, { kind: 'claim' }), opportunity }),
    };
  }

  submit({ actor, payload = {}, idempotencyKey } = {}) {
    assertSafePayload(payload);
    const agentId = assertId(payload.agentId ?? payload.agent_id, 'agentId');
    const auth = this.#authorize(actor, WORKFLOW_SCOPES.submit, agentId);
    const opportunityId = assertId(payload.opportunityId ?? payload.opportunity_id, 'opportunityId');
    const opportunity = this.getOpportunity(opportunityId);
    if (!opportunity) workflowError('opportunity not found', 'opportunity_not_found', 404);
    const claimId = assertId(payload.claimId ?? payload.claim_id, 'claimId');
    const claim = this.#findClaim(claimId);
    if (!claim || claim.agentId !== agentId || claim.opportunityId !== opportunityId) workflowError('claim not found for this agent and opportunity', 'claim_not_found', 404);
    const normalized = {
      agentId,
      opportunityId,
      claimId,
      title: bounded(payload.title, 240),
      summary: bounded(payload.summary ?? payload.description, 2200),
      artifact: payload.artifact ?? null,
      evidence: normalizeList(payload.evidence, 40, 500),
      requestedReviewers: normalizeList(payload.requestedReviewers ?? payload.requested_reviewers, 10, 120),
    };
    if (!normalized.title || !normalized.artifact || !normalized.evidence.length) workflowError('title, artifact, and evidence are required', 'invalid_submission', 422);
    const key = assertSafeKey(idempotencyKey ?? payload.idempotencyKey ?? `submission-${digest(normalized).slice(0, 32)}`);
    const requestDigest = digest(normalized);
    const idem = this.#idempotent('submission', auth.subject, key, requestDigest);
    if (idem.prior) {
      const existing = this.#findSubmission(idem.prior.recordId);
      const attestation = this.#ensurePendingAttestation({
        submissionId: existing.id,
        opportunityId: existing.opportunityId,
        agentId: existing.agentId,
        timestamp: existing.createdAt,
      });
      this.#save();
      return {
        created: false,
        replayed: true,
        ...recordEnvelope('submission_queued_for_review', existing, {
          kind: 'submission',
          submission: publicRecord(existing, { kind: 'submission', includeFeedback: true }),
          attestation: publicAttestation(attestation),
        }),
      };
    }
    const timestamp = nowIso(this.#clock);
    const record = {
      schema: PORTAL_WORKFLOW_SCHEMA,
      id: `sub_${randomUUID()}`,
      ...normalized,
      status: 'submitted',
      lifecycleStatus: 'submitted',
      reviewStatus: 'queued_for_review',
      reviewVersion: 0,
      feedbackIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      payloadDigest: requestDigest,
      idempotencyKey: key,
      authenticatedSubject: auth.subject,
    };
    this.#state.submissions[record.id] = record;
    const attestation = this.#ensurePendingAttestation({
      submissionId: record.id,
      opportunityId,
      agentId,
      timestamp,
    });
    this.#rememberIdempotency(idem.key, requestDigest, record.id);
    this.#save();
    return {
      created: true,
      replayed: false,
      ...recordEnvelope('submission_queued_for_review', record, {
        kind: 'submission',
        submission: publicRecord(record, { kind: 'submission', includeFeedback: true }),
        attestation: publicAttestation(attestation),
      }),
      nextAction: 'Reviewer acceptance is required before publication, assignment, reputation credit, or attestation.',
    };
  }

  feedback({ actor, payload = {}, idempotencyKey } = {}) {
    assertSafePayload(payload);
    const submissionId = assertId(payload.submissionId ?? payload.submission_id, 'submissionId');
    const submission = this.#findSubmission(submissionId);
    if (!submission) workflowError('submission not found', 'submission_not_found', 404);
    const auth = this.#authorize(actor, WORKFLOW_SCOPES.feedback, submission.agentId);
    const normalized = {
      submissionId,
      response: bounded(payload.response, 2200),
      changes: normalizeList(payload.changes, 30, 500),
      evidence: normalizeList(payload.evidence, 40, 500),
    };
    if (!normalized.response) workflowError('response is required', 'invalid_feedback', 422);
    const key = assertSafeKey(idempotencyKey ?? payload.idempotencyKey ?? `feedback-${digest(normalized).slice(0, 32)}`);
    const requestDigest = digest(normalized);
    const idem = this.#idempotent('feedback', auth.subject, key, requestDigest);
    if (idem.prior) {
      const existing = this.#state.feedback[idem.prior.recordId];
      return { created: false, replayed: true, ...recordEnvelope('feedback_response_queued_for_review', existing, { kind: 'feedback', feedbackResponse: publicRecord(existing, { kind: 'feedback' }) }) };
    }
    const timestamp = nowIso(this.#clock);
    const record = {
      schema: PORTAL_WORKFLOW_SCHEMA,
      id: `fb_${randomUUID()}`,
      ...normalized,
      status: 'feedback_submitted',
      lifecycleStatus: 'reviewed',
      reviewStatus: 'queued_for_review',
      createdAt: timestamp,
      updatedAt: timestamp,
      payloadDigest: requestDigest,
      idempotencyKey: key,
      authenticatedSubject: auth.subject,
    };
    this.#state.feedback[record.id] = record;
    submission.feedbackIds = [...(submission.feedbackIds ?? []), record.id];
    submission.updatedAt = timestamp;
    this.#rememberIdempotency(idem.key, requestDigest, record.id);
    this.#save();
    return {
      created: true,
      replayed: false,
      ...recordEnvelope('feedback_response_queued_for_review', record, { kind: 'feedback', feedbackResponse: publicRecord(record, { kind: 'feedback' }) }),
    };
  }

  review({ actor, payload = {}, idempotencyKey } = {}) {
    assertSafePayload(payload);
    const auth = this.#authorize(actor, WORKFLOW_SCOPES.review, undefined, { allowReviewerRole: true });
    const submissionId = assertId(payload.submissionId ?? payload.submission_id, 'submissionId');
    const submission = this.#findSubmission(submissionId);
    if (!submission) workflowError('submission not found', 'submission_not_found', 404);
    const decision = bounded(payload.decision ?? payload.reviewOutcome ?? payload.review_outcome, 32).toLowerCase();
    if (!TERMINAL_DECISIONS.has(decision)) workflowError('decision must be approved or rejected', 'invalid_review', 422);
    const expectedVersion = payload.expectedVersion ?? payload.expected_version;
    if (expectedVersion !== undefined && Number(expectedVersion) !== Number(submission.reviewVersion)) {
      throw new ContributorPortalConflictError('submission was reviewed concurrently', {
        code: 'concurrent_review',
        details: { currentVersion: submission.reviewVersion },
      });
    }
    if (submission.terminalOutcome) {
      if (submission.terminalOutcome === decision) {
        return { created: false, replayed: true, ...recordEnvelope('reviewed', submission, { kind: 'submission', review: publicRecord(submission, { kind: 'submission' }), submission: publicRecord(submission, { kind: 'submission', includeFeedback: true }) }) };
      }
      throw new ContributorPortalConflictError('terminal submission cannot be reviewed again', { code: 'review_already_terminal' });
    }
    const timestamp = nowIso(this.#clock);
    submission.reviewVersion = Number(submission.reviewVersion ?? 0) + 1;
    submission.reviewStatus = 'reviewed';
    submission.lifecycleStatus = 'terminal';
    submission.status = decision;
    submission.terminalOutcome = decision;
    submission.reviewerId = auth.subject;
    submission.reviewDecision = decision;
    submission.updatedAt = timestamp;
    const attestation = this.#findAttestationBySubmissionId(submissionId);
    if (attestation) {
      attestation.status = contributionAttestationStatusForReviewStatus(decision);
      attestation.lifecycleStatus = 'terminal';
      attestation.reviewStatus = 'reviewed';
      attestation.attestationStatus = attestation.status;
      attestation.publicAttestation = false;
      attestation.updatedAt = timestamp;
    }
    const review = {
      schema: PORTAL_WORKFLOW_REVIEW_SCHEMA,
      id: `review_${randomUUID()}`,
      submissionId,
      decision,
      status: 'reviewed',
      reviewerId: auth.subject,
      reviewVersion: submission.reviewVersion,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.#state.reviews[review.id] = review;
    const key = idempotencyKey ?? payload.idempotencyKey;
    if (key) this.#rememberIdempotency(`review:${auth.subject}:${assertSafeKey(key)}`, digest({ submissionId, decision }), review.id);
    const integrationPayload = {
      submissionId,
      title: submission.title,
      summary: submission.summary,
      reviewOutcome: decision,
      reviewDecision: decision,
      managerStatus: 'not_created',
      sourceIds: submission.evidence,
      artifactCount: 1,
      opportunityId: submission.opportunityId,
      claimId: submission.claimId,
      occurredAt: timestamp,
    };
    if (decision === 'approved') this.#outbox?.enqueue?.('idacc_task_create', integrationPayload, { id: `idacc:${submissionId}` });
    this.#outbox?.enqueue?.('brain_terminal_summary', integrationPayload, { id: `brain:${submissionId}:${decision}` });
    this.#save();
    return {
      created: true,
      replayed: false,
      ...recordEnvelope('reviewed', submission, {
        kind: 'submission',
        review: { ...publicRecord(review, { kind: 'review' }), decision },
        submission: publicRecord(submission, { kind: 'submission', includeFeedback: true }),
        terminal: { status: 'terminal', outcome: decision },
      }),
    };
  }

  status({ id, kind = 'any', actor } = {}) {
    const queryId = bounded(id, 180);
    const queryKind = bounded(kind, 40, 'any');
    if (!queryId) return { status: 'status_lookup_ready', query: { id: null, kind: queryKind }, reviewGate: reviewGate() };
    const actorRecord = normalizeActor(actor);
    const attestationQuery = queryKind === 'attestation' || queryId.startsWith('att_');
    const attestationId = queryId.startsWith('att_') ? queryId : contributionAttestationId(queryId);
    const attestationRecord = this.#state.attestations[attestationId]
      ?? (attestationQuery ? this.#findAttestationBySubmissionId(contributionIdFromAttestationId(queryId)) : undefined);
    const attestationSubmission = attestationQuery
      ? this.#findSubmission(contributionIdFromAttestationId(queryId))
      : undefined;
    if (attestationQuery && (attestationRecord || attestationSubmission)) {
      const owner = attestationRecord?.agentId ?? attestationSubmission?.agentId;
      const reviewer = actorRecord.scopes.includes(WORKFLOW_SCOPES.review) || REVIEWER_ROLES.has(actorRecord.role);
      const isOwner = !!actorRecord.subject
        && actorRecord.subject === owner
        && actorRecord.scopes.includes(WORKFLOW_SCOPES.submit);
      if (!reviewer && !isOwner) {
        return { status: 'not_found', query: { id: queryId, kind: queryKind }, result: null, reviewGate: reviewGate(), privacy: { notFoundForUnauthorizedOwner: true } };
      }
      return {
        status: 'status_found',
        query: { id: queryId, kind: queryKind },
        result: publicAttestation(attestationRecord ?? attestationSubmission, {
          intakeReceipt: this.#findIntakeReceiptBySubmissionId(
            attestationRecord?.submissionId ?? attestationSubmission?.id,
          ),
        }),
        reviewGate: reviewGate(),
      };
    }

    const collections = queryKind === 'registration'
      ? [['registration', this.#state.registrations]]
      : queryKind === 'claim'
        ? [['claim', this.#state.claims]]
        : queryKind === 'submission'
          ? [['submission', this.#state.submissions]]
          : queryKind === 'feedback'
            ? [['feedback', this.#state.feedback]]
            : queryKind === 'review'
              ? [['review', this.#state.reviews]]
              : queryKind === 'attestation'
                ? [['attestation', this.#state.attestations]]
              : [
                  ['registration', this.#state.registrations],
                  ['claim', this.#state.claims],
                  ['submission', this.#state.submissions],
                  ['feedback', this.#state.feedback],
                  ['review', this.#state.reviews],
                  ['attestation', this.#state.attestations],
                ];
    for (const [recordKind, collection] of collections) {
      const record = collection[queryId];
      if (!record) continue;
      const owner = record.agentId ?? this.#findSubmission(record.submissionId)?.agentId;
      const reviewer = actorRecord.scopes.includes(WORKFLOW_SCOPES.review) || REVIEWER_ROLES.has(actorRecord.role);
      // Same-subject actors are not automatically the record's actor: a
      // caller only ever holds the scope for the action it actually took, so
      // an actor without the recordKind's own scope must be treated the same
      // as an unrelated subject, not silently granted read access.
      const requiredScope = STATUS_SCOPE_BY_KIND[recordKind];
      const hasRequiredScope = !requiredScope || actorRecord.scopes.includes(requiredScope);
      const isOwner = !!actorRecord.subject && (!owner || actorRecord.subject === owner) && hasRequiredScope;
      if (!reviewer && !isOwner) {
        return { status: 'not_found', query: { id: queryId, kind: queryKind }, result: null, reviewGate: reviewGate(), privacy: { notFoundForUnauthorizedOwner: true } };
      }
      return {
        status: 'status_found',
        query: { id: queryId, kind: queryKind },
        result: recordKind === 'attestation'
          ? publicAttestation(record, {
              intakeReceipt: this.#findIntakeReceiptBySubmissionId(record.submissionId ?? record.id),
            })
          : publicRecord(record, { kind: recordKind, includeFeedback: true }),
        reviewGate: reviewGate(),
      };
    }
    const opportunity = this.getOpportunity(queryId);
    if (opportunity && (queryKind === 'any' || queryKind === 'opportunity')) {
      return { status: 'status_found', query: { id: queryId, kind: queryKind }, result: { schema: PORTAL_WORKFLOW_STATUS_SCHEMA, kind: 'opportunity', id: queryId, status: opportunity.status, lifecycleStatus: opportunity.status, opportunity, reviewGate: reviewGate() }, reviewGate: reviewGate() };
    }
    return { status: 'not_found', query: { id: queryId, kind: queryKind }, result: null, reviewGate: reviewGate() };
  }

  lookupAttestation({ attestationId, contributionId, actor } = {}) {
    const queryId = attestationId ? assertId(attestationId, 'attestationId') : assertId(contributionId, 'contributionId');
    const submissionId = contributionIdFromAttestationId(queryId);
    const record = this.#state.attestations[attestationId ? queryId : contributionAttestationId(queryId)]
      ?? this.#findAttestationBySubmissionId(submissionId)
      ?? this.#findSubmission(submissionId);
    if (!record) {
      return { status: 'not_found', query: { attestationId: attestationId ?? null, contributionId: contributionId ?? null }, attestation: null, reviewGate: reviewGate() };
    }
    const status = this.status({ id: attestationId ?? contributionAttestationId(queryId), kind: 'attestation', actor });
    return {
      ...status,
      attestation: status.status === 'status_found' ? status.result : null,
    };
  }

  getContributionAttestation(id) {
    const submissionId = contributionIdFromAttestationId(id);
    const record = this.#findAttestationBySubmissionId(submissionId) ?? this.#findSubmission(submissionId);
    return record
      ? publicAttestation(record, { intakeReceipt: this.#findIntakeReceiptBySubmissionId(submissionId) })
      : undefined;
  }

  reviewQueue({ actor } = {}) {
    this.#authorize(actor, WORKFLOW_SCOPES.review, undefined, { allowReviewerRole: true });
    return {
      status: 'review_queue_ready',
      reviewGate: reviewGate(),
      registrations: Object.values(this.#state.registrations).map((row) => publicRecord(row, { kind: 'registration' })),
      claims: Object.values(this.#state.claims).map((row) => publicRecord(row, { kind: 'claim' })),
      submissions: Object.values(this.#state.submissions).map((row) => publicRecord(row, { kind: 'submission', includeFeedback: true })),
      feedback: Object.values(this.#state.feedback).map((row) => publicRecord(row, { kind: 'feedback' })),
      attestations: Object.values(this.#state.attestations).map((record) => publicAttestation(record, {
        intakeReceipt: this.#findIntakeReceiptBySubmissionId(record.submissionId ?? record.id),
      })),
    };
  }

  outboxRows() { return this.#outbox?.rows?.() ?? []; }
}

export function createContributorPortalWorkflow(options = {}) {
  return new ContributorPortalWorkflow(options);
}

export default ContributorPortalWorkflow;
