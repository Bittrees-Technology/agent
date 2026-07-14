import { createHash } from 'node:crypto';

export const BRAIN_TERMINAL_SUMMARY_SCHEMA = 'agent.bittrees.contribution.terminal-summary.v1';
export const BRAIN_DEFAULT_URL = 'http://127.0.0.1:4200';

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_SUMMARY_LENGTH = 2200;
const MAX_TITLE_LENGTH = 180;
const MAX_SOURCES = 40;
const SAFE_SOURCE_ID = /^(?:memory|fact|text|entity|source):[A-Za-z0-9._:-]+$/;
const SECRET_PATTERN = /\b(?:sk|pk|ak|rk)-[A-Za-z0-9_-]{16,}\b|\b0x[a-fA-F0-9]{64}\b|\b(?:api[_-]?key|access[_-]?token|auth(?:orization)?|bearer|private[_-]?key|secret|password|seed[_-]?phrase)\s*[:=]\s*[^\s,;}]+/gi;

function text(value, limit, fallback = '') {
  return (typeof value === 'string' ? value : fallback)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(SECRET_PATTERN, '[redacted]')
    .slice(0, limit)
    .trim();
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function sourceIds(value) {
  if (!Array.isArray(value)) return [];
  const normalized = [...new Set(value.map((source) => text(source, 160)).filter(Boolean))];
  const invalid = normalized.filter((source) => !SAFE_SOURCE_ID.test(source));
  if (invalid.length) {
    throw new BrainSourceValidationError('terminal summary contains malformed Brain source ids', { status: 422 });
  }
  return normalized.slice(0, MAX_SOURCES);
}

function normalizeDecision(value) {
  return text(value, 48).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

export class BrainTerminalSummaryError extends Error {
  constructor(message, { code = 'brain_terminal_summary_error', status = 0, retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'BrainTerminalSummaryError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export class BrainSourceValidationError extends BrainTerminalSummaryError {
  constructor(message, options = {}) {
    super(message, { ...options, code: 'brain_source_validation_failed', retryable: false });
    this.name = 'BrainSourceValidationError';
  }
}

function parseJson(textValue) {
  try { return textValue ? JSON.parse(textValue) : {}; } catch { return {}; }
}

function sourceValidationResult(payload, requested) {
  const rows = Array.isArray(payload?.sources) ? payload.sources : [];
  const invalid = rows.filter((source) => source?.valid === false);
  // Brain returns one row per checked source. Do not accept a partial response
  // as proof that every cited source is valid.
  if (requested.length && (rows.length !== requested.length || invalid.length)) {
    throw new BrainSourceValidationError('terminal summary cites invalid or unresolved Brain sources', {
      status: 422,
    });
  }
  return rows;
}

export function sanitizeTerminalSummary(input = {}) {
  const source = input?.submission && typeof input.submission === 'object'
    ? { ...input.submission, ...input }
    : input;
  const submissionId = text(source.submissionId ?? source.submission_id, 180);
  if (!submissionId) throw new BrainTerminalSummaryError('submissionId is required', { code: 'invalid_terminal_summary' });
  const decision = normalizeDecision(source.decision ?? source.reviewDecision ?? source.review_decision);
  if (!['approved', 'rejected'].includes(decision)) {
    throw new BrainTerminalSummaryError('terminal summary decision must be approved or rejected', { code: 'invalid_terminal_summary' });
  }
  const terminalState = normalizeDecision(source.terminalState ?? source.terminal_state ?? source.status ?? decision);
  const title = text(source.title, MAX_TITLE_LENGTH, 'Bittrees contribution');
  const summary = text(source.summary ?? source.description, MAX_SUMMARY_LENGTH);
  const lane = text(source.lane ?? source.opportunityId ?? source.opportunity_id, 100, 'contribution');
  const sources = sourceIds(source.sourceIds ?? source.source_ids ?? source.brainSourceIds);
  const managerTask = source.managerTask ?? source.manager_task ?? {};
  const managerState = text(managerTask.state ?? managerTask.status, 48, 'not_created').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const managerRef = text(managerTask.ref ?? managerTask.taskRef ?? managerTask.task_ref, 180);
  const occurredAt = text(source.occurredAt ?? source.occurred_at, 64, new Date().toISOString());
  const eventKey = `contribution-terminal:${hash(`${submissionId}:${decision}:${terminalState}`)}`;

  return {
    schema: BRAIN_TERMINAL_SUMMARY_SCHEMA,
    eventKey,
    correlationKey: hash(submissionId),
    decision,
    terminalState,
    title,
    summary,
    lane,
    sourceIds: sources,
    artifactCount: Number.isFinite(Number(source.artifactCount ?? source.artifact_count))
      ? Math.max(0, Math.min(20, Number(source.artifactCount ?? source.artifact_count)))
      : Array.isArray(source.artifacts) ? Math.min(20, source.artifacts.length) : 0,
    manager: {
      state: managerState,
      taskKey: managerRef ? hash(managerRef) : null,
    },
    occurredAt,
    publicSafe: true,
  };
}

function errorForResponse(response, payload, path) {
  const status = Number(response.status || 0);
  const retryable = status === 408 || status === 425 || status === 429 || status >= 500 || status === 0;
  return new BrainTerminalSummaryError(text(payload?.message ?? payload?.error, 600, `Brain ${path} failed`), {
    code: retryable ? 'brain_unavailable' : 'brain_rejected',
    status,
    retryable,
  });
}

export class BrainTerminalSummaryClient {
  #baseUrl;
  #fetch;
  #timeoutMs;
  #project;

  constructor({
    baseUrl = process.env.BRAIN_MCP_BASE_URL ?? process.env.BRAIN_URL ?? BRAIN_DEFAULT_URL,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    project = 'bittrees-contributors',
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    this.#baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.#fetch = fetchImpl;
    this.#timeoutMs = Math.max(250, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
    this.#project = text(project, 120, 'bittrees-contributors');
  }

  async #request(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      let response;
      try {
        response = await this.#fetch(`${this.#baseUrl}${path}`, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (cause) {
        throw new BrainTerminalSummaryError('Brain request failed', { code: 'brain_unavailable', retryable: true, cause });
      }
      const payload = parseJson(await response.text());
      if (!response.ok) throw errorForResponse(response, payload, path);
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  async publish(input) {
    const summary = sanitizeTerminalSummary(input);
    const requestedSources = summary.sourceIds;
    if (!requestedSources.length) {
      throw new BrainSourceValidationError('terminal summary requires at least one Brain source', {
        status: 422,
      });
    }
    if (requestedSources.length) {
      const validation = await this.#request('/sources/validate', { source_ids: requestedSources });
      sourceValidationResult(validation, requestedSources);
    }

    // Keyed Brain memory is idempotent across worker restarts and retries. The
    // raw Brain memory id returned by this route is intentionally not exposed.
    const content = [
      `# Contribution terminal summary`,
      `Schema: ${summary.schema}`,
      `Decision: ${summary.decision}`,
      `Terminal state: ${summary.terminalState}`,
      `Contribution: ${summary.correlationKey}`,
      `Lane: ${summary.lane}`,
      `Title: ${summary.title}`,
      summary.summary ? `Summary: ${summary.summary}` : '',
      `Manager task state: ${summary.manager.state}`,
      `Artifact count: ${summary.artifactCount}`,
      `Brain sources: ${summary.sourceIds.length}`,
      `Occurred at: ${summary.occurredAt}`,
    ].filter(Boolean).join('\n');
    await this.#request('/memory/manager', {
      key: summary.eventKey,
      content,
      tags: ['bittrees', 'contribution', 'terminal-summary', summary.decision],
      shared: true,
      project: this.#project,
      durable_candidate: {
        subject: `contribution:${summary.correlationKey}`,
        predicate: 'terminal_state',
        value: { decision: summary.decision, state: summary.terminalState },
        claim_type: 'reviewed_outcome',
        scope: 'bittrees contributor workflow',
        source_ids: summary.sourceIds,
        owner: 'contribution-service',
        confidence: 0.9,
        freshness: summary.occurredAt,
        update_path: 'reviewer decision supersedes the keyed terminal summary',
        confidence_reason: 'terminal state is emitted only after reviewer decision',
        source_recovery: 'source IDs are validated by Brain before writeback',
        validator_state: 'review-approved',
      },
    });
    return { ok: true, eventKey: summary.eventKey, correlationKey: summary.correlationKey };
  }

  async writeTerminalSummary(input) {
    return this.publish(input);
  }

  async captureTerminalSummary(input) {
    return this.publish(input);
  }
}

export function createBrainTerminalSummaryClient(options) {
  return new BrainTerminalSummaryClient(options);
}

export const BrainMemoryClient = BrainTerminalSummaryClient;
