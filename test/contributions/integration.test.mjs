import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ManagerTaskClient,
  ManagerBridgeError,
} from '../../src/contributions/idacc.mjs';
import {
  BrainTerminalSummaryClient,
  BrainSourceValidationError,
  sanitizeTerminalSummary,
} from '../../src/contributions/brain.mjs';
import {
  BrainOutboxWorker,
  InMemoryBrainOutboxStore,
} from '../../src/contributions/outbox.mjs';

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const approved = {
  submissionId: 'sub_01',
  reviewDecision: 'approved',
  title: 'Implement a contributor workflow',
  summary: 'A reviewed implementation packet with tests.',
  lane: 'engineering',
  sourceIds: ['memory:3595'],
  artifacts: ['./output/report.md'],
};

test('ManagerTaskClient creates one bounded task and never claims or completes it', async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    if (init.method === 'GET') return response(404, { error: 'not found' });
    assert.equal(init.method, 'POST');
    return response(201, { task: { name: requests.at(-1).body.name, status: 'doing', title: requests.at(-1).body.title, shortId: '#private' } });
  };
  const client = new ManagerTaskClient({ fetchImpl, baseUrl: 'http://manager.test' });
  const result = await client.createTask(approved);
  assert.equal(result.created, true);
  assert.equal(result.status, 'doing');
  assert.equal(requests.filter((request) => request.init.method === 'POST').length, 1);
  assert.match(requests.at(-1).body.description, /Out of scope: task claim\/done/);
  assert.doesNotMatch(requests.at(-1).body.description, /memory:3595/);
  assert.equal(requests.some((request) => /claim|done/.test(request.url)), false);
  assert.equal(result.managerRef, '#private');
});

test('ManagerTaskClient fails closed before reviewer approval', async () => {
  const client = new ManagerTaskClient({ fetchImpl: async () => response(500, {}) });
  await assert.rejects(() => client.createTask({ ...approved, reviewDecision: 'pending' }), (error) => {
    assert.equal(error.code, 'review_required');
    assert.equal(error.retryable, false);
    return true;
  });
});

test('Brain terminal summary validates sources and writes a keyed, redacted memory', async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/sources/validate')) return response(200, { sources: [{ source_id: 'memory:3595', valid: true }] });
    return response(200, { ok: true, memoryId: 12345 });
  };
  const client = new BrainTerminalSummaryClient({ fetchImpl, baseUrl: 'http://brain.test' });
  const result = await client.publish({
    ...approved,
    decision: 'approved',
    summary: 'Use api_key=secret-value; deliver a reviewed packet.',
    managerTask: { status: 'done', ref: '#private-manager-ref' },
  });
  assert.equal(result.ok, true);
  assert.equal(requests[0].url, 'http://brain.test/sources/validate');
  assert.equal(requests[1].url, 'http://brain.test/memory/manager');
  assert.equal(requests[1].body.shared, true);
  assert.match(requests[1].body.content, /\[redacted\]/);
  assert.doesNotMatch(requests[1].body.content, /secret-value|private-manager-ref/);
  assert.match(requests[1].body.key, /^contribution-terminal:/);
  assert.equal(requests[1].body.durable_candidate.source_ids[0], 'memory:3595');
  assert.equal(requests[1].body.memoryId, undefined);
});

test('Brain terminal summary rejects unresolved sources before writeback', async () => {
  let writes = 0;
  const client = new BrainTerminalSummaryClient({
    fetchImpl: async (url) => {
      if (url.endsWith('/sources/validate')) return response(200, { sources: [{ source_id: 'memory:missing', valid: false }] });
      writes += 1;
      return response(200, {});
    },
  });
  await assert.rejects(() => client.publish({ ...approved, decision: 'rejected', sourceIds: ['memory:missing'] }), BrainSourceValidationError);
  assert.equal(writes, 0);
});

test('BrainOutboxWorker sends, retries transient failures, and dead-letters after max attempts', async () => {
  const store = new InMemoryBrainOutboxStore();
  store.enqueue({ submissionId: 'sub-ok', decision: 'approved', summary: 'ok' }, { eventKey: 'ok', availableAt: 0 });
  store.enqueue({ submissionId: 'sub-retry', decision: 'approved', summary: 'retry' }, { eventKey: 'retry', availableAt: 0 });
  let calls = 0;
  const worker = new BrainOutboxWorker({
    outbox: store,
    brainClient: {
      publish: async (payload) => {
        calls += 1;
        if (payload.submissionId === 'sub-retry') {
          const error = new Error('temporary brain outage');
          error.retryable = true;
          throw error;
        }
        return { ok: true, eventKey: payload.eventKey };
      },
    },
    clock: () => 1000,
    baseDelayMs: 20,
    maxAttempts: 1,
  });
  const result = await worker.processOnce();
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.retried, 0);
  assert.equal(calls, 2);
  assert.deepEqual(store.rows().map((row) => row.status).sort(), ['failed', 'sent']);
});

test('sanitizeTerminalSummary exposes only terminal, public-safe fields', () => {
  const summary = sanitizeTerminalSummary({ ...approved, decision: 'rejected', summary: 'password=hunter2' });
  assert.equal(summary.publicSafe, true);
  assert.equal(summary.decision, 'rejected');
  assert.match(summary.summary, /\[redacted\]/);
  assert.equal(summary.correlationKey.length, 64);
  assert.equal(summary.manager.taskKey, null);
});

test('manager transport errors are retryable', async () => {
  const client = new ManagerTaskClient({ fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(() => client.createTask(approved), (error) => {
    assert.equal(error, error);
    assert.equal(error instanceof ManagerBridgeError, true);
    assert.equal(error.code, 'manager_unavailable');
    assert.equal(error.retryable, true);
    return true;
  });
});
