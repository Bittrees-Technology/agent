import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

export const ROLE_APPLICATION_SCHEMA = 'agent.bittrees.role-application.v1';
export const ROLE_APPLICATION_STATES = Object.freeze([
  'submitted',
  'in_review',
  'needs_info',
  'pending_authority',
  'approved',
  'rejected',
]);

export const ROLE_CATALOG = Object.freeze({
  'research-contributor': Object.freeze({ id: 'research-contributor', lane: 'research' }),
  'governance-contributor': Object.freeze({ id: 'governance-contributor', lane: 'inc-ops-governance' }),
});

const TERMINAL_STATES = new Set(['approved', 'rejected']);
const ACTIVE_STATES = new Set(ROLE_APPLICATION_STATES.filter((state) => !TERMINAL_STATES.has(state)));
const REVIEW_ACTIONS = new Set(['start_review', 'request_info', 'resume_review', 'approve', 'reject']);
const ACTION_TRANSITIONS = Object.freeze({
  start_review: new Set(['submitted']),
  request_info: new Set(['in_review']),
  resume_review: new Set(['needs_info']),
  approve: new Set(['in_review', 'pending_authority']),
  reject: new Set(['in_review', 'pending_authority']),
});
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;
const FORBIDDEN_SUBMISSION_FIELDS = new Set([
  'applicant', 'applicantId', 'applicant_id', 'wallet', 'reviewer', 'reviewerId', 'reviewer_id',
  'authority', 'authorityId', 'authority_id', 'lane', 'capabilityGrant', 'provisioning',
]);

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

function text(value, limit, field, { min = 1 } = {}) {
  if (typeof value !== 'string') throw new RoleApplicationError(`${field} is required`, { code: 'invalid_payload', status: 422 });
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (normalized.length < min || normalized.length > limit) {
    throw new RoleApplicationError(`${field} must be between ${min} and ${limit} characters`, { code: 'invalid_payload', status: 422 });
  }
  return normalized;
}

function id(value, field) {
  const normalized = text(value, 180, field);
  if (!ID_PATTERN.test(normalized)) {
    throw new RoleApplicationError(`${field} is invalid`, { code: 'invalid_identifier', status: 422 });
  }
  return normalized;
}

function normalizeEvidenceLinks(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw new RoleApplicationError('evidenceLinks must contain one to eight HTTPS or HTTP links', { code: 'invalid_payload', status: 422 });
  }
  const links = value.map((item) => text(item, 500, 'evidenceLinks item'));
  for (const link of links) {
    let parsed;
    try {
      parsed = new URL(link);
    } catch {
      throw new RoleApplicationError('evidenceLinks must contain valid HTTP(S) URLs', { code: 'invalid_evidence_link', status: 422 });
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new RoleApplicationError('evidenceLinks must contain valid HTTP(S) URLs', { code: 'invalid_evidence_link', status: 422 });
    }
  }
  return [...new Set(links)];
}

function normalizeApplicationPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new RoleApplicationError('request body must be a JSON object', { code: 'invalid_json', status: 400 });
  }
  for (const field of FORBIDDEN_SUBMISSION_FIELDS) {
    if (Object.hasOwn(payload, field)) {
      throw new RoleApplicationError(`${field} is server-derived and must not be supplied`, { code: 'forbidden_client_identity_field', status: 400 });
    }
  }
  const roleId = text(payload.roleId, 80, 'roleId');
  const role = ROLE_CATALOG[roleId];
  if (!role) throw new RoleApplicationError('roleId is not registered', { code: 'unknown_role', status: 422 });
  return {
    roleId: role.id,
    lane: role.lane,
    motivation: text(payload.motivation, 2000, 'motivation', { min: 20 }),
    experience: text(payload.experience, 4000, 'experience', { min: 20 }),
    evidenceLinks: normalizeEvidenceLinks(payload.evidenceLinks),
  };
}

