import { createServer } from 'node:http';

import {
  CONTRIBUTION_AUTH_SCOPES,
  CONTRIBUTION_HTTP_PREFIX,
  CONTRIBUTION_REVIEW_DECISIONS,
  CONTRIBUTION_REVIEW_DECISIONS_SUFFIX,
  CONTRIBUTION_SERVICE_REQUEST_SCHEMAS,
  CONTRIBUTION_SERVICE_RESPONSE_SCHEMA,
  CONTRIBUTION_SERVICE_REVIEW_DECISION_SCHEMA,
  CONTRIBUTION_STATES,
  CONTRIBUTION_SUBMISSIONS_ROUTE,
  buildContributionReviewGate,
  buildIdaccTaskName,
  buildRedactedSubmissionProjection,
  buildReviewerSubmissionProjection,
  buildStatusReceipt,
  buildTerminalSummary,
  canonicalContributionRequestFingerprint,
  canonicalReviewDecisionFingerprint,
  createOpaqueId,
  getContributionStateLabel,
  isContributionServiceWritesEnabled,
  isReviewerScope,
  isSubmitterScope,
  isTerminalContributionState,
  normalizeContributionSubmissionRequest,
  parseContributionBearerToken,
  sha256Base16,
  stableStringify,
  validateReviewDecisionRequest,
} from './domain.mjs';
import { createContributionRepository } from './repository.mjs';
import { buildContributionOutboxEvent } from './outbox-worker.mjs';
import { PORTAL_SECURITY_HEADERS } from '../portal.mjs';

const SCHEMA_URL = 'https://json-schema.org/draft/2020-12/schema';
const CONTRIBUTION_SERVICE_ROUTE_PREFIX = CONTRIBUTION_HTTP_PREFIX;
const CONTRIBUTION_SERVICE_DASHBOARD_ROUTE = `${CONTRIBUTION_HTTP_PREFIX}/dashboard`;
const CONTRIBUTION_SERVICE_STATUS_ROUTE = `${CONTRIBUTION_HTTP_PREFIX}/status`;
const CONTRIBUTION_SERVICE_SUBMISSION_STATUS_ALIAS = `${CONTRIBUTION_SUBMISSIONS_ROUTE}/status`;
const CONTRIBUTION_SERVICE_REVIEW_DECISIONS_COLLECTION_ROUTE = `${CONTRIBUTION_SUBMISSIONS_ROUTE}${CONTRIBUTION_REVIEW_DECISIONS_SUFFIX}`;
const CONTRIBUTION_SERVICE_SUBMISSION_REVIEW_DECISIONS_ROUTE = `${CONTRIBUTION_SUBMISSIONS_ROUTE}/:submissionId${CONTRIBUTION_REVIEW_DECISIONS_SUFFIX}`;
const CONTRIBUTION_SERVICE_SUBMISSION_REVIEW_HISTORY_ROUTE = `${CONTRIBUTION_SUBMISSIONS_ROUTE}/reviews`;
const CONTRIBUTION_SERVICE_SUPPORTED_LOOKUP_KINDS = Object.freeze([
  'submission',
  'review',
  'idacc',
  'attestation',
  'outbox',
  'feedback',
  'any',
]);

function normalizeText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return text || fallback;
}

function nowIso(clock = () => new Date().toISOString()) {
  const value = typeof clock === 'function' ? clock() : new Date().toISOString();
  return value instanceof Date ? value.toISOString() : normalizeText(value, new Date().toISOString());
}

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function createServiceError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseAcceptedTypes(req) {
  return String(req.headers?.accept ?? '')
    .toLowerCase()
    .split(',')
    .map((item) => item.split(';')[0].trim())
    .filter(Boolean);
}

function wantsJson(req) {
  const accepted = parseAcceptedTypes(req);
  return accepted.length === 0 || accepted.includes('*/*') || accepted.includes('application/json');
}

function buildEnvelope({ route, status, schema = CONTRIBUTION_SERVICE_RESPONSE_SCHEMA, data, generatedAt = new Date().toISOString() }) {
  return {
    $schema: SCHEMA_URL,
    route,
    generatedAt,
    status,
    schema,
    data,
  };
}

function logContributionTelemetry({ timestamp = new Date().toISOString(), method, path, status }) {
  console.log(JSON.stringify({ timestamp, method, path, status }));
}

function sendJson(res, statusCode, body, includeBody = true, extraHeaders = {}, telemetry = null) {
  const payload = Buffer.from(`${JSON.stringify(body, null, 2)}\n`);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.byteLength,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    ...PORTAL_SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(includeBody ? payload : undefined);
  if (telemetry) {
    logContributionTelemetry({ ...telemetry, status: statusCode });
  }
}

