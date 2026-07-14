import { createHash } from 'node:crypto';

export const INTEGRATION_OUTBOX_SCHEMA = 'agent.bittrees.integration-outbox-worker.v1';
export const OUTBOX_EVENT_KINDS = Object.freeze([
  'idacc_task_create',
  'idacc_task_refresh',
  'brain_terminal_summary',
]);

const STATUS_MAP = Object.freeze({ todo: 'idacc_todo', doing: 'idacc_doing', done: 'idacc_done' });

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function eventPayload(event) {
  const value = event?.payload ?? event?.payload_json ?? event?.body ?? event?.data ?? event?.event ?? event;
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = {}; }
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const nested = parsed.submission && typeof parsed.submission === 'object' ? parsed.submission : {};
  const task = parsed.task && typeof parsed.task === 'object' ? parsed.task : {};
  return { ...nested, ...task, ...parsed };
}

function eventKind(event) {
  return String(event?.kind ?? event?.eventKind ?? event?.event_kind ?? event?.eventType ?? event?.event_type ?? event?.type ?? '').trim();
}

function attempts(event) {
  return Math.max(1, Number(event?.attempts ?? event?.attempt_count ?? event?.retryCount ?? event?.retry_count ?? 1) || 1);
}

function submissionId(payload, event) {
  return String(payload.submissionId ?? payload.submission_id ?? event?.submissionId ?? event?.submission_id ?? event?.submission_key ?? '').trim();
}

