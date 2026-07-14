import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import handler from '../api/index.js';
import { IDENTITY_KEYS_PUBLIC_CONTRACT, PORTAL_SECURITY_HEADERS, buildStaticAssets } from '../src/portal.mjs';

const SAMPLE_CONTRIBUTION_INTENT = {
  schema: 'agent.bittrees.contribution-intent.v1',
  intentId: 'intent-2026-07-07-write-gate-smoke',
  submittedAt: '2026-07-07T10:30:00Z',
  contributor: {
    kind: 'agent',
    name: 'maintenance-engineer',
    agentId: 'maintenance-engineer',
    team: 'engineering-team',
    contactRoute: 'https://example.org/maintenance-contact',
  },
  targetLane: 'inc-ops-governance',
  summary:
    'Wire the contribution-intent destination so leads can review intake packets with stored evidence and fleet notification records.',
  proposedTemplate: 'contribution-task',
  handoff: {
    requestedOwnerRoute: 'approved-review-contact',
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

const WRITE_FLAG_NAMES = [
  'CONTRIBUTION_INTENTS_WRITE_ENABLED',
  'CONTRIBUTION_INTENTS_ENABLED',
  'PORTAL_ENABLE_CONTRIBUTION_INTENTS',
];
const RAW_BRAIN_MEMORY_ID_PATTERN = /\bmemory:\d+\b/;

function buildContributionIntentFormBody({ summary, includeSafety = true } = {}) {
  const params = new URLSearchParams();
  params.set('contributor.kind', SAMPLE_CONTRIBUTION_INTENT.contributor.kind);
  params.set('contributor.name', SAMPLE_CONTRIBUTION_INTENT.contributor.name);
  params.set('contributor.agentId', SAMPLE_CONTRIBUTION_INTENT.contributor.agentId);
  params.set('contributor.team', SAMPLE_CONTRIBUTION_INTENT.contributor.team);
  params.set('contributor.contactRoute', SAMPLE_CONTRIBUTION_INTENT.contributor.contactRoute);
  params.set('targetLane', SAMPLE_CONTRIBUTION_INTENT.targetLane);
  params.set('summary', summary ?? 'Submit a gateway form contribution intent through the urlencoded visitor workflow.');
  params.set('proposedTemplate', SAMPLE_CONTRIBUTION_INTENT.proposedTemplate);
  params.set('handoff.requestedOwnerRoute', SAMPLE_CONTRIBUTION_INTENT.handoff.requestedOwnerRoute);
  params.set('handoff.goalId', SAMPLE_CONTRIBUTION_INTENT.handoff.goalId);
  params.set('handoff.expectedOutput', SAMPLE_CONTRIBUTION_INTENT.handoff.expectedOutput);
  params.set('handoff.acceptanceCriteria', SAMPLE_CONTRIBUTION_INTENT.handoff.acceptanceCriteria.join('\n'));
  params.set('handoff.outOfScope', SAMPLE_CONTRIBUTION_INTENT.handoff.outOfScope.join('\n'));
  params.set('handoff.backlogPolicy', SAMPLE_CONTRIBUTION_INTENT.handoff.backlogPolicy);
  params.set('handoff.sourceIds', SAMPLE_CONTRIBUTION_INTENT.handoff.sourceIds.join(','));

  if (includeSafety) {
    params.set('safety.noSecretsIncluded', 'true');
    params.set('safety.noLiveWriteAcknowledged', 'true');
    params.set('safety.noOnchainActionRequested', 'true');
  }

  return params.toString();
}

function mockRequest({ method, path, host = 'agent.bittrees.org', headers = {}, body }) {
  const req = new EventEmitter();
  req.method = method;
  req.url = path;
  req.headers = { host, ...headers };
  req.body = body ?? (method === 'GET' || method === 'HEAD' ? undefined : '');
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
  { method: 'GET', path: '/identity-keys' },
  { method: 'GET', path: '/identity-keys/', expectedStatus: 301 },
  { method: 'GET', path: '/submission-status' },
  { method: 'GET', path: '/submission-status/', expectedStatus: 301 },
  { method: 'GET', path: '/reputation' },
  { method: 'GET', path: '/reputation/', expectedStatus: 301 },
  { method: 'GET', path: '/identity-keys.json' },
  { method: 'GET', path: '/identity-keys.json/', expectedStatus: 301 },
  { method: 'GET', path: '/llms.txt' },
  { method: 'GET', path: '/llms.txt/', expectedStatus: 301 },
  { method: 'GET', path: '/agents.json' },
  { method: 'GET', path: '/templates.json' },
  { method: 'GET', path: '/onboarding.json' },
  { method: 'GET', path: '/v1/workflow/opportunities' },
  { method: 'GET', path: '/v1/workflow/opportunities/source-registry-hardening' },
  { method: 'GET', path: '/v1/workflow/status?id=source-registry-hardening&kind=opportunity' },
  { method: 'GET', path: '/v1/registry/agents' },
  { method: 'GET', path: '/idacc/releases.json' },
  { method: 'GET', path: '/contribution-intents' },
  { method: 'GET', path: '/gateway/contribution-intents' },
  { method: 'GET', path: '/mcp' },
  { method: 'GET', path: '/mcp-docs' },
  { method: 'GET', path: '/mcp.json' },
  { method: 'GET', path: '/submission-status.json' },
  { method: 'GET', path: '/reputation.json' },
  { method: 'POST', path: '/contribution-intents' },
  { method: 'POST', path: '/contribution-intents/', expectedStatus: 301 },
  { method: 'POST', path: '/gateway/contribution-intents' },
  { method: 'POST', path: '/gateway/contribution-intents/', expectedStatus: 301 },
  { method: 'GET', path: '/does-not-exist', expectedStatus: 404 },
];

let failed = 0;

const staticAssetPaths = new Set(buildStaticAssets().map((asset) => asset.path));
for (const postCapablePath of ['contribution-intents', 'gateway/contribution-intents', 'mcp/index.html']) {
  if (staticAssetPaths.has(postCapablePath)) {
    failed += 1;
    console.error(`  FAIL: dist build would emit ${postCapablePath}, shadowing a POST-capable API route on Vercel.`);
  }
}

function checkTelemetryLine(telemetryLines, label, expectedStatus) {
  if (telemetryLines.length === 0) {
    failed += 1;
    console.error(`  FAIL: no telemetry line emitted for ${label}`);
    return null;
  }

  try {
    const telemetry = JSON.parse(telemetryLines[0]);
    const keys = Object.keys(telemetry).sort().join(',');

    if (keys !== 'method,path,status,timestamp') {
      failed += 1;
      console.error(`  FAIL: unexpected telemetry keys for ${label}: ${keys}`);
    }

    if (expectedStatus !== undefined && telemetry.status !== expectedStatus) {
      failed += 1;
      console.error(`  FAIL: expected telemetry status ${expectedStatus} for ${label}, received ${telemetry.status}`);
    }

    return telemetry;
  } catch (error) {
    failed += 1;
    console.error(`  FAIL: telemetry was not valid JSON for ${label}: ${error.message}`);
    return null;
  }
}

function checkHardeningHeaders(headers, label) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );

  for (const [header, expectedValue] of Object.entries(PORTAL_SECURITY_HEADERS)) {
    const actualValue = normalizedHeaders[header.toLowerCase()];
    if (actualValue !== expectedValue) {
      failed += 1;
      console.error(`  FAIL: ${label} missing ${header}: expected ${expectedValue}, received ${actualValue}`);
    }
  }

  if (normalizedHeaders['x-content-type-options'] !== 'nosniff') {
    failed += 1;
    console.error(`  FAIL: ${label} missing X-Content-Type-Options nosniff`);
  }

  if (normalizedHeaders['x-robots-tag'] !== 'noindex, nofollow') {
    failed += 1;
    console.error(`  FAIL: ${label} missing X-Robots-Tag noindex,nofollow`);
  }
}

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

  if (check.expectedStatus !== undefined && res.statusCode !== check.expectedStatus) {
    failed += 1;
    console.error(`  FAIL: expected ${check.expectedStatus} for ${check.method} ${check.path}, received ${res.statusCode}`);
  }

  if (res.statusCode === 200 && check.method === 'GET' && check.path === '/identity-keys') {
    if (!res.body.includes('Identity and keys.')) {
      failed += 1;
      console.error('  FAIL: /identity-keys did not render the identity and keys page.');
    }

    if (!res.body.includes('blocked-without-explicit-controller-or-safe-approval')) {
      failed += 1;
      console.error('  FAIL: /identity-keys did not render the execution gate policy.');
    }

    for (const expectedText of [
      'blocked-not-completed',
      '0/68 executed',
      '0 transaction hashes',
      '67 names uncreated',
      'onchainlead wallet-record mismatch',
      'authorized-controller-signer',
      'isolated-custody-attestations',
      'numeric-spend-cap',
      'broadcaster-authority',
      'future-agent-provisioning-required',
    ]) {
      if (!res.body.includes(expectedText)) {
        failed += 1;
        console.error(`  FAIL: /identity-keys missing ENS rollout status text: ${expectedText}`);
      }
    }

    if (/live-contract-ready|staging-ready|rollout complete|68\/68 executed|completed successfully|ready to execute/i.test(res.body)) {
      failed += 1;
      console.error('  FAIL: /identity-keys implied the ENS rollout was complete or executable.');
    }

    if (/rawPrivateKey|secretKey|mnemonic|seedPhrase/.test(res.body)) {
      failed += 1;
      console.error('  FAIL: /identity-keys rendered a forbidden secret field name.');
    }
  }

  if (res.statusCode === 200 && check.method === 'GET' && check.path === '/submission-status') {
    if (!res.body.includes('Submission status.') || !res.body.includes('check_contribution_status')) {
      failed += 1;
      console.error('  FAIL: /submission-status did not render the status lookup page.');
    }
  }

  if (res.statusCode === 200 && check.method === 'GET' && check.path === '/reputation') {
    if (!res.body.includes('Agent reputation.') || !res.body.includes('get_agent_reputation')) {
      failed += 1;
      console.error('  FAIL: /reputation did not render the reputation lookup page.');
    }
  }

  if (res.statusCode === 200 && check.method === 'GET' && check.path === '/mcp-docs') {
    if (!res.body.includes('Harness imports') || !res.body.includes('Claude Desktop')) {
      failed += 1;
      console.error('  FAIL: /mcp-docs did not render the MCP harness import docs.');
    }
  }

  if (res.statusCode === 200 && check.method === 'GET' && check.path === '/identity-keys.json') {
    try {
      const parsedBody = JSON.parse(res.body);
      const serializedBody = JSON.stringify(parsedBody);

      if (parsedBody.route !== '/identity-keys.json') {
        failed += 1;
        console.error(`  FAIL: /identity-keys.json route field mismatch: ${parsedBody.route}`);
      }

      if (parsedBody.status !== IDENTITY_KEYS_PUBLIC_CONTRACT.status) {
        failed += 1;
        console.error(`  FAIL: /identity-keys.json status mismatch: ${parsedBody.status}`);
      }

      if (parsedBody.data?.registryManagement?.identityKeysRoute !== '/identity-keys.json') {
        failed += 1;
        console.error('  FAIL: /identity-keys.json registry management does not point back to the identity route.');
      }

      const publicKeySection = parsedBody.data?.identityKeys?.sections?.some(
        (section) => section.id === 'public-operational-keys',
      );
      if (!publicKeySection) {
        failed += 1;
        console.error('  FAIL: /identity-keys.json missing public-operational-keys section.');
      }

      const executionGate = parsedBody.data?.identityKeys?.onchainExecutionReadiness?.some(
        (level) => level.level === 'execute' && level.automation === 'blocked-without-explicit-controller-or-safe-approval',
      );
      if (!executionGate) {
        failed += 1;
        console.error('  FAIL: /identity-keys.json missing blocked execute policy.');
      }

      const ensRollout = parsedBody.data?.identityKeys?.ensPrimaryNameRollout;
      const completionEvidence = ensRollout?.completionEvidence;
      const gateIds = ensRollout?.requiredExecutionGates?.map((gate) => gate.id).sort().join(',');
      if (
        ensRollout?.status !== 'blocked-not-completed'
        || completionEvidence?.executionProgress !== '0/68 executed'
        || completionEvidence?.executedAgentCount !== 0
        || completionEvidence?.cohortAgentCount !== 68
        || completionEvidence?.transactionHashCount !== 0
        || !Array.isArray(completionEvidence?.transactionHashes)
        || completionEvidence.transactionHashes.length !== 0
        || completionEvidence?.uncreatedNameCount !== 67
        || ensRollout?.walletRecordMismatch?.id !== 'onchainlead-wallet-record-mismatch'
        || gateIds !== 'authorized-controller-signer,broadcaster-authority,isolated-custody-attestations,numeric-spend-cap'
        || ensRollout?.futureAgentProvisioning?.status !== 'future-agent-provisioning-required'
      ) {
        failed += 1;
        console.error('  FAIL: /identity-keys.json missing blocked ENS rollout counters, mismatch, or gates.');
      }

      if (/live-contract-ready|staging-ready|rollout complete|68\/68 executed|completed successfully|ready to execute/i.test(serializedBody)) {
        failed += 1;
        console.error('  FAIL: /identity-keys.json implied the ENS rollout was complete or executable.');
      }

      if (/rawPrivateKey|secretKey|mnemonic|seedPhrase/.test(serializedBody)) {
        failed += 1;
        console.error('  FAIL: /identity-keys.json exposed a forbidden secret field name.');
      }
    } catch (error) {
      failed += 1;
      console.error(`  FAIL: /identity-keys.json response was not valid JSON: ${error.message}`);
    }
  }

  if (res.statusCode === 200 && check.method === 'GET' && check.path === '/v1/workflow/opportunities') {
    try {
      const parsedBody = JSON.parse(res.body);
      const rawOwner = (parsedBody.opportunities ?? []).some((opportunity) => (
        ['lead', 'research-lead', 'ops-lead'].includes(opportunity.owner)
      ));

      if (parsedBody.status !== 'ready-for-triage' || rawOwner) {
        failed += 1;
        console.error('  FAIL: workflow opportunities response is not public-safe and contract-ready.');
      }
    } catch (error) {
      failed += 1;
      console.error(`  FAIL: /v1/workflow/opportunities response was not valid JSON: ${error.message}`);
    }
  }

  if (res.statusCode === 200 && check.method === 'GET' && check.path === '/v1/registry/agents') {
    try {
      const parsedBody = JSON.parse(res.body);
      const prohibitedFields = ['controllerId', 'controller_id', 'publicKey', 'public_key', 'profileUri', 'profile_uri', 'metadata', 'contact'];
      const hasProhibitedField = parsedBody.records?.some((record) => prohibitedFields.some((field) => Object.hasOwn(record, field)));

      if (parsedBody.route !== '/v1/registry/agents' || !Array.isArray(parsedBody.records) || hasProhibitedField) {
        failed += 1;
        console.error('  FAIL: registry feed is not a public-safe agent-readable projection.');
      }
    } catch (error) {
      failed += 1;
      console.error(`  FAIL: /v1/registry/agents response was not valid JSON: ${error.message}`);
    }
  }

  if (res.statusCode === 200 && check.method === 'GET' && ['/agents.json', '/sources.json'].includes(check.path)) {
    if (RAW_BRAIN_MEMORY_ID_PATTERN.test(res.body)) {
      failed += 1;
      console.error(`  FAIL: ${check.path} leaked a raw Brain memory id.`);
    }
  }

  checkTelemetryLine(telemetryLines, `${check.method} ${check.path}`, res.statusCode);
  checkHardeningHeaders(res.headers, `${check.method} ${check.path}`);
}

