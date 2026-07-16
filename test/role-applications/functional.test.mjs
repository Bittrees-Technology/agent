import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createServerRequestHandler } from '../../src/server.mjs';
import {
  createRoleApplicationService,
  JsonRoleApplicationStore,
} from '../../src/role-applications/service.mjs';

const APPLICANT = '0xapplicant-local-test';
const OTHER_APPLICANT = '0xother-local-test';
const REVIEWER = '0xreviewer-local-test';

function localSiweHeaders(wallet) {
  return {
    'x-local-siwe-wallet': wallet,
    'x-local-siwe-verified': 'true',
    'x-local-siwe-domain': 'agent.bittrees.org',
  };
}

function applicationPayload(overrides = {}) {
  return {
    roleId: 'research-contributor',
    motivation: 'I want to contribute reproducible research with careful evidence handling.',
    experience: 'I have maintained source-backed research notes and reviewed adversarial test cases.',
    evidenceLinks: ['https://example.invalid/evidence/research'],
    ...overrides,
  };
}

async function withHarness({ decisionAuthority = false } = {}, callback) {
  const directory = await mkdtemp(join(tmpdir(), 'role-applications-'));
  const statePath = join(directory, 'state.json');
  const service = createRoleApplicationService({
    store: new JsonRoleApplicationStore({ path: statePath }),
    clock: () => Date.parse('2026-07-15T12:00:00.000Z'),
    reviewerEligibility({ reviewer }) {
      return reviewer?.wallet === REVIEWER
        ? { eligible: true, lanes: ['research', 'inc-ops-governance'], policyId: 'fixture-reviewer-policy' }
        : { eligible: false };
    },
    decisionAuthority({ reviewer }) {
      return reviewer?.wallet === REVIEWER && decisionAuthority
        ? { authorized: true, lanes: ['research', 'inc-ops-governance'], policyId: 'fixture-decision-authority' }
        : { authorized: false, lanes: [] };
    },
  });
  const server = createServer(createServerRequestHandler({ roleApplicationService: service }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    return await callback({ baseUrl, statePath });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(directory, { recursive: true, force: true });
  }
}

async function request(baseUrl, path, { method = 'GET', wallet, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(wallet ? localSiweHeaders(wallet) : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, json: await response.json() };
}

test('default server keeps role-application paths absent until a service is injected', async () => {
  const server = createServer(createServerRequestHandler());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/role-applications/mine`, {
      headers: {
        'x-request-id': 'role-route-missing-01',
      },
    });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-request-id'), 'role-route-missing-01');
    assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('x-permitted-cross-domain-policies'), 'none');
    assert.deepEqual(await response.json(), { error: 'not_found', requestId: 'role-route-missing-01' });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('submission validates server-owned identity, persists atomically at 0600, and is owner-readable', async () => {
  await withHarness({}, async ({ baseUrl, statePath }) => {
    const rejected = await request(baseUrl, '/api/role-applications', {
      method: 'POST',
      wallet: APPLICANT,
      headers: { 'x-request-id': 'role-identity-reject-01' },
      body: applicationPayload({ wallet: REVIEWER }),
    });
    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.response.headers.get('x-request-id'), 'role-identity-reject-01');
    assert.equal(rejected.json.error, 'forbidden_client_identity_field');
    assert.equal(rejected.json.requestId, 'role-identity-reject-01');

    const submitted = await request(baseUrl, '/api/role-applications', {
      method: 'POST', wallet: APPLICANT, body: applicationPayload(),
    });
    assert.equal(submitted.response.status, 201);
    assert.equal(submitted.json.application.state, 'submitted');
    assert.equal(submitted.json.application.capabilityGrant, null);
    assert.equal(submitted.json.application.provisioning, 'not_requested');

    const persisted = JSON.parse(await readFile(statePath, 'utf8'));
    const fileMode = (await stat(statePath)).mode & 0o777;
    assert.equal(fileMode, 0o600);
    assert.equal(Object.values(persisted.applications).length, 1);
    assert.equal(Object.values(persisted.applications)[0].applicantWallet, APPLICANT);
    assert.equal(Object.values(persisted.applications)[0].audit[0].kind, 'application_submitted');

    const mine = await request(baseUrl, '/api/role-applications/mine', { wallet: APPLICANT });
    assert.equal(mine.response.status, 200);
    assert.equal(mine.json.applications[0].id, submitted.json.application.id);
  });
});

test('admin review state machine is optimistic and terminal decisions remain immutable', async () => {
  await withHarness({ decisionAuthority: true }, async ({ baseUrl }) => {
    const submitted = await request(baseUrl, '/api/role-applications', {
      method: 'POST', wallet: APPLICANT, body: applicationPayload(),
    });
    const id = submitted.json.application.id;
    let version = submitted.json.application.version;
    const queue = await request(baseUrl, '/api/admin/role-applications?roleId=research-contributor', { wallet: REVIEWER });
    assert.equal(queue.response.status, 200);
    assert.equal(queue.json.applications[0].id, id);
    const summary = await request(baseUrl, '/api/admin/role-applications/summary', { wallet: REVIEWER });
    assert.equal(summary.response.status, 200);
    assert.equal(summary.json.counts.submitted, 1);
    for (const [action, expectedState] of [
      ['start_review', 'in_review'],
      ['request_info', 'needs_info'],
      ['resume_review', 'in_review'],
      ['approve', 'approved'],
    ]) {
      const reviewed = await request(baseUrl, `/api/admin/role-applications/${id}/review`, {
        method: 'PATCH', wallet: REVIEWER, body: { action, expectedVersion: version, reviewer: APPLICANT },
      });
      assert.equal(reviewed.response.status, 200);
      assert.equal(reviewed.json.application.state, expectedState);
      assert.equal(reviewed.json.application.capabilityGrant, null);
      assert.equal(reviewed.json.application.provisioning, 'not_requested');
      version = reviewed.json.application.version;
    }

    const conflict = await request(baseUrl, `/api/admin/role-applications/${id}/review`, {
      method: 'PATCH', wallet: REVIEWER, body: { action: 'reject', expectedVersion: version - 1 },
    });
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.json.error, 'version_conflict');

    const terminal = await request(baseUrl, `/api/admin/role-applications/${id}/review`, {
      method: 'PATCH', wallet: REVIEWER, body: { action: 'reject', expectedVersion: version },
    });
    assert.equal(terminal.response.status, 409);
    assert.equal(terminal.json.error, 'terminal_immutable');
  });
});

test('foreign applicants receive not-found status projections', async () => {
  await withHarness({}, async ({ baseUrl }) => {
    const submitted = await request(baseUrl, '/api/role-applications', {
      method: 'POST', wallet: APPLICANT, body: applicationPayload(),
    });
    const response = await request(baseUrl, `/api/role-applications/${submitted.json.application.id}/status`, { wallet: OTHER_APPLICANT });
    assert.equal(response.response.status, 404);
    assert.equal(response.json.error, 'not_found');
    assert.match(response.json.requestId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  });
});

test('missing decision authority holds final decisions pending without a capability grant', async () => {
  await withHarness({ decisionAuthority: false }, async ({ baseUrl, statePath }) => {
    const submitted = await request(baseUrl, '/api/role-applications', {
      method: 'POST', wallet: APPLICANT, body: applicationPayload(),
    });
    const id = submitted.json.application.id;
    const started = await request(baseUrl, `/api/admin/role-applications/${id}/review`, {
      method: 'PATCH', wallet: REVIEWER, body: { action: 'start_review', expectedVersion: 1 },
    });
    const held = await request(baseUrl, `/api/admin/role-applications/${id}/review`, {
      method: 'PATCH', wallet: REVIEWER, body: { action: 'approve', expectedVersion: started.json.application.version, authority: 'client-supplied' },
    });
    assert.equal(held.response.status, 200);
    assert.equal(held.json.application.state, 'pending_authority');
    assert.equal(held.json.application.capabilityGrant, null);
    assert.equal(held.json.application.provisioning, 'not_requested');
    assert.equal(held.json.application.audit.at(-1).kind, 'decision_held_pending_authority');
    const persisted = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(Object.values(persisted.applications)[0].capabilityGrant, null);
  });
});
