import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_BASE_URL = 'https://agent.bittrees.org';
const HEALTH_ROUTE = '/api/health';

function readArg(name, fallback = '') {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function normalizeUrl(value, fallback = DEFAULT_BASE_URL) {
  const raw = String(value ?? fallback).trim();
  const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url;
}

function help() {
  console.log(`Usage: node scripts/rollout-check.mjs --base-url=https://... [--rollback-url=https://...] [--health-only]

Checks the dynamic /api/health route and, unless --health-only is passed,
runs the existing smoke suite against the primary deployment and optional
rollback deployment.
`);
}

function requiredHeader(response, name, label) {
  const value = String(response.headers.get(name) ?? '').trim();
  if (!value) {
    throw new Error(`${label} response did not include the ${name} header.`);
  }
  return value;
}

async function parseJsonResponse(response, url, label) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} ${url} did not return JSON: ${error.message}`);
  }
}

function assertReleaseMetadataMatches(releaseMetadata, { expectedReleaseVersion, expectedReleaseTag, expectedReleaseCommit }, label) {
  if (releaseMetadata?.schemaVersion !== 'agent.bittrees.release-metadata.v1') {
    throw new Error(`${label} health route did not expose release metadata.`);
  }
  if (expectedReleaseVersion && releaseMetadata?.version !== expectedReleaseVersion) {
    throw new Error(`${label} release version ${releaseMetadata?.version} did not match ${expectedReleaseVersion}.`);
  }
  if (expectedReleaseTag && releaseMetadata?.tag !== expectedReleaseTag) {
    throw new Error(`${label} release tag ${releaseMetadata?.tag} did not match ${expectedReleaseTag}.`);
  }
  if (
    expectedReleaseCommit
    && String(releaseMetadata?.commitSha ?? '').toLowerCase() !== expectedReleaseCommit.toLowerCase()
  ) {
    throw new Error(`${label} release commit ${releaseMetadata?.commitSha} did not match ${expectedReleaseCommit}.`);
  }
}

async function verifyHealth(baseUrl, label, expectations) {
  const healthUrl = new URL(HEALTH_ROUTE, baseUrl);
  const response = await fetch(healthUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'agent.bittrees.org-rollout-check',
    },
  });

  const requestId = requiredHeader(response, 'x-request-id', label);
  if (response.status !== 200) {
    throw new Error(`${label} ${healthUrl} returned ${response.status}.`);
  }

  const body = await parseJsonResponse(response, healthUrl, label);
  if (body?.route !== HEALTH_ROUTE) {
    throw new Error(`${label} health route mismatch: expected ${HEALTH_ROUTE}, got ${body?.route}.`);
  }
  if (body?.status !== 'ok') {
    throw new Error(`${label} health status was ${body?.status ?? 'missing'}.`);
  }
  if (body?.health?.overall !== 'ok') {
    throw new Error(`${label} overall health was ${body?.health?.overall ?? 'missing'}.`);
  }
  if (!Array.isArray(body?.health?.checks) || body.health.checks.length === 0) {
    throw new Error(`${label} health route did not expose any checks.`);
  }
  if (body?.observability?.requestIdHeader !== 'X-Request-Id') {
    throw new Error(`${label} observability metadata did not retain X-Request-Id.`);
  }

  assertReleaseMetadataMatches(body.releaseMetadata, expectations, label);

  return {
    label,
    baseUrl: baseUrl.toString(),
    healthUrl: healthUrl.toString(),
    requestId,
    releaseMetadata: body.releaseMetadata,
    checks: body.health.checks,
  };
}

async function runSmoke(baseUrl, label, expectations) {
  const args = [
    'scripts/smoke-check.mjs',
    `--base-url=${baseUrl.toString()}`,
  ];
  if (expectations.expectedReleaseVersion) {
    args.push(`--expected-release-version=${expectations.expectedReleaseVersion}`);
  }
  if (expectations.expectedReleaseTag) {
    args.push(`--expected-release-tag=${expectations.expectedReleaseTag}`);
  }
  if (expectations.expectedReleaseCommit) {
    args.push(`--expected-release-commit=${expectations.expectedReleaseCommit}`);
  }

  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`${label} smoke check failed with exit code ${exitCode}.`);
  }

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

if (process.argv.includes('--help')) {
  help();
  process.exit(0);
}

const baseUrl = normalizeUrl(readArg('--base-url', process.env.BASE_URL ?? DEFAULT_BASE_URL));
const rollbackUrlValue = readArg('--rollback-url', process.env.ROLLBACK_BASE_URL ?? '');
const rollbackUrl = rollbackUrlValue ? normalizeUrl(rollbackUrlValue, rollbackUrlValue) : null;
const summaryFile = readArg('--summary-file', process.env.ROLLOUT_SUMMARY_FILE ?? '');
const healthOnly = process.argv.includes('--health-only');

const expectations = {
  expectedReleaseVersion: readArg('--expected-release-version', process.env.EXPECTED_RELEASE_VERSION ?? ''),
  expectedReleaseTag: readArg('--expected-release-tag', process.env.EXPECTED_RELEASE_TAG ?? ''),
  expectedReleaseCommit: readArg('--expected-release-commit', process.env.EXPECTED_RELEASE_COMMIT ?? ''),
};

const summary = {
  generatedAt: new Date().toISOString(),
  primary: await verifyHealth(baseUrl, 'primary deployment', expectations),
};

if (!healthOnly) {
  summary.primary.smoke = await runSmoke(baseUrl, 'primary deployment', expectations);
}

if (rollbackUrl) {
  summary.rollback = await verifyHealth(rollbackUrl, 'rollback deployment', expectations);
  if (!healthOnly) {
    summary.rollback.smoke = await runSmoke(rollbackUrl, 'rollback deployment', expectations);
  }
}

if (summaryFile) {
  await writeFile(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

console.log(
  `Rollout check passed for ${baseUrl.toString()}`
  + (rollbackUrl ? ` with rollback target ${rollbackUrl.toString()}` : ''),
);
