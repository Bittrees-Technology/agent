import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequestHandler as createAppRequestHandler } from '../src/app.mjs';
import { createContributionRequestHandler, createContributionWorkflowService } from '../src/contributions/index.mjs';
import { createContributionRepository } from '../src/contributions/repository.mjs';
import { createContributionOutboxWorker } from '../src/contributions/outbox-worker.mjs';
import { createBrainClient } from '../src/integrations/brain-client.mjs';
import { createIdaccManagerClient } from '../src/integrations/idacc-manager-client.mjs';

const CONTRIBUTION_PAYLOAD = {
  schema: 'agent.bittrees.contribution-submission.v1',
  intentId: 'intent-2026-07-13-bridge-01',
  submittedAt: '2026-07-13T00:00:00.000Z',
  contributor: {
    kind: 'agent',
    name: 'Bridge Agent',
    agentId: 'bridge-agent',
    team: 'engineering-team',
    contactRoute: 'https://example.test/contact',
  },
  targetLane: 'inc-ops-governance',
  summary: 'Implement the contributor workflow service API surface and durable outbox adapters.',
  proposedTemplate: 'contribution-task',
  handoff: {
    requestedOwnerRoute: 'owning-review-route',
    goalId: 'goal_plan_rzit49',
    expectedOutput: 'Durable contribution workflow API surface with tests',
    acceptanceCriteria: [
      'Submission intake is persisted.',
      'Review decisions are recorded.',
    ],
    outOfScope: [
      'Public deployment',
      'Credential handling',
    ],
    backlogPolicy: 'Backlog follow-ups are recorded but not auto-implemented.',
    sourceIds: [
      'memory:3821',
      'entity:task:828f216d-be33-4406-87aa-f569134d57fa',
      'text:27875',
    ],
  },
  safety: {
    noSecretsIncluded: true,
    noLiveWriteAcknowledged: true,
    noOnchainActionRequested: true,
  },
};

function mockRequest({ method = 'GET', path = '/', headers = {}, body } = {}) {
  return {
    method,
    url: path,
    headers: {
      host: '127.0.0.1',
      ...headers,
    },
    body,
    resume() {},
  };
}

function mockResponse() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    headersSent: false,
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headersSent = true;
      Object.assign(this.headers, headers);
    },
    end(chunk) {
      if (chunk === undefined || chunk === null) return;
      this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    },
  };
}

function jsonFetchResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() {
      return body === undefined ? '' : JSON.stringify(body);
    },
  };
}

async function withEnv(env, callback) {
  const previousValues = new Map(Object.keys(env).map((key) => [key, process.env[key]]));

  try {
    for (const [key, value] of Object.entries(env)) {
      process.env[key] = value;
    }

    return await callback();
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('IDACC manager client only exposes bounded task creation and lookup', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({
      url,
      init: {
        ...init,
        body: init.body ?? null,
      },
    });

    if (init.method === 'POST') {
      return jsonFetchResponse(409, { error: 'conflict' });
    }

    return jsonFetchResponse(200, {
      name: 'bittrees-submission-bridge-agent',
      uuid: 'task-123',
      status: 'done',
      updatedAt: '2026-07-13T00:05:00.000Z',
    });
  };

  const client = createIdaccManagerClient({
    baseUrl: 'http://manager.test',
    team: 'engineering-team',
    fetchImpl,
  });

  const task = await client.createBoundedTask({
    name: 'bittrees-submission-bridge-agent',
    title: 'Bridge task',
    description: 'This description is intentionally ignored by the allowlist.',
    team: 'engineering-team',
  });

  assert.deepEqual(task, {
    name: 'bittrees-submission-bridge-agent',
    uuid: 'task-123',
    status: 'done',
  });

  assert.equal(typeof client.createBoundedTask, 'function');
  assert.equal(typeof client.getTask, 'function');
  assert.equal(Object.keys(client).length, 2);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://manager.test/tasks');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['X-Id-Team'], 'engineering-team');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    title: 'Bridge task',
    name: 'bittrees-submission-bridge-agent',
    from: 'portal-submission-bridge',
  });

  assert.equal(calls[1].url, 'http://manager.test/tasks/bittrees-submission-bridge-agent');
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[1].init.headers['X-Id-Team'], 'engineering-team');
});

