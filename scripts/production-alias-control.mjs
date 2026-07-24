import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_ALIAS = 'agent.bittrees.org';
const DEFAULT_PROJECT = 'agent';
const DEFAULT_SCOPE = 'bittrees-tech';

function readArg(name, fallback = '') {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
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

async function runVercel(args) {
  const { stdout } = await execFileAsync('vercel', args, {
    cwd: rootDir,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function inspectDeployment(target, scope) {
  const stdout = await runVercel(['inspect', target, '--scope', scope, '--json']);
  return parseCliJson(stdout);
}

async function listReadyProductionDeployments(project, scope) {
  const stdout = await runVercel([
    'list',
    project,
    '--format=json',
    '--status=READY',
    '--environment=production',
    '--scope',
    scope,
  ]);
  const payload = parseCliJson(stdout);
  return Array.isArray(payload?.deployments) ? payload.deployments : [];
}

function help() {
  console.log(`Usage: node scripts/production-alias-control.mjs --action=publish|rollback [options]

Controls the production custom-domain alias for agent.bittrees.org with a
default dry-run posture.

Options:
  --action=publish|rollback                  Required action.
  --target=https://deployment.vercel.app     Explicit deployment target.
  --alias=agent.bittrees.org                 Custom domain to move.
  --project=agent                            Vercel project name.
  --scope=bittrees-tech                      Vercel scope/team.
  --expected-commit=<sha>                    Require the target metadata commit.
  --allow-dirty-target                       Permit meta.gitDirty="1".
  --apply                                    Perform the alias mutation.
  --confirm-alias=agent.bittrees.org         Required with --apply.
  --summary-file=output/...json              Optional JSON summary path.

If --action=rollback is used without --target, the script selects the most
recent READY production deployment that is not currently serving the alias.
`);
}

if (process.argv.includes('--help')) {
  help();
  process.exit(0);
}

const action = readArg('--action', '').trim();
if (!['publish', 'rollback'].includes(action)) {
  console.error('Expected --action=publish or --action=rollback.');
  process.exit(1);
}

const alias = readArg('--alias', process.env.PRODUCTION_ALIAS ?? DEFAULT_ALIAS).trim() || DEFAULT_ALIAS;
const project = readArg('--project', process.env.VERCEL_PROJECT ?? DEFAULT_PROJECT).trim() || DEFAULT_PROJECT;
const scope = readArg('--scope', process.env.VERCEL_SCOPE ?? DEFAULT_SCOPE).trim() || DEFAULT_SCOPE;
const explicitTarget = normalizeUrl(readArg('--target', process.env.TARGET_DEPLOYMENT ?? ''));
const expectedCommit = readArg('--expected-commit', process.env.EXPECTED_RELEASE_COMMIT ?? '').trim().toLowerCase();
const summaryFile = readArg('--summary-file', process.env.PRODUCTION_ALIAS_CONTROL_SUMMARY ?? '').trim();
const apply = process.argv.includes('--apply');
const confirmAlias = readArg('--confirm-alias', process.env.CONFIRM_ALIAS ?? '').trim();
const allowDirtyTarget = process.argv.includes('--allow-dirty-target');

if (apply && confirmAlias !== alias) {
  console.error(`Refusing to mutate alias ${alias} without --confirm-alias=${alias}.`);
  process.exit(1);
}

const currentDeployment = await inspectDeployment(`https://${alias}`, scope);
const currentUrl = normalizeUrl(currentDeployment?.url);
const currentHost = normalizeHost(currentUrl);

const readyDeployments = (await listReadyProductionDeployments(project, scope))
  .map((deployment) => ({
    ...deployment,
    absoluteUrl: normalizeUrl(deployment?.url),
    host: normalizeHost(deployment?.url),
  }))
  .filter((deployment) => deployment.absoluteUrl && deployment.target === 'production');

let selected = null;
if (explicitTarget) {
  selected = readyDeployments.find((deployment) => deployment.absoluteUrl === explicitTarget || deployment.host === normalizeHost(explicitTarget));
  if (!selected) {
    const inspected = await inspectDeployment(explicitTarget, scope);
    selected = {
      id: inspected?.id ?? null,
      url: inspected?.url ?? normalizeHost(explicitTarget),
      absoluteUrl: normalizeUrl(inspected?.url ?? explicitTarget),
      host: normalizeHost(inspected?.url ?? explicitTarget),
      target: inspected?.target ?? null,
      readyState: inspected?.readyState ?? null,
      aliases: Array.isArray(inspected?.aliases) ? inspected.aliases : [],
      meta: inspected?.meta ?? {},
      createdAt: inspected?.createdAt ?? null,
    };
  }
} else if (action === 'rollback') {
  selected = readyDeployments
    .filter((deployment) => deployment.host !== currentHost)
    .sort((left, right) => Number(right?.createdAt ?? 0) - Number(left?.createdAt ?? 0))[0];
}

if (!selected) {
  console.error('Could not determine the target deployment.');
  process.exit(1);
}

if (selected.target !== 'production') {
  console.error(`Refusing target ${selected.absoluteUrl}: deployment target was ${selected.target ?? 'missing'}.`);
  process.exit(1);
}

if (selected.readyState && selected.readyState !== 'READY') {
  console.error(`Refusing target ${selected.absoluteUrl}: readyState was ${selected.readyState}.`);
  process.exit(1);
}

const targetCommit = String(selected?.meta?.githubCommitSha ?? selected?.meta?.gitCommitSha ?? '').trim().toLowerCase();
if (expectedCommit && targetCommit !== expectedCommit) {
  console.error(`Refusing target ${selected.absoluteUrl}: commit ${targetCommit || 'missing'} did not match ${expectedCommit}.`);
  process.exit(1);
}

const targetDirty = String(selected?.meta?.gitDirty ?? '').trim() === '1';
if (targetDirty && !allowDirtyTarget) {
  console.error(`Refusing target ${selected.absoluteUrl}: deployment metadata reported meta.gitDirty=1.`);
  process.exit(1);
}

if (selected.host === currentHost) {
  console.error(`Alias ${alias} already points at ${selected.absoluteUrl}.`);
  process.exit(1);
}

const summary = {
  schema: 'agent.bittrees.production-alias-control.v1',
  generatedAt: new Date().toISOString(),
  action,
  alias,
  project,
  scope,
  apply,
  current: {
    id: currentDeployment?.id ?? null,
    url: currentUrl,
    host: currentHost,
    aliases: Array.isArray(currentDeployment?.aliases) ? currentDeployment.aliases.map((entry) => normalizeUrl(entry)) : [],
  },
  selected: {
    id: selected?.id ?? null,
    url: selected?.absoluteUrl,
    host: selected?.host,
    createdAt: selected?.createdAt ?? null,
    meta: selected?.meta ?? {},
  },
};

if (apply) {
  await runVercel(['alias', 'set', selected.host, alias, '--scope', scope]);
  summary.mutated = true;
} else {
  summary.mutated = false;
  summary.nextStep = `Re-run with --apply --confirm-alias=${alias} to move ${alias} to ${selected.absoluteUrl}.`;
}

if (summaryFile) {
  await writeFile(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify(summary, null, 2));