export function deterministicTaskName(id) {
  const raw = String(id ?? '').trim();
  const safe = raw.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  if (safe) return `bittrees-submission-${safe}`;
  return `bittrees-submission-${createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
}

function managerStatus(status) {
  return STATUS_MAP[String(status ?? '').toLowerCase()] ?? 'idacc_unknown';
}

async function invoke(store, names, ...args) {
  for (const name of names) {
    if (typeof store?.[name] === 'function') return store[name](...args);
  }
  throw new TypeError(`integration outbox store must implement ${names.join(' or ')}`);
}

export class ContributionOutboxError extends Error {
  constructor(message, { retryable = false, code = 'contribution_outbox_error', cause } = {}) {
    super(message, { cause });
    this.name = 'ContributionOutboxError';
    this.retryable = retryable;
    this.code = code;
  }
}

export class InMemoryIntegrationOutboxStore {
  #events = new Map();
  #sequence = 0;

  enqueue(kind, payload, { id, availableAt = 0 } = {}) {
    if (!OUTBOX_EVENT_KINDS.includes(kind)) throw new TypeError(`unsupported outbox kind: ${kind}`);
    const row = {
      id: String(id ?? `outbox-${++this.#sequence}`),
      kind,
      payload,
      status: 'pending',
      attempts: 0,
      availableAt,
      createdAt: Date.now(),
    };
    this.#events.set(row.id, row);
    return { ...row };
  }

  async claimPending({ kinds = OUTBOX_EVENT_KINDS, limit = 10, now = Date.now(), leaseMs = 30000 } = {}) {
    const rows = [...this.#events.values()]
      .filter((row) => kinds.includes(row.kind) && ['pending', 'retry'].includes(row.status) && Number(row.availableAt) <= now)
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(0, positive(limit, 10));
    return rows.map((row) => {
      row.status = 'processing';
      row.attempts += 1;
      row.leaseUntil = now + leaseMs;
      return { ...row };
    });
  }

  async markSent(id, result) {
    const row = this.#events.get(String(id));
    if (!row) return false;
    row.status = 'sent';
    row.result = result;
    return true;
  }

  async markRetry(id, details) {
    const row = this.#events.get(String(id));
    if (!row) return false;
    row.status = 'retry';
    row.availableAt = details.nextAttemptAt;
    row.error = details.error;
    return true;
  }

  async markFailed(id, details) {
    const row = this.#events.get(String(id));
    if (!row) return false;
    row.status = 'failed';
    row.error = details.error;
    return true;
  }

  rows() { return [...this.#events.values()].map((row) => ({ ...row })); }
}

export class ContributionOutboxWorker {
  #store;
  #manager;
  #brain;
  #now;
  #random;
  #limit;
  #leaseMs;
  #maxAttempts;
  #baseDelayMs;
  #maxDelayMs;
  #jitterMs;
  #intervalMs;
  #timer = null;
  #running = null;
  #createdBySubmission = new Map();

  constructor({
    store,
    outbox,
    managerClient,
    manager,
    brainClient,
    brain,
    clock = () => Date.now(),
    random = () => Math.random(),
    limit = 10,
    batchSize,
    leaseMs = 30000,
    maxAttempts = 5,
    baseDelayMs = 1000,
    maxDelayMs = 300000,
    jitterMs = 250,
    intervalMs = 10000,
  } = {}) {
    this.#store = store ?? outbox;
    this.#manager = managerClient ?? manager;
    this.#brain = brainClient ?? brain;
    if (!this.#store) throw new TypeError('integration outbox store is required');
    if (!this.#manager || typeof this.#manager.createBoundedTask !== 'function' || typeof this.#manager.getTask !== 'function') {
      throw new TypeError('managerClient.createBoundedTask and getTask are required');
    }
    if (!this.#brain || typeof this.#brain.publishTerminalSummary !== 'function') {
      throw new TypeError('brainClient.publishTerminalSummary is required');
    }
    this.#now = clock;
    this.#random = random;
    this.#limit = positive(batchSize ?? limit, 10);
    this.#leaseMs = positive(leaseMs, 30000);
    this.#maxAttempts = positive(maxAttempts, 5);
    this.#baseDelayMs = positive(baseDelayMs, 1000);
    this.#maxDelayMs = positive(maxDelayMs, 300000);
    this.#jitterMs = Math.max(0, Number(jitterMs) || 0);
    this.#intervalMs = positive(intervalMs, 10000);
  }

  async #claim(now) {
    return invoke(this.#store, ['claimPending', 'claimBatch', 'leasePending', 'leaseEvents', 'leaseIntegrationOutbox', 'claimIntegrationOutbox'], {
      kinds: OUTBOX_EVENT_KINDS,
      limit: this.#limit,
      now,
      leaseMs: this.#leaseMs,
      leaseUntil: now + this.#leaseMs,
    });
  }

  async #sent(event, result) {
    return invoke(this.#store, ['markSent', 'markOutboxSent', 'complete', 'ack'], event.id ?? event.eventId, result);
  }

  async #retry(event, error, now) {
    const count = attempts(event);
    const exponential = Math.min(this.#maxDelayMs, this.#baseDelayMs * (2 ** Math.max(0, count - 1)));
    const jitter = this.#jitterMs ? Math.floor(Math.max(0, Math.min(1, Number(this.#random()) || 0)) * this.#jitterMs) : 0;
    const nextAttemptAt = now + exponential + jitter;
    return invoke(this.#store, ['markRetry', 'markOutboxRetry', 'scheduleRetry', 'retry'], event.id ?? event.eventId, {
      attempts: count,
      nextAttemptAt,
      error: String(error?.message ?? error).slice(0, 500),
    });
  }

  async #failed(event, error) {
    return invoke(this.#store, ['markFailed', 'markOutboxFailed', 'deadLetter', 'fail'], event.id ?? event.eventId, {
      attempts: attempts(event),
      error: String(error?.message ?? error).slice(0, 500),
    });
  }

  async #reconcileCreate(payload, name, originalError) {
    try {
      const task = await this.#manager.getTask(name);
      if (task) return { ...task, status: managerStatus(task.status), reconciled: true };
    } catch (error) {
      if (error?.code === 'idacc_task_not_found' || Number(error?.status) === 404) throw originalError;
      // A timeout or manager outage during reconciliation must remain a retry;
      // never convert it into a second POST or a silent drop.
      throw Object.assign(error, { retryable: true });
    }
    throw originalError;
  }

  async #handle(event) {
    const payload = eventPayload(event);
    const kind = eventKind(event);
    if (!OUTBOX_EVENT_KINDS.includes(kind)) {
      throw new ContributionOutboxError(`unsupported integration outbox event: ${kind}`, { code: 'unsupported_event' });
    }
    if (kind === 'brain_terminal_summary') return this.#brain.publishTerminalSummary(payload);

    const id = submissionId(payload, event);
    const name = boundedName(payload.taskName ?? payload.task_name ?? event.taskName ?? event.task_name) || deterministicTaskName(id);
    if (kind === 'idacc_task_refresh') {
      const task = await this.#manager.getTask(name);
      return { ...task, status: managerStatus(task.status), taskName: name };
    }
    if (id && this.#createdBySubmission.has(id)) return this.#createdBySubmission.get(id);
    // A deterministic-name read-before-create is the process-restart guard.
    // A missing task is the only condition that permits POST /tasks.
    try {
      const existing = await this.#manager.getTask(name);
      if (existing) {
        const reconciled = { ...existing, status: managerStatus(existing.status), taskName: name, reconciled: true };
        if (id) this.#createdBySubmission.set(id, reconciled);
        return reconciled;
      }
    } catch (error) {
      if (!(error?.code === 'idacc_task_not_found' || Number(error?.status) === 404)) throw error;
    }
    const request = {
      name,
      title: payload.title ?? payload.task?.title ?? 'Bittrees contribution',
      description: payload.description ?? payload.task?.description,
      team: payload.team ?? 'engineering-team',
    };
    try {
      const task = await this.#manager.createBoundedTask(request);
      const result = { ...task, status: managerStatus(task.status), taskName: name };
      if (id) this.#createdBySubmission.set(id, result);
      return result;
    } catch (error) {
      if (error?.retryable === true) {
        const result = await this.#reconcileCreate(payload, name, error);
        if (id) this.#createdBySubmission.set(id, result);
        return result;
      }
      throw error;
    }
  }

  async processOnce() {
    if (this.#running) return this.#running;
    this.#running = (async () => {
      const now = Number(this.#now()) || Date.now();
      const claimed = await this.#claim(now);
      const events = Array.isArray(claimed) ? claimed : claimed?.events ?? claimed?.items ?? [];
      const results = [];
      for (const event of events) {
        try {
          const result = await this.#handle(event);
          await this.#sent(event, result);
          results.push({ id: event.id, kind: eventKind(event), status: 'sent', result });
        } catch (error) {
          if (error?.retryable === true && attempts(event) < this.#maxAttempts) {
            await this.#retry(event, error, now);
            results.push({ id: event.id, kind: eventKind(event), status: 'retry' });
          } else {
            await this.#failed(event, error);
            results.push({ id: event.id, kind: eventKind(event), status: 'failed' });
          }
        }
      }
      return {
        schema: INTEGRATION_OUTBOX_SCHEMA,
        claimed: events.length,
        sent: results.filter((result) => result.status === 'sent').length,
        retried: results.filter((result) => result.status === 'retry').length,
        failed: results.filter((result) => result.status === 'failed').length,
        results,
      };
    })().finally(() => { this.#running = null; });
    return this.#running;
  }

  async runOnce() { return this.processOnce(); }
  async tick() { return this.processOnce(); }

  start() {
    if (this.#timer) return this;
    this.#timer = setInterval(() => { void this.processOnce().catch(() => {}); }, this.#intervalMs);
    this.#timer.unref?.();
    return this;
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    return this;
  }
}

function boundedName(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 140).trim() : '';
}

export function createContributionOutboxWorker(options) {
  return new ContributionOutboxWorker(options);
}

export const createOutboxWorker = createContributionOutboxWorker;
export const OutboxWorker = ContributionOutboxWorker;
export default ContributionOutboxWorker;
