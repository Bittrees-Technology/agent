import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  buildStaticAssets,
  createRequestHandler,
} from '../../src/portal.mjs';

async function withServer(contributionService, callback) {
  const server = createServer(createRequestHandler({ contributionService }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('unauthenticated status routes do not delegate to compatibility or queue projections', async () => {
  const calls = [];
  const contributionService = {
    loadStatusProjection(options) {
      calls.push(options);
      return {
        schema: 'agent.bittrees.contribution-status-projection.v1',
        status: 'status_found',
        query: { id: options.id, kind: options.kind },
        result: {
          schema: 'agent.bittrees.contribution-status-projection.v1',
          kind: 'submission',
          id: options.id,
          submissionId: options.id,
          status: 'approved',
          nextAction: 'dynamic-loader-acceptance-marker',
          reviewGate: { productionMutationAllowed: false },
        },
        reviewGate: { productionMutationAllowed: false },
        privacy: { redacted: true, notFoundForUnauthorizedOwner: true },
      };
    },
  };

  await withServer(contributionService, async (baseUrl) => {
    const htmlResponse = await fetch(`${baseUrl}/submission-status?id=sub_dynamic&kind=submission`);
    const html = await htmlResponse.text();
    assert.equal(htmlResponse.status, 200);
    assert.doesNotMatch(html, /dynamic-loader-acceptance-marker/);
    assert.match(html, /not_found/);
    assert.deepEqual(calls, []);

    const jsonResponse = await fetch(`${baseUrl}/v1/workflow/status?id=sub_dynamic&kind=submission`);
    const json = await jsonResponse.json();
    assert.equal(jsonResponse.status, 200);
    assert.equal(json.lookup.status, 'not_found');
    assert.equal(json.lookup.result, null);
    assert.deepEqual(calls, []);
  });
});

test('status route has no static shadow and its index alias redirects with query intact', async () => {
  const asset = buildStaticAssets().find((item) => item.path === 'submission-status/index.html');
  assert.equal(asset, undefined);

  await withServer({ loadStatusProjection: () => ({ status: 'not_found' }) }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/submission-status/index.html?id=sub_dynamic&kind=submission`, {
      redirect: 'manual',
    });
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), '/submission-status?id=sub_dynamic&kind=submission');
  });
});
