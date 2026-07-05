import { mkdir, readdir, copyFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPortalManifest } from '../src/portal.mjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(rootDir, 'src');
const distDir = join(rootDir, 'dist');

async function copyTree(fromDir, toDir) {
  await mkdir(toDir, { recursive: true });

  for (const entry of await readdir(fromDir, { withFileTypes: true })) {
    const sourcePath = join(fromDir, entry.name);
    const targetPath = join(toDir, entry.name);

    if (entry.isDirectory()) {
      await copyTree(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      await copyFile(sourcePath, targetPath);
    }
  }
}

await rm(distDir, { recursive: true, force: true });
await copyTree(srcDir, distDir);
await writeFile(join(distDir, 'portal-manifest.json'), `${JSON.stringify(buildPortalManifest(), null, 2)}\n`);

console.log(`built ${relative(rootDir, distDir)}/ with server.mjs and portal-manifest.json`);