function sendEmpty(res, statusCode, extraHeaders = {}, telemetry = null) {
  res.writeHead(statusCode, {
    'Content-Length': '0',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    ...PORTAL_SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end();
  if (telemetry) {
    logContributionTelemetry({ ...telemetry, status: statusCode });
  }
}

function sendError(res, error, includeBody = true, route = CONTRIBUTION_SERVICE_ROUTE_PREFIX, telemetry = null) {
  const statusCode = Number(error.statusCode ?? error.status ?? 500);
  const body = buildEnvelope({
    route,
    status: error.code ?? 'error',
    schema: CONTRIBUTION_SERVICE_RESPONSE_SCHEMA,
    data: {
      error: error.code ?? 'error',
      message: normalizeText(error.message, 'Request failed.'),
      details: error.details ?? null,
    },
  });
  sendJson(res, statusCode, body, includeBody, {}, telemetry);
}

function isWriteEnabled() {
  return isContributionServiceWritesEnabled(process.env);
}

function ensureWritesEnabled() {
  if (!isWriteEnabled()) {
    throw createServiceError(501, 'writes_disabled', 'Contribution service writes are disabled.');
  }
}

function splitListValue(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => splitListValue(item));
  }

  if (typeof value !== 'string') return [];
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setNestedValue(target, path, value) {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return target;

  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!isObject(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }

  const leaf = parts.at(-1);
  if (cursor[leaf] === undefined) {
    cursor[leaf] = value;
  } else if (Array.isArray(cursor[leaf])) {
    cursor[leaf].push(value);
  } else {
    cursor[leaf] = [cursor[leaf], value];
  }

  return target;
}

function parseFormBody(rawBody) {
  const params = new URLSearchParams(String(rawBody ?? ''));
  const result = {};
  for (const [key, value] of params.entries()) {
    setNestedValue(result, key, value);
  }

  for (const field of ['handoff.acceptanceCriteria', 'handoff.outOfScope', 'handoff.sourceIds']) {
    const parts = field.split('.');
    let cursor = result;
    for (let index = 0; index < parts.length - 1; index += 1) {
      cursor = cursor?.[parts[index]];
      if (!isObject(cursor)) break;
    }
    const leaf = parts.at(-1);
    if (cursor && typeof cursor[leaf] === 'string') {
      cursor[leaf] = splitListValue(cursor[leaf]);
    } else if (cursor && Array.isArray(cursor[leaf])) {
      cursor[leaf] = cursor[leaf].flatMap((item) => splitListValue(item));
    }
  }

  return result;
}

async function readRequestBody(req, { maxBytes = 1_048_576 } = {}) {
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    return Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  }

  if (req.body && typeof req.body === 'object' && typeof req.body[Symbol.asyncIterator] !== 'function') {
    return req.body;
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) {
      throw createServiceError(413, 'body_too_large', 'Request body exceeded the 1 MiB limit.');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function parseRequestPayload(rawBody, req) {
  const contentType = String(req.headers?.['content-type'] ?? '').toLowerCase();

  if (rawBody && typeof rawBody === 'object' && !Buffer.isBuffer(rawBody)) {
    return rawBody;
  }

  const text = normalizeText(rawBody);
  if (!text) return {};

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return parseFormBody(text);
  }

  if (contentType.includes('application/json') || text.startsWith('{') || text.startsWith('[')) {
    return JSON.parse(text);
  }

  throw createServiceError(415, 'unsupported_media_type', 'Only JSON or form submissions are supported.');
}

function resolvePrincipal(req, { subjectFallback = null, scopeFallback = null } = {}) {
  const auth = parseContributionBearerToken(req.headers?.authorization);
  if (auth) return auth;

  const subject = normalizeText(
    req.headers?.['x-reviewer-subject']
      ?? req.headers?.['x-contributor-subject']
      ?? req.headers?.['x-subject']
      ?? subjectFallback,
  );

  return {
    raw: null,
    scope: scopeFallback,
    subject: subject || null,
    tokenType: 'header-fallback',
  };
}

function resolveSubmitterSubject(req, normalizedRequest) {
  const principal = resolvePrincipal(req, {
    subjectFallback: normalizedRequest.contributor?.agentId ?? normalizedRequest.contributor?.name ?? null,
    scopeFallback: CONTRIBUTION_AUTH_SCOPES.submit,
  });

  if (principal.scope && !isSubmitterScope(principal.scope)) {
    throw createServiceError(403, 'forbidden', 'Submitter scope is required.');
  }

  const subject = normalizeText(principal.subject ?? normalizedRequest.contributor?.agentId ?? normalizedRequest.contributor?.name);
  if (!subject) {
    throw createServiceError(400, 'missing_subject', 'A submitter subject is required.');
  }

  return {
    ...principal,
    subject,
  };
}

function resolveReviewerSubject(req) {
  const principal = resolvePrincipal(req, {
    subjectFallback: process.env.CONTRIBUTION_REVIEWER_SUBJECT ?? 'owning-reviewer',
    scopeFallback: CONTRIBUTION_AUTH_SCOPES.review,
  });

  if (principal.scope && !isReviewerScope(principal.scope)) {
    throw createServiceError(403, 'forbidden', 'Reviewer scope is required.');
  }

  const subject = normalizeText(principal.subject ?? process.env.CONTRIBUTION_REVIEWER_SUBJECT ?? 'owning-reviewer');
  return {
    ...principal,
    subject,
  };
}

function makeSubmissionRecord(request, { submitterSubject, fingerprint, statusReceipt, now }) {
  const submission = {
    id: createOpaqueId('sub'),
    schema: request.schema,
    intentId: request.intentId,
    submittedAt: request.submittedAt,
    state: 'review_pending',
    version: 1,
    statusReceipt,
    requestFingerprint: fingerprint,
    submitterSubject,
    request: clone(request),
    redacted: null,
    review: null,
    idacc: null,
    terminalSummary: null,
    createdAt: now,
    updatedAt: now,
    ...clone(request),
  };

  submission.redacted = buildRedactedSubmissionProjection(submission);
  return submission;
}

function refreshSubmissionSnapshots(submission) {
  submission.redacted = buildRedactedSubmissionProjection(submission);
  return submission;
}

function createReviewRecord(submission, review, { reviewerSubject, now, fingerprint, version = 1 }) {
  return {
    id: createOpaqueId('rev'),
    submissionId: submission.id,
    version,
    decision: review.decision,
    notes: review.notes ?? null,
    evidence: Array.isArray(review.evidence) ? [...review.evidence] : [],
    fingerprint,
    reviewerSubject,
    state: review.decision === 'accept' ? 'review_accepted' : review.decision === 'reject' ? 'review_rejected' : 'withdrawn',
    result: review.decision,
    outboxStatus: review.outboxStatus ?? null,
    terminalSummary: review.terminalSummary ?? null,
    reviewedAt: now,
    createdAt: now,
  };
}

function buildDecisionEventPayload(submission, reviewRecord) {
  return {
    submissionId: submission.id,
    title: reviewRecord.terminalSummary ? normalizeText(reviewRecord.terminalSummary, `Contribution terminal summary for ${submission.id}`) : `Contribution terminal summary for ${submission.id}`,
    state: submission.state,
    statusReceipt: submission.statusReceipt,
    updatedAt: submission.updatedAt,
    sourceIds: submission.handoff?.sourceIds ?? [],
    review: {
      decision: reviewRecord.decision,
      state: reviewRecord.state,
      reviewedAt: reviewRecord.reviewedAt,
      result: reviewRecord.result,
    },
    idacc: submission.idacc
      ? {
          state: submission.idacc.state,
          taskName: submission.idacc.taskName ?? null,
          taskStatus: submission.idacc.taskStatus ?? null,
        }
      : null,
    terminalSummary: {
      ...buildTerminalSummary(submission),
      text: reviewRecord.terminalSummary ?? null,
    },
  };
}

function matchSubmissionView(submission, { reviewer = false } = {}) {
  return reviewer ? buildReviewerSubmissionProjection(submission) : buildRedactedSubmissionProjection(submission);
}

function buildSubmissionListView(submissions, { reviewer = false } = {}) {
  return submissions.map((submission) => matchSubmissionView(submission, { reviewer }));
}

function normalizeLookupKind(kind) {
  const normalized = normalizeText(kind, 'any').toLowerCase();
  return CONTRIBUTION_SERVICE_SUPPORTED_LOOKUP_KINDS.includes(normalized) ? normalized : 'any';
}

function buildContributionServiceContractData() {
  const reviewGate = buildContributionReviewGate({ deploymentWritesEnabled: isWriteEnabled() });

  return {
    status: reviewGate.deploymentWritesEnabled ? 'review-gated-service-ready' : 'review-gated-service-disabled',
    persistenceMode: reviewGate.persistenceMode,
    reviewGate,
    routePrefix: CONTRIBUTION_SERVICE_ROUTE_PREFIX,
    routes: {
      contract: CONTRIBUTION_SERVICE_ROUTE_PREFIX,
      dashboard: CONTRIBUTION_SERVICE_DASHBOARD_ROUTE,
      status: CONTRIBUTION_SERVICE_STATUS_ROUTE,
      submissions: CONTRIBUTION_SUBMISSIONS_ROUTE,
      submissionStatusAlias: CONTRIBUTION_SERVICE_SUBMISSION_STATUS_ALIAS,
      reviewDecisions: CONTRIBUTION_SERVICE_SUBMISSION_REVIEW_DECISIONS_ROUTE,
      reviewDecisionsCollection: CONTRIBUTION_SERVICE_REVIEW_DECISIONS_COLLECTION_ROUTE,
      reviewHistory: CONTRIBUTION_SERVICE_SUBMISSION_REVIEW_HISTORY_ROUTE,
    },
    requestSchemas: [...CONTRIBUTION_SERVICE_REQUEST_SCHEMAS],
    responseSchemas: [CONTRIBUTION_SERVICE_RESPONSE_SCHEMA, CONTRIBUTION_SERVICE_REVIEW_DECISION_SCHEMA],
    authScopes: CONTRIBUTION_AUTH_SCOPES,
    allowedLookupKinds: [...CONTRIBUTION_SERVICE_SUPPORTED_LOOKUP_KINDS],
    stateMachine: CONTRIBUTION_STATES.map((state) => ({
      state,
      label: getContributionStateLabel(state),
      terminal: isTerminalContributionState(state),
    })),
    taskNamePattern: 'bittrees-submission-<submission-id-prefix>',
    outboxKinds: ['idacc_task_create', 'idacc_task_refresh', 'brain_terminal_summary'],
    writeEnabled: reviewGate.deploymentWritesEnabled,
  };
}

export function createContributionWorkflowService({
  repository = createContributionRepository(),
  clock = () => new Date().toISOString(),
} = {}) {
  if (!repository || typeof repository.transaction !== 'function') {
    throw new TypeError('A contribution repository with transaction support is required.');
  }

  async function getSubmissionById(submissionId) {
    const id = normalizeText(submissionId);
    if (!id) return null;
    return repository.getSubmissionById(id);
  }

  async function listSubmissions({ reviewer = false, subject = null } = {}) {
    const submissions = await repository.listSubmissions();
    if (reviewer) {
      return buildSubmissionListView(submissions, { reviewer: true });
    }

    if (subject) {
      return buildSubmissionListView(submissions.filter((submission) => submission.submitterSubject === subject));
    }

    return buildSubmissionListView(submissions);
  }

  async function lookupStatus({ id, kind = 'any', reviewer = false } = {}) {
    const lookupId = normalizeText(id);
    if (!lookupId) {
      throw createServiceError(400, 'missing_id', 'An id is required.');
    }

    const normalizedKind = normalizeLookupKind(kind);
    const submissions = await repository.listSubmissions();

    const findSubmissionRecord = async () => {
      const submission = await repository.getSubmissionById(lookupId);
      if (!submission) return null;
      return {
        kind: 'submission',
        record: matchSubmissionView(submission, { reviewer }),
        submissionId: submission.id,
      };
    };

    const findReviewRecord = async () => {
      for (const submission of submissions) {
        const reviews = await repository.listReviews(submission.id);
        const review = reviews.find((entry) => entry.id === lookupId);
        if (review) {
          return {
            kind: 'review',
            record: review,
            submissionId: submission.id,
          };
        }
      }

      return null;
    };

    const findIdaccRecord = async () => {
      for (const submission of submissions) {
        if (submission.idacc?.taskName === lookupId || submission.idacc?.taskId === lookupId) {
          return {
            kind: 'idacc',
            record: submission.idacc,
            submissionId: submission.id,
          };
        }
        const link = await repository.getIdaccTaskLink(submission.id);
        if (link && (link.taskName === lookupId || link.taskId === lookupId)) {
          return {
            kind: 'idacc',
            record: link,
            submissionId: submission.id,
          };
        }
      }

      return null;
    };

    const findAttestationRecord = async () => {
      for (const submission of submissions) {
        if (submission.terminalSummary) {
          const terminalSummaryKey = submission.terminalSummary.brainKey ?? submission.terminalSummary.key ?? null;
          if (submission.id === lookupId || terminalSummaryKey === lookupId) {
            return {
              kind: 'attestation',
              record: submission.terminalSummary,
              submissionId: submission.id,
            };
          }
        }
      }

      return null;
    };

    const findOutboxRecord = async () => {
      const events = await repository.listIntegrationOutbox();
      const event = events.find((entry) => entry.id === lookupId || entry.dedupeKey === lookupId);
      if (!event) return null;
      return {
        kind: 'outbox',
        record: event,
        submissionId: event.payload?.submissionId ?? null,
      };
    };

    const attempts = [
      normalizedKind === 'submission' || normalizedKind === 'any' ? findSubmissionRecord : null,
      normalizedKind === 'review' || normalizedKind === 'any' || normalizedKind === 'feedback' ? findReviewRecord : null,
      normalizedKind === 'idacc' || normalizedKind === 'any' ? findIdaccRecord : null,
      normalizedKind === 'attestation' || normalizedKind === 'any' ? findAttestationRecord : null,
      normalizedKind === 'outbox' || normalizedKind === 'any' ? findOutboxRecord : null,
    ].filter(Boolean);

    for (const attempt of attempts) {
      const result = await attempt();
      if (result) {
        return {
          status: 'status_found',
          reviewGate: buildContributionReviewGate({ deploymentWritesEnabled: isWriteEnabled() }),
          query: { id: lookupId, kind: normalizedKind },
          result,
        };
      }
    }

    return {
      status: 'not_found',
      reviewGate: buildContributionReviewGate({ deploymentWritesEnabled: isWriteEnabled() }),
      query: { id: lookupId, kind: normalizedKind },
      result: null,
    };
  }

  async function submitContribution(input = {}, context = {}) {
    ensureWritesEnabled();
    const validation = normalizeContributionSubmissionRequest(input);
    if (!validation.ok) {
      throw createServiceError(400, 'invalid_submission', 'Contribution submission validation failed.', validation.errors);
    }

    const request = validation.normalized;
    const principal = resolveSubmitterSubject(context.req ?? context.request ?? { headers: context.headers ?? {} }, request);
    const idempotencyKey = normalizeText(context.idempotencyKey ?? request.intentId ?? principal.subject);
    const fingerprint = canonicalContributionRequestFingerprint(request);
    const now = nowIso(clock);
    const statusReceipt = buildStatusReceipt(request.intentId, fingerprint);

    const result = await repository.transaction(async (tx) => {
      const existing = await tx.getSubmissionByIdempotencyKey(principal.subject, idempotencyKey);
      if (existing) {
        const existingSubmission = await tx.getSubmissionById(existing.submissionId ?? existing.submission_id ?? existing.id);
        if (!existingSubmission) {
          throw createServiceError(500, 'idempotency_corrupt', 'Idempotency record pointed at a missing submission.');
        }

        if (normalizeText(existingSubmission.requestFingerprint) !== fingerprint) {
          throw createServiceError(409, 'idempotency_conflict', 'A different submission already exists for that idempotency key.');
        }

        return {
          submission: refreshSubmissionSnapshots(existingSubmission),
          idempotent: true,
        };
      }

      const submission = makeSubmissionRecord(request, {
        submitterSubject: principal.subject,
        fingerprint,
        statusReceipt,
        now,
      });

      await tx.insertSubmission(submission);
      await tx.setSubmissionByIdempotencyKey(principal.subject, idempotencyKey, {
        key: `${principal.subject}::${idempotencyKey}`,
        submitterSubject: principal.subject,
        requestFingerprint: fingerprint,
        submissionId: submission.id,
        statusReceipt,
        createdAt: now,
        updatedAt: now,
      });
      await tx.recordIntegrationAuditEvent({
        id: createOpaqueId('audit'),
        submissionId: submission.id,
        kind: 'submission_received',
        payload: {
          submissionId: submission.id,
          submitterSubject: principal.subject,
          requestFingerprint: fingerprint,
          statusReceipt,
        },
        createdAt: now,
      });

      return {
        submission: submission,
        idempotent: false,
      };
    });

    const reviewGate = buildContributionReviewGate({ deploymentWritesEnabled: true });
    const submission = refreshSubmissionSnapshots(result.submission);

    return {
      status: 'submission_queued_for_review',
      reviewGate,
      idempotent: result.idempotent,
      submissionId: submission.id,
      statusReceipt: submission.statusReceipt,
      requestFingerprint: submission.requestFingerprint,
      nextStep: `${CONTRIBUTION_SUBMISSIONS_ROUTE}/${submission.id}${CONTRIBUTION_REVIEW_DECISIONS_SUFFIX}`,
      submission: matchSubmissionView(submission),
    };
  }

  async function recordReviewDecision(submissionId, input = {}, context = {}) {
    ensureWritesEnabled();
    const submissionKey = normalizeText(submissionId);
    if (!submissionKey) {
      throw createServiceError(400, 'missing_submission_id', 'A submission id is required.');
    }

    const validation = validateReviewDecisionRequest(input);
    if (!validation.ok) {
      throw createServiceError(400, 'invalid_review_decision', 'Review decision validation failed.', validation.errors);
    }

    const request = validation.normalized;
    const principal = resolveReviewerSubject(context.req ?? context.request ?? { headers: context.headers ?? {} });
    const decisionFingerprint = canonicalReviewDecisionFingerprint(request);
    const now = nowIso(clock);

    const result = await repository.transaction(async (tx) => {
      const submission = await tx.getSubmissionById(submissionKey);
      if (!submission) {
        throw createServiceError(404, 'submission_not_found', 'Submission not found.');
      }

      const existingReviews = await tx.listReviews(submission.id);
      const existingFingerprint = existingReviews.find((review) => normalizeText(review.fingerprint) === decisionFingerprint);
      if (existingFingerprint) {
        return {
          submission: refreshSubmissionSnapshots(submission),
          review: existingFingerprint,
          idempotent: true,
          outboxEvents: [],
        };
      }

      const reviewRecord = createReviewRecord(submission, request, {
        reviewerSubject: principal.subject,
        now,
        fingerprint: decisionFingerprint,
        version: existingReviews.length + 1,
      });

      await tx.appendReview(submission.id, reviewRecord);

      let nextState = 'review_pending';
      let nextIdacc = clone(submission.idacc ?? null);
      const outboxEvents = [];
      const updatedAt = now;

      if (reviewRecord.decision === 'accept') {
        nextState = 'idacc_create_pending';
        nextIdacc = {
          state: nextState,
          taskName: buildIdaccTaskName(submission.id),
          taskStatus: 'pending',
          createdAt: submission.idacc?.createdAt ?? updatedAt,
          updatedAt,
        };
        outboxEvents.push(
          buildContributionOutboxEvent({
            kind: 'idacc_task_create',
            topic: `submission:${submission.id}:idacc-create`,
            dedupeKey: `idacc_task_create:${submission.id}`,
            payload: {
              submissionId: submission.id,
            },
            now,
            availableAt: now,
          }),
        );
      } else {
        nextState = reviewRecord.decision === 'reject' ? 'review_rejected' : 'withdrawn';
        nextIdacc = submission.idacc ? { ...submission.idacc } : null;
        outboxEvents.push(
          buildContributionOutboxEvent({
            kind: 'brain_terminal_summary',
            topic: `submission:${submission.id}:brain-terminal-summary`,
            dedupeKey: `brain_terminal_summary:${submission.id}:${submission.version + 1}`,
            payload: {
              submissionId: submission.id,
              terminalSummary: {
                ...buildTerminalSummary({
                  ...submission,
                  state: nextState,
                  review: {
                    ...reviewRecord,
                    state: reviewRecord.state,
                  },
                }),
                text: request.terminalSummary || null,
                title: request.terminalSummary || `Contribution terminal summary for ${submission.id}`,
              },
            },
            now,
            availableAt: now,
          }),
        );
      }

      const updatedSubmission = await tx.updateSubmission(submission.id, (current) => ({
        ...current,
        version: (current.version ?? 0) + 1,
        state: nextState,
        review: {
          ...reviewRecord,
          outboxStatus: request.outboxStatus || reviewRecord.outboxStatus,
        },
        idacc: nextIdacc,
        terminalSummary: reviewRecord.decision === 'accept'
          ? current.terminalSummary ?? null
          : {
              submissionId: current.id,
              state: nextState,
              statusReceipt: current.statusReceipt,
              text: request.terminalSummary || null,
              title: request.terminalSummary || `Contribution terminal summary for ${current.id}`,
              publishedAt: null,
            },
        updatedAt,
      }));

      for (const event of outboxEvents) {
        await tx.enqueueIntegrationOutbox(event);
      }

      await tx.recordIntegrationAuditEvent({
        id: createOpaqueId('audit'),
        submissionId: submission.id,
        kind: 'review_decision_recorded',
        payload: {
          submissionId: submission.id,
          decision: reviewRecord.decision,
          reviewerSubject: principal.subject,
          fingerprint: decisionFingerprint,
        },
        createdAt: now,
      });

      return {
        submission: refreshSubmissionSnapshots(updatedSubmission),
        review: reviewRecord,
        idempotent: false,
        outboxEvents,
      };
    });

    return {
      status: 'review_decision_recorded',
      reviewGate: buildContributionReviewGate({ deploymentWritesEnabled: true }),
      idempotent: result.idempotent,
      submissionId: result.submission.id,
      decision: result.review.decision,
      nextStep: result.review.decision === 'accept'
        ? 'The outbox worker will create or refresh the IDACC task.'
        : 'A terminal summary writeback has been queued for Brain.',
      submission: matchSubmissionView(result.submission, { reviewer: true }),
      review: result.review,
      outboxEvents: result.outboxEvents.map((event) => ({
        id: event.id,
        kind: event.kind,
        state: event.state,
        dedupeKey: event.dedupeKey,
      })),
    };
  }

  async function listReviewDecisions(submissionId) {
    const id = normalizeText(submissionId);
    if (!id) throw createServiceError(400, 'missing_submission_id', 'A submission id is required.');
    const reviews = await repository.listReviews(id);
    return {
      status: 'review_history_ready',
      reviewGate: buildContributionReviewGate({ deploymentWritesEnabled: isWriteEnabled() }),
      submissionId: id,
      count: reviews.length,
      reviews,
    };
  }

  async function listReviewDecisionsCollection({ reviewer = false } = {}) {
    const submissions = await repository.listSubmissions();
    const reviews = [];

    for (const submission of submissions) {
      const submissionReviews = await repository.listReviews(submission.id);
      for (const review of submissionReviews) {
        reviews.push({
          ...review,
          submission: matchSubmissionView(submission, { reviewer }),
        });
      }
    }

    reviews.sort((left, right) => {
      const leftAt = normalizeText(left.reviewedAt ?? left.createdAt ?? '');
      const rightAt = normalizeText(right.reviewedAt ?? right.createdAt ?? '');
      if (leftAt !== rightAt) return leftAt.localeCompare(rightAt);
      if (left.submissionId !== right.submissionId) return left.submissionId.localeCompare(right.submissionId);
      return normalizeText(left.id).localeCompare(normalizeText(right.id));
    });

    return {
      status: 'review_history_ready',
      reviewGate: buildContributionReviewGate({ deploymentWritesEnabled: isWriteEnabled() }),
      count: reviews.length,
      reviews,
    };
  }

  function getContract() {
    return buildContributionServiceContractData();
  }

  return Object.freeze({
    repository,
    getContract,
    getSubmissionById,
    listSubmissions,
    lookupStatus,
    submitContribution,
    recordReviewDecision,
    listReviewDecisions,
    listReviewDecisionsCollection,
  });
}

async function handleContributionRoute(service, req, res, route, {
  includeBody = true,
  searchParams = new URL(req.url, 'http://localhost').searchParams,
  submissionId = null,
  routePath = CONTRIBUTION_SERVICE_ROUTE_PREFIX,
} = {}) {
  const method = String(req.method ?? 'GET').toUpperCase();
  const telemetry = { method, path: routePath };

  try {
    switch (route) {
      case 'contract': {
        if (method !== 'GET' && method !== 'HEAD') {
          return sendEmpty(res, 405, { Allow: 'GET, HEAD' }, telemetry);
        }

        return sendJson(
          res,
          200,
          buildEnvelope({
            route: routePath,
            status: service.getContract().status,
            schema: CONTRIBUTION_SERVICE_RESPONSE_SCHEMA,
            data: service.getContract(),
            }),
            includeBody,
            {},
            telemetry,
        );
      }

      case 'dashboard':
      case 'list': {
        if (method !== 'GET' && method !== 'HEAD') {
          return sendEmpty(res, 405, { Allow: 'GET, HEAD' }, telemetry);
        }

        const reviewer = normalizeText(searchParams.get('view')) === 'reviewer';
        const subject = normalizeText(searchParams.get('subject') || searchParams.get('submitter'));
        const submissions = await service.listSubmissions({ reviewer, subject: subject || null });

        return sendJson(
          res,
          200,
          buildEnvelope({
            route: routePath,
            status: 'dashboard_ready',
            schema: CONTRIBUTION_SERVICE_RESPONSE_SCHEMA,
            data: {
              reviewGate: buildContributionReviewGate({ deploymentWritesEnabled: isWriteEnabled() }),
              count: submissions.length,
              submissions,
            },
            }),
            includeBody,
            {},
            telemetry,
        );
      }

      case 'status-query':
      case 'submission-status-alias': {
        if (method !== 'GET' && method !== 'HEAD') {
          return sendEmpty(res, 405, { Allow: 'GET, HEAD' }, telemetry);
        }

        const id = normalizeText(searchParams.get('id') || searchParams.get('submissionId'));
        const kind = normalizeLookupKind(searchParams.get('kind'));
        const reviewer = normalizeText(searchParams.get('view')) === 'reviewer';
        const result = await service.lookupStatus({ id, kind, reviewer });

        return sendJson(
          res,
          200,
          buildEnvelope({
            route: routePath,
            status: result.status,
            schema: CONTRIBUTION_SERVICE_RESPONSE_SCHEMA,
            data: {
              reviewGate: result.reviewGate,
              query: result.query,
              result: result.result,
            },
            }),
            includeBody,
            {},
            telemetry,
        );
      }

      case 'submission-item':
      case 'submission-item-status': {
        if (method !== 'GET' && method !== 'HEAD') {
          return sendEmpty(res, 405, { Allow: 'GET, HEAD' }, telemetry);
        }

        const id = normalizeText(submissionId || searchParams.get('id') || searchParams.get('submissionId'));
        if (!id) {
          throw createServiceError(400, 'missing_submission_id', 'A submission id is required.');
        }

        const result = await service.lookupStatus({
          id,
          kind: 'submission',
          reviewer: normalizeText(searchParams.get('view')) === 'reviewer',
        });

        return sendJson(
          res,
          200,
          buildEnvelope({
            route: routePath,
            status: result.status,
            schema: CONTRIBUTION_SERVICE_RESPONSE_SCHEMA,
            data: {
              reviewGate: result.reviewGate,
              query: result.query,
              result: result.result,
            },
            }),
            includeBody,
            {},
            telemetry,
        );
      }

      case 'submit': {
        if (method !== 'POST') {
          return sendEmpty(res, 405, { Allow: 'POST' }, telemetry);
        }

        const rawBody = await readRequestBody(req);
        const payload = parseRequestPayload(rawBody, req);
        const result = await service.submitContribution(payload, {
          req,
          idempotencyKey: req.headers?.['idempotency-key'] ?? req.headers?.['x-idempotency-key'] ?? null,
        });

        return sendJson(
          res,
          201,
          buildEnvelope({
            route: CONTRIBUTION_SUBMISSIONS_ROUTE,
            status: result.status,
            schema: CONTRIBUTION_SERVICE_RESPONSE_SCHEMA,
            data: {
              reviewGate: result.reviewGate,
              idempotent: result.idempotent,
              submissionId: result.submissionId,
              statusReceipt: result.statusReceipt,
              requestFingerprint: result.requestFingerprint,
              nextStep: result.nextStep,
              submission: result.submission,
            },
            }),
            includeBody,
            {},
            telemetry,
        );
      }

      case 'submission-reviews': {
        const id = normalizeText(submissionId || searchParams.get('submissionId') || searchParams.get('id'));

        if (!id) {
          if (method !== 'GET' && method !== 'HEAD') {
            return sendEmpty(res, 405, { Allow: 'GET, HEAD' }, telemetry);
          }

          const result = await service.listReviewDecisionsCollection({
            reviewer: normalizeText(searchParams.get('view')) === 'reviewer',
          });
          return sendJson(
            res,
            200,
            buildEnvelope({
              route: routePath,
              status: result.status,
              schema: CONTRIBUTION_SERVICE_RESPONSE_SCHEMA,
              data: {
                reviewGate: result.reviewGate,
                count: result.count,
                reviews: result.reviews,
              },
              }),
              includeBody,
              {},
              telemetry,
          );
        }

        if (method === 'POST') {
          const rawBody = await readRequestBody(req);
          const payload = parseRequestPayload(rawBody, req);
          const result = await service.recordReviewDecision(id, payload, { req });

          return sendJson(
            res,
            201,
            buildEnvelope({
              route: routePath,
              status: result.status,
              schema: CONTRIBUTION_SERVICE_REVIEW_DECISION_SCHEMA,
              data: {
                reviewGate: result.reviewGate,
                idempotent: result.idempotent,
                submissionId: result.submissionId,
                decision: result.decision,
                nextStep: result.nextStep,
                submission: result.submission,
                review: result.review,
                outboxEvents: result.outboxEvents,
              },
            }),
            includeBody,
            {},
            telemetry,
          );
        }

        if (method !== 'GET' && method !== 'HEAD') {
          return sendEmpty(res, 405, { Allow: 'GET, HEAD, POST' }, telemetry);
        }

        const result = await service.listReviewDecisions(id);
        return sendJson(
          res,
          200,
          buildEnvelope({
            route: routePath,
            status: result.status,
            schema: CONTRIBUTION_SERVICE_RESPONSE_SCHEMA,
            data: {
              reviewGate: result.reviewGate,
              submissionId: result.submissionId,
              count: result.count,
              reviews: result.reviews,
            },
            }),
            includeBody,
            {},
            telemetry,
        );
      }

      default:
        return false;
    }
  } catch (error) {
    sendError(res, error, includeBody, routePath, telemetry);
    return true;
  }
}

function normalizeContributionRoute(pathname) {
  if (pathname !== '/' && pathname.endsWith('/')) {
    return pathname.replace(/\/+$/, '') || '/';
  }

  return pathname;
}

function matchContributionRoute(pathname) {
  const normalized = normalizeContributionRoute(pathname);

  if (normalized === CONTRIBUTION_SERVICE_ROUTE_PREFIX) return { type: 'contract' };
  if (normalized === CONTRIBUTION_SERVICE_DASHBOARD_ROUTE) return { type: 'dashboard' };
  if (normalized === CONTRIBUTION_SERVICE_STATUS_ROUTE) return { type: 'status-query' };
  if (normalized === CONTRIBUTION_SUBMISSIONS_ROUTE) return { type: 'list' };
  if (normalized === CONTRIBUTION_SERVICE_SUBMISSION_STATUS_ALIAS) return { type: 'submission-status-alias' };
  if (normalized === CONTRIBUTION_SERVICE_SUBMISSION_REVIEW_HISTORY_ROUTE) return { type: 'submission-reviews' };
  if (normalized === CONTRIBUTION_SERVICE_REVIEW_DECISIONS_COLLECTION_ROUTE) return { type: 'submission-reviews' };

  if (normalized.startsWith(`${CONTRIBUTION_SUBMISSIONS_ROUTE}/`)) {
    const remainder = normalized.slice(CONTRIBUTION_SUBMISSIONS_ROUTE.length + 1);
    if (remainder.endsWith(CONTRIBUTION_REVIEW_DECISIONS_SUFFIX)) {
      return {
        type: 'submission-reviews',
        submissionId: remainder.slice(0, -CONTRIBUTION_REVIEW_DECISIONS_SUFFIX.length),
      };
    }

    if (remainder.endsWith('/status')) {
      return {
        type: 'submission-item-status',
        submissionId: remainder.slice(0, -'/status'.length),
      };
    }

    return {
      type: 'submission-item',
      submissionId: remainder,
    };
  }

  return null;
}

export function createContributionRequestHandler(options = {}) {
  const service = options.service ?? createContributionWorkflowService({
    repository: options.repository ?? createContributionRepository(options.repositoryOptions ?? {}),
    clock: options.clock ?? (() => new Date().toISOString()),
  });

  return async function handleContributionRequest(req, res) {
    const pathname = new URL(req.url ?? '/', `http://${req.headers?.host ?? 'localhost'}`).pathname;
    const match = matchContributionRoute(pathname);
    if (!match) return false;

    const includeBody = req.method !== 'HEAD';
    const searchParams = new URL(req.url ?? '/', `http://${req.headers?.host ?? 'localhost'}`).searchParams;
    const normalizedPath = normalizeContributionRoute(pathname);

    if (pathname !== normalizedPath) {
      res.writeHead(301, {
        Location: `${normalizedPath}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
        'Content-Length': '0',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow',
        ...PORTAL_SECURITY_HEADERS,
      });
      res.end();
      logContributionTelemetry({
        method: req.method ?? 'GET',
        path: normalizedPath,
        status: 301,
      });
      return true;
    }

    const handled = await handleContributionRoute(service, req, res, match.type, {
      includeBody,
      searchParams,
      submissionId: match.submissionId ?? null,
      routePath: normalizedPath,
    });
    return handled !== false;
  };
}

export function createContributionApiServer(options = {}) {
  const handler = createContributionRequestHandler(options);
  return createServer((req, res) => handler(req, res));
}

export {
  buildContributionServiceContractData as buildContributionServiceContract,
  CONTRIBUTION_SERVICE_ROUTE_PREFIX,
  CONTRIBUTION_SERVICE_DASHBOARD_ROUTE,
  CONTRIBUTION_SERVICE_STATUS_ROUTE,
  CONTRIBUTION_SERVICE_SUBMISSION_REVIEW_DECISIONS_ROUTE,
  CONTRIBUTION_SERVICE_REVIEW_DECISIONS_COLLECTION_ROUTE,
  CONTRIBUTION_SERVICE_SUBMISSION_STATUS_ALIAS,
  CONTRIBUTION_SERVICE_SUBMISSION_REVIEW_HISTORY_ROUTE,
};
