import { createHash, randomUUID } from 'node:crypto';

export const CONTRIBUTION_HTTP_PREFIX = '/v1/contributions';
export const CONTRIBUTION_SUBMISSIONS_ROUTE = `${CONTRIBUTION_HTTP_PREFIX}/submissions`;
export const CONTRIBUTION_REVIEW_DECISIONS_SUFFIX = '/review-decisions';

export const CONTRIBUTION_SERVICE_REQUEST_SCHEMAS = Object.freeze([
  'agent.bittrees.contribution-submission.v1',
  'agent.bittrees.contribution-intent.v1',
]);

export const CONTRIBUTION_SERVICE_RESPONSE_SCHEMA = 'agent.bittrees.contribution-submission.response.v1';
export const CONTRIBUTION_SERVICE_REVIEW_DECISION_SCHEMA = 'agent.bittrees.contribution-submission.review-decision.v1';

export const CONTRIBUTION_WRITE_FLAG_NAMES = Object.freeze([
  'CONTRIBUTION_SERVICE_WRITE_ENABLED',
  'CONTRIBUTION_SUBMISSIONS_WRITE_ENABLED',
  'PORTAL_ENABLE_CONTRIBUTION_SERVICE',
  'CONTRIBUTION_INTENTS_WRITE_ENABLED',
  'CONTRIBUTION_INTENTS_ENABLED',
  'PORTAL_ENABLE_CONTRIBUTION_INTENTS',
]);

export const CONTRIBUTION_STATES = Object.freeze([
  'received',
  'validated',
  'review_pending',
  'review_rejected',
  'review_accepted',
  'idacc_create_pending',
  'idacc_created',
  'idacc_todo',
  'idacc_doing',
  'idacc_done',
  'integration_retrying',
  'integration_failed',
  'withdrawn',
]);

export const CONTRIBUTION_REVIEW_DECISIONS = Object.freeze(['accept', 'reject', 'withdraw']);

export const CONTRIBUTION_LANES = Object.freeze([
  {
    id: 'research',
    label: 'Research',
    bittreesArm: 'Bittrees Research',
  },
  {
    id: 'inc-ops-governance',
    label: 'Inc ops/governance',
    bittreesArm: 'Bittrees, Inc.',
  },
  {
    id: 'capital-treasury',
    label: 'Capital/treasury',
    bittreesArm: 'Bittrees Capital',
  },
  {
    id: 'discovery',
    label: 'Discovery',
    bittreesArm: 'Cross-cutting',
  },
  {
    id: 'awareness',
    label: 'Awareness',
    bittreesArm: 'Cross-cutting',
  },
]);

export const CONTRIBUTION_TEMPLATES = Object.freeze([
  {
    id: 'source-backed-claim',
    name: 'Source-backed claim packet',
    lane: 'research',
  },
  {
    id: 'contribution-task',
    name: 'Contribution task brief',
    lane: 'inc-ops-governance',
  },
  {
    id: 'opportunity-brief',
    name: 'Discovery opportunity brief',
    lane: 'discovery',
  },
  {
    id: 'treasury-verification-request',
    name: 'Treasury verification request',
    lane: 'capital-treasury',
  },
  {
    id: 'awareness-summary',
    name: 'Public awareness summary',
    lane: 'awareness',
  },
]);

export const CONTRIBUTION_AUTH_SCOPES = Object.freeze({
  submit: 'contributor:submit',
  review: 'contributor:review',
});

