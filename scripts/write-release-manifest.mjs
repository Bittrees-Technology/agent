import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));

function readArg(name, fallback = '') {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function help() {
  console.log(`Usage: node scripts/write-release-manifest.mjs --output=output/.../release-manifest.json --action=publish|rollback --alias=agent.bittrees.org --plan=output/.../alias-plan.json [options]

Builds an immutable release-control manifest by combining the alias plan,
preview verification, alias result, and post-release verification artifacts.

Options:
  --output=...json               Required output path.
  --action=publish|rollback      Required release action.
  --alias=agent.bittrees.org     Required production alias.
  --plan=...json                 Required alias-plan JSON.
  --preview=...json              Optional preview rollout summary JSON.
  --result=...json               Optional alias-result JSON.
  --post=...json                 Optional post-release rollout summary JSON.
  --smoke-log=...log             Optional post-release smoke log path.
  --expected-commit=<sha>        Optional expected commit SHA.
`);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  if (!path) return null;
  return JSON.parse(await readFile(resolve(rootDir, path), 'utf8'));
}

async function readText(path) {
  if (!path) return null;
  return readFile(resolve(rootDir, path), 'utf8');
}

function normalizeCommit(value) {
  const raw = String(value ?? '').trim();
  return raw ? raw.toLowerCase() : null;
}

function summarizeVerification(payload) {
  if (!payload) return null;
  return {
    generatedAt: payload.generatedAt ?? null,
    primary: payload.primary
      ? {
        baseUrl: payload.primary.baseUrl ?? null,
        requestId: payload.primary.requestId ?? null,
        releaseMetadata: payload.primary.releaseMetadata ?? null,
      }
      : null,
    rollback: payload.rollback
      ? {
        baseUrl: payload.rollback.baseUrl ?? null,
        requestId: payload.rollback.requestId ?? null,
        releaseMetadata: payload.rollback.releaseMetadata ?? null,
      }
      : null,
  };
}

if (process.argv.includes('--help')) {
  help();
  process.exit(0);
}

const outputPath = readArg('--output').trim();
const action = readArg('--action').trim();
const alias = readArg('--alias').trim();
const planPath = readArg('--plan').trim();
const previewPath = readArg('--preview').trim();
const resultPath = readArg('--result').trim();
const postPath = readArg('--post').trim();
const smokeLogPath = readArg('--smoke-log').trim();
const expectedCommit = normalizeCommit(readArg('--expected-commit').trim());

if (!outputPath || !action || !alias || !planPath) {
  help();
  process.exit(1);
}

const absoluteOutputPath = resolve(rootDir, outputPath);
if (await fileExists(absoluteOutputPath)) {
  throw new Error(`Refusing to overwrite existing release manifest: ${absoluteOutputPath}`);
}

const [plan, preview, result, post, smokeLog] = await Promise.all([
  readJson(planPath),
  readJson(previewPath),
  readJson(resultPath),
  readJson(postPath),
  readText(smokeLogPath),
]);

const selectedCommit = normalizeCommit(plan?.selected?.meta?.githubCommitSha ?? plan?.selected?.meta?.gitCommitSha);
const postCommit = normalizeCommit(post?.primary?.releaseMetadata?.commitSha);
const previewCommit = normalizeCommit(preview?.primary?.releaseMetadata?.commitSha);

if (expectedCommit && selectedCommit && selectedCommit !== expectedCommit) {
  throw new Error(`Selected deployment commit ${selectedCommit} did not match expected ${expectedCommit}.`);
}

if (expectedCommit && postCommit && postCommit !== expectedCommit) {
  throw new Error(`Post-release commit ${postCommit} did not match expected ${expectedCommit}.`);
}

const manifest = {
  schema: 'agent.bittrees.release-control-manifest.v1',
  generatedAt: new Date().toISOString(),
  immutable: true,
  action,
  alias,
  expectedCommit,
  target: {
    deploymentId: plan?.selected?.id ?? null,
    url: plan?.selected?.url ?? null,
    host: plan?.selected?.host ?? null,
    commitSha: selectedCommit,
    gitDirty: String(plan?.selected?.meta?.gitDirty ?? '') === '1',
    metadata: plan?.selected?.meta ?? {},
  },
  currentBeforeChange: {
    deploymentId: plan?.current?.id ?? null,
    url: plan?.current?.url ?? null,
    host: plan?.current?.host ?? null,
    aliases: Array.isArray(plan?.current?.aliases) ? plan.current.aliases : [],
  },
  verification: {
    preview: summarizeVerification(preview),
    postRelease: summarizeVerification(post),
  },
  provenance: {
    previewCommit,
    postReleaseCommit: postCommit,
    targetMatchesExpected: expectedCommit ? selectedCommit === expectedCommit : null,
    postReleaseMatchesTarget: selectedCommit ? postCommit === selectedCommit : null,
    postReleaseMatchesExpected: expectedCommit ? postCommit === expectedCommit : null,
  },
  evidence: {
    planPath,
    previewPath: previewPath || null,
    resultPath: resultPath || null,
    postPath: postPath || null,
    smokeLogPath: smokeLogPath || null,
    smokeLogSha256: smokeLog ? createHash('sha256').update(smokeLog).digest('hex') : null,
  },
};

const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');

await mkdir(dirname(absoluteOutputPath), { recursive: true });
await writeFile(absoluteOutputPath, manifestBytes, 'utf8');
await writeFile(`${absoluteOutputPath}.sha256`, `${manifestSha256}  ${outputPath}\n`, 'utf8');

console.log(JSON.stringify({
  manifestPath: outputPath,
  checksumPath: `${outputPath}.sha256`,
  manifestSha256,
}, null, 2));
