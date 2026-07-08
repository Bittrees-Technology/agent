import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PORTAL_SECURITY_HEADERS, ROBOTS_TXT_PATH, ROUTE_DEFINITIONS, normalizeCanonicalPath } from '../src/portal.mjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(rootDir, 'dist');
const port = Number(process.env.PORT ?? '3000');
const host = process.env.HOST ?? '0.0.0.0';
const canonicalRoutePaths = new Set([ROBOTS_TXT_PATH, ...ROUTE_DEFINITIONS.map((definition) => definition.path), '/portal-manifest.json']);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

function resolveAssetPath(requestUrl) {
  const url = new URL(requestUrl ?? '/', 'http://localhost');
  const pathname = url.pathname === '/'
    ? '/index.html'
    : extname(url.pathname)
      ? url.pathname
      : `${url.pathname.replace(/\/$/, '')}/index.html`;
  let decodedPathname;

  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const normalizedPath = normalize(decodedPathname).replace(/^(\.\.[/\\])+/, '');
  const assetPath = join(distDir, normalizedPath);
  const relativePath = relative(distDir, assetPath);

  if (relativePath.startsWith('..') || relativePath.includes(`..${sep}`)) {
    return null;
  }

  return assetPath;
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    ...PORTAL_SECURITY_HEADERS,
  });
  res.end(body);
}

function logTelemetry({ timestamp = new Date().toISOString(), method, path, status }) {
  console.log(JSON.stringify({ timestamp, method, path, status }));
}

function sendRedirect(res, statusCode, location, telemetry) {
  res.writeHead(statusCode, {
    Location: location,
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': '0',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    ...PORTAL_SECURITY_HEADERS,
  });
  res.end();
  logTelemetry(telemetry);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = url.pathname;
  const telemetry = { method: req.method ?? 'GET', path: pathname };

  const normalizedPath = normalizeCanonicalPath(pathname);
  if (pathname !== normalizedPath && canonicalRoutePaths.has(normalizedPath)) {
    return sendRedirect(res, 301, `${normalizedPath}${url.search}`, {
      ...telemetry,
      status: 301,
    });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.once('finish', () => logTelemetry({ ...telemetry, status: 405 }));
    return sendText(res, 405, 'Only GET and HEAD are supported.\n');
  }

  const assetPath = resolveAssetPath(req.url);

  if (!assetPath) {
    res.once('finish', () => logTelemetry({ ...telemetry, status: 404 }));
    return sendText(res, 404, 'Not found.\n');
  }

  try {
    const body = await readFile(assetPath);
    res.once('finish', () => logTelemetry({ ...telemetry, status: 200 }));
    res.writeHead(200, {
      'Content-Type': contentTypes.get(extname(assetPath)) ?? 'application/octet-stream',
      'Content-Length': body.byteLength,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      ...PORTAL_SECURITY_HEADERS,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      res.once('finish', () => logTelemetry({ ...telemetry, status: 404 }));
      return sendText(res, 404, 'Not found.\n');
    }

    console.error(error);
    res.once('finish', () => logTelemetry({ ...telemetry, status: 500 }));
    return sendText(res, 500, 'Internal server error.\n');
  }
});

server.listen(port, host, () => {
  console.log(`serving ${relative(rootDir, distDir)}/ on http://${host}:${port}`);
});

function shutdown(signal) {
  server.close(() => {
    console.log(`received ${signal}, stopped cleanly`);
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