const FORBIDDEN_INPUT_KEYS = new Set([
  'taskName',
  'task_name',
  'reviewer',
  'reviewerId',
  'reviewer_id',
  'reviewerIdentity',
  'brainKey',
  'brain_key',
  'brainId',
  'brain_id',
  'statusReceipt',
  'submissionId',
  'submission_id',
  'idaccTaskName',
  'idacc_task_name',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (!isPlainObject(value)) return value;

  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = stableValue(value[key]);
      return acc;
    }, {});
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256Base16(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function createOpaqueId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function isContributionServiceWritesEnabled(env = process.env) {
  return CONTRIBUTION_WRITE_FLAG_NAMES.some((flagName) => normalizeBoolean(env?.[flagName]));
}

export function buildContributionReviewGate({ deploymentWritesEnabled }) {
  return {
    productionMutationAllowed: false,
    deploymentWritesEnabled: Boolean(deploymentWritesEnabled),
    persistenceMode: 'transactional-review-queue',
    status: deploymentWritesEnabled ? 'review_required_before_publication_or_assignment' : 'deployment-disabled',
    reviewers: ['owning lead', 'implementation validator', 'evidence and claims validator'],
    policy:
      'Submission and review operations remain review-gated and do not grant production mutation, execution authority, or public attestation.',
  };
}

function pushError(errors, path, message) {
  errors.push(`${path} ${message}`);
}

function validateString(errors, value, path, { minLength = 0, maxLength = Number.POSITIVE_INFINITY, allowedValues } = {}) {
  if (typeof value !== 'string') {
    pushError(errors, path, 'must be a string.');
    return false;
  }

  if (value.length < minLength) {
    pushError(errors, path, `must be at least ${minLength} characters.`);
  }

  if (value.length > maxLength) {
    pushError(errors, path, `must be at most ${maxLength} characters.`);
  }

  if (Array.isArray(allowedValues) && allowedValues.length > 0 && !allowedValues.includes(value)) {
    pushError(errors, path, `must be one of: ${allowedValues.join(', ')}.`);
  }

  return true;
}

function validateStringArray(errors, value, path, { minItems = 0, maxItems = Number.POSITIVE_INFINITY, minLength = 1 } = {}) {
  if (!Array.isArray(value)) {
    pushError(errors, path, 'must be an array.');
    return false;
  }

  if (value.length < minItems) {
    pushError(errors, path, `must include at least ${minItems} item(s).`);
  }

  if (value.length > maxItems) {
    pushError(errors, path, `must include at most ${maxItems} item(s).`);
  }

  value.forEach((item, index) => {
    if (typeof item !== 'string' || item.trim().length < minLength) {
      pushError(errors, `${path}[${index}]`, `must be a string of at least ${minLength} character(s).`);
    }
  });

  return true;
}

function validateUnknownKeys(errors, value, allowedKeys, path) {
  if (!isPlainObject(value)) return;

  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) {
      pushError(errors, `${path}.${key}`, 'is not allowed.');
      continue;
    }
    if (!allowed.has(key)) {
      pushError(errors, `${path}.${key}`, 'is not allowed.');
    }
  }
}

function normalizeContributor(contributor, errors) {
  if (!isPlainObject(contributor)) {
    pushError(errors, 'body.contributor', 'must be an object.');
    return null;
  }

  validateUnknownKeys(errors, contributor, ['kind', 'name', 'agentId', 'team', 'contactRoute'], 'body.contributor');

  const kind = normalizeString(contributor.kind);
  const name = normalizeString(contributor.name);
  const contactRoute = normalizeString(contributor.contactRoute);
  const agentId = normalizeString(contributor.agentId);
  const team = normalizeString(contributor.team);

  validateString(errors, kind, 'body.contributor.kind', {
    allowedValues: ['agent', 'human', 'team', 'tool'],
  });
  validateString(errors, name, 'body.contributor.name', { minLength: 1, maxLength: 120 });
  validateString(errors, contactRoute, 'body.contributor.contactRoute', { minLength: 3, maxLength: 300 });

  const normalized = { kind, name, contactRoute };
  if (agentId) normalized.agentId = agentId;
  if (team) normalized.team = team;
  return normalized;
}

function normalizeHandoff(handoff, errors) {
  if (!isPlainObject(handoff)) {
    pushError(errors, 'body.handoff', 'must be an object.');
    return null;
  }

  validateUnknownKeys(
    errors,
    handoff,
    ['requestedOwnerRoute', 'goalId', 'expectedOutput', 'acceptanceCriteria', 'outOfScope', 'backlogPolicy', 'sourceIds'],
    'body.handoff',
  );

  const requestedOwnerRoute = normalizeString(handoff.requestedOwnerRoute);
  const goalId = normalizeString(handoff.goalId);
  const expectedOutput = normalizeString(handoff.expectedOutput);
  const backlogPolicy = normalizeString(handoff.backlogPolicy);
  const acceptanceCriteria = normalizeStringArray(handoff.acceptanceCriteria);
  const outOfScope = normalizeStringArray(handoff.outOfScope);
  const sourceIds = normalizeStringArray(handoff.sourceIds);

  validateString(errors, requestedOwnerRoute, 'body.handoff.requestedOwnerRoute', { minLength: 1, maxLength: 160 });
  if (goalId) validateString(errors, goalId, 'body.handoff.goalId', { minLength: 1, maxLength: 120 });
  validateString(errors, expectedOutput, 'body.handoff.expectedOutput', { minLength: 10, maxLength: 1200 });
  validateStringArray(errors, acceptanceCriteria, 'body.handoff.acceptanceCriteria', { minItems: 1, maxItems: 10, minLength: 5 });
  validateStringArray(errors, outOfScope, 'body.handoff.outOfScope', { minItems: 1, maxItems: 10, minLength: 3 });
  validateString(errors, backlogPolicy, 'body.handoff.backlogPolicy', { minLength: 10, maxLength: 700 });

  const normalized = {
    requestedOwnerRoute,
    expectedOutput,
    acceptanceCriteria,
    outOfScope,
    backlogPolicy,
  };

  if (goalId) normalized.goalId = goalId;
  if (sourceIds.length > 0) normalized.sourceIds = sourceIds;
  return normalized;
}

