import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function readArg(name, fallback = '') {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function help() {
  console.log(`Usage: node scripts/select-rollback-target.mjs --project=agent --scope=bittrees-tech [--exclude-url=https://...]

Select the most recent READY production deployment that is not the excluded URL.
Outputs a JSON object with url, host, createdAt, and metadata.
`);
}

function parseCliJson(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) throw new Error('Vercel CLI returned an empty response.');
  const firstJsonIndex = Math.min(
    ...['{', '[']
      .map((token) => trimmed.indexOf(token))
      .filter((index) => index >= 0),
  );
  if (!Number.isFinite(firstJsonIndex)) {
    throw new Error(`Could not locate JSON in Vercel CLI output: ${trimmed}`);
  }
  return JSON.parse(trimmed.slice(firstJsonIndex));
}

function normalizeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
}

function normalizeHost(value) {
  const absoluteUrl = normalizeUrl(value);
  if (!absoluteUrl) return '';
  return new URL(absoluteUrl).host;
}

async function inspectDeployment(target, scope) {
  const { stdout } = await execFileAsync('vercel', ['inspect', target, '--scope', scope, '--json'], {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  return parseCliJson(stdout);
}

if (process.argv.includes('--help')) {
  help();
  process.exit(0);
}

const project = readArg('--project', String(process.env.VERCEL_PROJECT ?? '').trim() || 'agent');
const scope = readArg('--scope', String(process.env.VERCEL_SCOPE ?? '').trim() || 'bittrees-tech');
const environment = readArg('--environment', 'production');
const excludeUrl = normalizeUrl(readArg('--exclude-url', process.env.ROLLBACK_EXCLUDE_URL ?? ''));
const excludeHost = normalizeHost(excludeUrl);

const excludedHosts = new Set([excludeHost].filter(Boolean));
const excludedUrls = new Set([excludeUrl].filter(Boolean));
let excludedDeployment = null;

if (excludeUrl) {
  try {
    const deployment = await inspectDeployment(excludeUrl, scope);
    const deploymentUrl = normalizeUrl(deployment?.url);
    const aliases = Array.isArray(deployment?.aliases) ? deployment.aliases : [];

    excludedDeployment = {
      id: deployment?.id ?? null,
      url: deploymentUrl || excludeUrl,
      aliases: aliases.map((alias) => normalizeUrl(alias)).filter(Boolean),
    };

    for (const candidateUrl of [deploymentUrl, ...excludedDeployment.aliases]) {
      if (!candidateUrl) continue;
      excludedUrls.add(candidateUrl);
      excludedHosts.add(normalizeHost(candidateUrl));
    }
  } catch (error) {
    console.error(`Warning: could not inspect excluded deployment ${excludeUrl}: ${error.message}`);
  }
}

const cliArgs = [
  'list',
  project,
  '--format=json',
  '--status=READY',
  `--environment=${environment}`,
  '--scope',
  scope,
];

const { stdout } = await execFileAsync('vercel', cliArgs, {
  env: process.env,
  maxBuffer: 10 * 1024 * 1024,
});
const payload = parseCliJson(stdout);
const deployments = Array.isArray(payload?.deployments) ? payload.deployments : [];

const candidate = deployments
  .filter((deployment) => deployment?.target === 'production')
  .map((deployment) => ({
    ...deployment,
    absoluteUrl: normalizeUrl(deployment?.url),
    host: normalizeHost(deployment?.url),
  }))
  .filter((deployment) => deployment.absoluteUrl)
  .filter((deployment) => !excludedUrls.has(deployment.absoluteUrl) && !excludedHosts.has(deployment.host))
  .sort((left, right) => Number(right?.createdAt ?? 0) - Number(left?.createdAt ?? 0))[0];

if (!candidate) {
  console.error('No READY production rollback deployment was found.');
  process.exit(1);
}

console.log(JSON.stringify({
  url: candidate.absoluteUrl,
  host: candidate.url,
  createdAt: candidate.createdAt,
  target: candidate.target,
  meta: candidate.meta ?? {},
  excludedDeployment,
}, null, 2));
