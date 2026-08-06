import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  JSON_ROUTE_MAP,
  buildJsonResponse,
  buildStaticAssets,
  createRequestHandler,
} from '../src/portal.mjs';
import { resolveBuildDirtyState, resolveReleaseMetadata } from '../src/release-metadata.mjs';

const RELEASE_COMMIT = '0123456789abcdef0123456789abcdef01234567';

async function withReleaseServer(releaseMetadata, callback) {
  const server = createServer(createRequestHandler({ releaseMetadata }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('release metadata derives the deployed version from an exact build tag', () => {
  const metadata = resolveReleaseMetadata({
    env: { VERCEL_DEPLOYMENT_ID: 'dpl_release_241' },
    packageVersion: '0.1.0',
    gitTag: 'v2.4.1',
    gitCommitSha: RELEASE_COMMIT,
  });

  assert.equal(metadata.version, '2.4.1');
  assert.equal(metadata.tag, 'v2.4.1');
  assert.equal(metadata.commitSha, RELEASE_COMMIT);
  assert.equal(metadata.buildId, 'dpl_release_241');
  assert.equal(metadata.source, 'release-tag');
  assert.notEqual(metadata.version, metadata.packageVersion);
});

test('untagged and dirty builds use immutable commit-derived versions', () => {
  const metadata = resolveReleaseMetadata({
    env: {},
    packageVersion: '0.1.0',
    gitCommitSha: RELEASE_COMMIT,
    dirty: true,
  });

  assert.equal(metadata.version, '0.1.0+0123456789ab.dirty');
  assert.equal(metadata.tag, null);
  assert.equal(metadata.buildId, '0123456789ab');
  assert.equal(metadata.source, 'git-commit');
  assert.equal(metadata.dirty, true);
});

test('hosted immutable commits do not inherit build-platform worktree noise', () => {
  assert.equal(resolveBuildDirtyState({
    env: { VERCEL_GIT_COMMIT_SHA: RELEASE_COMMIT },
    trackedChanges: ' M package.json',
  }), false);
  assert.equal(resolveBuildDirtyState({
    env: { GITHUB_SHA: RELEASE_COMMIT },
    trackedChanges: ' M package.json',
  }), false);
  assert.equal(resolveBuildDirtyState({ env: {}, trackedChanges: ' M package.json' }), true);
  assert.equal(resolveBuildDirtyState({ env: {}, trackedChanges: '' }), false);
});

test('static release artifacts carry the injected build identity', () => {
  const releaseMetadata = resolveReleaseMetadata({
    env: {},
    packageVersion: '0.1.0',
    gitTag: 'v3.2.1',
    gitCommitSha: RELEASE_COMMIT,
  });
  const assets = buildStaticAssets('2026-07-14T00:00:00.000Z', { releaseMetadata });
  const releaseRoute = JSON.parse(assets.find((asset) => asset.path === 'idacc/releases.json').body);
  const manifest = JSON.parse(assets.find((asset) => asset.path === 'portal-manifest.json').body);

  assert.deepEqual(releaseRoute.data.releaseMetadata, releaseMetadata);
  assert.deepEqual(manifest.releaseMetadata, releaseMetadata);
  assert.equal(releaseRoute.data.releaseMetadata.version, '3.2.1');
});

test('runtime release route reports the injected deployed build', async () => {
  const releaseMetadata = resolveReleaseMetadata({
    env: { PORTAL_RELEASE_VERSION: '2026.07.14-rc.2' },
    packageVersion: '0.1.0',
    gitCommitSha: RELEASE_COMMIT,
  });

  await withReleaseServer(releaseMetadata, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/idacc/releases.json`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.data.releaseMetadata, releaseMetadata);
    assert.equal(body.data.releaseMetadata.version, '2026.07.14-rc.2');
  });
});

test('release route schema requires deployed release metadata', () => {
  const releaseRoute = JSON_ROUTE_MAP.get('/idacc/releases.json');
  const response = buildJsonResponse(releaseRoute, '2026-07-14T00:00:00.000Z', {
    releaseMetadata: resolveReleaseMetadata({ env: {}, gitCommitSha: RELEASE_COMMIT }),
  });

  assert.ok(releaseRoute.schema.required.includes('releaseMetadata'));
  assert.equal(response.data.releaseMetadata.commitSha, RELEASE_COMMIT);
});