for (const check of [
  {
    label: 'POST /mcp initialize',
    body: {
      jsonrpc: '2.0',
      id: 101,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'verify-api-handler',
          version: '0.1.0',
        },
      },
    },
    assertBody(parsedBody) {
      if (parsedBody?.result?.protocolVersion !== '2025-06-18') {
        failed += 1;
        console.error('  FAIL: MCP initialize did not negotiate 2025-06-18.');
      }
    },
  },
  {
    label: 'POST /mcp tools/list',
    body: {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/list',
      params: {},
    },
    assertBody(parsedBody) {
      const toolNames = new Set((parsedBody?.result?.tools ?? []).map((tool) => tool.name));
      for (const toolName of [
        'list_contribution_opportunities',
        'get_contribution_brief',
        'get_bittrees_context',
        'register_external_agent',
        'claim_contribution',
        'submit_contribution',
        'check_contribution_status',
        'respond_to_review_feedback',
        'get_agent_reputation',
        'lookup_contribution_attestation',
      ]) {
        if (!toolNames.has(toolName)) {
          failed += 1;
          console.error(`  FAIL: MCP tools/list missing ${toolName}.`);
        }
      }
    },
  },
  {
    label: 'POST /mcp tools/call get_bittrees_context',
    body: {
      jsonrpc: '2.0',
      id: 103,
      method: 'tools/call',
      params: {
        name: 'get_bittrees_context',
        arguments: {},
      },
    },
    assertBody(parsedBody) {
      if (parsedBody?.result?.structuredContent?.status !== 'source-grounded-context-ready') {
        failed += 1;
        console.error('  FAIL: MCP get_bittrees_context returned unexpected status.');
      }

      if (RAW_BRAIN_MEMORY_ID_PATTERN.test(JSON.stringify(parsedBody))) {
        failed += 1;
        console.error('  FAIL: MCP get_bittrees_context leaked a raw Brain memory id.');
      }
    },
  },
]) {
  const req = mockRequest({
    method: 'POST',
    path: '/mcp',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify(check.body),
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

  console.log(`${check.label} -> ${res.statusCode} | ${res.body.slice(0, 80).replace(/\n/g, ' ')}`);

  if (res.statusCode !== 200) {
    failed += 1;
    console.error(`  FAIL: expected 200 for ${check.label}, received ${res.statusCode}`);
  }

  try {
    check.assertBody(JSON.parse(res.body));
  } catch (error) {
    failed += 1;
    console.error(`  FAIL: ${check.label} response was not valid JSON: ${error.message}`);
  }

  checkTelemetryLine(telemetryLines, check.label, 200);
  checkHardeningHeaders(res.headers, check.label);

  if (String(res.headers['MCP-Protocol-Version']) !== '2025-06-18') {
    failed += 1;
    console.error(`  FAIL: ${check.label} missing MCP-Protocol-Version header.`);
  }
}

{
  const req = mockRequest({
    method: 'POST',
    path: '/mcp',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-06-18',
    },
    body: {
      jsonrpc: '2.0',
      id: 'vercel-parsed-body',
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'verify-api-handler', version: '0.1.0' },
      },
    },
  });
  const res = mockResponse();

  await handler(req, res);

  console.log(`POST /mcp initialize (pre-parsed body) -> ${res.statusCode} | ${res.body.slice(0, 80).replace(/\n/g, ' ')}`);

  if (res.statusCode !== 200) {
    failed += 1;
    console.error(`  FAIL: expected 200 for POST /mcp initialize (pre-parsed body), received ${res.statusCode}`);
  }

  try {
    const parsedBody = JSON.parse(res.body);
    if (parsedBody.result?.protocolVersion !== '2025-06-18') {
      failed += 1;
      console.error('  FAIL: POST /mcp initialize (pre-parsed body) did not negotiate protocol 2025-06-18.');
    }
  } catch (error) {
    failed += 1;
    console.error(`  FAIL: POST /mcp initialize (pre-parsed body) response was not valid JSON: ${error.message}`);
  }

  checkHardeningHeaders(res.headers, 'POST /mcp initialize (pre-parsed body)');

  if (String(res.headers['MCP-Protocol-Version']) !== '2025-06-18') {
    failed += 1;
    console.error('  FAIL: POST /mcp initialize (pre-parsed body) missing MCP-Protocol-Version header.');
  }
}