function normalizedPolicy(result, { requireAuthority = false } = {}) {
  if (!result || result.eligible !== true) return { eligible: false, lanes: [] };
  const lanes = Array.isArray(result.lanes)
    ? result.lanes.filter((lane) => lane === 'research' || lane === 'inc-ops-governance')
    : [];
  if (!lanes.length) return { eligible: false, lanes: [] };
  if (requireAuthority && result.authorized !== true) return { eligible: false, lanes: [] };
  return { eligible: true, lanes: [...new Set(lanes)], policyId: typeof result.policyId === 'string' ? result.policyId.slice(0, 120) : 'server-policy' };
}

function policyCovers(policy, lane) {
  return policy.eligible === true && policy.lanes.includes(lane);
}

function defaultState() {
  return {
    schema: ROLE_APPLICATION_SCHEMA,
    version: 1,
    applications: {},
  };
}

function normalizeState(value) {
  const state = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...defaultState(),
    ...state,
    schema: ROLE_APPLICATION_SCHEMA,
    version: 1,
    applications: state.applications && typeof state.applications === 'object' && !Array.isArray(state.applications)
      ? state.applications
      : {},
  };
}

export class RoleApplicationError extends Error {
  constructor(message, { code = 'role_application_error', status = 400, details } = {}) {
    super(message);
    this.name = 'RoleApplicationError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class RoleApplicationConflictError extends RoleApplicationError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? 'role_application_conflict', status: options.status ?? 409 });
    this.name = 'RoleApplicationConflictError';
  }
}

export class InMemoryRoleApplicationStore {
  #state;

  constructor(initialState = defaultState()) {
    this.#state = normalizeState(initialState);
  }

