const DEFAULT_BRAIN_BASE_URL = 'http://127.0.0.1:4200';
const DEFAULT_BRAIN_AGENT_ID = process.env.BRAIN_AGENT_ID ?? 'validate';
const REQUEST_TIMEOUT_MS = 15_000;
const SAFE_SOURCE_ID_PATTERN = /^(?:memory|text|fact|entity|output):/i;
const UNSAFE_TITLE_PATTERN = /(?:secret|token|password|mnemonic|seed\s*phrase|private\s*key|api\s*key|bearer|credential)/i;

function normalizeText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return text || fallback;
}

function normalizeSourceIds(sourceIds = []) {
  if (!Array.isArray(sourceIds)) return [];
  return sourceIds
    .map((sourceId) => normalizeText(sourceId))
    .filter((sourceId) => sourceId && SAFE_SOURCE_ID_PATTERN.test(sourceId));
}

function safeTitle(title, submissionId) {
  const text = normalizeText(title);
  if (!text) return `Contribution terminal summary for ${submissionId}`;
  if (UNSAFE_TITLE_PATTERN.test(text)) return `Contribution terminal summary for ${submissionId}`;
  return text.slice(0, 140);
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

function sanitizeSummaryPayload(input = {}) {
  const submissionId = normalizeText(input.submissionId);
  if (!submissionId) {
    throw new TypeError('submissionId is required.');
  }

  const summary = {
    schema: 'agent.bittrees.contribution-terminal-summary.v1',
    submissionId,
    title: safeTitle(input.title, submissionId),
    state: normalizeText(input.state, 'unknown'),
    statusReceipt: normalizeText(input.statusReceipt),
    updatedAt: normalizeText(input.updatedAt),
    sourceIds: normalizeSourceIds(input.sourceIds),
  };

  const terminalSummary = input.terminalSummary;
  if (terminalSummary && typeof terminalSummary === 'object' && !Array.isArray(terminalSummary)) {
    summary.terminalSummary = {
      submissionId,
      state: normalizeText(terminalSummary.state, summary.state),
      statusReceipt: normalizeText(terminalSummary.statusReceipt, summary.statusReceipt),
      submittedAt: normalizeText(terminalSummary.submittedAt),
      updatedAt: normalizeText(terminalSummary.updatedAt, summary.updatedAt),
      targetLane: normalizeText(terminalSummary.targetLane),
      outcome: normalizeText(terminalSummary.outcome),
      idacc: terminalSummary.idacc && typeof terminalSummary.idacc === 'object'
        ? {
            state: normalizeText(terminalSummary.idacc.state),
            taskStatus: normalizeText(terminalSummary.idacc.taskStatus),
          }
        : null,
    };
  }

  if (input.idacc && typeof input.idacc === 'object') {
    summary.idacc = {
      state: normalizeText(input.idacc.state),
      taskName: normalizeText(input.idacc.taskName),
      taskStatus: normalizeText(input.idacc.taskStatus),
    };
  }

  if (input.review && typeof input.review === 'object') {
    summary.review = {
      decision: normalizeText(input.review.decision),
      state: normalizeText(input.review.state),
      reviewedAt: normalizeText(input.review.reviewedAt),
      result: normalizeText(input.review.result),
    };
  }

  return summary;
}

function sanitizeBrainRecord(summary) {
  const record = {
    title: summary.title,
    content: JSON.stringify(summary),
  };

  return record;
}

function sanitizeBrainError(response, payload) {
  const error = new Error('Brain memory write failed.');
  error.status = response.status;
  error.retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
  error.details = payload && typeof payload === 'object' ? payload : null;
  return error;
}

export function buildBrainTerminalSummaryRecord(input = {}) {
  return sanitizeSummaryPayload(input);
}

export function createBrainClient({
  baseUrl = process.env.BRAIN_BASE_URL ?? DEFAULT_BRAIN_BASE_URL,
  agentId = process.env.BRAIN_AGENT_ID ?? DEFAULT_BRAIN_AGENT_ID,
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required to create the Brain client.');
  }

  const resolvedAgentId = normalizeText(agentId);
  if (!resolvedAgentId) {
    throw new TypeError('agentId is required.');
  }

  async function publishTerminalSummary(input = {}) {
    const summary = sanitizeSummaryPayload(input);
    const record = sanitizeBrainRecord(summary);
    const request = withTimeout(timeoutMs);

    try {
      const response = await fetchImpl(new URL(`/memory/${encodeURIComponent(resolvedAgentId)}`, baseUrl).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          key: `contribution:${summary.submissionId}`,
          content: record.content,
          shared: true,
          tags: ['contribution', 'terminal-summary'],
        }),
        signal: request.signal,
      });
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw sanitizeBrainError(response, payload);
      }

      return {
        key: `contribution:${summary.submissionId}`,
        agentId: resolvedAgentId,
        status: 'stored',
        summary,
        response: payload,
      };
    } finally {
      request.clear();
    }
  }

  return Object.freeze({
    publishTerminalSummary,
    writeTerminalSummary: publishTerminalSummary,
  });
}

export { sanitizeBrainError, sanitizeSummaryPayload };
