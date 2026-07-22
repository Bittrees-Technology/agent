import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { buildStaticAssets } from '../src/portal.mjs';
import { resolveBuildDirtyState, resolveReleaseMetadata } from '../src/release-metadata.mjs';

const execFileAsync = promisify(execFile);

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(rootDir, 'dist');

async function gitOutput(args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: rootDir });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

const [gitCommitSha, gitTag, trackedChanges] = await Promise.all([
  gitOutput(['rev-parse', 'HEAD']),
  gitOutput(['describe', '--tags', '--exact-match', 'HEAD']),
  gitOutput(['status', '--porcelain', '--untracked-files=no']),
]);
const releaseMetadata = resolveReleaseMetadata({
  gitCommitSha,
  // Never claim a release tag for a local build whose tracked sources differ
  // from that tag. Hosted release builds are expected to be clean.
  gitTag: trackedChanges ? undefined : gitTag,
  dirty: resolveBuildDirtyState({ trackedChanges }),
});

await rm(distDir, { recursive: true, force: true });

const assets = buildStaticAssets(undefined, { releaseMetadata });

for (const asset of assets) {
  const targetPath = join(distDir, asset.path);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, asset.body);
}

console.log(
  `built ${relative(rootDir, distDir)}/ with ${assets.length} static assets `
  + `(release ${releaseMetadata.version}, source ${releaseMetadata.source})`,
);
