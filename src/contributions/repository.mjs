import { buildSubmissionId, createOpaqueId, stableStringify } from './domain.mjs';

function clone(value) {
  return structuredClone(value);
}

function nowIso(clock) {
  return typeof clock === 'function' ? clock() : new Date().toISOString();
}

function createEmptyState() {
  return {
    submissions: new Map(),
    idempotency: new Map(),
    reviews: new Map(),
    idaccTaskLinks: new Map(),
    integrationOutbox: new Map(),
    integrationAuditEvents: [],
  };
}

function cloneMap(sourceMap) {
  return new Map([...sourceMap.entries()].map(([key, value]) => [key, clone(value)]));
}

function cloneState(state) {
  return {
    submissions: cloneMap(state.submissions),
    idempotency: cloneMap(state.idempotency),
    reviews: cloneMap(state.reviews),
    idaccTaskLinks: cloneMap(state.idaccTaskLinks),
    integrationOutbox: cloneMap(state.integrationOutbox),
    integrationAuditEvents: state.integrationAuditEvents.map((entry) => clone(entry)),
  };
}

function findOutboxEventByDedupeKey(snapshot, dedupeKey) {
  for (const event of snapshot.integrationOutbox.values()) {
    if (event.dedupeKey === dedupeKey) return event;
  }

  return null;
}

function createTxHelpers(snapshot, clock) {
  return {
    getSubmissionById(submissionId) {
      return snapshot.submissions.get(submissionId) ?? null;
    },
    listSubmissions() {
      return [...snapshot.submissions.values()].map((submission) => clone(submission));
    },
    getSubmissionByIdempotencyKey(subject, idempotencyKey) {
      return snapshot.idempotency.get(`${subject}::${idempotencyKey}`) ?? null;
    },
    setSubmissionByIdempotencyKey(subject, idempotencyKey, record) {
      snapshot.idempotency.set(`${subject}::${idempotencyKey}`, clone(record));
    },
    insertSubmission(submission) {
      snapshot.submissions.set(submission.id, clone(submission));
      return clone(submission);
    },
    updateSubmission(submissionId, mutator) {
      const existing = snapshot.submissions.get(submissionId);
      if (!existing) return null;
      const nextSubmission = clone(mutator(clone(existing)));
      snapshot.submissions.set(submissionId, nextSubmission);
      return clone(nextSubmission);
    },
    appendReview(submissionId, reviewRecord) {
      const reviews = snapshot.reviews.get(submissionId) ?? [];
      reviews.push(clone(reviewRecord));
      snapshot.reviews.set(submissionId, reviews);
      return clone(reviewRecord);
    },
    listReviews(submissionId) {
      return (snapshot.reviews.get(submissionId) ?? []).map((entry) => clone(entry));
    },
    insertIdaccTaskLink(linkRecord) {
      snapshot.idaccTaskLinks.set(linkRecord.submissionId, clone(linkRecord));
      return clone(linkRecord);
    },
    updateIdaccTaskLink(submissionId, mutator) {
      const existing = snapshot.idaccTaskLinks.get(submissionId);
      if (!existing) return null;
      const next = clone(mutator(clone(existing)));
      snapshot.idaccTaskLinks.set(submissionId, next);
      return clone(next);
    },
    getIdaccTaskLink(submissionId) {
      return snapshot.idaccTaskLinks.get(submissionId) ?? null;
    },
    enqueueIntegrationOutbox(event) {
      const existing = findOutboxEventByDedupeKey(snapshot, event.dedupeKey);
      if (existing) return clone(existing);

      const nextEvent = {
        ...clone(event),
        availableAt: event.availableAt ?? event.createdAt ?? nowIso(clock),
      };
      snapshot.integrationOutbox.set(nextEvent.id, nextEvent);
      return clone(nextEvent);
    },
    updateIntegrationOutbox(eventId, mutator) {
      const existing = snapshot.integrationOutbox.get(eventId);
      if (!existing) return null;
      const next = clone(mutator(clone(existing)));
      snapshot.integrationOutbox.set(eventId, next);
      return clone(next);
    },
    leaseIntegrationOutbox({ kind = null, limit = 1, leaseOwner = 'service', leaseMs = 30_000 } = {}) {
      const leasedAt = nowIso(clock);
      const leasedUntilMs = Date.parse(leasedAt) + leaseMs;
      const leasedUntil = new Date(leasedUntilMs).toISOString();
      const nowMs = Date.parse(leasedAt);
      const leased = [];

      for (const event of snapshot.integrationOutbox.values()) {
        if (leased.length >= limit) break;
        if (event.state !== 'ready') continue;
        if (kind && event.kind !== kind) continue;
        if (event.availableAt && Date.parse(event.availableAt) > nowMs) continue;
        if (event.leasedUntil && Date.parse(event.leasedUntil) > nowMs) continue;

        const next = {
          ...event,
          state: 'leased',
          leaseOwner,
          leasedAt,
          leasedUntil,
          leaseCount: (event.leaseCount ?? 0) + 1,
          updatedAt: leasedAt,
        };
        snapshot.integrationOutbox.set(event.id, next);
        leased.push(clone(next));
      }

      return leased;
    },
    recordIntegrationAuditEvent(event) {
      snapshot.integrationAuditEvents.push(clone(event));
      return clone(event);
    },
    listIntegrationAuditEvents() {
      return snapshot.integrationAuditEvents.map((event) => clone(event));
    },
  };
}

