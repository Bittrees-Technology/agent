// One production preflight command.
//
//   node scripts/preflight.mjs
//
// Runs the release gates in order — check (syntax) → test → build → schema →
// security → launch-readiness — and writes a single machine-readable evidence
// file to output/production-readiness/preflight-evidence.json. Exits non-zero
// if any gate fails. `--only=schema,security` runs a subset (the heavy test and
// build gates are skippable for fast local iteration); the emitted evidence
// records which gates were skipped so a partial run can never masquerade as a
// full pass.

import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveFeatureGates } from '../src/feature-gates.mjs';
import { buildLaunchReadiness } from '../src/launch-readiness.mjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const SCHEMA_DIR = join(rootDir, 'output', 'schemas');
const READINESS_DIR = join(rootDir, 'output', 'production-readiness');
const EVIDENCE_PATH = join(READINESS_DIR, 'preflight-evidence.json');
const READINESS_PATH = join(READINESS_DIR, 'launch-readiness.json');
const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

const ALL_GATES = ['check', 'test', 'build', 'schema', 'security', 'launch-readiness'];

function readArg(name, fallback = '') {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const onlyArg = readArg('--only').trim();
const selected = onlyArg ? new Set(onlyArg.split(',').map((gate) => gate.trim()).filter(Boolean)) : null;
const shouldRun = (gate) => !selected || selected.has(gate);

async function runCommand(gate, command, args) {
  const startedAt = Date.now();
  const child = spawn(command, args, { cwd: rootDir, env: process.env, stdio: 'inherit' });
  const exitCode = await new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', resolvePromise);
  });
  return {
    gate,
    status: exitCode === 0 ? 'pass' : 'fail',
    command: `${command} ${args.join(' ')}`.trim(),
    exitCode,
    durationMs: Date.now() - startedAt,
  };
}

async function runSchemaGate() {
  const startedAt = Date.now();
  const problems = [];
  let files = [];
  try {
    files = (await readdir(SCHEMA_DIR)).filter((name) => name.endsWith('.json'));
  } catch (error) {
    problems.push(`unable to read schema directory: ${error.message}`);
  }
  for (const file of files) {
    try {
      const parsed = JSON.parse(await readFile(join(SCHEMA_DIR, file), 'utf8'));
      if (parsed.$schema !== DRAFT_2020_12) {
        problems.push(`${file} is not declared against draft 2020-12`);
      }
      // A valid root schema declares a type or a recognized combinator/reference.
      const ROOT_KEYWORDS = ['type', 'oneOf', 'anyOf', 'allOf', '$ref', 'enum', 'const', 'properties'];
      if (!ROOT_KEYWORDS.some((keyword) => keyword in parsed)) {
        problems.push(`${file} has no root type or schema combinator`);
      }
    } catch (error) {
      problems.push(`${file} did not parse: ${error.message}`);
    }
  }
  return {
    gate: 'schema',
    status: problems.length === 0 && files.length > 0 ? 'pass' : 'fail',
    schemasValidated: files.length,
    problems,
    durationMs: Date.now() - startedAt,
  };
}

async function runSecurityGate() {
  const startedAt = Date.now();
  // Fail-closed invariants — the deployed defaults that keep the portal safe.
  const gates = resolveFeatureGates(process.env);
  const invariants = [
    { id: 'public-indexing-default-off', ok: gates.publicIndexing.enabled === false },
    { id: 'durable-writes-default-off', ok: gates.durableContributionWrites.enabled === false },
  ];
  const violated = invariants.filter((invariant) => !invariant.ok).map((invariant) => invariant.id);

  // Best-effort dependency audit; advisories are recorded, not fatal, and a
  // failure to run the audit (e.g. offline) does not fail the gate.
  let audit = { ran: false, note: 'npm audit not run' };
  try {
    const result = await new Promise((resolvePromise) => {
      const child = spawn('npm', ['audit', '--omit=dev', '--json'], { cwd: rootDir });
      let stdout = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.on('error', () => resolvePromise(null));
      child.on('close', () => resolvePromise(stdout));
    });
    if (result) {
      const parsed = JSON.parse(result);
      audit = { ran: true, vulnerabilities: parsed.metadata?.vulnerabilities ?? null };
    }
  } catch {
    audit = { ran: false, note: 'npm audit unavailable or produced no JSON' };
  }

  return {
    gate: 'security',
    status: violated.length === 0 ? 'pass' : 'fail',
    invariants,
    violatedInvariants: violated,
    dependencyAudit: audit,
    durationMs: Date.now() - startedAt,
  };
}

async function runLaunchReadinessGate() {
  const startedAt = Date.now();
  const readiness = buildLaunchReadiness({ env: process.env });
  await mkdir(dirname(READINESS_PATH), { recursive: true });
  await writeFile(READINESS_PATH, `${JSON.stringify(readiness, null, 2)}\n`);
  return {
    gate: 'launch-readiness',
    // The checklist is generated successfully regardless of go/no-go; the
    // gate only fails if it cannot be produced.
    status: 'pass',
    overallStatus: readiness.overallStatus,
    outstanding: readiness.summary.outstanding,
    artifact: 'output/production-readiness/launch-readiness.json',
    durationMs: Date.now() - startedAt,
  };
}

const gateRunners = {
  check: () => runCommand('check', 'npm', ['run', 'check']),
  test: () => runCommand('test', 'npm', ['test']),
  build: () => runCommand('build', 'npm', ['run', 'build']),
  schema: runSchemaGate,
  security: runSecurityGate,
  'launch-readiness': runLaunchReadinessGate,
};

const results = [];
const skipped = [];
for (const gate of ALL_GATES) {
  if (!shouldRun(gate)) {
    skipped.push(gate);
    continue;
  }
  console.log(`\n=== preflight: ${gate} ===`);
  // eslint-disable-next-line no-await-in-loop
  results.push(await gateRunners[gate]());
}

const failed = results.filter((result) => result.status === 'fail');
const evidence = {
  schema: 'agent.bittrees.preflight-evidence.v1',
  service: 'agent.bittrees.org',
  generatedAt: new Date().toISOString(),
  overallStatus: failed.length === 0 ? 'pass' : 'fail',
  partial: skipped.length > 0,
  skippedGates: skipped,
  gates: results,
};

await mkdir(dirname(EVIDENCE_PATH), { recursive: true });
await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(`\npreflight ${evidence.overallStatus.toUpperCase()}`
  + (skipped.length ? ` (skipped: ${skipped.join(', ')})` : '')
  + ` — evidence: ${resolve(EVIDENCE_PATH).replace(`${rootDir}`, '.')}`);

if (failed.length > 0) {
  console.error(`failed gates: ${failed.map((result) => result.gate).join(', ')}`);
  process.exit(1);
}
