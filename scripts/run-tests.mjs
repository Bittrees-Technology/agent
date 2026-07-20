import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function collectTestFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return collectTestFiles(path);
      return entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
    })
    .sort();
}

const testFiles = collectTestFiles('test');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...testFiles], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
