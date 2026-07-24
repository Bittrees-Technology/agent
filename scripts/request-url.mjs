import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function parseResponseHeaders(raw) {
  const normalized = String(raw ?? '').replace(/\r\n/g, '\n');
  const blocks = normalized
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  const headerBlock = [...blocks].reverse().find((block) => /^HTTP\/\S+\s+\d{3}/i.test(block));
  if (!headerBlock) {
    throw new Error(`Could not parse response headers from vercel curl output: ${normalized}`);
  }

  const lines = headerBlock.split('\n');
  const statusLine = lines.shift() ?? '';
  const match = statusLine.match(/^HTTP\/\S+\s+(\d{3})/i);
  if (!match) {
    throw new Error(`Could not parse HTTP status from vercel curl output: ${statusLine}`);
  }

  const headers = new Headers();
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  return {
    status: Number(match[1]),
    headers,
  };
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value ?? ''), 'utf8');
}

export async function requestUrl(url, {
  method = 'GET',
  headers = {},
  body,
  redirect = 'follow',
  vercelDeployment = '',
  cwd = process.cwd(),
} = {}) {
  const deploymentTarget = String(vercelDeployment ?? '').trim();
  if (!deploymentTarget) {
    return fetch(url, {
      method,
      headers,
      body,
      redirect,
    });
  }

  const requestTarget = new URL(url);
  const requestPath = `${requestTarget.pathname}${requestTarget.search}`;
  const tempDir = await mkdtemp(join(tmpdir(), 'agent-bittrees-vercel-curl-'));
  const headerPath = join(tempDir, 'headers.txt');
  const bodyPath = join(tempDir, 'body.bin');
  const payloadPath = join(tempDir, 'payload.bin');

  try {
    const args = [
      'curl',
      requestPath,
      '--deployment',
      deploymentTarget,
      '--',
      '--silent',
      '--show-error',
      '--request',
      method,
      '--dump-header',
      headerPath,
      '--output',
      bodyPath,
    ];

    if (redirect !== 'manual') {
      args.push('--location');
    }

    for (const [name, value] of Object.entries(headers)) {
      if (value === undefined || value === null) continue;
      args.push('--header', `${name}: ${value}`);
    }

    if (body !== undefined) {
      await writeFile(payloadPath, asBuffer(body));
      args.push('--data-binary', `@${payloadPath}`);
    }

    await execFileAsync('vercel', args, {
      cwd,
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
    });

    const [{ status, headers: responseHeaders }, responseBody] = await Promise.all([
      readFile(headerPath, 'utf8').then(parseResponseHeaders),
      readFile(bodyPath),
    ]);

    return {
      status,
      headers: responseHeaders,
      async text() {
        return responseBody.toString('utf8');
      },
      async json() {
        return JSON.parse(responseBody.toString('utf8'));
      },
      async arrayBuffer() {
        return responseBody.buffer.slice(
          responseBody.byteOffset,
          responseBody.byteOffset + responseBody.byteLength,
        );
      },
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
