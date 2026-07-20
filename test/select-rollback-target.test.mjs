import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = join(projectRoot, 'scripts', 'select-rollback-target.mjs');

async function withFakeVercel(callback) {
  const tempDir = await mkdtemp(join(tmpdir(), 'fake-vercel-'));
  const fakeCliPath = join(tempDir, 'vercel.mjs');
  const unixWrapperPath = join(tempDir, 'vercel');
  const windowsWrapperPath = join(tempDir, 'vercel.cmd');

  const fakeCli = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'inspect') {
  console.log(JSON.stringify({
    id: 'dpl_current',
    url: 'agent-current-bittrees-tech.vercel.app',
    aliases: [
      'agent-bittrees-tech.vercel.app',
      'agent.bittrees.org'
    ]
  }));
  process.exit(0);
}
if (args[0] === 'list') {
  console.log(JSON.stringify({
    deployments: [
      {
        url: 'agent-current-bittrees-tech.vercel.app',
        name: 'agent',
        state: 'READY',
        target: 'production',
        createdAt: 200,
        meta: { gitCommitSha: 'current' }
      },
      {
        url: 'agent-previous-bittrees-tech.vercel.app',
        name: 'agent',
        state: 'READY',
        target: 'production',
        createdAt: 100,
        meta: { gitCommitSha: 'previous' }
      }
    ]
  }));
  process.exit(0);
}
console.error('unexpected args', JSON.stringify(args));
process.exit(1);
`;

  const unixWrapper = `#!/bin/sh
exec "${process.execPath}" "${fakeCliPath}" "$@"
`;
  const windowsWrapper = `@"${process.execPath}" "${fakeCliPath}" %*
`;

  await writeFile(fakeCliPath, fakeCli, 'utf8');
  await writeFile(unixWrapperPath, unixWrapper, 'utf8');
  await writeFile(windowsWrapperPath, windowsWrapper, 'utf8');
  await chmod(fakeCliPath, 0o755);
  await chmod(unixWrapperPath, 0o755);

  const env = {
    ...process.env,
    PATH: `${tempDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
  };

  try {
    return await callback(env);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('rollback target selector excludes the deployment currently serving the custom domain', async () => {
  await withFakeVercel(async (env) => {
    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      '--project=agent',
      '--scope=bittrees-tech',
      '--exclude-url=https://agent.bittrees.org',
    ], {
      cwd: projectRoot,
      env,
    });

    const payload = JSON.parse(stdout);

    assert.equal(payload.url, 'https://agent-previous-bittrees-tech.vercel.app');
    assert.equal(payload.host, 'agent-previous-bittrees-tech.vercel.app');
    assert.equal(payload.meta.gitCommitSha, 'previous');
    assert.equal(payload.excludedDeployment.id, 'dpl_current');
    assert.equal(payload.excludedDeployment.url, 'https://agent-current-bittrees-tech.vercel.app');
    assert.ok(payload.excludedDeployment.aliases.includes('https://agent.bittrees.org'));
  });
});