  read() { return clone(this.#state); }
  write(state) { this.#state = normalizeState(state); return clone(this.#state); }
}

/** Local/test-only append-safe state persistence. Each replacement is written
 * to a same-directory 0600 temporary file and atomically renamed into place. */
export class JsonRoleApplicationStore {
  #path;

  constructor({ path } = {}) {
    if (!path) throw new TypeError('role application store path is required');
    this.#path = String(path);
  }

  read() {
    try {
      return normalizeState(JSON.parse(readFileSync(this.#path, 'utf8')));
    } catch (error) {
      if (error?.code === 'ENOENT') return defaultState();
      throw new RoleApplicationError('role application storage is unavailable', { code: 'storage_unavailable', status: 503 });
    }
  }

  write(state) {
    const normalized = normalizeState(state);
    const directory = dirname(this.#path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.${this.#path.split('/').pop()}.${process.pid}.${randomUUID()}.tmp`);
    let descriptor;
    try {
      descriptor = openSync(temporary, 'wx', 0o600);
      writeFileSync(descriptor, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporary, this.#path);
      chmodSync(this.#path, 0o600);
      return clone(normalized);
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      throw error instanceof RoleApplicationError
        ? error
        : new RoleApplicationError('role application storage is unavailable', { code: 'storage_unavailable', status: 503 });
    }
  }
}

function publicApplication(application, { includeDetail = false } = {}) {
  if (!application) return null;
  const projection = {
    schema: ROLE_APPLICATION_SCHEMA,
    id: application.id,
    roleId: application.roleId,
    lane: application.lane,
    state: application.state,
    version: application.version,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    provisioning: 'not_requested',
    capabilityGrant: null,
  };
  if (includeDetail) {
    projection.motivation = application.motivation;
    projection.experience = application.experience;
    projection.evidenceLinks = clone(application.evidenceLinks);
    projection.reviews = clone(application.reviews);
    projection.audit = clone(application.audit);
  }
  return projection;
}

export class RoleApplicationService {
  #store;
  #state;
  #clock;
  #reviewerEligibility;
  #decisionAuthority;

  constructor({
    store = new InMemoryRoleApplicationStore(),
    clock = () => Date.now(),
    reviewerEligibility = () => ({ eligible: false }),
    decisionAuthority = () => ({ authorized: false }),
  } = {}) {
    if (!store || typeof store.read !== 'function' || typeof store.write !== 'function') {
      throw new TypeError('role application store must implement read and write');
    }
    if (typeof reviewerEligibility !== 'function' || typeof decisionAuthority !== 'function') {
      throw new TypeError('reviewer policy lookups must be functions');
    }
    this.#store = store;
    this.#state = normalizeState(store.read());
    this.#clock = clock;
    this.#reviewerEligibility = reviewerEligibility;
    this.#decisionAuthority = decisionAuthority;
  }

  #save() {
    this.#state = normalizeState(this.#state);
    this.#store.write(this.#state);
  }

  #get(idValue) {
    const applicationId = id(idValue, 'application id');
    return this.#state.applications[applicationId] ?? null;
  }

  #eligibility(reviewer, application, action) {
    return normalizedPolicy(this.#reviewerEligibility({ reviewer: clone(reviewer), application: clone(application), action }));
  }

  #authority(reviewer, application, action) {
    const result = this.#decisionAuthority({ reviewer: clone(reviewer), application: clone(application), action });
    const normalized = result && typeof result === 'object' ? result : {};
    const lanes = Array.isArray(normalized.lanes)
      ? normalized.lanes.filter((lane) => lane === 'research' || lane === 'inc-ops-governance')
      : [];
    return {
      authorized: normalized.authorized === true && lanes.includes(application.lane),
      policyId: typeof normalized.policyId === 'string' ? normalized.policyId.slice(0, 120) : 'unresolved-authority',
    };
  }

  #requireEligibility(reviewer, application, action) {
    if (!reviewer?.wallet) throw new RoleApplicationError('verified reviewer session is required', { code: 'unauthorized', status: 401 });
    const eligibility = this.#eligibility(reviewer, application, action);
    if (!policyCovers(eligibility, application.lane)) {
      throw new RoleApplicationError('reviewer eligibility is denied', { code: 'reviewer_forbidden', status: 403 });
    }
    return eligibility;
  }

  #append(application, kind, detail, timestamp) {
    application.audit.push({
      id: `audit_${randomUUID()}`,
      at: timestamp,
      kind,
      detail: clone(detail),
    });
  }

  submit({ applicant, payload } = {}) {
    const applicantWallet = id(applicant?.wallet, 'verified applicant wallet');
    const normalized = normalizeApplicationPayload(payload);
    const duplicate = Object.values(this.#state.applications).find((application) => (
      application.applicantWallet === applicantWallet
      && application.roleId === normalized.roleId
      && ACTIVE_STATES.has(application.state)
    ));
    if (duplicate) {
      throw new RoleApplicationConflictError('an active application already exists for this role', {
        code: 'active_application_exists',
        details: { applicationId: duplicate.id },
      });
    }
    const timestamp = nowIso(this.#clock);
    const application = {
      schema: ROLE_APPLICATION_SCHEMA,
      id: `rap_${randomUUID()}`,
      applicantWallet,
      roleId: normalized.roleId,
      lane: normalized.lane,
      motivation: normalized.motivation,
      experience: normalized.experience,
      evidenceLinks: normalized.evidenceLinks,
      state: 'submitted',
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      provisioning: 'not_requested',
      capabilityGrant: null,
      reviews: [],
      audit: [],
    };
    this.#append(application, 'application_submitted', {
      applicantWallet,
      roleId: application.roleId,
      lane: application.lane,
    }, timestamp);
    this.#state.applications[application.id] = application;
    this.#save();
    return publicApplication(application, { includeDetail: true });
  }

  mine({ applicant } = {}) {
    const applicantWallet = id(applicant?.wallet, 'verified applicant wallet');
    return Object.values(this.#state.applications)
      .filter((application) => application.applicantWallet === applicantWallet)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((application) => publicApplication(application, { includeDetail: true }));
  }

  status({ applicant, reviewer, applicationId } = {}) {
    const application = this.#get(applicationId);
    if (!application) return null;
    if (applicant?.wallet === application.applicantWallet) return publicApplication(application, { includeDetail: true });
    if (!reviewer?.wallet) return null;
    const eligibility = this.#eligibility(reviewer, application, 'read_status');
    return policyCovers(eligibility, application.lane) ? publicApplication(application, { includeDetail: true }) : null;
  }

  listAdmin({ reviewer, roleId = '', lane = '' } = {}) {
    if (!reviewer?.wallet) throw new RoleApplicationError('verified reviewer session is required', { code: 'unauthorized', status: 401 });
    const listEligibility = this.#eligibility(reviewer, null, 'list');
    if (!listEligibility.eligible) throw new RoleApplicationError('reviewer eligibility is denied', { code: 'reviewer_forbidden', status: 403 });
    if (roleId && !ROLE_CATALOG[roleId]) throw new RoleApplicationError('roleId is not registered', { code: 'unknown_role', status: 422 });
    if (lane && lane !== 'research' && lane !== 'inc-ops-governance') throw new RoleApplicationError('lane is not registered', { code: 'unknown_lane', status: 422 });
    return Object.values(this.#state.applications)
      .filter((application) => !roleId || application.roleId === roleId)
      .filter((application) => !lane || application.lane === lane)
      .filter((application) => listEligibility.lanes.includes(application.lane))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((application) => publicApplication(application, { includeDetail: true }));
  }

  summary({ reviewer } = {}) {
    if (!reviewer?.wallet) throw new RoleApplicationError('verified reviewer session is required', { code: 'unauthorized', status: 401 });
    const eligibility = this.#eligibility(reviewer, null, 'summary');
    if (!eligibility.eligible) throw new RoleApplicationError('reviewer eligibility is denied', { code: 'reviewer_forbidden', status: 403 });
    const counts = {};
    for (const application of Object.values(this.#state.applications)) {
      if (!eligibility.lanes.includes(application.lane)) continue;
      counts[application.state] = (counts[application.state] ?? 0) + 1;
    }
    return { schema: ROLE_APPLICATION_SCHEMA, lanes: eligibility.lanes, counts };
  }

  review({ reviewer, applicationId, expectedVersion, action, note = '' } = {}) {
    const application = this.#get(applicationId);
    if (!application) throw new RoleApplicationError('application not found', { code: 'not_found', status: 404 });
    this.#requireEligibility(reviewer, application, action);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new RoleApplicationError('expectedVersion is required', { code: 'expected_version_required', status: 422 });
    }
    if (expectedVersion !== application.version) {
      throw new RoleApplicationConflictError('application was updated concurrently', {
        code: 'version_conflict',
        details: { expectedVersion, currentVersion: application.version },
      });
    }
    if (!REVIEW_ACTIONS.has(action)) {
      throw new RoleApplicationError('unsupported review action', { code: 'invalid_review_action', status: 422 });
    }
    if (TERMINAL_STATES.has(application.state)) {
      throw new RoleApplicationConflictError('terminal decisions are immutable', { code: 'terminal_immutable' });
    }
    if (!ACTION_TRANSITIONS[action].has(application.state)) {
      throw new RoleApplicationConflictError('review action is invalid for the application state', {
        code: 'invalid_state_transition',
        details: { state: application.state, action },
      });
    }
    const timestamp = nowIso(this.#clock);
    const boundedNote = note === undefined || note === null ? '' : text(note, 1200, 'note', { min: 0 });
    let nextState = {
      start_review: 'in_review',
      request_info: 'needs_info',
      resume_review: 'in_review',
      approve: 'approved',
      reject: 'rejected',
    }[action];
    let authority = { authorized: true, policyId: 'not_required' };
    if (action === 'approve' || action === 'reject') {
      authority = this.#authority(reviewer, application, action);
      if (!authority.authorized) nextState = 'pending_authority';
    }
    const review = {
      id: `review_${randomUUID()}`,
      at: timestamp,
      reviewerWallet: reviewer.wallet,
      action,
      note: boundedNote,
      stateBefore: application.state,
      stateAfter: nextState,
      authority: action === 'approve' || action === 'reject'
        ? { resolved: authority.authorized, policyId: authority.policyId }
        : null,
    };
    application.reviews.push(review);
    application.state = nextState;
    application.version += 1;
    application.updatedAt = timestamp;
    application.provisioning = 'not_requested';
    application.capabilityGrant = null;
    this.#append(application, nextState === 'pending_authority' ? 'decision_held_pending_authority' : 'review_recorded', {
      reviewerWallet: reviewer.wallet,
      action,
      previousState: review.stateBefore,
      nextState,
      authority: review.authority,
    }, timestamp);
    this.#save();
    return publicApplication(application, { includeDetail: true });
  }
}

export function createRoleApplicationService(options = {}) {
  return new RoleApplicationService(options);
}
