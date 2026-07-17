import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = join(projectRoot, 'scripts', 'production-alias-control.mjs');

async function withFakeVercel({ dirtyRollback = false } = {}, callback) {
  const tempDir = await mkdtemp(join(tmpdir(), 'fake-vercel-alias-'));
  const fakeCliPath = join(tempDir, 'vercel.mjs');
  const unixWrapperPath = join(tempDir, 'vercel');
  const windowsWrapperPath = join(tempDir, 'vercel.cmd');
  const recordPath = join(tempDir, 'alias-set.json');

  const fakeCli = `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
const recordPath = ${JSON.stringify(recordPath)};
const dirtyRollback = ${dirtyRollback ? 'true' : 'false'};

if (args[0] === 'inspect') {
  const target = args[1];
  if (String(target).includes('agent.bittrees.org')) {
    console.log(JSON.stringify({
      id: 'dpl_current',
      url: 'agent-current-bittrees-tech.vercel.app',
      target: 'production',
      readyState: 'READY',
      aliases: ['agent.bittrees.org']
    }));
    process.exit(0);
  }
  console.log(JSON.stringify({
    id: 'dpl_target',
    url: 'agent-next-bittrees-tech.vercel.app',
    target: 'production',
    readyState: 'READY',
    aliases: []
  }));
  process.exit(0);
}

if (args[0] === 'list') {
  console.log(JSON.stringify({
    deployments: [
      {
        uid: 'current',
        url: 'agent-current-bittrees-tech.vercel.app',
        target: 'production',
        createdAt: 200,
        meta: { githubCommitSha: 'currentcommit' }
      },
      {
        uid: 'rollback',
        url: 'agent-rollback-bittrees-tech.vercel.app',
        target: 'production',
        createdAt: dirtyRollback ? 300 : 150,
        meta: { githubCommitSha: 'rollbackcommit', gitDirty: dirtyRollback ? '1' : '0' }
      },
      {
        uid: 'publish',
        url: 'agent-next-bittrees-tech.vercel.app',
        target: 'production',
        createdAt: 250,
        meta: { githubCommitSha: 'publishcommit' }
      }
    ]
  }));
  process.exit(0);
}

if (args[0] === 'alias' && args[1] === 'set') {
  fs.writeFileSync(recordPath, JSON.stringify({ target: args[2], alias: args[3] }));
  console.log('alias updated');
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
    return await callback({ env, recordPath });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('publish dry-run reports the selected deployment without mutating aliases', async () => {
  await withFakeVercel({}, async ({ env, recordPath }) => {
    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      '--action=publish',
      '--target=https://agent-next-bittrees-tech.vercel.app',
      '--expected-commit=publishcommit',
    ], {
      cwd: projectRoot,
      env,
    });

    const payload = JSON.parse(stdout);
    assert.equal(payload.action, 'publish');
    assert.equal(payload.mutated, false);
    assert.equal(payload.selected.url, 'https://agent-next-bittrees-tech.vercel.app');
    await assert.rejects(() => readFile(recordPath, 'utf8'));
  });
});

test('rollback auto-selection refuses dirty retained deployments by default', async () => {
  await withFakeVercel({ dirtyRollback: true }, async ({ env }) => {
    await assert.rejects(
      execFileAsync(process.execPath, [
        scriptPath,
        '--action=rollback',
      ], {
        cwd: projectRoot,
        env,
      }),
      /meta\.gitDirty=1/,
    );
  });
});

test('apply mode mutates the alias only after explicit confirmation', async () => {
  await withFakeVercel({}, async ({ env, recordPath }) => {
    await execFileAsync(process.execPath, [
      scriptPath,
      '--action=rollback',
      '--target=https://agent-rollback-bittrees-tech.vercel.app',
      '--expected-commit=rollbackcommit',
      '--allow-dirty-target',
      '--apply',
      '--confirm-alias=agent.bittrees.org',
    ], {
      cwd: projectRoot,
      env,
    });

    const recorded = JSON.parse(await readFile(recordPath, 'utf8'));
    assert.equal(recorded.target, 'agent-rollback-bittrees-tech.vercel.app');
    assert.equal(recorded.alias, 'agent.bittrees.org');
  });
});
