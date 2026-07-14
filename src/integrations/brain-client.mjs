import { createHash } from 'node:crypto';

const DEFAULT_BRAIN_URL = 'http://127.0.0.1:4200';
const DEFAULT_AGENT_ID = 'manager';
const SECRET_RE = /\b(?:sk|pk|ak|rk)-[A-Za-z0-9_-]{16,}\b|\b0x[a-fA-F0-9]{64}\b|\b(?:api[_-]?key|access[_-]?token|auth(?:orization)?|bearer|private[_-]?key|secret|password|seed[_-]?phrase)\s*[:=]\s*[^\s,;}]+/gi;
const INTERNAL_ID_RE = /\b(?:memory|fact|text|entity):[^\s,;)]+/gi;
const ALLOWED_ALIAS_RE = /^(?:bittrees-citation|citation)\/[A-Za-z0-9._:-]+$/;
const UNSAFE_SUMMARY_RE = /\b(?:artifact|evidence|contact|email|auth|bearer|private\s+reviewer|legal|financial|payout|compensation|wallet|seed\s+phrase)\b/i;

function bounded(value, max, fallback = '') {
  return (typeof value === 'string' ? value : fallback)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(SECRET_RE, '[redacted]')
    .replace(INTERNAL_ID_RE, '[citation omitted]')
    .slice(0, max)
    .trim();
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function parseBody(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function safeOutcome(value) {
  const normalized = bounded(value, 64).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return ['approved', 'rejected', 'todo', 'doing', 'done', 'idacc_todo', 'idacc_doing', 'idacc_done'].includes(normalized)
    ? normalized
    : 'reviewed';
}

function aliases(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((alias) => bounded(alias, 160))
    .filter((alias) => ALLOWED_ALIAS_RE.test(alias)))].slice(0, 20);
}

/**
 * Convert an internal terminal event to a small, public-safe Brain memory
 * string. Raw artifact/evidence, contact, auth, reviewer-reason, legal and
 * financial fields are never read or serialized.
 */
export function sanitizeBrainTerminalSummary(input = {}) {
  const submissionId = bounded(input.submissionId ?? input.submission_id, 180);
  if (!submissionId) throw new BrainClientError('submission id is required', { code: 'invalid_terminal_summary' });
  const outcome = safeOutcome(input.reviewOutcome ?? input.review_outcome ?? input.decision ?? input.status);
  const managerStatus = safeOutcome(input.managerStatus ?? input.manager_status);
  const rawTitle = bounded(input.title, 180, 'Bittrees contribution');
  const title = UNSAFE_SUMMARY_RE.test(rawTitle) ? 'Bittrees contribution' : rawTitle;
  const rawSummary = typeof (input.summary ?? input.publicSummary ?? input.public_summary) === 'string'
    ? input.summary ?? input.publicSummary ?? input.public_summary
    : '';
  const summary = UNSAFE_SUMMARY_RE.test(rawSummary) ? '' : bounded(rawSummary, 1800);
  const timestamp = bounded(input.timestamp ?? input.occurredAt ?? input.occurred_at, 64, new Date().toISOString());
  const citationAliases = aliases(input.citationAliases ?? input.citation_aliases);
  const content = [
    '# Bittrees contribution terminal summary',
    `Submission: ${submissionId}`,
    `Review outcome: ${outcome}`,
    `Manager status: ${managerStatus}`,
    `Title: ${title}`,
    summary ? `Summary: ${summary}` : '',
    citationAliases.length ? `Approved citations: ${citationAliases.join(', ')}` : '',
    `Occurred at: ${timestamp}`,
    `Correlation digest: ${hash(submissionId)}`,
  ].filter(Boolean).join('\n');
  return {
    key: `bittrees:submission:${submissionId}:terminal:v1`,
    content,
    tags: ['bittrees', 'contribution', 'terminal'],
    shared: true,
  };
}

export class BrainClientError extends Error {
  constructor(message, { code = 'brain_client_error', status = 0, retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'BrainClientError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export class BrainClient {
  #baseUrl;
  #agentId;
  #fetch;
  #timeoutMs;

  constructor({
    baseUrl = process.env.BRAIN_MCP_BASE_URL ?? process.env.BRAIN_URL ?? DEFAULT_BRAIN_URL,
    agentId = process.env.BRAIN_AGENT_ID ?? DEFAULT_AGENT_ID,
    fetchImpl = globalThis.fetch,
    timeoutMs = 5000,
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    this.#baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.#agentId = bounded(agentId, 160, DEFAULT_AGENT_ID);
    this.#fetch = fetchImpl;
    this.#timeoutMs = Math.max(250, Number(timeoutMs) || 5000);
  }

  async #post(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    const path = `/memory/${encodeURIComponent(this.#agentId)}`;
    try {
      let response;
      try {
        response = await this.#fetch(`${this.#baseUrl}${path}`, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (cause) {
        throw new BrainClientError('Brain unavailable', { code: 'brain_unavailable', retryable: true, cause });
      }
      const body = parseBody(await response.text());
      if (!response.ok) {
        const status = Number(response.status || 0);
        throw new BrainClientError('Brain terminal summary write failed', {
          code: status >= 500 || status === 429 ? 'brain_unavailable' : 'brain_rejected',
          status,
          retryable: status >= 500 || status === 429,
        });
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  async publishTerminalSummary(input) {
    await this.#post(sanitizeBrainTerminalSummary(input));
    // Never return Brain's internal memory id to a caller.
    return { ok: true };
  }

  async writeTerminalSummary(input) {
    return this.publishTerminalSummary(input);
  }

  async publishSanitizedMemory(input) {
    return this.publishTerminalSummary(input);
  }

  async publish(input) {
    return this.publishTerminalSummary(input);
  }
}

export function createBrainClient(options) {
  return new BrainClient(options);
}

export const BrainTerminalSummaryClient = BrainClient;
export default BrainClient;