test('Brain client stores a redacted contribution terminal summary', async () => {
  const calls = [];
  const client = createBrainClient({
    baseUrl: 'http://brain.test',
    agentId: 'brain-agent',
    fetchImpl: async (url, init = {}) => {
      calls.push({
        url,
        init: {
          ...init,
          body: init.body ?? null,
        },
      });

      return jsonFetchResponse(200, { ok: true });
    },
  });

  const result = await client.publishTerminalSummary({
    submissionId: 'sub_123',
    title: 'Bearer token plan for sub_123',
    state: 'idacc_done',
    statusReceipt: 'receipt_abc123',
    updatedAt: '2026-07-13T00:00:00.000Z',
    sourceIds: ['memory:3821', 'text:27875', 'not-allowed'],
    terminalSummary: {
      state: 'idacc_done',
      statusReceipt: 'receipt_abc123',
      submittedAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:05:00.000Z',
      targetLane: 'inc-ops-governance',
      outcome: 'accept',
      idacc: {
        state: 'idacc_done',
        taskStatus: 'done',
      },
    },
    idacc: {
      state: 'idacc_done',
      taskName: 'bittrees-submission-sub123',
      taskStatus: 'done',
    },
    review: {
      decision: 'accept',
      state: 'review_accepted',
      reviewedAt: '2026-07-13T00:05:00.000Z',
      result: 'accept',
    },
  });

  assert.equal(result.status, 'stored');
  assert.equal(result.agentId, 'brain-agent');
  assert.equal(result.key, 'contribution:sub_123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://brain.test/memory/brain-agent');
  assert.equal(calls[0].init.method, 'POST');

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.key, 'contribution:sub_123');
  assert.equal(body.shared, true);
  assert.deepEqual(body.tags, ['contribution', 'terminal-summary']);

  const content = JSON.parse(body.content);
  assert.equal(content.schema, 'agent.bittrees.contribution-terminal-summary.v1');
  assert.equal(content.submissionId, 'sub_123');
  assert.equal(content.title, 'Contribution terminal summary for sub_123');
  assert.deepEqual(content.sourceIds, ['memory:3821', 'text:27875']);
  assert.equal(content.idacc.state, 'idacc_done');
  assert.equal(content.review.decision, 'accept');
});

