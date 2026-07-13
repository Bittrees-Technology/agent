import { randomUUID } from 'node:crypto';

import {
  buildIdaccTaskName,
  buildIdaccTaskSummary,
  buildTerminalSummary,
  isTerminalContributionState,
  sha256Base16,
  stableStringify,
} from './domain.mjs';

const DEFAULT_EVENT_KINDS = Object.freeze(['idacc_task_create', 'idacc_task_refresh', 'brain_terminal_summary']);
const DEFAULT_LEASE_OWNER = 'contribution-outbox-worker';
const DEFAULT_MIN_BACKOFF_MS = 250;
const DEFAULT_MAX_BACKOFF_MS = 60_000;
const DEFAULT_JITTER_FRACTION = 0.2;
const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_LEASE_MS = 30_000;

function normalizeText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return text || fallback;
}

function nowIso(clock = () => new Date().toISOString()) {
  const value = typeof clock === 'function' ? clock() : new Date().toISOString();
  return value instanceof Date ? value.toISOString() : normalizeText(value, new Date().toISOString());
}

function stableRatio(seed) {
  const digest = sha256Base16(seed);
  const sample = Number.parseInt(digest.slice(0, 8), 16);
  return sample / 0xffffffff;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function buildRetryDelayMs({
  seed,
  leaseCount = 1,
  minBackoffMs = DEFAULT_MIN_BACKOFF_MS,
  maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
  jitterFraction = DEFAULT_JITTER_FRACTION,
} = {}) {
  const attempt = Math.max(1, Number(leaseCount) || 1);
  const baseDelay = clamp(minBackoffMs * 2 ** (attempt - 1), minBackoffMs, maxBackoffMs);
  const jitterWindow = baseDelay * jitterFraction;
  const ratio = stableRatio(`${seed}:${attempt}`);
  const jitter = (ratio * 2 - 1) * jitterWindow;
  return clamp(Math.round(baseDelay + jitter), minBackoffMs, maxBackoffMs);
}

export function mapManagerTaskStatusToContributionState(status) {
  const normalized = normalizeText(status).toLowerCase();

  switch (normalized) {
    case 'todo':
    case 'queued':
    case 'open':
      return 'idacc_todo';
    case 'doing':
    case 'in_progress':
    case 'active':
      return 'idacc_doing';
    case 'done':
    case 'closed':
    case 'complete':
      return 'idacc_done';
    case 'created':
    case 'accepted':
      return 'idacc_created';
    case 'failed':
    case 'error':
    case 'rejected':
      return 'integration_failed';
    default:
      return 'idacc_created';
  }
}

export function buildContributionOutboxEvent({
  kind,
  topic = kind,
  payload = {},
  dedupeKey,
  state = 'ready',
  now = new Date().toISOString(),
  availableAt = now,
}) {
  const createdAt = nowIso(() => now);
  return {
    id: `evt_${randomUUID()}`,
    dedupeKey: normalizeText(dedupeKey),
    kind: normalizeText(kind),
    topic: normalizeText(topic, normalizeText(kind)),
    payload,
    state,
    availableAt,
    leaseOwner: null,
    leasedAt: null,
    leasedUntil: null,
    leaseCount: 0,
    lastError: null,
    completedAt: null,
    deadLetteredAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function isRetryableWorkerError(error) {
  if (!error) return false;
  if (error.retryable === true) return true;
  const status = Number(error.status ?? error.statusCode);
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
}

function normalizeWorkerError(error) {
  const message = normalizeText(error?.message, 'Outbox processing failed.');
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [redacted]')
    .replace(/token=[^\s]+/gi, 'token=[redacted]')
    .replace(/api[_-]?key=[^\s]+/gi, 'api_key=[redacted]');
}

function buildTaskTitle(submission) {
  const lane = normalizeText(submission.targetLane, 'contribution');
  const summary = normalizeText(submission.summary, 'Contribution');
  return `Bittrees ${lane}: ${summary}`.slice(0, 240);
}

function buildTaskDescription(submission) {
  return stableStringify({
    submissionId: submission.id,
    contributor: submission.contributor?.agentId ?? submission.contributor?.name ?? null,
    targetLane: submission.targetLane,
    summary: submission.summary,
    proposedTemplate: submission.proposedTemplate,
    handoff: buildIdaccTaskSummary(submission).handoff,
    statusReceipt: submission.statusReceipt,
  });
}

function buildBrainSummaryPayload(submission, { title, sourceIds } = {}) {
  const terminalSummary = buildTerminalSummary(submission);
  return {
    submissionId: submission.id,
    title: title ?? `Contribution terminal summary for ${submission.id}`,
    state: submission.state,
    statusReceipt: submission.statusReceipt,
    updatedAt: submission.updatedAt,
    sourceIds: Array.isArray(sourceIds) ? sourceIds : submission.handoff?.sourceIds ?? [],
    terminalSummary,
    review: submission.review
      ? {
          decision: submission.review.decision,
          state: submission.review.state,
          reviewedAt: submission.review.reviewedAt,
          result: submission.review.result ?? null,
        }
      : null,
    idacc: submission.idacc
      ? {
          state: submission.idacc.state,
          taskName: submission.idacc.taskName ?? null,
          taskStatus: submission.idacc.taskStatus ?? null,
        }
      : null,
  };
}

async function recordAudit(tx, payload, clock) {
  if (!tx?.recordIntegrationAuditEvent) return null;

  return tx.recordIntegrationAuditEvent({
    id: `audit_${randomUUID()}`,
    submissionId: payload.submissionId ?? null,
    kind: payload.kind,
    payload,
    createdAt: nowIso(clock),
  });
}

export function createContributionOutboxWorker({
  repository,
  idaccClient,
  brainClient,
  clock = () => new Date().toISOString(),
  leaseOwner = DEFAULT_LEASE_OWNER,
  leaseMs = DEFAULT_LEASE_MS,
  minBackoffMs = DEFAULT_MIN_BACKOFF_MS,
  maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
  jitterFraction = DEFAULT_JITTER_FRACTION,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  logger = console,
} = {}) {
  if (!repository || typeof repository.transaction !== 'function') {
    throw new TypeError('A repository with transactional outbox support is required.');
  }

  if (!idaccClient || typeof idaccClient.createBoundedTask !== 'function' || typeof idaccClient.getTask !== 'function') {
    throw new TypeError('An IDACC manager client with createBoundedTask/getTask is required.');
  }

  if (!brainClient || typeof brainClient.publishTerminalSummary !== 'function') {
    throw new TypeError('A Brain client with publishTerminalSummary is required.');
  }

  async function leaseEvents({ limit = 1, kinds = DEFAULT_EVENT_KINDS } = {}) {
    const eventKinds = Array.isArray(kinds) && kinds.length > 0 ? kinds : DEFAULT_EVENT_KINDS;

    return repository.transaction(async (tx) => {
      const leased = [];
      for (const kind of eventKinds) {
        if (leased.length >= limit) break;
        const remaining = limit - leased.length;
        const batch = await tx.leaseIntegrationOutbox({ kind, limit: remaining, leaseOwner, leaseMs });
        leased.push(...batch);
      }

      return leased;
    });
  }

  async function scheduleEvent(tx, event) {
    return tx.enqueueIntegrationOutbox(event);
  }

  async function completeEvent(tx, event, extra = {}) {
    return tx.updateIntegrationOutbox(event.id, (current) => ({
      ...current,
      ...extra,
      state: 'completed',
      leaseOwner: null,
      leasedAt: null,
      leasedUntil: null,
      completedAt: nowIso(clock),
      updatedAt: nowIso(clock),
      lastError: null,
    }));
  }

  async function retryEvent(tx, event, error) {
    const retryable = isRetryableWorkerError(error);
    const updatedAt = nowIso(clock);
    const normalizedError = normalizeWorkerError(error);

    if (!retryable || (event.leaseCount ?? 0) >= maxAttempts) {
      return tx.updateIntegrationOutbox(event.id, (current) => ({
        ...current,
        state: 'dead_lettered',
        leaseOwner: null,
        leasedAt: null,
        leasedUntil: null,
        deadLetteredAt: nowIso(clock),
        updatedAt,
        lastError: normalizedError,
      }));
    }

    const delayMs = buildRetryDelayMs({
      seed: `${event.id}:${event.kind}`,
      leaseCount: event.leaseCount ?? 1,
      minBackoffMs,
      maxBackoffMs,
      jitterFraction,
    });
    const availableAt = new Date(Date.parse(updatedAt) + delayMs).toISOString();

    return tx.updateIntegrationOutbox(event.id, (current) => ({
      ...current,
      state: 'ready',
      leaseOwner: null,
      leasedAt: null,
      leasedUntil: null,
      availableAt,
      updatedAt,
      lastError: normalizedError,
    }));
  }

  async function processIdaccTaskCreate(event) {
    return repository.transaction(async (tx) => {
      const submissionId = normalizeText(event.payload?.submissionId);
      const submission = await tx.getSubmissionById(submissionId);
      if (!submission) {
        throw new Error(`Submission ${submissionId} was not found for task creation.`);
      }

      const taskName = buildIdaccTaskName(submission.id);
      const task = await idaccClient.createBoundedTask({
        name: taskName,
        title: buildTaskTitle(submission),
        description: buildTaskDescription(submission),
        team: submission.contributor?.team ?? 'engineering-team',
      });

      const taskNow = nowIso(clock);
      await tx.insertIdaccTaskLink({
        submissionId: submission.id,
        taskName,
        taskId: task.uuid,
        taskStatus: task.status,
        createdAt: taskNow,
        updatedAt: taskNow,
      });

      const nextState = mapManagerTaskStatusToContributionState(task.status);
      const updatedSubmission = await tx.updateSubmission(submission.id, (current) => ({
        ...current,
        version: (current.version ?? 0) + 1,
        state: nextState,
        idacc: {
          state: nextState,
          taskName,
          taskId: task.uuid,
          taskStatus: task.status,
          taskUpdatedAt: taskNow,
          createdAt: current.idacc?.createdAt ?? taskNow,
          updatedAt: taskNow,
        },
      }));

      await scheduleEvent(
        tx,
        buildContributionOutboxEvent({
          kind: 'idacc_task_refresh',
          topic: `submission:${submission.id}:idacc-refresh`,
          dedupeKey: `idacc_task_refresh:${submission.id}`,
          payload: {
            submissionId: submission.id,
            taskName,
            taskId: task.uuid,
          },
          now: taskNow,
          availableAt: taskNow,
        }),
      );

      if (updatedSubmission.state === 'idacc_done') {
        await scheduleEvent(
          tx,
          buildContributionOutboxEvent({
            kind: 'brain_terminal_summary',
            topic: `submission:${submission.id}:brain-terminal-summary`,
            dedupeKey: `brain_terminal_summary:${submission.id}:${updatedSubmission.version}`,
            payload: {
              submissionId: submission.id,
              terminalSummary: buildBrainSummaryPayload(updatedSubmission, { sourceIds: updatedSubmission.handoff?.sourceIds ?? [] }),
            },
            now: taskNow,
            availableAt: taskNow,
          }),
        );
      }

      await recordAudit(tx, {
        kind: 'idacc_task_created',
        submissionId: submission.id,
        payload: {
          submissionId: submission.id,
          taskName,
          taskId: task.uuid,
          taskStatus: task.status,
        },
      }, clock);

      await completeEvent(tx, event, {
        payload: {
          ...event.payload,
          taskName,
          taskId: task.uuid,
          taskStatus: task.status,
        },
      });

      return {
        submissionId: submission.id,
        taskName,
        taskId: task.uuid,
        taskStatus: task.status,
      };
    });
  }

  async function processIdaccTaskRefresh(event) {
    return repository.transaction(async (tx) => {
      const submissionId = normalizeText(event.payload?.submissionId);
      const taskName = normalizeText(event.payload?.taskName, buildIdaccTaskName(submissionId));
      const submission = await tx.getSubmissionById(submissionId);
      if (!submission) {
        throw new Error(`Submission ${submissionId} was not found for task refresh.`);
      }

      const task = await idaccClient.getTask(taskName);
      const refreshedAt = nowIso(clock);
      const nextState = mapManagerTaskStatusToContributionState(task.status);
      const nextSubmissionState = task.status === 'done' ? 'idacc_done' : nextState;

      const updatedSubmission = await tx.updateSubmission(submission.id, (current) => ({
        ...current,
        version: (current.version ?? 0) + 1,
        state: nextSubmissionState,
        idacc: {
          ...(current.idacc ?? {}),
          state: nextSubmissionState,
          taskName,
          taskId: task.uuid,
          taskStatus: task.status,
          taskUpdatedAt: task.updatedAt ?? refreshedAt,
          updatedAt: refreshedAt,
          createdAt: current.idacc?.createdAt ?? refreshedAt,
        },
      }));

      if (task.status === 'done' || isTerminalContributionState(nextSubmissionState)) {
        await scheduleEvent(
          tx,
          buildContributionOutboxEvent({
            kind: 'brain_terminal_summary',
            topic: `submission:${submission.id}:brain-terminal-summary`,
            dedupeKey: `brain_terminal_summary:${submission.id}:${updatedSubmission.version}`,
            payload: {
              submissionId: submission.id,
              terminalSummary: buildBrainSummaryPayload(updatedSubmission, { sourceIds: updatedSubmission.handoff?.sourceIds ?? [] }),
            },
            now: refreshedAt,
            availableAt: refreshedAt,
          }),
        );

        await completeEvent(tx, event, {
          payload: {
            ...event.payload,
            taskName,
            taskId: task.uuid,
            taskStatus: task.status,
          },
        });
      } else {
        const delayMs = buildRetryDelayMs({
          seed: `${event.id}:${event.kind}`,
          leaseCount: event.leaseCount ?? 1,
          minBackoffMs,
          maxBackoffMs,
          jitterFraction,
        });
        const availableAt = new Date(Date.parse(refreshedAt) + delayMs).toISOString();
        await tx.updateIntegrationOutbox(event.id, (current) => ({
          ...current,
          state: 'ready',
          leaseOwner: null,
          leasedAt: null,
          leasedUntil: null,
          availableAt,
          updatedAt: refreshedAt,
          lastError: null,
        }));
      }

      await recordAudit(tx, {
        kind: 'idacc_task_refreshed',
        submissionId: submission.id,
        payload: {
          submissionId: submission.id,
          taskName,
          taskId: task.uuid,
          taskStatus: task.status,
        },
      }, clock);

      return {
        submissionId: submission.id,
        taskName,
        taskId: task.uuid,
        taskStatus: task.status,
        state: nextSubmissionState,
      };
    });
  }

  async function processBrainTerminalSummary(event) {
    return repository.transaction(async (tx) => {
      const submissionId = normalizeText(event.payload?.submissionId);
      const submission = await tx.getSubmissionById(submissionId);
      if (!submission) {
        throw new Error(`Submission ${submissionId} was not found for terminal summary writeback.`);
      }

      const summaryPayload = event.payload?.terminalSummary ?? buildBrainSummaryPayload(submission);
      const brainResult = await brainClient.publishTerminalSummary(summaryPayload);
      const publishedAt = nowIso(clock);

      await tx.updateSubmission(submission.id, (current) => ({
        ...current,
        version: (current.version ?? 0) + 1,
        terminalSummary: {
          ...summaryPayload,
          brainKey: brainResult.key,
          brainAgentId: brainResult.agentId,
          publishedAt,
        },
        updatedAt: publishedAt,
      }));

      await recordAudit(tx, {
        kind: 'brain_terminal_summary_written',
        submissionId: submission.id,
        payload: {
          submissionId: submission.id,
          key: brainResult.key,
          agentId: brainResult.agentId,
        },
      }, clock);

      await completeEvent(tx, event, {
        payload: {
          ...event.payload,
          brainKey: brainResult.key,
          brainAgentId: brainResult.agentId,
        },
      });

      return {
        submissionId: submission.id,
        key: brainResult.key,
        agentId: brainResult.agentId,
      };
    });
  }

  async function processEvent(event) {
    if (!event || typeof event !== 'object') {
      throw new TypeError('An outbox event object is required.');
    }

    switch (event.kind) {
      case 'idacc_task_create':
        return processIdaccTaskCreate(event);
      case 'idacc_task_refresh':
        return processIdaccTaskRefresh(event);
      case 'brain_terminal_summary':
        return processBrainTerminalSummary(event);
      default:
        throw new Error(`Unsupported outbox event kind: ${event.kind}`);
    }
  }

  async function runOnce({ limit = DEFAULT_EVENT_KINDS.length, kinds = DEFAULT_EVENT_KINDS } = {}) {
    const leased = await leaseEvents({ limit, kinds });
    const processed = [];

    for (const event of leased) {
      try {
        const result = await processEvent(event);
        processed.push({ eventId: event.id, kind: event.kind, status: 'completed', result });
      } catch (error) {
        if (logger?.error) {
          logger.error(error);
        }

        await repository.transaction(async (tx) => {
          await retryEvent(tx, event, error);
        });

        processed.push({
          eventId: event.id,
          kind: event.kind,
          status: isRetryableWorkerError(error) ? 'retrying' : 'dead_lettered',
          error: normalizeWorkerError(error),
        });
      }
    }

    return {
      leased: leased.length,
      processed,
    };
  }

  return Object.freeze({
    leaseEvents,
    processEvent,
    runOnce,
    processBatch: runOnce,
    buildBrainSummaryPayload,
  });
}

export { DEFAULT_EVENT_KINDS };
