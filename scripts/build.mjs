import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildStaticAssets } from '../src/portal.mjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(rootDir, 'dist');

await rm(distDir, { recursive: true, force: true });

const assets = buildStaticAssets();

for (const asset of assets) {
  const targetPath = join(distDir, asset.path);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, asset.body);
}

console.log(`built ${relative(rootDir, distDir)}/ with ${assets.length} static assets`);
