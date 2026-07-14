import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ContributionAuthorizationError,
  ContributionConflictError,
  ContributionService,
  InMemoryContributionOutbox,
} from '../../src/contributions/service.mjs';

const contributor = { subject: 'agent-acceptance', scopes: ['contributor:submit'] };
const reviewer = { subject: 'owner-acceptance', scopes: ['contributor:review'] };
const payload = {
  title: 'Acceptance matrix contribution',
  summary: 'A source-grounded packet used to verify the contribution service.',
  opportunityId: 'source-registry-hardening',
  sourceIds: ['memory:3595'],
  artifacts: [{ kind: 'markdown', value: 'redacted artifact metadata' }],
};

function service() {
  return new ContributionService({ outbox: new InMemoryContributionOutbox(), clock: () => 1_735_689_600_000 });
}

test('submission idempotency is actor-bound and returns the original receipt', () => {
  const domain = service();
  const first = domain.submit({ actor: contributor, idempotencyKey: 'matrix-1', payload });
  const replay = domain.submit({ actor: contributor, idempotencyKey: 'matrix-1', payload });

  assert.equal(first.created, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.receiptId, first.receiptId);
  assert.throws(
    () => domain.submit({ actor: contributor, idempotencyKey: 'matrix-1', payload: { ...payload, title: 'different' } }),
    (error) => error.code === 'idempotency_conflict' && error.status === 409,
  );
});

test('submission authorization and sensitive-payload gates fail closed', () => {
  const domain = service();
  assert.throws(() => domain.submit({ idempotencyKey: 'matrix-auth', payload }), ContributionAuthorizationError);
  assert.throws(
    () => domain.submit({ actor: { subject: 'agent', scopes: ['contributor:read'] }, idempotencyKey: 'matrix-auth', payload }),
    (error) => error.code === 'scope_forbidden' && error.status === 403,
  );
  assert.throws(
    () => domain.submit({ actor: contributor, idempotencyKey: 'matrix-secret', payload: { ...payload, summary: 'private key 0x1234' } }),
    (error) => error.code === 'sensitive_payload' && error.status === 422,
  );
});

test('review gate keeps submissions queued and only reviewer decisions enqueue integrations', () => {
  const domain = service();
  const submitted = domain.submit({ actor: contributor, idempotencyKey: 'matrix-review', payload });
  assert.equal(submitted.status, 'queued_for_review');
  assert.deepEqual(domain.outboxRows(), []);
  assert.throws(
    () => domain.review({ actor: contributor, submissionId: submitted.receiptId, decision: 'approved', expectedVersion: 0 }),
    (error) => error.code === 'review_forbidden' && error.status === 403,
  );

  const reviewed = domain.review({ actor: reviewer, submissionId: submitted.receiptId, decision: 'approved', expectedVersion: 0 });
  assert.equal(reviewed.projection.status, 'approved');
  assert.deepEqual(domain.outboxRows().map((row) => row.kind).sort(), ['brain_terminal_summary', 'idacc_task_create']);
});

test('concurrent review uses an optimistic version and terminal replay is idempotent', () => {
  const domain = service();
  const submitted = domain.submit({ actor: contributor, idempotencyKey: 'matrix-concurrency', payload });
  domain.review({ actor: reviewer, submissionId: submitted.receiptId, decision: 'rejected', expectedVersion: 0 });
  assert.throws(
    () => domain.review({ actor: { ...reviewer, subject: 'second-reviewer' }, submissionId: submitted.receiptId, decision: 'approved', expectedVersion: 0 }),
    (error) => error instanceof ContributionConflictError && error.code === 'concurrent_review',
  );
  const replay = domain.review({ actor: reviewer, submissionId: submitted.receiptId, decision: 'rejected', expectedVersion: 1 });
  assert.equal(replay.replayed, true);
});

test('status projection is private to a submit-scoped owner or reviewer', () => {
  const domain = service();
  const submitted = domain.submit({ actor: contributor, idempotencyKey: 'matrix-status', payload });
  const owner = domain.loadStatusProjection({ id: submitted.receiptId, kind: 'submission', actor: contributor });
  const foreign = domain.loadStatusProjection({ id: submitted.receiptId, kind: 'submission', actor: { subject: 'other', scopes: ['contributor:submit'] } });
  const registerOnly = domain.loadStatusProjection({
    id: submitted.receiptId,
    kind: 'submission',
    actor: { subject: contributor.subject, scopes: ['contributor:register'] },
  });
  const anonymous = domain.loadStatusProjection({ id: submitted.receiptId, kind: 'submission' });
  const reviewerLookup = domain.loadStatusProjection({
    id: `att_${submitted.receiptId}`,
    kind: 'attestation',
    actor: reviewer,
  });

  assert.equal(owner.status, 'status_found');
  assert.equal(owner.result.status, 'queued_for_review');
  assert.equal(foreign.status, 'not_found');
  assert.equal(registerOnly.status, 'not_found');
  assert.equal(registerOnly.result, null);
  assert.equal(anonymous.status, 'not_found');
  assert.equal(anonymous.result, null);
  assert.equal(reviewerLookup.status, 'status_found');
  assert.equal(reviewerLookup.result.submissionId, submitted.receiptId);
  assert.equal(reviewerLookup.result.reviewGate.productionMutationAllowed, false);
});

test('unknown and wrong-kind status lookups do not disclose submission existence', () => {
  const domain = service();
  const submitted = domain.submit({ actor: contributor, idempotencyKey: 'matrix-privacy', payload });
  assert.equal(domain.loadStatusProjection({ id: submitted.receiptId, kind: 'opportunity' }).status, 'not_found');
  assert.equal(domain.loadStatusProjection({ id: 'sub_missing', kind: 'any' }).status, 'not_found');
});