function normalizeSafety(safety, errors) {
  if (!isPlainObject(safety)) {
    pushError(errors, 'body.safety', 'must be an object.');
    return null;
  }

  validateUnknownKeys(
    errors,
    safety,
    ['noSecretsIncluded', 'noLiveWriteAcknowledged', 'noOnchainActionRequested'],
    'body.safety',
  );

  const noSecretsIncluded = normalizeBoolean(safety.noSecretsIncluded);
  const noLiveWriteAcknowledged = normalizeBoolean(safety.noLiveWriteAcknowledged);
  const noOnchainActionRequested = normalizeBoolean(safety.noOnchainActionRequested);

  if (!noSecretsIncluded) pushError(errors, 'body.safety.noSecretsIncluded', 'must be true.');
  if (!noLiveWriteAcknowledged) pushError(errors, 'body.safety.noLiveWriteAcknowledged', 'must be true.');
  if (!noOnchainActionRequested) pushError(errors, 'body.safety.noOnchainActionRequested', 'must be true.');

  return {
    noSecretsIncluded: true,
    noLiveWriteAcknowledged: true,
    noOnchainActionRequested: true,
  };
}

function normalizeSubmissionMetadata(input) {
  return {
    schema: normalizeString(input.schema || CONTRIBUTION_SERVICE_REQUEST_SCHEMAS[0]),
    intentId: normalizeString(input.intentId || createOpaqueId('intent')),
    submittedAt: normalizeString(input.submittedAt || new Date().toISOString()),
  };
}

export function normalizeContributionSubmissionRequest(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['body must be an object.'] };
  }

  validateUnknownKeys(
    errors,
    input,
    ['schema', 'intentId', 'submittedAt', 'contributor', 'targetLane', 'summary', 'proposedTemplate', 'handoff', 'safety'],
    'body',
  );

  const normalized = normalizeSubmissionMetadata(input);
  if (!CONTRIBUTION_SERVICE_REQUEST_SCHEMAS.includes(normalized.schema)) {
    pushError(
      errors,
      'body.schema',
      `must be one of: ${CONTRIBUTION_SERVICE_REQUEST_SCHEMAS.join(', ')}.`,
    );
  }

  if (Number.isNaN(Date.parse(normalized.submittedAt))) {
    pushError(errors, 'body.submittedAt', 'must be an ISO-8601 date-time string.');
  }

  normalized.contributor = normalizeContributor(input.contributor, errors);
  normalized.targetLane = normalizeString(input.targetLane);
  normalized.summary = normalizeString(input.summary);
  normalized.proposedTemplate = normalizeString(input.proposedTemplate);
  normalized.handoff = normalizeHandoff(input.handoff, errors);
  normalized.safety = normalizeSafety(input.safety, errors);

  validateString(errors, normalized.targetLane, 'body.targetLane', {
    allowedValues: CONTRIBUTION_LANES.map((lane) => lane.id),
  });
  validateString(errors, normalized.summary, 'body.summary', { minLength: 20, maxLength: 1200 });
  validateString(errors, normalized.proposedTemplate, 'body.proposedTemplate', {
    allowedValues: CONTRIBUTION_TEMPLATES.map((template) => template.id),
  });

  if (!isPlainObject(normalized.contributor) || !isPlainObject(normalized.handoff) || !isPlainObject(normalized.safety)) {
    return { ok: false, errors: errors.length > 0 ? errors : ['body could not be normalized.'] };
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized,
  };
}

