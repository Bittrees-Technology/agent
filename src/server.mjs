import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PORTAL_RESPONSE_HARDENING_HEADERS,
  REQUEST_ID_HEADER,
  createRequestHandler,
} from './portal.mjs';
import {
  createRoleApplicationRequestHandler,
  isRoleApplicationPath,
} from './role-applications/http.mjs';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function requestId(req) {
  const candidate = String(req.headers?.['x-request-id'] ?? '').trim();
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

function sendRoleRouteNotFound(req, res) {
  const id = requestId(req);
  const body = Buffer.from(`${JSON.stringify({ error: 'not_found', requestId: id })}\n`);
  res.writeHead(404, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.byteLength,
    [REQUEST_ID_HEADER]: id,
    ...PORTAL_RESPONSE_HARDENING_HEADERS,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/**
 * The portal itself remains unaware of role-application routes. Local tests
 * and harnesses opt in by injecting the isolated service here.
 */
export function createServerRequestHandler({ roleApplicationService, resolvePrincipal, ...portalOptions } = {}) {
  const portalHandler = createRequestHandler(portalOptions);
  const roleHandler = roleApplicationService
    ? createRoleApplicationRequestHandler({ roleApplicationService, resolvePrincipal })
    : null;
  return async function serverRequestHandler(req, res) {
    const pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
    if (isRoleApplicationPath(pathname)) {
      if (!roleHandler) return sendRoleRouteNotFound(req, res);
      return roleHandler(req, res);
    }
    return portalHandler(req, res);
  };
}

const port = Number(process.env.PORT ?? '3000');
const host = process.env.HOST ?? '0.0.0.0';

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const server = createServer(createServerRequestHandler());
  server.listen(port, host, () => {
    console.log(`agent.bittrees.org portal listening on http://${host}:${port}`);
  });

  function shutdown(signal) {
    server.close(() => {
      console.log(`received ${signal}, stopped cleanly`);
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
