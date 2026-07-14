import { BrainTerminalSummaryError } from './brain.mjs';

export const BRAIN_OUTBOX_SCHEMA = 'agent.bittrees.contribution.brain-outbox.v1';

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nowMs(clock) {
  const value = typeof clock === 'function' ? clock() : Date.now();
  return Number.isFinite(Number(value)) ? Number(value) : Date.now();
}

function attemptsFor(item) {
  return Math.max(0, Number(item?.attempts ?? item?.attempt_count ?? item?.retryCount ?? 0) || 0);
}

function itemPayload(item) {
  return item?.payload ?? item?.event ?? item?.body ?? item;
}

async function callStore(store, names, ...args) {
  for (const name of names) {
    if (typeof store?.[name] === 'function') return store[name](...args);
  }
  throw new TypeError(`outbox store must implement one of: ${names.join(', ')}`);
}

export class InMemoryBrainOutboxStore {
  #rows = new Map();
  #sequence = 0;

  enqueue(payload, { id, availableAt = Date.now(), eventKey } = {}) {
    const key = String(eventKey ?? payload?.eventKey ?? payload?.event_key ?? id ?? `event-${++this.#sequence}`);
    const existing = [...this.#rows.values()].find((row) => row.eventKey === key);
    if (existing) return { ...existing };
    const row = {
      id: String(id ?? `outbox-${++this.#sequence}`),
      eventKey: key,
      payload,
      status: 'pending',
      attempts: 0,
      availableAt: Number.isFinite(Number(availableAt)) ? Number(availableAt) : Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.#rows.set(row.id, row);
    return { ...row };
  }

  async claimBatch({ limit = 10, now = Date.now(), leaseMs = 30000 } = {}) {
    const rows = [...this.#rows.values()]
      .filter((row) => ['pending', 'retry'].includes(row.status) && row.availableAt <= now)
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(0, positiveInt(limit, 10));
    return rows.map((row) => {
      row.status = 'processing';
      row.attempts += 1;
      row.leaseUntil = now + positiveInt(leaseMs, 30000);
      row.updatedAt = now;
      return { ...row };
    });
  }

  async markSent(id, result = {}) {
    const row = this.#rows.get(String(id));
    if (!row) return false;
    row.status = 'sent';
    row.result = result;
    row.updatedAt = Date.now();
    return true;
  }

  async markRetry(id, { nextAttemptAt, error, retryAt } = {}) {
    const row = this.#rows.get(String(id));
    if (!row) return false;
    row.status = 'retry';
    row.availableAt = Number(nextAttemptAt ?? retryAt ?? Date.now());
    row.error = error;
    row.updatedAt = Date.now();
    return true;
  }

  async markFailed(id, { error } = {}) {
    const row = this.#rows.get(String(id));
    if (!row) return false;
    row.status = 'failed';
    row.error = error;
    row.updatedAt = Date.now();
    return true;
  }

  rows() { return [...this.#rows.values()].map((row) => ({ ...row })); }
}

export class BrainOutboxWorker {
  #store;
  #brain;
  #clock;
  #timer = null;
  #processing = null;
  #limit;
  #leaseMs;
  #maxAttempts;
  #baseDelayMs;
  #maxDelayMs;
  #intervalMs;
  #logger;

  constructor({
    outbox,
    store,
    brainClient,
    brain,
    clock = () => Date.now(),
    batchSize = 10,
    limit,
    leaseMs = 30000,
    maxAttempts = 5,
    baseDelayMs = 1000,
    maxDelayMs = 300000,
    intervalMs = 10000,
    logger = console,
  } = {}) {
    this.#store = outbox ?? store;
    this.#brain = brainClient ?? brain;
    if (!this.#store) throw new TypeError('outbox store is required');
    if (!this.#brain || typeof this.#brain.publish !== 'function') throw new TypeError('brainClient.publish is required');
    this.#clock = clock;
    this.#limit = positiveInt(limit ?? batchSize, 10);
    this.#leaseMs = positiveInt(leaseMs, 30000);
    this.#maxAttempts = positiveInt(maxAttempts, 5);
    this.#baseDelayMs = positiveInt(baseDelayMs, 1000);
    this.#maxDelayMs = positiveInt(maxDelayMs, 300000);
    this.#intervalMs = positiveInt(intervalMs, 10000);
    this.#logger = logger ?? console;
  }

  async #claim(now) {
    return callStore(this.#store, ['claimBatch', 'claimPending', 'leasePending'], {
      limit: this.#limit,
      now,
      leaseMs: this.#leaseMs,
      leaseUntil: now + this.#leaseMs,
    });
  }

  async #sent(item, result) {
    return callStore(this.#store, ['markSent', 'complete', 'ack'], item.id, result);
  }

  async #retry(item, error, nextAttemptAt) {
    return callStore(this.#store, ['markRetry', 'scheduleRetry', 'retry'], item.id, {
      attempts: attemptsFor(item),
      nextAttemptAt,
      retryAt: nextAttemptAt,
      error: String(error?.message ?? error).slice(0, 500),
    });
  }

  async #failed(item, error) {
    return callStore(this.#store, ['markFailed', 'deadLetter', 'fail'], item.id, {
      attempts: attemptsFor(item),
      error: String(error?.message ?? error).slice(0, 500),
    });
  }

  async #processItem(item, now) {
    try {
      const result = await this.#brain.publish(itemPayload(item));
      await this.#sent(item, result);
      return { id: item.id, status: 'sent', result };
    } catch (error) {
      const attempts = attemptsFor(item);
      const retryable = error?.retryable === true || (error instanceof BrainTerminalSummaryError && error.retryable);
      if (retryable && attempts < this.#maxAttempts) {
        const delay = Math.min(this.#maxDelayMs, this.#baseDelayMs * (2 ** Math.max(0, attempts - 1)));
        const nextAttemptAt = now + delay;
        await this.#retry(item, error, nextAttemptAt);
        return { id: item.id, status: 'retry', attempts, nextAttemptAt, error: String(error?.message ?? error) };
      }
      await this.#failed(item, error);
      return { id: item.id, status: 'failed', attempts, error: String(error?.message ?? error) };
    }
  }

  async processOnce() {
    if (this.#processing) return this.#processing;
    this.#processing = (async () => {
      const now = nowMs(this.#clock);
      const claimed = await this.#claim(now);
      const rows = Array.isArray(claimed) ? claimed : claimed?.items ?? claimed?.rows ?? [];
      const results = [];
      for (const item of rows) results.push(await this.#processItem(item, now));
      return {
        schema: BRAIN_OUTBOX_SCHEMA,
        claimed: rows.length,
        sent: results.filter((result) => result.status === 'sent').length,
        retried: results.filter((result) => result.status === 'retry').length,
        failed: results.filter((result) => result.status === 'failed').length,
        results,
      };
    })().catch((error) => {
      this.#logger?.error?.('[contribution Brain outbox] batch failed', error);
      throw error;
    }).finally(() => { this.#processing = null; });
    return this.#processing;
  }

  async runOnce() {
    return this.processOnce();
  }

  async tick() {
    return this.processOnce();
  }

  async processPending() {
    return this.processOnce();
  }

  start() {
    if (this.#timer) return this;
    this.#timer = setInterval(() => {
      void this.processOnce().catch(() => {});
    }, this.#intervalMs);
    this.#timer.unref?.();
    return this;
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    return this;
  }
}

export function createBrainOutboxWorker(options) {
  return new BrainOutboxWorker(options);
}

export const BrainOutbox = BrainOutboxWorker;