export function validateReviewDecisionRequest(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['body must be an object.'] };
  }

  validateUnknownKeys(errors, input, ['decision', 'notes', 'evidence', 'outboxStatus', 'terminalSummary'], 'body');
  const decision = normalizeString(input.decision);
  validateString(errors, decision, 'body.decision', {
    allowedValues: CONTRIBUTION_REVIEW_DECISIONS,
  });

  const notes = normalizeString(input.notes);
  if (notes) validateString(errors, notes, 'body.notes', { maxLength: 2000 });
  if (input.evidence !== undefined) validateStringArray(errors, normalizeStringArray(input.evidence), 'body.evidence', { minItems: 0, maxItems: 20, minLength: 1 });

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      decision,
      ...(notes ? { notes } : {}),
      evidence: normalizeStringArray(input.evidence),
      outboxStatus: normalizeString(input.outboxStatus || ''),
      terminalSummary: normalizeString(input.terminalSummary || ''),
    },
  };
}

export function canonicalContributionRequestFingerprint(input) {
  return sha256Base16(
    stableStringify({
      schema: normalizeString(input.schema || CONTRIBUTION_SERVICE_REQUEST_SCHEMAS[0]),
      intentId: normalizeString(input.intentId || ''),
      submittedAt: normalizeString(input.submittedAt || ''),
      contributor: input.contributor,
      targetLane: normalizeString(input.targetLane || ''),
      summary: normalizeString(input.summary || ''),
      proposedTemplate: normalizeString(input.proposedTemplate || ''),
      handoff: input.handoff,
      safety: input.safety,
    }),
  );
}

export function canonicalReviewDecisionFingerprint(input) {
  return sha256Base16(
    stableStringify({
      decision: normalizeString(input.decision || ''),
      notes: normalizeString(input.notes || ''),
      evidence: normalizeStringArray(input.evidence),
      outboxStatus: normalizeString(input.outboxStatus || ''),
      terminalSummary: normalizeString(input.terminalSummary || ''),
    }),
  );
}

export function buildSubmissionId() {
  return createOpaqueId('sub');
}

export function buildStatusReceipt(submissionId, fingerprint) {
  return `receipt_${sha256Base16(`${submissionId}:${fingerprint}`).slice(0, 24)}`;
}

export function buildIdaccTaskName(submissionId) {
  return `bittrees-submission-${submissionId.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 16).toLowerCase()}`;
}

export function buildIdaccTaskSummary(submission) {
  return {
    submissionId: submission.id,
    contributor: submission.contributor.agentId ?? submission.contributor.name,
    targetLane: submission.targetLane,
    summary: submission.summary,
    proposedTemplate: submission.proposedTemplate,
    handoff: {
      goalId: submission.handoff.goalId ?? null,
      requestedOwnerRoute: submission.handoff.requestedOwnerRoute,
      expectedOutput: submission.handoff.expectedOutput,
      acceptanceCriteria: submission.handoff.acceptanceCriteria,
      outOfScope: submission.handoff.outOfScope,
      backlogPolicy: submission.handoff.backlogPolicy,
      sourceCount: submission.handoff.sourceIds?.length ?? 0,
    },
  };
}

export function buildTerminalSummary(submission) {
  return {
    submissionId: submission.id,
    state: submission.state,
    statusReceipt: submission.statusReceipt,
    submittedAt: submission.submittedAt,
    updatedAt: submission.updatedAt,
    targetLane: submission.targetLane,
    summary: submission.summary,
    proposedTemplate: submission.proposedTemplate,
    outcome: submission.review?.decision ?? submission.outcome ?? null,
    idacc: submission.idacc
      ? {
          state: submission.idacc.state,
          taskStatus: submission.idacc.taskStatus ?? null,
        }
      : null,
  };
}

function redactedContributor(contributor) {
  return {
    kind: contributor.kind,
    name: contributor.name,
    agentId: contributor.agentId ?? null,
    team: contributor.team ?? null,
  };
}

function redactedHandoff(handoff) {
  return {
    goalId: handoff.goalId ?? null,
    expectedOutput: handoff.expectedOutput,
    acceptanceCriteria: [...handoff.acceptanceCriteria],
    outOfScope: [...handoff.outOfScope],
    backlogPolicy: handoff.backlogPolicy,
    sourceCount: handoff.sourceIds?.length ?? 0,
  };
}