test('workflow service records submissions, review history, and outbox-driven terminal states', async () => {
  await withEnv({ CONTRIBUTION_SERVICE_WRITE_ENABLED: '1' }, async () => {
    const clock = () => '2026-07-13T00:00:00.000Z';
    const repository = createContributionRepository({ clock });
    const service = createContributionWorkflowService({ repository, clock });

    const submissionResult = await service.submitContribution(CONTRIBUTION_PAYLOAD, {
      req: mockRequest({
        headers: {
          'x-contributor-subject': 'bridge-agent',
        },
      }),
      idempotencyKey: 'bridge-agent-001',
    });

    assert.equal(submissionResult.status, 'submission_queued_for_review');
    assert.equal(submissionResult.idempotent, false);
    assert.equal(submissionResult.submission.state, 'review_pending');

    const duplicateResult = await service.submitContribution(CONTRIBUTION_PAYLOAD, {
      req: mockRequest({
        headers: {
          'x-contributor-subject': 'bridge-agent',
        },
      }),
      idempotencyKey: 'bridge-agent-001',
    });

    assert.equal(duplicateResult.idempotent, true);
    assert.equal(duplicateResult.submissionId, submissionResult.submissionId);

    const reviewResult = await service.recordReviewDecision(
      submissionResult.submissionId,
      {
        decision: 'accept',
        evidence: ['memory:3821'],
        outboxStatus: 'queued',
        terminalSummary: 'Approve the durable contribution workflow',
      },
      {
        req: mockRequest({
          headers: {
            'x-reviewer-subject': 'owning-reviewer',
          },
        }),
      },
    );

    assert.equal(reviewResult.status, 'review_decision_recorded');
    assert.equal(reviewResult.decision, 'accept');
    assert.equal(reviewResult.outboxEvents[0].kind, 'idacc_task_create');

    const history = await service.listReviewDecisionsCollection();
    assert.equal(history.count, 1);
    assert.equal(history.reviews[0].decision, 'accept');

    const reviewHandler = createContributionRequestHandler({ service });
    const collectionResponse = mockResponse();
    await reviewHandler(mockRequest({ path: '/v1/contributions/submissions/review-decisions' }), collectionResponse);
    assert.equal(collectionResponse.statusCode, 200);

    const collectionBody = JSON.parse(collectionResponse.body);
    assert.equal(collectionBody.route, '/v1/contributions/submissions/review-decisions');
    assert.equal(collectionBody.data.count, 1);
    assert.equal(collectionBody.data.reviews[0].decision, 'accept');

    const worker = createContributionOutboxWorker({
      repository,
      idaccClient: {
        async createBoundedTask() {
          return {
            name: 'bittrees-submission-bridge-agent',
            uuid: 'task-123',
            status: 'doing',
          };
        },
        async getTask() {
          return {
            name: 'bittrees-submission-bridge-agent',
            uuid: 'task-123',
            status: 'done',
            updatedAt: '2026-07-13T00:05:00.000Z',
          };
        },
      },
      brainClient: {
        async publishTerminalSummary(summary) {
          return {
            key: `contribution:${summary.submissionId}`,
            agentId: 'brain-agent',
            status: 'stored',
            summary,
          };
        },
      },
      clock,
      logger: {
        error() {},
      },
      leaseMs: 1_000,
    });

    let runResult = await worker.runOnce({ limit: 1, kinds: ['idacc_task_create'] });
    assert.equal(runResult.leased, 1);
    assert.equal(runResult.processed[0].status, 'completed');

    let snapshot = repository.snapshot();
    assert.equal(snapshot.submissions.get(submissionResult.submissionId).state, 'idacc_doing');
    assert.equal(snapshot.integrationOutbox.size >= 1, true);

    runResult = await worker.runOnce({ limit: 1, kinds: ['idacc_task_refresh'] });
    assert.equal(runResult.leased, 1);
    assert.equal(runResult.processed[0].status, 'completed');

    snapshot = repository.snapshot();
    assert.equal(snapshot.submissions.get(submissionResult.submissionId).state, 'idacc_done');

    runResult = await worker.runOnce({ limit: 1, kinds: ['brain_terminal_summary'] });
    assert.equal(runResult.leased, 1);
    assert.equal(runResult.processed[0].status, 'completed');

    snapshot = repository.snapshot();
    const finalSubmission = snapshot.submissions.get(submissionResult.submissionId);
    assert.equal(finalSubmission.state, 'idacc_done');
    assert.equal(finalSubmission.terminalSummary.brainKey, `contribution:${submissionResult.submissionId}`);
    assert.equal(finalSubmission.terminalSummary.brainAgentId, 'brain-agent');
    assert.equal(snapshot.integrationAuditEvents.length >= 3, true);
  });
});

test('composed request handler serves contribution routes and falls back to the portal', async () => {
  await withEnv({ CONTRIBUTION_SERVICE_WRITE_ENABLED: '1' }, async () => {
    const clock = () => '2026-07-13T00:00:00.000Z';
    const repository = createContributionRepository({ clock });
    const service = createContributionWorkflowService({ repository, clock });

    const submissionResult = await service.submitContribution(CONTRIBUTION_PAYLOAD, {
      req: mockRequest({
        headers: {
          'x-contributor-subject': 'bridge-agent',
        },
      }),
    });
    await service.recordReviewDecision(submissionResult.submissionId, { decision: 'accept' }, { req: mockRequest() });

    const handler = createAppRequestHandler({ service });

    const contractResponse = mockResponse();
    await handler(mockRequest({ path: '/v1/contributions' }), contractResponse);
    assert.equal(contractResponse.statusCode, 200);
    const contractBody = JSON.parse(contractResponse.body);
    assert.equal(contractBody.route, '/v1/contributions');
    assert.equal(contractBody.data.routes.reviewDecisions, '/v1/contributions/submissions/:submissionId/review-decisions');

    const rootResponse = mockResponse();
    await handler(mockRequest({ path: '/' }), rootResponse);
    assert.equal(rootResponse.statusCode, 200);
    assert.match(rootResponse.body, /Contribution Workflow/i);
  });
});
