#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  writeFile,
} from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

import { requestUrl } from './request-url.mjs';

const execFileAsync = promisify(execFile);
const rootDir = fileURLToPath(new URL('..', import.meta.url));

const DEFAULT_BASE_URL = 'https://agent.bittrees.org';
const DEFAULT_OUTPUT_DIR = 'output/production-backups';
const DEFAULT_ROUTES = [
  '/api/health',
  '/monitoring.json',
  '/portal-manifest.json',
  '/idacc/releases.json',
  '/agents.json',
  '/identity-keys.json',
  '/sources.json',
  '/opportunities.json',
  '/onboarding.json',
  '/mcp.json',
  '/submission-status.json',
  '/reputation.json',
  '/terms-of-use.json',
  '/privacy.json',
  '/v1/registry/agents',
];

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.BASE_URL || DEFAULT_BASE_URL,
    outputDir: process.env.PRODUCTION_BACKUP_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    routes: process.env.PRODUCTION_BACKUP_ROUTES
      ? splitList(process.env.PRODUCTION_BACKUP_ROUTES)
      : [...DEFAULT_ROUTES],
    includePaths: process.env.PRODUCTION_STATE_PATHS
      ? splitList(process.env.PRODUCTION_STATE_PATHS)
      : [],
    vercelProject: process.env.VERCEL_PROJECT || 'agent',
    vercelScope: process.env.VERCEL_SCOPE || 'bittrees-tech',
    vercelDeployment: process.env.VERCEL_DEPLOYMENT || '',
    vercelProtected: false,
    skipVercel: false,
    requireVercel: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      index += 1;
      return argv[index] ?? '';
    };

    if (arg === '--help') {
      options.help = true;
    } else if (arg === '--vercel-protected') {
      options.vercelProtected = true;
    } else if (arg === '--skip-vercel') {
      options.skipVercel = true;
    } else if (arg === '--require-vercel') {
      options.requireVercel = true;
    } else if (arg === '--base-url') {
      options.baseUrl = nextValue();
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
    } else if (arg === '--output-dir') {
      options.outputDir = nextValue();
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length);
    } else if (arg === '--routes') {
      options.routes = splitList(nextValue());
    } else if (arg.startsWith('--routes=')) {
      options.routes = splitList(arg.slice('--routes='.length));
    } else if (arg === '--extra-route') {
      options.routes.push(nextValue());
    } else if (arg.startsWith('--extra-route=')) {
      options.routes.push(arg.slice('--extra-route='.length));
    } else if (arg === '--include-path') {
      options.includePaths.push(nextValue());
    } else if (arg.startsWith('--include-path=')) {
      options.includePaths.push(arg.slice('--include-path='.length));
    } else if (arg === '--vercel-project') {
      options.vercelProject = nextValue();
    } else if (arg.startsWith('--vercel-project=')) {
      options.vercelProject = arg.slice('--vercel-project='.length);
    } else if (arg === '--vercel-scope') {
      options.vercelScope = nextValue();
    } else if (arg.startsWith('--vercel-scope=')) {
      options.vercelScope = arg.slice('--vercel-scope='.length);
    } else if (arg === '--vercel-deployment') {
      options.vercelDeployment = nextValue();
    } else if (arg.startsWith('--vercel-deployment=')) {
      options.vercelDeployment = arg.slice('--vercel-deployment='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.routes = [...new Set(options.routes.map(normalizeRoute).filter(Boolean))];
  options.includePaths = [...new Set(options.includePaths.filter(Boolean))];
  return options;
}

function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeRoute(route) {
  const trimmed = String(route ?? '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function normalizeBaseUrl(value) {
  const raw = String(value || DEFAULT_BASE_URL).trim();
  const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url;
}

function safeName(value) {
  const safe = String(value || 'root')
    .replace(/^\/+/, '')
    .replace(/[?#]/g, '__')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || 'root';
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:]/g, '-');
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function fetchRoute(baseUrl, route, backupDir, options) {
  const routeUrl = new URL(route, baseUrl);
  const requestId = `backup-${Date.now()}-${safeName(route).slice(0, 60)}`;
  const response = await requestUrl(routeUrl, {
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'User-Agent': 'agent.bittrees.org-production-backup',
      'X-Request-Id': requestId,
    },
    vercelDeployment: options.vercelDeployment || (options.vercelProtected ? baseUrl.origin : ''),
    cwd: rootDir,
  });
  const body = Buffer.from(await response.arrayBuffer());
  const routeStem = safeName(route);
  const routeDir = join(backupDir, 'routes');
  await mkdir(routeDir, { recursive: true });

  const bodyPath = join(routeDir, `${routeStem}.body`);
  const headerPath = join(routeDir, `${routeStem}.headers.json`);
  const headers = Object.fromEntries([...response.headers.entries()].sort(([a], [b]) => a.localeCompare(b)));

  await writeFile(bodyPath, body);
  await writeJson(headerPath, {
    url: routeUrl.toString(),
    route,
    status: response.status,
    requestId,
    headers,
  });

  return {
    route,
    url: routeUrl.toString(),
    status: response.status,
    ok: response.status >= 200 && response.status < 400,
    contentType: response.headers.get('content-type') || '',
    requestId,
    responseRequestId: response.headers.get('x-request-id') || null,
    bytes: body.byteLength,
    sha256: sha256(body),
    bodyPath: relative(backupDir, bodyPath),
    headersPath: relative(backupDir, headerPath),
  };
}

async function copyStatePath(sourcePath, backupDir, index) {
  const source = resolve(sourcePath);
  await access(source, fsConstants.R_OK);
  const rootName = `${String(index + 1).padStart(2, '0')}-${safeName(basename(source) || 'state')}`;
  const destination = join(backupDir, 'state', rootName);
  const files = [];
  await copyStateNode(source, destination, source, backupDir, files);

  return {
    source,
    snapshotPath: relative(backupDir, destination),
    fileCount: files.filter((file) => file.type === 'file').length,
    files,
  };
}

async function copyStateNode(source, destination, rootSource, backupDir, files) {
  const info = await lstat(source);
  if (info.isSymbolicLink()) {
    files.push({
      type: 'symlink',
      source: relative(rootSource, source) || '.',
      target: await readlink(source),
      copied: false,
    });
    return;
  }

  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    const entries = await readdir(source);
    for (const entry of entries) {
      await copyStateNode(join(source, entry), join(destination, entry), rootSource, backupDir, files);
    }
    return;
  }

  if (!info.isFile()) {
    files.push({
      type: 'special',
      source: relative(rootSource, source) || '.',
      copied: false,
    });
    return;
  }

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  const contents = await readFile(destination);
  files.push({
    type: 'file',
    source: relative(rootSource, source) || basename(source),
    path: relative(backupDir, destination),
    bytes: contents.byteLength,
    sha256: sha256(contents),
  });
}

async function runVercelCommand(args, backupDir, fileName) {
  const startedAt = new Date().toISOString();
  const result = await execFileAsync('vercel', args, {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const outputPath = join(backupDir, 'vercel', fileName);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.stdout, 'utf8');
  return {
    command: ['vercel', ...args].join(' '),
    startedAt,
    stdoutPath: relative(backupDir, outputPath),
    bytes: Buffer.byteLength(result.stdout),
    sha256: sha256(Buffer.from(result.stdout)),
  };
}

async function collectVercelMetadata(options, baseUrl, backupDir) {
  if (options.skipVercel) {
    return {
      status: 'skipped',
      reason: '--skip-vercel was set',
    };
  }

  const commands = [];
  const failures = [];
  const commandSpecs = [
    {
      fileName: 'inspect-production.json',
      args: ['inspect', baseUrl.toString(), '--scope', options.vercelScope, '--format=json', '--no-color'],
    },
    {
      fileName: 'deployments.json',
      args: ['ls', options.vercelProject, '--scope', options.vercelScope, '--format=json', '--no-color'],
    },
  ];

  for (const spec of commandSpecs) {
    try {
      commands.push(await runVercelCommand(spec.args, backupDir, spec.fileName));
    } catch (error) {
      failures.push({
        command: ['vercel', ...spec.args].join(' '),
        message: error.message,
        stderr: error.stderr || '',
      });
    }
  }

  if (failures.length > 0 && options.requireVercel) {
    throw new Error(`Vercel metadata collection failed: ${failures.map((failure) => failure.message).join('; ')}`);
  }

  return {
    status: failures.length > 0 ? 'partial' : 'ok',
    scope: options.vercelScope,
    project: options.vercelProject,
    commands,
    failures,
  };
}

function printHelp() {
  console.log(`Usage: node scripts/production-backup.mjs [options]

Creates a timestamped, hash-manifested backup of the public production
service state for agent.bittrees.org. Secrets are not read or exported.

Options:
  --base-url=https://agent.bittrees.org     Production base URL.
  --output-dir=output/production-backups    Directory for backup snapshots.
  --routes=/a,/b                            Comma-separated route list.
  --extra-route=/path                       Add one route to the default list.
  --include-path=/path                      Copy a non-secret local state path.
  --vercel-protected                        Route service checks through \`vercel curl\`.
  --vercel-deployment=https://...           Explicit protected deployment target.
  --skip-vercel                             Do not attempt Vercel CLI metadata.
  --require-vercel                          Fail if Vercel metadata is missing.
  --vercel-project=agent                    Vercel project name for metadata.
  --vercel-scope=bittrees-tech              Vercel team scope for metadata.
`);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

const baseUrl = normalizeBaseUrl(options.baseUrl);
const outputDir = resolve(options.outputDir);
const generatedAt = new Date().toISOString();
const backupDir = join(outputDir, `agent-bittrees-org-${timestampSlug(new Date(generatedAt))}`);

await mkdir(backupDir, { recursive: true });

const routes = [];
for (const route of options.routes) {
  routes.push(await fetchRoute(baseUrl, route, backupDir, options));
}

const failedRoutes = routes.filter((route) => !route.ok);
if (failedRoutes.length > 0) {
  throw new Error(`Production backup route capture failed: ${failedRoutes.map((route) => `${route.route}=${route.status}`).join(', ')}`);
}

const statePaths = [];
for (const [index, includePath] of options.includePaths.entries()) {
  statePaths.push(await copyStatePath(includePath, backupDir, index));
}

const vercel = await collectVercelMetadata(options, baseUrl, backupDir);

const manifest = {
  schema: 'agent.bittrees.production-backup.v1',
  service: 'agent.bittrees.org',
  generatedAt,
  baseUrl: baseUrl.toString(),
  backupDir,
  routeCount: routes.length,
  routes,
  statePaths,
  vercel,
  restoreNotes: [
    'Use route body files and hashes as the public service-state baseline for rollback/candidate comparison.',
    'For explicitly included state paths, stop writers, copy the state snapshot back to the original path, restart, then run npm run health and npm run smoke.',
    'This backup intentionally excludes secrets, DNS, TLS, Vercel environment variables, wallet material, and deployment mutation.',
  ],
};

const manifestPath = join(backupDir, 'backup-manifest.json');
await writeJson(manifestPath, manifest);

const manifestBytes = await readFile(manifestPath);
await writeJson(join(outputDir, 'latest-manifest.json'), {
  schema: 'agent.bittrees.production-backup-pointer.v1',
  generatedAt,
  latestManifest: relative(outputDir, manifestPath),
  manifestSha256: sha256(manifestBytes),
});

console.log(`Production backup written to ${backupDir}`);
console.log(`Manifest: ${manifestPath}`);
console.log(`Routes captured: ${routes.length}`);
if (statePaths.length > 0) console.log(`State paths captured: ${statePaths.length}`);
if (vercel.status !== 'ok') console.log(`Vercel metadata status: ${vercel.status}`);