export function buildRedactedSubmissionProjection(submission) {
  return {
    submissionId: submission.id,
    state: submission.state,
    version: submission.version,
    statusReceipt: submission.statusReceipt,
    submittedAt: submission.submittedAt,
    updatedAt: submission.updatedAt,
    targetLane: submission.targetLane,
    summary: submission.summary,
    proposedTemplate: submission.proposedTemplate,
    contributor: redactedContributor(submission.contributor),
    handoff: redactedHandoff(submission.handoff),
    review: {
      decision: submission.review?.decision ?? 'pending',
      state: submission.review?.state ?? submission.state,
      reviewedAt: submission.review?.reviewedAt ?? null,
      result: submission.review?.result ?? null,
    },
    idacc: submission.idacc
      ? {
          state: submission.idacc.state,
          taskStatus: submission.idacc.taskStatus ?? null,
        }
      : null,
    terminalSummary: submission.terminalSummary ?? null,
  };
}

export function buildReviewerSubmissionProjection(submission) {
  return {
    ...buildRedactedSubmissionProjection(submission),
    review: {
      ...buildRedactedSubmissionProjection(submission).review,
      decisionNotes: submission.review?.notes ?? null,
      evidenceCount: Array.isArray(submission.review?.evidence) ? submission.review.evidence.length : 0,
    },
  };
}

export function parseContributionBearerToken(headerValue) {
  const raw = normalizeString(headerValue);
  if (!raw) return null;

  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  if (token.startsWith('{') && token.endsWith('}')) {
    try {
      const parsed = JSON.parse(token);
      if (!isPlainObject(parsed)) return null;
      const scope = normalizeString(parsed.scope || parsed.scopes || '');
      const subject = normalizeString(parsed.subject || parsed.sub || '');
      return {
        raw: token,
        scope: scope || null,
        subject: subject || null,
        tokenType: 'json',
      };
    } catch {
      return null;
    }
  }

  let scope = null;
  let subject = null;

  for (const fragment of token.split(/[|,\s]+/).map((item) => item.trim()).filter(Boolean)) {
    const [key, ...rest] = fragment.split('=');
    const value = rest.join('=').trim();

    if (/^scope$/i.test(key)) {
      scope = normalizeString(value);
      continue;
    }

    if (/^(subject|sub)$/i.test(key)) {
      subject = normalizeString(value);
      continue;
    }

    if (!scope && (fragment === CONTRIBUTION_AUTH_SCOPES.submit || fragment === CONTRIBUTION_AUTH_SCOPES.review)) {
      scope = fragment;
      continue;
    }

    if (!scope && /contributor:submit/i.test(fragment)) {
      scope = CONTRIBUTION_AUTH_SCOPES.submit;
      continue;
    }

    if (!scope && /contributor:review/i.test(fragment)) {
      scope = CONTRIBUTION_AUTH_SCOPES.review;
    }
  }

  if (!scope && token.startsWith('contributor:submit')) {
    scope = CONTRIBUTION_AUTH_SCOPES.submit;
  }

  if (!scope && token.startsWith('contributor:review')) {
    scope = CONTRIBUTION_AUTH_SCOPES.review;
  }

  return {
    raw: token,
    scope: scope || null,
    subject: subject || null,
    tokenType: 'text',
  };
}

export function isSubmitterScope(scope) {
  return typeof scope === 'string' && scope.toLowerCase() === CONTRIBUTION_AUTH_SCOPES.submit;
}

export function isReviewerScope(scope) {
  if (typeof scope !== 'string') return false;
  const lower = scope.toLowerCase();
  return lower === CONTRIBUTION_AUTH_SCOPES.review || lower === 'reviewer' || lower === 'contributor:decision';
}

export function isOwnedBySubmissionSubject(submission, subject) {
  return Boolean(subject) && submission?.contributor?.agentId === subject;
}

export function isReviewerAllowedForSubmission(_submission, auth) {
  return isReviewerScope(auth?.scope);
}

export function normalizeSubmissionId(value) {
  return normalizeString(value);
}

export function isTerminalContributionState(state) {
  return ['review_rejected', 'withdrawn', 'idacc_done', 'integration_failed'].includes(state);
}

export function getContributionStateLabel(state) {
  switch (state) {
    case 'received':
    case 'validated':
    case 'review_pending':
    case 'review_accepted':
    case 'idacc_create_pending':
      return 'review queue';
    case 'idacc_created':
    case 'idacc_todo':
    case 'idacc_doing':
    case 'idacc_done':
      return 'idacc';
    case 'review_rejected':
      return 'rejected';
    case 'integration_retrying':
      return 'retrying';
    case 'integration_failed':
      return 'failed';
    case 'withdrawn':
      return 'withdrawn';
    default:
      return 'unknown';
  }
}