function createInMemoryRepository(initialState = {}, clock = () => new Date().toISOString()) {
  const state = createEmptyState();
  const transactionState = { chain: Promise.resolve() };

  if (Array.isArray(initialState.submissions)) {
    for (const submission of initialState.submissions) {
      state.submissions.set(submission.id, clone(submission));
    }
  }

  if (Array.isArray(initialState.reviews)) {
    for (const review of initialState.reviews) {
      const list = state.reviews.get(review.submissionId) ?? [];
      list.push(clone(review));
      state.reviews.set(review.submissionId, list);
    }
  }

  if (Array.isArray(initialState.integrationAuditEvents)) {
    state.integrationAuditEvents.push(...initialState.integrationAuditEvents.map((event) => clone(event)));
  }

  if (Array.isArray(initialState.integrationOutbox)) {
    for (const event of initialState.integrationOutbox) {
      state.integrationOutbox.set(event.id, clone(event));
    }
  }

  if (Array.isArray(initialState.idaccTaskLinks)) {
    for (const link of initialState.idaccTaskLinks) {
      state.idaccTaskLinks.set(link.submissionId, clone(link));
    }
  }

  if (Array.isArray(initialState.idempotency)) {
    for (const entry of initialState.idempotency) {
      state.idempotency.set(entry.key, clone(entry));
    }
  }

  function commitSnapshot(snapshot) {
    state.submissions = snapshot.submissions;
    state.idempotency = snapshot.idempotency;
    state.reviews = snapshot.reviews;
    state.idaccTaskLinks = snapshot.idaccTaskLinks;
    state.integrationOutbox = snapshot.integrationOutbox;
    state.integrationAuditEvents = snapshot.integrationAuditEvents;
  }

  async function transaction(work) {
    const run = transactionState.chain.then(async () => {
      const snapshot = cloneState(state);
      const tx = createTxHelpers(snapshot, clock);
      const result = await work(tx);
      commitSnapshot(snapshot);
      return result;
    });

    transactionState.chain = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  function snapshot() {
    return cloneState(state);
  }

  return {
    transaction,
    snapshot,
    async getSubmissionById(submissionId) {
      return clone(state.submissions.get(submissionId) ?? null);
    },
    async getSubmissionByIdempotencyKey(subject, idempotencyKey) {
      return clone(state.idempotency.get(`${subject}::${idempotencyKey}`) ?? null);
    },
    async listSubmissions() {
      return [...state.submissions.values()].map((submission) => clone(submission));
    },
    async listReviews(submissionId) {
      return (state.reviews.get(submissionId) ?? []).map((entry) => clone(entry));
    },
    async getIdaccTaskLink(submissionId) {
      return clone(state.idaccTaskLinks.get(submissionId) ?? null);
    },
    async listIntegrationOutbox(kind = null) {
      const events = [...state.integrationOutbox.values()];
      return (kind ? events.filter((event) => event.kind === kind) : events).map((event) => clone(event));
    },
    async listIntegrationAuditEvents() {
      return state.integrationAuditEvents.map((event) => clone(event));
    },
  };
}

export const CONTRIBUTION_SCHEMA_SQL = Object.freeze([
  `
CREATE TABLE IF NOT EXISTS contribution_submissions (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  version INTEGER NOT NULL,
  status_receipt TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  submitter_subject TEXT NOT NULL,
  request_json JSONB NOT NULL,
  redacted_json JSONB NOT NULL,
  idacc_json JSONB,
  review_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);`,
  `
CREATE TABLE IF NOT EXISTS submission_idempotency (
  submitter_subject TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  submission_id TEXT NOT NULL REFERENCES contribution_submissions(id) ON DELETE CASCADE,
  status_receipt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (submitter_subject, idempotency_key)
);`,
  `
CREATE TABLE IF NOT EXISTS submission_reviews (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES contribution_submissions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  decision TEXT NOT NULL,
  notes TEXT,
  evidence JSONB NOT NULL,
  reviewer_subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);`,
  `
CREATE TABLE IF NOT EXISTS idacc_task_links (
  submission_id TEXT PRIMARY KEY REFERENCES contribution_submissions(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL UNIQUE,
  task_id TEXT,
  task_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);`,
  `
CREATE TABLE IF NOT EXISTS integration_outbox (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  state TEXT NOT NULL,
  lease_owner TEXT,
  leased_at TIMESTAMPTZ,
  leased_until TIMESTAMPTZ,
  lease_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);`,
  `
CREATE TABLE IF NOT EXISTS integration_audit_events (
  id TEXT PRIMARY KEY,
  submission_id TEXT,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);`,
]);

export function createSqlContributionRepository({ client } = {}) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A PostgreSQL client with a query method is required for the SQL repository adapter.');
  }

  async function query(sql, params = []) {
    return client.query(sql, params);
  }

  return {
    async transaction(work) {
      await query('BEGIN');
      try {
        const tx = {
          async raw(sql, params = []) {
            return query(sql, params);
          },
        };
        const result = await work(tx);
        await query('COMMIT');
        return result;
      } catch (error) {
        await query('ROLLBACK').catch(() => {});
        throw error;
      }
    },
    async getSubmissionById(submissionId) {
      const { rows } = await query('SELECT * FROM contribution_submissions WHERE id = $1', [submissionId]);
      return rows[0] ?? null;
    },
    async getSubmissionByIdempotencyKey(subject, idempotencyKey) {
      const { rows } = await query(
        'SELECT * FROM submission_idempotency WHERE submitter_subject = $1 AND idempotency_key = $2',
        [subject, idempotencyKey],
      );
      return rows[0] ?? null;
    },
    async listSubmissions() {
      const { rows } = await query('SELECT * FROM contribution_submissions ORDER BY created_at ASC');
      return rows;
    },
    async listReviews(submissionId) {
      const { rows } = await query('SELECT * FROM submission_reviews WHERE submission_id = $1 ORDER BY created_at ASC', [submissionId]);
      return rows;
    },
    async getIdaccTaskLink(submissionId) {
      const { rows } = await query('SELECT * FROM idacc_task_links WHERE submission_id = $1', [submissionId]);
      return rows[0] ?? null;
    },
    async listIntegrationOutbox(kind = null) {
      if (kind) {
        const { rows } = await query('SELECT * FROM integration_outbox WHERE kind = $1 ORDER BY created_at ASC', [kind]);
        return rows;
      }
      const { rows } = await query('SELECT * FROM integration_outbox ORDER BY created_at ASC');
      return rows;
    },
    async listIntegrationAuditEvents() {
      const { rows } = await query('SELECT * FROM integration_audit_events ORDER BY created_at ASC');
      return rows;
    },
  };
}

export function createContributionRepository(options = {}) {
  if (options.mode === 'postgres') {
    return createSqlContributionRepository(options);
  }

  return createInMemoryRepository(options.initialState, options.clock);
}

export { buildSubmissionId, createOpaqueId, stableStringify };
