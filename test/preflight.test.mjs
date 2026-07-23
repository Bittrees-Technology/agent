import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const rootDir = fileURLToPath(new URL('..', import.meta.url));

function runNode(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code));
  });
}

test('preflight --only runs a subset, emits partial evidence, and stays fail-closed', async () => {
  const code = await runNode(['scripts/preflight.mjs', '--only=schema,security,launch-readiness']);
  assert.equal(code, 0, 'preflight subset should pass with default (fail-closed) gates');

  const evidence = JSON.parse(await readFile(join(rootDir, 'output/production-readiness/preflight-evidence.json'), 'utf8'));
  assert.equal(evidence.schema, 'agent.bittrees.preflight-evidence.v1');
  assert.equal(evidence.overallStatus, 'pass');
  assert.equal(evidence.partial, true);
  assert.ok(evidence.skippedGates.includes('test'));
  assert.ok(evidence.skippedGates.includes('build'));

  const security = evidence.gates.find((gate) => gate.gate === 'security');
  assert.equal(security.status, 'pass');
  assert.deepEqual(security.violatedInvariants, []);

  const readiness = JSON.parse(await readFile(join(rootDir, 'output/production-readiness/launch-readiness.json'), 'utf8'));
  assert.equal(readiness.overallStatus, 'no-go');
});

test('preflight security gate fails closed when a gate default is violated', async () => {
  const code = await runNode(['scripts/preflight.mjs', '--only=security'], { PUBLIC_INDEXING_ENABLED: '1' });
  assert.equal(code, 1, 'enabling indexing must fail the security invariant check');
});
