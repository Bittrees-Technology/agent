import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchLatestIdaccRelease } from '../scripts/github-release.mjs';

test('release verification authenticates only to the fixed GitHub API and refuses redirects', async () => {
  const release = { tag_name: 'v1.2.3', published_at: '2026-09-01T00:00:00Z' };
  assert.deepEqual(await fetchLatestIdaccRelease({ token: ' test-token ', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/bobofbuilding/idacc/releases/latest');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(release);
  } }), release);
});

test('local release verification works without a token', async () => {
  await fetchLatestIdaccRelease({ token: '', fetchImpl: async (_url, options) => {
    assert.equal(options.headers.Authorization, undefined);
    return Response.json({ tag_name: 'v1', published_at: '2026-09-01T00:00:00Z' });
  } });
});

test('rate limits and invalid responses fail without inventing release drift', async () => {
  for (const [response, expected] of [
    [new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }), /rate limit/],
    [new Response('', { status: 503 }), /HTTP 503/],
    [new Response('not json'), /invalid JSON/],
    [Response.json({ message: 'unavailable' }), /metadata is incomplete/],
  ]) {
    await assert.rejects(fetchLatestIdaccRelease({ token: '', fetchImpl: async () => response }), expected);
  }
});

test('network errors never echo credentials or provider response bodies', async () => {
  await assert.rejects(fetchLatestIdaccRelease({ token: 'secret', fetchImpl: async () => {
    throw new Error('secret provider details');
  } }), (error) => {
    assert.match(error.message, /failed or timed out/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
});
