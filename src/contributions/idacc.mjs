import { createHash } from 'node:crypto';

export const IDACC_TASK_SCHEMA = 'agent.bittrees.idacc-contribution-task.v1';
export const IDACC_MANAGER_DEFAULT_URL = 'http://127.0.0.1:4100';

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TITLE_LENGTH = 180;
const MAX_SUMMARY_LENGTH = 2200;
const MAX_ARTIFACTS = 20;
const MAX_SOURCES = 40;
const SAFE_SOURCE_ID = /^(?:memory|fact|text|entity|source):[A-Za-z0-9._:-]+$/;
const SECRET_PATTERN = /\b(?:sk|pk|ak|rk)-[A-Za-z0-9_-]{16,}\b|\b0x[a-fA-F0-9]{64}\b|\b(?:api[_-]?key|access[_-]?token|auth(?:orization)?|bearer|private[_-]?key|secret|password|seed[_-]?phrase)\s*[:=]\s*[^\s,;}]+/gi;

function asText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function boundedText(value, limit, fallback = '') {
  return asText(value, fallback).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit).trim();
}

function redactText(value) {
  return String(value ?? '').replace(SECRET_PATTERN, '[redacted]');
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function stableTaskName(submissionId) {
  return `contribution-${hash(submissionId).slice(0, 24)}`;
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((source) => boundedText(source, 160)).filter((source) => SAFE_SOURCE_ID.test(source)))].slice(0, MAX_SOURCES);
}

function normalizeArtifacts(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((artifact) => {
      if (typeof artifact === 'string') return boundedText(artifact, 240);
      if (!artifact || typeof artifact !== 'object') return '';
      return boundedText(artifact.path ?? artifact.ref ?? artifact.url, 240);
    })
    .filter(Boolean)
    .filter((artifact) => {
      SECRET_PATTERN.lastIndex = 0;
      return !SECRET_PATTERN.test(artifact);
    })
    .slice(0, MAX_ARTIFACTS);
}

function normalizeStatus(value) {
  return boundedText(value, 48).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

function parseJsonResponse(text) {
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: boundedText(text, 1000) }; }
}

