import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const vercelDir = join(rootDir, '.vercel');
const projectFile = join(vercelDir, 'project.json');

function requireEnv(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) {
    throw new Error(`${name} is required to write .vercel/project.json`);
  }
  return value;
}

const orgId = requireEnv('VERCEL_ORG_ID');
const projectId = requireEnv('VERCEL_PROJECT_ID');
const projectName = String(process.env.VERCEL_PROJECT ?? '').trim() || 'agent';

await mkdir(vercelDir, { recursive: true });
await writeFile(
  projectFile,
  `${JSON.stringify({
    orgId,
    projectId,
    projectName,
  }, null, 2)}\n`,
  'utf8',
);

console.log(`Wrote ${projectFile} for project ${projectName}.`);
