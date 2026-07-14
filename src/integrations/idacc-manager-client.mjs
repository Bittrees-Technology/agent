/**
 * The only manager capability granted to the contributor service is bounded
 * task create/read. It deliberately has no claim, done, assignment,
 * capability, registry, wallet, or chain methods.
 */

const DEFAULT_MANAGER_URL = 'http://127.0.0.1:4100';
const DEFAULT_TEAM = 'engineering-team';
const BRIDGE_ACTOR = 'portal-submission-bridge';
const SECRET_RE = /\b(?:api[_-]?key|access[_-]?token|auth(?:orization)?|bearer|private[_-]?key|secret|password|seed[_-]?phrase)\s*[:=]\s*[^\s,;}]+/gi;

function bounded(value, max, fallback = '') {
  return (typeof value === 'string' ? value : fallback)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(SECRET_RE, '[redacted]')
    .slice(0, max)
    .trim();
}

function parseBody(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function taskResult(payload, { includeUpdatedAt = false } = {}) {
  const task = payload?.task ?? payload ?? {};
  const result = {
    name: bounded(task.name, 140),
    uuid: bounded(task.uuid ?? task.id, 160),
    status: bounded(task.status, 32).toLowerCase(),
  };
  if (includeUpdatedAt) result.updatedAt = task.updatedAt ?? task.updated_at ?? null;
  return result;
}

export class IdaccManagerError extends Error {
  constructor(message, { code = 'idacc_manager_error', status = 0, retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'IdaccManagerError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function responseError(response, payload, path) {
  const status = Number(response.status || 0);
  const conflict = status === 409;
  const retryable = conflict || status === 408 || status === 425 || status === 429 || status >= 500 || status === 0;
  return new IdaccManagerError(bounded(payload?.message ?? payload?.error, 400, `IDACC manager request failed: ${path}`), {
    code: status === 404 ? 'idacc_task_not_found' : conflict ? 'idacc_task_conflict' : retryable ? 'idacc_manager_unavailable' : 'idacc_manager_rejected',
    status,
    retryable,
  });
}

export class IdaccManagerClient {
  #baseUrl;
  #team;
  #fetch;
  #timeoutMs;

  constructor({
    baseUrl = process.env.MANAGER_URL ?? DEFAULT_MANAGER_URL,
    team = DEFAULT_TEAM,
    fetchImpl = globalThis.fetch,
    timeoutMs = 5000,
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    this.#baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.#team = bounded(team, 100, DEFAULT_TEAM);
    this.#fetch = fetchImpl;
    this.#timeoutMs = Math.max(250, Number(timeoutMs) || 5000);
  }

  async #request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      let response;
      try {
        response = await this.#fetch(`${this.#baseUrl}${path}`, {
          method,
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'X-Id-Team': this.#team,
          },
          // The manager bridge sends the exact allowlisted body below. The
          // optional description/team parameters are part of the service
          // method contract but are not authority-bearing manager fields.
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (cause) {
        throw new IdaccManagerError('IDACC manager unavailable', {
          code: 'idacc_manager_unavailable',
          retryable: true,
          cause,
        });
      }
      const payload = parseBody(await response.text());
      if (!response.ok) throw responseError(response, payload, path);
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Create exactly one bounded manager task. The caller owns idempotency and
   * timeout reconciliation; this client does not create a second task.
   */
  async createBoundedTask({ name, title, description: _description, team: _team } = {}) {
    const safeName = bounded(name, 140);
    const safeTitle = bounded(title, 180);
    if (!safeName || !safeTitle) {
      throw new IdaccManagerError('task name and title are required', { code: 'invalid_task' });
    }
    // Keep this body intentionally allowlisted and stable. The bridge must not
    // forward raw submission content, evidence, credentials, or team routing
    // authority into the manager API.
    const payload = await this.#request('/tasks', {
      method: 'POST',
      body: { title: safeTitle, name: safeName, from: BRIDGE_ACTOR },
    });
    return taskResult(payload);
  }

  async getTask(name) {
    const safeName = bounded(name, 140);
    if (!safeName) throw new IdaccManagerError('task name is required', { code: 'invalid_task' });
    const payload = await this.#request(`/tasks/${encodeURIComponent(safeName)}`);
    return taskResult(payload, { includeUpdatedAt: true });
  }
}

export function createIdaccManagerClient(options) {
  return new IdaccManagerClient(options);
}

export const createManagerTaskClient = createIdaccManagerClient;
export const createManagerClient = createIdaccManagerClient;
export default IdaccManagerClient;