export class ManagerBridgeError extends Error {
  constructor(message, { code = 'manager_bridge_error', status = 0, retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'ManagerBridgeError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function errorForResponse(response, payload, method, path) {
  const status = Number(response.status || 0);
  const message = boundedText(payload?.message ?? payload?.error, 600, `${method} ${path} failed`);
  const retryable = status === 408 || status === 425 || status === 429 || status >= 500 || status === 0;
  return new ManagerBridgeError(message, {
    code: status === 404 ? 'manager_task_not_found' : retryable ? 'manager_unavailable' : 'manager_rejected',
    status,
    retryable,
  });
}

function normalizeTask(raw, { taskName, created = false } = {}) {
  const task = raw?.task ?? raw ?? {};
  const managerRef = boundedText(task.shortId ?? task.ref ?? task.uuid ?? task.id ?? task.name ?? taskName, 180);
  return {
    ok: true,
    created,
    taskName: boundedText(task.name, 120, taskName),
    managerRef,
    status: normalizeStatus(task.status || 'todo') || 'todo',
    title: boundedText(task.title, MAX_TITLE_LENGTH),
    // This is intentionally an internal adapter result. HTTP adapters should
    // expose only the contribution receipt and status, never managerRef.
    internal: { managerRef },
  };
}

function assertApproved(input) {
  const decision = normalizeStatus(
    input?.reviewDecision
      ?? input?.review_decision
      ?? input?.review?.decision
      ?? input?.review?.status
      ?? input?.decision,
  );
  if (decision !== 'approved') {
    throw new ManagerBridgeError('manager task creation requires reviewer approval', {
      code: 'review_required',
      retryable: false,
    });
  }
}

function managerTaskPayload(input, { taskName, team, from, goalId }) {
  const submissionId = boundedText(input.submissionId ?? input.submission_id, 180);
  if (!submissionId) {
    throw new ManagerBridgeError('submissionId is required', { code: 'invalid_submission', retryable: false });
  }
  const title = boundedText(input.title, MAX_TITLE_LENGTH, 'Reviewed Bittrees contribution');
  const summary = boundedText(redactText(input.summary ?? input.description), MAX_SUMMARY_LENGTH);
  const lane = boundedText(input.lane ?? input.opportunityId ?? input.opportunity_id, 100, 'contribution');
  const artifacts = normalizeArtifacts(input.artifacts ?? input.artifactRefs ?? input.artifact_refs);
  const sources = normalizeSources(input.sourceIds ?? input.source_ids ?? input.brainSourceIds);
  const expectedOutput = boundedText(input.expectedOutput ?? input.expected_output, 600, 'Owner-reviewed contribution implementation packet');
  const acceptance = boundedText(input.acceptanceCriteria ?? input.acceptance_criteria, 800, 'Deliver a source-grounded, reviewable contribution artifact and tests.');

  const description = [
    `Schema: ${IDACC_TASK_SCHEMA}`,
    `Goal ID: ${boundedText(input.goalId ?? input.goal_id, 120, goalId)}`,
    `Expected output: ${expectedOutput}`,
    `Acceptance criteria: ${acceptance}`,
    'Validation path: owning engineering reviewer -> default coder + researcher when required',
    'Out of scope: task claim/done by this bridge, authority grants, wallet/onchain execution, payouts, and public registry mutation.',
    'Backlog policy: optional infrastructure remains backlog until separately approved.',
    'Bittrees relevance: high: review-gated contributor workflow routing.',
    `Submission digest: ${hash(submissionId)}`,
    `Lane: ${lane}`,
    summary ? `Reviewed summary: ${summary}` : '',
    `Artifact count: ${artifacts.length}`,
    `Brain source count: ${sources.length}`,
  ].filter(Boolean).join('\n');

  return {
    title,
    name: taskName,
    team,
    from,
    description,
    goal_id: boundedText(input.goalId ?? input.goal_id, 120, goalId),
    expected_output: expectedOutput,
    acceptance_criteria: acceptance,
    validation_path: 'owning engineering reviewer -> default coder + researcher when required',
    out_of_scope: 'task claim/done by this bridge, authority grants, wallet/onchain execution, payouts, and public registry mutation',
    backlog_policy: 'optional infrastructure remains backlog until separately approved',
    bittrees_relevance: 'high: review-gated contributor workflow routing',
  };
}

export class ManagerTaskClient {
  #baseUrl;
  #team;
  #from;
  #goalId;
  #fetch;
  #timeoutMs;
  #known = new Map();

  constructor({
    baseUrl = process.env.MANAGER_URL ?? IDACC_MANAGER_DEFAULT_URL,
    team = process.env.ID_TEAM ?? process.env.ID_AGENT_TEAM ?? 'engineering-team',
    from = process.env.ID_AGENT_NAME ?? 'contribution-service',
    goalId = 'goal_plan_1fgpnd5',
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    this.#baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.#team = boundedText(team, 100, 'engineering-team');
    this.#from = boundedText(from, 100, 'contribution-service');
    this.#goalId = boundedText(goalId, 120, 'goal_plan_1fgpnd5');
    this.#fetch = fetchImpl;
    this.#timeoutMs = Math.max(250, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
  }

  async #request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      let response;
      try {
        response = await this.#fetch(`${this.#baseUrl}${path}`, {
          method,
          headers: { accept: 'application/json', 'content-type': 'application/json', 'X-Id-Team': this.#team },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (cause) {
        throw new ManagerBridgeError('manager request failed', { code: 'manager_unavailable', retryable: true, cause });
      }
      const payload = parseJsonResponse(await response.text());
      if (!response.ok) throw errorForResponse(response, payload, method, path);
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getTask(ref) {
    const safeRef = encodeURIComponent(boundedText(ref, 180));
    if (!safeRef) throw new ManagerBridgeError('task ref is required', { code: 'invalid_task_ref' });
    try {
      return normalizeTask(await this.#request(`/tasks/${safeRef}`), { taskName: boundedText(ref, 120) });
    } catch (error) {
      if (error instanceof ManagerBridgeError && error.code === 'manager_task_not_found') return null;
      throw error;
    }
  }

  async createTask(input) {
    const submission = input?.submission && typeof input.submission === 'object'
      ? { ...input.submission, ...input }
      : input;
    assertApproved(submission);
    const submissionId = boundedText(submission?.submissionId ?? submission?.submission_id, 180);
    if (!submissionId) throw new ManagerBridgeError('submissionId is required', { code: 'invalid_submission' });
    const taskName = stableTaskName(submissionId);
    if (this.#known.has(submissionId)) return this.#known.get(submissionId);

    // Read-before-create makes retries and process-local duplicate submissions
    // safe. A 409 from a concurrent creator follows the same read path.
    const existing = await this.getTask(taskName);
    if (existing) {
      const result = { ...existing, created: false };
      this.#known.set(submissionId, result);
      return result;
    }

    const payload = managerTaskPayload(submission, {
      taskName,
      team: this.#team,
      from: this.#from,
      goalId: this.#goalId,
    });
    let response;
    try {
      response = await this.#request('/tasks', { method: 'POST', body: payload });
    } catch (error) {
      if (!(error instanceof ManagerBridgeError) || error.status !== 409) throw error;
      response = await this.#request(`/tasks/${encodeURIComponent(taskName)}`);
    }
    const result = normalizeTask(response, { taskName, created: true });
    this.#known.set(submissionId, result);
    return result;
  }

  async createBoundedTask(input) {
    return this.createTask(input);
  }

  async readTaskStatus(ref) {
    return this.getTask(ref);
  }
}

export function createManagerTaskClient(options) {
  return new ManagerTaskClient(options);
}

export function redactManagerTaskPayload(input) {
  return managerTaskPayload(input, {
    taskName: stableTaskName(input?.submissionId ?? input?.submission_id ?? 'unknown'),
    team: 'engineering-team',
    from: 'contribution-service',
    goalId: 'goal_plan_1fgpnd5',
  });
}

// Deliberately no claimTask/completeTask methods are exposed. The bridge may
// create and read one bounded task, while task ownership and completion remain
// with the IDACC manager/assigned agents.