const savedDisabledFlags = new Map(WRITE_FLAG_NAMES.map((flagName) => [flagName, process.env[flagName]]));

try {
  for (const flagName of WRITE_FLAG_NAMES) {
    delete process.env[flagName];
  }

  const req = mockRequest({
    method: 'POST',
    path: '/contribution-intents',
    headers: {
      accept: 'text/html',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: buildContributionIntentFormBody(),
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

  console.log(`POST /contribution-intents (form write disabled) -> ${res.statusCode} | ${res.body.slice(0, 80).replace(/\n/g, ' ')}`);

  if (res.statusCode !== 501) {
    failed += 1;
    console.error(`  FAIL: expected 501 for disabled form POST /contribution-intents, received ${res.statusCode}`);
  }

  if (!String(res.headers['Content-Type']).includes('text/html')) {
    failed += 1;
    console.error('  FAIL: disabled form POST did not return HTML.');
  }

  if (!res.body.includes('Offline packet template')) {
    failed += 1;
    console.error('  FAIL: disabled form POST did not include offline packet instructions.');
  }

  checkTelemetryLine(telemetryLines, 'disabled form POST /contribution-intents', 501);
  checkHardeningHeaders(res.headers, 'disabled form POST /contribution-intents');

  const gatewayReq = mockRequest({
    method: 'POST',
    path: '/gateway/contribution-intents',
    headers: {
      accept: 'text/html',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: buildContributionIntentFormBody(),
  });
  const gatewayRes = mockResponse();
  const gatewayTelemetryLines = [];

  console.log = (...args) => {
    gatewayTelemetryLines.push(args.join(' '));
  };

  try {
    await handler(gatewayReq, gatewayRes);
  } finally {
    console.log = originalConsoleLog;
  }

  console.log(`POST /gateway/contribution-intents (form write disabled) -> ${gatewayRes.statusCode} | ${gatewayRes.body.slice(0, 80).replace(/\n/g, ' ')}`);

  if (gatewayRes.statusCode !== 501) {
    failed += 1;
    console.error(`  FAIL: expected 501 for disabled form POST /gateway/contribution-intents, received ${gatewayRes.statusCode}`);
  }

  if (!String(gatewayRes.headers['Content-Type']).includes('text/html')) {
    failed += 1;
    console.error('  FAIL: disabled gateway form POST did not return HTML.');
  }

  if (!gatewayRes.body.includes('Offline packet template')) {
    failed += 1;
    console.error('  FAIL: disabled gateway form POST did not include offline packet instructions.');
  }

  checkTelemetryLine(gatewayTelemetryLines, 'disabled form POST /gateway/contribution-intents', 501);
  checkHardeningHeaders(gatewayRes.headers, 'disabled form POST /gateway/contribution-intents');
} finally {
  for (const [flagName, value] of savedDisabledFlags) {
    if (value === undefined) delete process.env[flagName];
    else process.env[flagName] = value;
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

  checkTelemetryLine(telemetryLines, 'enabled JSON POST /contribution-intents', 202);
  checkHardeningHeaders(res.headers, 'enabled JSON POST /contribution-intents');

  const invalidFormReq = mockRequest({
    method: 'POST',
    path: '/gateway/contribution-intents',
    headers: {
      accept: 'text/html',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: buildContributionIntentFormBody({ summary: 'too short', includeSafety: false }),
  });
  const invalidFormRes = mockResponse();

  await handler(invalidFormReq, invalidFormRes);
  console.log(`POST /gateway/contribution-intents (invalid form) -> ${invalidFormRes.statusCode} | ${invalidFormRes.body.slice(0, 80).replace(/\n/g, ' ')}`);

  if (invalidFormRes.statusCode !== 400) {
    failed += 1;
    console.error(`  FAIL: expected 400 for invalid form POST /gateway/contribution-intents, received ${invalidFormRes.statusCode}`);
  }

  if (!String(invalidFormRes.headers['Content-Type']).includes('text/html')) {
    failed += 1;
    console.error('  FAIL: invalid gateway form POST did not return HTML.');
  }

  if (!invalidFormRes.body.includes('body.summary must be at least 20 characters.')) {
    failed += 1;
    console.error('  FAIL: invalid gateway form POST did not render schema validation feedback.');
  }

  if (!invalidFormRes.body.includes('action="/gateway/contribution-intents"')) {
    failed += 1;
    console.error('  FAIL: invalid gateway form POST did not re-render the gateway form action.');
  }
  if (!invalidFormRes.body.includes('class="error-summary" role="alert"')) {
    failed += 1;
    console.error('  FAIL: invalid gateway form POST did not expose an accessible error summary.');
  }
  if (!invalidFormRes.body.includes('aria-describedby="intent-rights-notice intent-privacy-notice intent-write-notice"')) {
    failed += 1;
    console.error('  FAIL: invalid gateway form POST did not associate the form with its safety notices.');
  }
  checkHardeningHeaders(invalidFormRes.headers, 'invalid gateway form POST /gateway/contribution-intents');

  const formReq = mockRequest({
    method: 'POST',
    path: '/gateway/contribution-intents',
    headers: {
      accept: 'text/html',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: buildContributionIntentFormBody(),
  });
  const formRes = mockResponse();

  await handler(formReq, formRes);
  console.log(`POST /gateway/contribution-intents (write enabled form) -> ${formRes.statusCode} | ${formRes.body.slice(0, 80).replace(/\n/g, ' ')}`);

  if (formRes.statusCode !== 202) {
    failed += 1;
    console.error(`  FAIL: expected 202 for enabled form POST /gateway/contribution-intents, received ${formRes.statusCode}`);
  }

  if (!String(formRes.headers['Content-Type']).includes('text/html')) {
    failed += 1;
    console.error('  FAIL: enabled gateway form POST did not return HTML.');
  }

  if (!formRes.body.includes('Receipt ID:')) {
    failed += 1;
    console.error('  FAIL: enabled gateway form POST did not render a receipt.');
  }
  checkHardeningHeaders(formRes.headers, 'enabled gateway form POST /gateway/contribution-intents');

  try {
    const submissionsLog = await readFile(join(tempDir, 'submissions.jsonl'), 'utf8');
    const notificationsLog = await readFile(join(tempDir, 'fleet-notifications.jsonl'), 'utf8');
    const submissionRecord = JSON.parse(submissionsLog.trim().split('\n').filter(Boolean).at(-1));
    const notificationRecord = JSON.parse(notificationsLog.trim().split('\n').filter(Boolean).at(-1));

    if (!submissionRecord.request?.intentId?.startsWith('intent-')) {
      failed += 1;
      console.error('  FAIL: gateway form submission did not receive a generated intentId.');
    }

    if (submissionRecord.request?.summary !== 'Submit a gateway form contribution intent through the urlencoded visitor workflow.') {
      failed += 1;
      console.error('  FAIL: gateway form submission did not preserve the urlencoded summary.');
    }

    if (!formRes.body.includes(notificationRecord.receiptId)) {
      failed += 1;
      console.error('  FAIL: gateway form receipt did not match the persisted fleet notification receipt ID.');
    }
  } catch (error) {
    failed += 1;
    console.error(`  FAIL: enabled gateway form POST did not persist readable logs: ${error.message}`);
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
