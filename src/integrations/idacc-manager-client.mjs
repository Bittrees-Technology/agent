const DEFAULT_MANAGER_TEAM = 'engineering-team';
const DEFAULT_TASK_FROM = 'portal-submission-bridge';
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_TASK_LIFECYCLE_HEADERS = Object.freeze({
  Accept: 'application/json',
  'Content-Type': 'application/json',
});

function normalizeText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return text || fallback;
}

function assertText(value, field, { minLength = 1, maxLength = Number.POSITIVE_INFINITY } = {}) {
  const text = normalizeText(value);
  if (text.length < minLength) {
    throw new TypeError(`${field} must be at least ${minLength} character(s).`);
  }
  if (text.length > maxLength) {
    throw new TypeError(`${field} must be at most ${maxLength} character(s).`);
  }
  return text;
}

function createRequestUrl(baseUrl, pathname) {
  const url = new URL(baseUrl);
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function withTimeout(timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Request timed out.')), timeoutMs);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeout);
    },
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sanitizeManagerRecord(record, { includeUpdatedAt = false } = {}) {
  const normalized = {
    name: normalizeText(record?.name),
    uuid: normalizeText(record?.uuid),
    status: normalizeText(record?.status),
  };

  if (includeUpdatedAt) {
    normalized.updatedAt = normalizeText(record?.updatedAt);
  }

  return normalized;
}

function sanitizeManagerError(response, payload) {
  const error = new Error('IDACC manager request failed.');
  error.status = response.status;
  error.retryable = [408, 409, 425, 429, 500, 502, 503, 504].includes(response.status);
  error.details = payload && typeof payload === 'object' ? payload : null;
  return error;
}

function createCapabilityPreflightError(message, details) {
  const error = new TypeError(message);
  error.code = 'task_dispatch_capability_mismatch';
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function normalizeTaskLifecycleResponse(payload, fallbackTaskName) {
  const sanitized = sanitizeManagerRecord(payload);
  return {
    name: sanitized.name || fallbackTaskName,
    uuid: sanitized.uuid,
    status: sanitized.status,
  };
}

export function createIdaccManagerClient({
  baseUrl = process.env.MANAGER_URL ?? process.env.IDACC_MANAGER_URL ?? 'http://127.0.0.1:3000',
  team = process.env.X_ID_TEAM ?? DEFAULT_MANAGER_TEAM,
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required to create the IDACC manager client.');
  }

  const resolvedTeam = assertText(team, 'team', { minLength: 1, maxLength: 120 });

  async function requestJson(pathname, init) {
    const request = withTimeout(timeoutMs);
    try {
      const response = await fetchImpl(createRequestUrl(baseUrl, pathname), {
        ...init,
        signal: request.signal,
      });
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw sanitizeManagerError(response, payload);
      }

      return payload;
    } finally {
      request.clear();
    }
  }

  async function getTask(name) {
    const taskName = assertText(name, 'name', { minLength: 1, maxLength: 160 });
    const payload = await requestJson(`/tasks/${encodeURIComponent(taskName)}`, {
      method: 'GET',
      headers: {
        'X-Id-Team': resolvedTeam,
        Accept: 'application/json',
      },
    });

    return sanitizeManagerRecord(payload, { includeUpdatedAt: true });
  }

  async function createBoundedTask({ name, title, description, team: taskTeam } = {}) {
    const taskName = assertText(name, 'name', { minLength: 1, maxLength: 160 });
    const taskTitle = assertText(title, 'title', { minLength: 1, maxLength: 240 });
    assertText(description, 'description', { minLength: 1, maxLength: 2000 });
    assertText(taskTeam ?? resolvedTeam, 'team', { minLength: 1, maxLength: 120 });

    const payload = {
      title: taskTitle,
      name: taskName,
      from: DEFAULT_TASK_FROM,
    };

    const request = withTimeout(timeoutMs);
    try {
      const response = await fetchImpl(createRequestUrl(baseUrl, '/tasks'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Id-Team': resolvedTeam,
        },
        body: JSON.stringify(payload),
        signal: request.signal,
      });

      const body = await readJsonResponse(response);

      if (response.status === 409) {
        const reconciled = await getTask(taskName);
        return {
          name: reconciled.name,
          uuid: reconciled.uuid,
          status: reconciled.status,
        };
      }

      if (!response.ok) {
        throw sanitizeManagerError(response, body);
      }

      const sanitized = sanitizeManagerRecord(body ?? payload);
      return {
        name: sanitized.name,
        uuid: sanitized.uuid,
        status: sanitized.status,
      };
    } finally {
      request.clear();
    }
  }

  async function claimTask(name, { agentId, note } = {}) {
    const taskName = assertText(name, 'name', { minLength: 1, maxLength: 160 });
    const resolvedAgentId = assertText(agentId, 'agentId', { minLength: 1, maxLength: 160 });

    const request = withTimeout(timeoutMs);
    try {
      const response = await fetchImpl(createRequestUrl(baseUrl, `/tasks/${encodeURIComponent(taskName)}/claim`), {
        method: 'POST',
        headers: {
          ...DEFAULT_TASK_LIFECYCLE_HEADERS,
          'X-Id-Team': resolvedTeam,
        },
        body: JSON.stringify({
          agentId: resolvedAgentId,
          from: DEFAULT_TASK_FROM,
          note: normalizeText(note) || undefined,
        }),
        signal: request.signal,
      });

      const body = await readJsonResponse(response);
      if (!response.ok) {
        throw sanitizeManagerError(response, body);
      }

      return normalizeTaskLifecycleResponse(body, taskName);
    } finally {
      request.clear();
    }
  }

  async function finishTask(name, { agentId, note } = {}) {
    const taskName = assertText(name, 'name', { minLength: 1, maxLength: 160 });
    const resolvedAgentId = assertText(agentId, 'agentId', { minLength: 1, maxLength: 160 });

    const request = withTimeout(timeoutMs);
    try {
      const response = await fetchImpl(createRequestUrl(baseUrl, `/tasks/${encodeURIComponent(taskName)}/done`), {
        method: 'POST',
        headers: {
          ...DEFAULT_TASK_LIFECYCLE_HEADERS,
          'X-Id-Team': resolvedTeam,
        },
        body: JSON.stringify({
          agentId: resolvedAgentId,
          from: DEFAULT_TASK_FROM,
          note: normalizeText(note) || undefined,
        }),
        signal: request.signal,
      });

      const body = await readJsonResponse(response);
      if (!response.ok) {
        throw sanitizeManagerError(response, body);
      }

      return normalizeTaskLifecycleResponse(body, taskName);
    } finally {
      request.clear();
    }
  }

  function preflightDispatchCapability({
    dispatchRoute,
    requiredCapabilities = [],
    availableCapabilities = [],
    rerouteTo = null,
  } = {}) {
    const route = assertText(dispatchRoute, 'dispatchRoute', { minLength: 1, maxLength: 240 });
    const required = Array.isArray(requiredCapabilities) ? requiredCapabilities.filter(Boolean).map((item) => normalizeText(item)) : [];
    const available = Array.isArray(availableCapabilities) ? availableCapabilities.filter(Boolean).map((item) => normalizeText(item)) : [];

    const missing = required.filter((capability) => !available.includes(capability));
    if (missing.length === 0) {
      return {
        route,
        rerouted: false,
        missingCapabilities: [],
      };
    }

    if (rerouteTo) {
      return {
        route: assertText(rerouteTo, 'rerouteTo', { minLength: 1, maxLength: 240 }),
        rerouted: true,
        rerouteFrom: route,
        missingCapabilities: missing,
      };
    }

    throw createCapabilityPreflightError(
      `Dispatch route ${route} requires unsupported capability/capabilities: ${missing.join(', ')}.`,
      {
        route,
        requiredCapabilities: required,
        availableCapabilities: available,
        missingCapabilities: missing,
      },
    );
  }

  return Object.freeze({
    claimTask,
    createBoundedTask,
    getTask,
    finishTask,
    preflightDispatchCapability,
  });
}

export { sanitizeManagerError, sanitizeManagerRecord };
