import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = join(projectRoot, 'scripts', 'write-release-manifest.mjs');

test('release manifest captures target provenance and immutable evidence paths', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'release-manifest-'));

  try {
    const planPath = join(tempDir, 'alias-plan.json');
    const previewPath = join(tempDir, 'preview-summary.json');
    const resultPath = join(tempDir, 'alias-result.json');
    const postPath = join(tempDir, 'post-summary.json');
    const smokeLogPath = join(tempDir, 'smoke.log');
    const outputPath = join(tempDir, 'release-manifest.json');

    await writeFile(planPath, `${JSON.stringify({
      selected: {
        id: 'dpl_target',
        url: 'https://agent-next-bittrees-tech.vercel.app',
        host: 'agent-next-bittrees-tech.vercel.app',
        meta: {
          githubCommitSha: 'abc1234def5678abc1234def5678abc1234def56',
          gitDirty: '0',
        },
      },
      current: {
        id: 'dpl_current',
        url: 'https://agent-current-bittrees-tech.vercel.app',
        host: 'agent-current-bittrees-tech.vercel.app',
        aliases: ['https://agent.bittrees.org'],
      },
    }, null, 2)}\n`);
    await writeFile(previewPath, `${JSON.stringify({
      generatedAt: '2026-07-22T09:00:00.000Z',
      primary: {
        baseUrl: 'https://agent-next-bittrees-tech.vercel.app/',
        requestId: 'preview-1',
        releaseMetadata: {
          commitSha: 'abc1234def5678abc1234def5678abc1234def56',
        },
      },
    }, null, 2)}\n`);
    await writeFile(resultPath, `${JSON.stringify({ mutated: true }, null, 2)}\n`);
    await writeFile(postPath, `${JSON.stringify({
      generatedAt: '2026-07-22T09:05:00.000Z',
      primary: {
        baseUrl: 'https://agent.bittrees.org/',
        requestId: 'prod-1',
        releaseMetadata: {
          commitSha: 'abc1234def5678abc1234def5678abc1234def56',
        },
      },
    }, null, 2)}\n`);
    await writeFile(smokeLogPath, 'all smoke checks passed\n');

    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      `--output=${outputPath}`,
      '--action=publish',
      '--alias=agent.bittrees.org',
      `--plan=${planPath}`,
      `--preview=${previewPath}`,
      `--result=${resultPath}`,
      `--post=${postPath}`,
      `--smoke-log=${smokeLogPath}`,
      '--expected-commit=abc1234def5678abc1234def5678abc1234def56',
    ], {
      cwd: projectRoot,
    });

    const summary = JSON.parse(stdout);
    assert.equal(summary.manifestPath, outputPath);
    assert.match(summary.manifestSha256, /^[a-f0-9]{64}$/);

    const manifest = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(manifest.schema, 'agent.bittrees.release-control-manifest.v1');
    assert.equal(manifest.immutable, true);
    assert.equal(manifest.target.commitSha, 'abc1234def5678abc1234def5678abc1234def56');
    assert.equal(manifest.provenance.postReleaseMatchesTarget, true);
    assert.equal(manifest.evidence.smokeLogPath, smokeLogPath);

    const checksum = await readFile(`${outputPath}.sha256`, 'utf8');
    assert.match(checksum, /^[a-f0-9]{64}  /);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
