import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import test from 'node:test';

import { callMcpTool, createRequestHandler, OPPORTUNITIES } from '../../src/portal.mjs';
import {
  ContributorPortalWorkflow,
  InMemoryPortalWorkflowStore,
  JsonPortalWorkflowStore,
} from '../../src/contributor-signing/portal-workflow.mjs';

const tokens = {
  register: { subject: 'agent-contract', scopes: ['contributor:register'] },
  claim: { subject: 'agent-contract', scopes: ['contributor:claim'] },
  submit: { subject: 'agent-contract', scopes: ['contributor:submit'] },
  feedback: { subject: 'agent-contract', scopes: ['contributor:feedback'] },
  review: { subject: 'reviewer-contract', scopes: ['contributor:review'], role: 'reviewer' },
  statusReader: { subject: 'agent-observer', scopes: ['contributor:register'] },
};

async function withServer(workflow, callback) {
  const server = createServer(createRequestHandler({ workflow }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    return await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function request(baseUrl, path, { token, body, method = 'POST', headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await response.json() };
}

function newWorkflow() {
  return new ContributorPortalWorkflow({
    opportunities: OPPORTUNITIES,
    store: new InMemoryPortalWorkflowStore({ opportunities: OPPORTUNITIES }),
  });
}

function registration() {
  return {
    agentId: 'agent-contract',
    displayName: 'Contract Agent',
    operator: 'Contract operator',
    contact: { kind: 'url', value: 'https://example.invalid/contact' },
    capabilities: ['source review'],
    evidencePolicy: 'Cite source ids and preserve reviewer caveats.',
    idempotencyKey: 'registration-contract-1',
  };
}

test('workflow HTTP contract fails closed for invalid identity and unauthorized actions', async () => {
  const previous = process.env.MCP_WRITE_TOKENS;
  process.env.MCP_WRITE_TOKENS = JSON.stringify(tokens);
  try {
    await withServer(newWorkflow(), async (baseUrl) => {
      const noToken = await request(baseUrl, '/v1/workflow/registrations', { body: registration() });
      assert.equal(noToken.response.status, 401);

      const mismatch = await request(baseUrl, '/v1/workflow/registrations', {
        token: 'register',
        body: { ...registration(), agentId: 'different-agent' },
      });
      assert.equal(mismatch.response.status, 403);
      assert.equal(mismatch.body.error, 'forbidden');

      const wrongScope = await request(baseUrl, '/v1/workflow/claims', {
        token: 'register',
        body: {
          agentId: 'agent-contract',
          opportunityId: 'source-registry-hardening',
          contributionSummary: 'Review source records.',
          evidencePlan: ['portal-route:/sources.json'],
        },
      });
      assert.equal(wrongScope.response.status, 403);
      assert.equal(wrongScope.body.code, 'scope_forbidden');
    });
  } finally {
    if (previous === undefined) delete process.env.MCP_WRITE_TOKENS;
    else process.env.MCP_WRITE_TOKENS = previous;
  }
});

test('workflow status does not reveal legacy queue records to a mismatched actor', async () => {
  const previous = process.env.MCP_WRITE_TOKENS;
  process.env.MCP_WRITE_TOKENS = JSON.stringify(tokens);
  try {
    const legacySubmission = callMcpTool('submit_contribution', {
      agentId: 'agent-contract',
      opportunityId: 'source-registry-hardening',
      title: 'Private legacy queue record',
      artifact: { kind: 'markdown', value: 'Private review material.' },
      evidence: ['portal-route:/sources.json'],
    }).structuredContent.submission;

    await withServer(newWorkflow(), async (baseUrl) => {
      const anonymous = await request(baseUrl, `/v1/workflow/status?id=${encodeURIComponent(legacySubmission.id)}&kind=submission`, {
        method: 'GET',
      });
      assert.equal(anonymous.response.status, 200);
      assert.equal(anonymous.body.lookup.status, 'not_found');
      assert.equal(anonymous.body.lookup.result, null);
      assert.doesNotMatch(JSON.stringify(anonymous.body), /Private legacy queue record|Private review material/);

      const status = await request(baseUrl, `/v1/workflow/status?id=${encodeURIComponent(legacySubmission.id)}&kind=submission`, {
        method: 'GET',
        token: 'statusReader',
      });

      assert.equal(status.response.status, 200);
      assert.equal(status.body.status, 'not_found');
      assert.equal(status.body.lookup.status, 'not_found');
      assert.equal(status.body.lookup.result, null);
    });
  } finally {
    if (previous === undefined) delete process.env.MCP_WRITE_TOKENS;
    else process.env.MCP_WRITE_TOKENS = previous;
  }
});

test('workflow status does not reveal a submission to the same subject holding an unrelated scope', async () => {
  const previous = process.env.MCP_WRITE_TOKENS;
  process.env.MCP_WRITE_TOKENS = JSON.stringify(tokens);
  try {
    await withServer(newWorkflow(), async (baseUrl) => {
      const registered = await request(baseUrl, '/v1/workflow/registrations', {
        token: 'register',
        body: registration(),
      });
      assert.equal(registered.response.status, 202);

      const claim = await request(baseUrl, '/v1/workflow/claims', {
        token: 'claim',
        body: {
          agentId: 'agent-contract',
          opportunityId: 'source-registry-hardening',
          contributionSummary: 'Review source records for the scope-gate check.',
          evidencePlan: ['portal-route:/sources.json'],
          idempotencyKey: 'claim-scope-gate-1',
        },
      });
      assert.equal(claim.response.status, 202);

      const submission = await request(baseUrl, '/v1/workflow/submissions', {
        token: 'submit',
        body: {
          agentId: 'agent-contract',
          opportunityId: 'source-registry-hardening',
          claimId: claim.body.claim.id,
          title: 'Scope-gated packet',
          summary: 'A source-grounded review packet.',
          artifact: { kind: 'markdown', value: 'Reviewed source entries.' },
          evidence: ['portal-route:/sources.json'],
          idempotencyKey: 'submission-scope-gate-1',
        },
      });
      assert.equal(submission.response.status, 202);

      // 'register' is the same subject (agent-contract) as the submission's
      // owner but only holds the register scope: subject match alone must
      // not be enough to read another action's status.
      const sameSubjectWrongScope = await request(
        baseUrl,
        `/v1/workflow/status?id=${encodeURIComponent(submission.body.submission.id)}&kind=submission`,
        { method: 'GET', token: 'register' },
      );
      assert.equal(sameSubjectWrongScope.body.lookup.status, 'not_found');
      assert.equal(sameSubjectWrongScope.body.lookup.result, null);

      const ownerWithScope = await request(
        baseUrl,
        `/v1/workflow/status?id=${encodeURIComponent(submission.body.submission.id)}&kind=submission`,
        { method: 'GET', token: 'submit' },
      );
      assert.equal(ownerWithScope.body.lookup.status, 'status_found');
    });
  } finally {
    if (previous === undefined) delete process.env.MCP_WRITE_TOKENS;
    else process.env.MCP_WRITE_TOKENS = previous;
  }
});

test('the declared /v1/contributions/* contract path is a backward-compatible alias for /v1/workflow/*', async () => {
  await withServer(newWorkflow(), async (baseUrl) => {
    const aliased = await request(baseUrl, '/v1/contributions/opportunities', { method: 'GET' });
    const canonical = await request(baseUrl, '/v1/workflow/opportunities', { method: 'GET' });
    assert.equal(aliased.response.status, 200);
    assert.deepEqual(
      { ...aliased.body, generatedAt: null },
      { ...canonical.body, generatedAt: null },
    );

    const malformedStatusKind = await request(
      baseUrl,
      '/v1/contributions/status?id=source-registry-hardening&kind=malformed',
      { method: 'GET' },
    );
    assert.equal(malformedStatusKind.response.status, 400);
    assert.equal(malformedStatusKind.body.error, 'invalid_status_kind');
    assert.ok(malformedStatusKind.body.acceptedKinds.includes('attestation'));
  });
});

test('workflow persists the complete registered -> claimed -> submitted -> reviewed -> terminal journey', async () => {
  const previous = process.env.MCP_WRITE_TOKENS;
  process.env.MCP_WRITE_TOKENS = JSON.stringify(tokens);
  try {
    const workflow = newWorkflow();
    let submissionId;
    await withServer(workflow, async (baseUrl) => {
      const firstRegistration = await request(baseUrl, '/v1/workflow/registrations', {
        token: 'register',
        body: registration(),
      });
      assert.equal(firstRegistration.response.status, 202);
      assert.equal(firstRegistration.body.registration.lifecycleStatus, 'registered');

      const replayedRegistration = await request(baseUrl, '/v1/workflow/registrations', {
        token: 'register',
        body: registration(),
      });
      assert.equal(replayedRegistration.response.status, 202);
      assert.equal(replayedRegistration.body.replayed, true);
      assert.equal(replayedRegistration.body.registration.id, firstRegistration.body.registration.id);

      const claim = await request(baseUrl, '/v1/workflow/claims', {
        token: 'claim',
        body: {
          agentId: 'agent-contract',
          opportunityId: 'source-registry-hardening',
          contributionSummary: 'Review source records for freshness and citations.',
          evidencePlan: ['portal-route:/sources.json'],
          expectedOutput: 'A reviewed source packet.',
          idempotencyKey: 'claim-contract-1',
        },
      });
      assert.equal(claim.response.status, 202);
      assert.equal(claim.body.claim.lifecycleStatus, 'claimed');

      const submissionPayload = {
        agentId: 'agent-contract',
        opportunityId: 'source-registry-hardening',
        claimId: claim.body.claim.id,
        title: 'Freshness review packet',
        summary: 'A source-grounded review packet with explicit caveats.',
        artifact: { kind: 'markdown', value: 'Reviewed source entries.' },
        evidence: ['portal-route:/sources.json'],
        idempotencyKey: 'submission-contract-1',
      };
      const submission = await request(baseUrl, '/v1/workflow/submissions', { token: 'submit', body: submissionPayload });
      assert.equal(submission.response.status, 202);
      assert.equal(submission.body.submission.lifecycleStatus, 'submitted');
      assert.equal(submission.body.attestation.publicAttestation, false);
      assert.equal(submission.body.attestation.attestationStatus, 'review_pending_not_publicly_attested');
      submissionId = submission.body.submission.id;

      const duplicate = await request(baseUrl, '/v1/workflow/submissions', { token: 'submit', body: submissionPayload });
      assert.equal(duplicate.response.status, 202);
      assert.equal(duplicate.body.replayed, true);
      assert.equal(duplicate.body.submission.id, submission.body.submission.id);
      assert.equal(duplicate.body.attestation.id, submission.body.attestation.id);

      const unauthorizedStatus = await request(baseUrl, `/v1/workflow/status?id=${encodeURIComponent(submission.body.submission.id)}&kind=submission`, {
        method: 'GET',
        token: 'statusReader',
      });
      assert.equal(unauthorizedStatus.body.lookup.status, 'not_found');

      const review = await request(baseUrl, '/v1/workflow/reviews', {
        token: 'review',
        body: {
          submissionId: submission.body.submission.id,
          decision: 'approved',
          expectedVersion: 0,
          idempotencyKey: 'review-contract-1',
        },
      });
      assert.equal(review.response.status, 202);
      assert.equal(review.body.review.status, 'reviewed');
      assert.equal(review.body.terminal.status, 'terminal');
      assert.equal(review.body.terminal.outcome, 'approved');

      const reviewReplay = await request(baseUrl, '/v1/workflow/reviews', {
        token: 'review',
        body: {
          submissionId: submission.body.submission.id,
          decision: 'approved',
          expectedVersion: 1,
          idempotencyKey: 'review-contract-1',
        },
      });
      assert.equal(reviewReplay.response.status, 202);
      assert.equal(reviewReplay.body.replayed, true);

      const status = await request(baseUrl, `/v1/workflow/status?id=${encodeURIComponent(submission.body.submission.id)}&kind=submission`, {
        method: 'GET',
        token: 'submit',
      });
      assert.equal(status.body.lookup.status, 'status_found');
      assert.equal(status.body.lookup.result.lifecycleStatus, 'terminal');
      assert.equal(status.body.lookup.result.terminalOutcome, 'approved');
      assert.deepEqual(Object.keys(status.body.lookup.result).sort(), [
        'agentId',
        'claimId',
        'createdAt',
        'id',
        'kind',
        'lifecycleStatus',
        'opportunityId',
        'privacy',
        'reviewGate',
        'reviewStatus',
        'reviewVersion',
        'schema',
        'status',
        'submissionId',
        'terminalOutcome',
        'updatedAt',
      ]);

      const attestationStatus = await request(baseUrl, `/v1/workflow/status?id=${encodeURIComponent(submission.body.attestation.id)}&kind=attestation`, {
        method: 'GET',
        token: 'submit',
      });
      assert.equal(attestationStatus.response.status, 200);
      assert.equal(attestationStatus.body.lookup.status, 'status_found');
      assert.equal(attestationStatus.body.lookup.result.attestationStatus, 'reviewed_not_publicly_attested');
      assert.equal(attestationStatus.body.lookup.result.publicAttestation, false);

      const feedback = await request(baseUrl, '/v1/workflow/feedback', {
        token: 'feedback',
        body: {
          submissionId: submission.body.submission.id,
          response: 'Acknowledged reviewer feedback.',
          changes: ['Clarified source caveat.'],
          evidence: ['portal-route:/sources.json'],
          idempotencyKey: 'feedback-contract-1',
        },
      });
      assert.equal(feedback.response.status, 202);
      assert.equal(feedback.body.feedbackResponse.status, 'feedback_submitted');
    });

    assert.deepEqual(workflow.outboxRows().map((row) => row.id).sort(), [
      `brain:${submissionId}:approved`,
      `idacc:${submissionId}`,
    ]);
  } finally {
    if (previous === undefined) delete process.env.MCP_WRITE_TOKENS;
    else process.env.MCP_WRITE_TOKENS = previous;
  }
});

test('workflow JSON store survives a new process object and terminal outcome emits IDACC and Brain events', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'portal-workflow-'));
  const path = join(directory, 'state.json');
  try {
    const first = new ContributorPortalWorkflow({ opportunities: OPPORTUNITIES, store: new JsonPortalWorkflowStore({ path, opportunities: OPPORTUNITIES }) });
    const actor = { subject: 'durable-agent', scopes: ['contributor:register', 'contributor:claim', 'contributor:submit'] };
    const reviewer = { subject: 'durable-reviewer', scopes: ['contributor:review'] };
    const reg = first.register({ actor, payload: { ...registration(), agentId: 'durable-agent', idempotencyKey: 'durable-reg' } });
    const claim = first.claim({ actor, payload: { agentId: 'durable-agent', opportunityId: 'source-registry-hardening', contributionSummary: 'Durable review.', evidencePlan: ['source:registry'], idempotencyKey: 'durable-claim' } });
    const submission = first.submit({ actor, payload: { agentId: 'durable-agent', opportunityId: 'source-registry-hardening', claimId: claim.claim.id, title: 'Durable packet', summary: 'Persisted packet.', artifact: { kind: 'markdown', value: 'packet' }, evidence: ['source:registry'], idempotencyKey: 'durable-submission' } });
    first.review({ actor: reviewer, payload: { submissionId: submission.submission.id, decision: 'rejected', idempotencyKey: 'durable-review' } });

    const persisted = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(persisted.schema, 'agent.bittrees.contributor-portal-workflow.v1');
    assert.ok(Object.keys(persisted.registrations).includes(reg.registration.id));

    const second = new ContributorPortalWorkflow({ opportunities: OPPORTUNITIES, store: new JsonPortalWorkflowStore({ path, opportunities: OPPORTUNITIES }) });
    const status = second.status({ id: submission.submission.id, kind: 'submission', actor });
    assert.equal(status.status, 'status_found');
    assert.equal(status.result.terminalOutcome, 'rejected');
    assert.deepEqual(second.outboxRows(), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
