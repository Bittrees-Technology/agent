import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import handler from '../api/index.js';

const SAMPLE_CONTRIBUTION_INTENT = {
  schema: 'agent.bittrees.contribution-intent.v1',
  intentId: 'intent-2026-07-07-live-write-smoke',
  submittedAt: '2026-07-07T10:30:00Z',
  contributor: {
    kind: 'agent',
    name: 'maintenance-engineer',
    agentId: 'maintenance-engineer',
    team: 'engineering-team',
    contactRoute: 'M:engineering-team/maintenance-engineer',
  },
  targetLane: 'operations-governance',
  summary:
    'Wire the contribution-intent destination so leads can review intake packets with stored evidence and fleet notification records.',
  proposedTemplate: 'contributor-onboarding',
  handoff: {
    requestedOwnerRoute: 'M:engineering-team/engineering-lead',
    goalId: 'goal_plan_rzit49',
    expectedOutput: 'Observable contribution-intent storage and notification records for lead review',
    acceptanceCriteria: [
      'Submission is persisted with a receipt ID',
      'Notification record is queued for lead review',
    ],
    outOfScope: [
      'Production deployment',
      'Credential collection',
    ],
    backlogPolicy: 'Optional productization ideas become backlog after the review path works.',
    sourceIds: ['memory:642', 'output:idacc-contributor-lane-map'],
  },
  safety: {
    noSecretsIncluded: true,
    noLiveWriteAcknowledged: true,
    noOnchainActionRequested: true,
  },
};

function mockRequest({ method, path, host = 'agent.bittrees.org', headers = {}, body }) {
  const req = new EventEmitter();
  req.method = method;
  req.url = path;
  req.headers = { host, ...headers };
  req.body = body;
  req.resume = () => req;
  req.destroy = () => req;
  return req;
}

function mockResponse() {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      res.statusCode = statusCode;
      Object.assign(res.headers, headers);
    },
    end(chunk) {
      if (chunk) res.body += chunk;
    },
  };
  return res;
}

const CHECKS = [
  { method: 'GET', path: '/' },
  { method: 'HEAD', path: '/' },
  { method: 'GET', path: '/robots.txt' },
  { method: 'GET', path: '/llms.txt' },
  { method: 'GET', path: '/llms.txt/' },
  { method: 'GET', path: '/agents.json' },
  { method: 'GET', path: '/templates.json' },
  { method: 'GET', path: '/idacc/releases.json' },
  { method: 'GET', path: '/contribution-intents' },
  { method: 'POST', path: '/contribution-intents' },
  { method: 'GET', path: '/does-not-exist' },
];

let failed = 0;

for (const check of CHECKS) {
  const req = mockRequest(check);
  const res = mockResponse();
  const originalConsoleLog = console.log;
  const telemetryLines = [];

  console.log = (...args) => {
    telemetryLines.push(args.join(' '));
  };

  try {
    await handler(req, res);
  } finally {
    console.log = originalConsoleLog;
  }

  const bodyPreview = res.body.slice(0, 80).replace(/\n/g, ' ');
  console.log(`${check.method} ${check.path} -> ${res.statusCode} | ${bodyPreview}`);

  if (res.statusCode == null) {
    failed += 1;
    console.error(`  FAIL: no status code written for ${check.method} ${check.path}`);
  }

  if (telemetryLines.length === 0) {
    failed += 1;
    console.error(`  FAIL: no telemetry line emitted for ${check.method} ${check.path}`);
    continue;
  }

  try {
    const telemetry = JSON.parse(telemetryLines[0]);
    const keys = Object.keys(telemetry).sort().join(',');

    if (keys !== 'method,path,status,timestamp') {
      failed += 1;
      console.error(`  FAIL: unexpected telemetry keys for ${check.method} ${check.path}: ${keys}`);
    }
  } catch (error) {
    failed += 1;
    console.error(`  FAIL: telemetry was not valid JSON for ${check.method} ${check.path}: ${error.message}`);
  }
}

const savedWriteFlag = process.env.CONTRIBUTION_INTENTS_WRITE_ENABLED;
const savedDataDir = process.env.CONTRIBUTION_INTENTS_DATA_DIR;
const tempDir = await mkdtemp(join(tmpdir(), 'agent-bittrees-intents-'));

try {
  process.env.CONTRIBUTION_INTENTS_WRITE_ENABLED = '1';
  process.env.CONTRIBUTION_INTENTS_DATA_DIR = tempDir;

  const req = mockRequest({
    method: 'POST',
    path: '/contribution-intents',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(SAMPLE_CONTRIBUTION_INTENT),
  });
  const res = mockResponse();
  const originalConsoleLog = console.log;
  const telemetryLines = [];

  console.log = (...args) => {
    telemetryLines.push(args.join(' '));
  };

  try {
    await handler(req, res);
  } finally {
    console.log = originalConsoleLog;
  }

  console.log(`POST /contribution-intents (write enabled) -> ${res.statusCode} | ${res.body.slice(0, 80).replace(/\n/g, ' ')}`);

  if (res.statusCode !== 202) {
    failed += 1;
    console.error(`  FAIL: expected 202 for enabled POST /contribution-intents, received ${res.statusCode}`);
  }

  let parsedBody = null;

  try {
    parsedBody = JSON.parse(res.body);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL: enabled POST response was not valid JSON: ${error.message}`);
  }

  if (!parsedBody?.accepted || typeof parsedBody?.receiptId !== 'string') {
    failed += 1;
    console.error('  FAIL: enabled POST response did not include an accepted receipt.');
  }

  const submissionsLogPath = join(tempDir, 'submissions.jsonl');
  const notificationsLogPath = join(tempDir, 'fleet-notifications.jsonl');

  try {
    const submissionsLog = await readFile(submissionsLogPath, 'utf8');
    const notificationsLog = await readFile(notificationsLogPath, 'utf8');
    const submissionRecord = JSON.parse(submissionsLog.trim().split('\n').filter(Boolean).at(-1));
    const notificationRecord = JSON.parse(notificationsLog.trim().split('\n').filter(Boolean).at(-1));

    if (submissionRecord.request?.intentId !== SAMPLE_CONTRIBUTION_INTENT.intentId) {
      failed += 1;
      console.error('  FAIL: submission record did not preserve the request intentId.');
    }

    if (notificationRecord.receiptId !== parsedBody?.receiptId) {
      failed += 1;
      console.error('  FAIL: notification record receiptId did not match the API response.');
    }
  } catch (error) {
    failed += 1;
    console.error(`  FAIL: enabled POST did not persist readable logs: ${error.message}`);
  }

  if (telemetryLines.length === 0) {
    failed += 1;
    console.error('  FAIL: no telemetry line emitted for enabled POST /contribution-intents');
  }
} finally {
  if (savedWriteFlag === undefined) delete process.env.CONTRIBUTION_INTENTS_WRITE_ENABLED;
  else process.env.CONTRIBUTION_INTENTS_WRITE_ENABLED = savedWriteFlag;

  if (savedDataDir === undefined) delete process.env.CONTRIBUTION_INTENTS_DATA_DIR;
  else process.env.CONTRIBUTION_INTENTS_DATA_DIR = savedDataDir;

  await rm(tempDir, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}

console.log('All api/index.js handler checks passed.');
