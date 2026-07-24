import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));

function withServer(handler, callback) {
  const server = createServer(handler);
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      try {
        resolve(await callback(`http://127.0.0.1:${address.port}`));
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

test('production backup captures routes, hashes, and explicit state paths', async () => {
  await withServer((request, response) => {
    const body = {
      route: new URL(request.url, 'http://backup.test').pathname,
      status: 'ok',
      schema: { title: 'test backup route' },
      data: { ok: true },
    };
    if (body.route === '/api/health') {
      body.health = { overall: 'ok', checks: [{ id: 'test', status: 'ok' }] };
      body.observability = { requestIdHeader: 'X-Request-Id' };
      body.releaseMetadata = { schemaVersion: 'agent.bittrees.release-metadata.v1' };
    }
    response.writeHead(200, {
      'content-type': 'application/json',
      'x-request-id': request.headers['x-request-id'] ?? '',
    });
    response.end(`${JSON.stringify(body)}\n`);
  }, async (baseUrl) => {
    const testResultsRoot = fileURLToPath(new URL('../test-results/', import.meta.url));
    await mkdir(testResultsRoot, { recursive: true });
    const tempRoot = await mkdtemp(join(testResultsRoot, 'backup-'));
    const stateDir = join(tempRoot, 'state');
    const outputDir = join(tempRoot, 'backups');
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, 'submissions.jsonl'), '{"id":"sub_1"}\n', 'utf8');

    await execFileAsync(process.execPath, [
      'scripts/production-backup.mjs',
      `--base-url=${baseUrl}`,
      `--output-dir=${outputDir}`,
      '--skip-vercel',
      '--routes=/api/health,/monitoring.json,/idacc/releases.json',
      `--include-path=${stateDir}`,
    ], { cwd: root });

    const pointer = JSON.parse(await readFile(join(outputDir, 'latest-manifest.json'), 'utf8'));
    assert.equal(pointer.schema, 'agent.bittrees.production-backup-pointer.v1');
    assert.match(pointer.manifestSha256, /^[a-f0-9]{64}$/);

    const manifest = JSON.parse(await readFile(join(outputDir, pointer.latestManifest), 'utf8'));
    assert.equal(manifest.schema, 'agent.bittrees.production-backup.v1');
    assert.equal(manifest.baseUrl, `${baseUrl}/`);
    assert.equal(manifest.routeCount, 3);
    assert.deepEqual(manifest.routes.map((route) => route.route), [
      '/api/health',
      '/monitoring.json',
      '/idacc/releases.json',
    ]);
    assert.equal(manifest.routes.every((route) => route.status === 200 && route.ok), true);
    assert.equal(manifest.routes.every((route) => /^[a-f0-9]{64}$/.test(route.sha256)), true);
    assert.equal(manifest.statePaths.length, 1);
    assert.equal(manifest.statePaths[0].fileCount, 1);
    assert.equal(manifest.statePaths[0].files[0].source, 'submissions.jsonl');
    assert.equal(manifest.vercel.status, 'skipped');
  });
});
