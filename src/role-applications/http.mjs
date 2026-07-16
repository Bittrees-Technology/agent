import { randomUUID } from 'node:crypto';

import { PORTAL_RESPONSE_HARDENING_HEADERS, REQUEST_ID_HEADER } from '../portal.mjs';
import { RoleApplicationError } from './service.mjs';

const ROLE_APPLICATION_STATUS_PATTERN = /^\/api\/role-applications\/([^/]+)\/status$/;
const ADMIN_REVIEW_PATTERN = /^\/api\/admin\/role-applications\/([^/]+)\/review$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REQUEST_ID_SYMBOL = Symbol('roleApplicationRequestId');
const MAX_BODY_BYTES = 64 * 1024;

export function isRoleApplicationPath(pathname) {
  return pathname === '/api/role-applications'
    || pathname === '/api/role-applications/mine'
    || pathname === '/api/admin/role-applications'
    || pathname === '/api/admin/role-applications/summary'
    || ROLE_APPLICATION_STATUS_PATTERN.test(pathname)
    || ADMIN_REVIEW_PATTERN.test(pathname);
}

function includeBody(req) {
  return req.method !== 'HEAD';
}

function requestId(req) {
  if (req?.[REQUEST_ID_SYMBOL]) return req[REQUEST_ID_SYMBOL];
  const candidate = String(req.headers?.['x-request-id'] ?? '').trim();
  const id = REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
  if (req) req[REQUEST_ID_SYMBOL] = id;
  return id;
}

function sendJson(req, res, status, body, { includeRequestIdInBody = false } = {}) {
  const id = requestId(req);
  const responseBody = includeRequestIdInBody && body && typeof body === 'object' && !Array.isArray(body)
    ? { ...body, requestId: id }
    : body;
  const payload = Buffer.from(`${JSON.stringify(responseBody)}\n`);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.byteLength,
    [REQUEST_ID_HEADER]: id,
    ...PORTAL_RESPONSE_HARDENING_HEADERS,
  });
  res.end(includeBody(req) ? payload : undefined);
}

function sendErrorJson(req, res, status, body) {
  return sendJson(req, res, status, body, { includeRequestIdInBody: true });
}

function roleError(req, res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 400;
  return sendErrorJson(req, res, status, {
    error: error?.code ?? 'role_application_rejected',
    message: error?.message ?? 'Role application request was rejected.',
    ...(error?.details ? { details: error.details } : {}),
  });
}

async function readJson(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new RoleApplicationError('request body is too large', { code: 'body_too_large', status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RoleApplicationError('request body must be valid JSON', { code: 'invalid_json', status: 400 });
  }
}

function header(req, name) {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Test-only SIWE adapter. It deliberately requires all three markers and
 * derives the wallet exclusively from request headers, never a request body. */
export function createLocalSiwePrincipalResolver({ domain = 'agent.bittrees.org' } = {}) {
  return function resolvePrincipal(req) {
    const wallet = String(header(req, 'x-local-siwe-wallet') ?? '').trim();
    const verified = String(header(req, 'x-local-siwe-verified') ?? '').trim();
    const verifiedDomain = String(header(req, 'x-local-siwe-domain') ?? '').trim().toLowerCase();
    if (!wallet || verified !== 'true' || verifiedDomain !== domain) return null;
    return { wallet };
  };
}

function requirePrincipal(resolvePrincipal, req, purpose) {
  const principal = resolvePrincipal(req);
  if (!principal?.wallet) throw new RoleApplicationError(`verified SIWE session is required for ${purpose}`, { code: 'unauthorized', status: 401 });
  return principal;
}

function parseExpectedVersion(value) {
  return Number.isInteger(value) ? value : Number.NaN;
}

/**
 * This router is only mounted by server.mjs when a service is explicitly
 * injected. Without it, the wrapper answers role-application paths as 404.
 */
export function createRoleApplicationRequestHandler({ roleApplicationService, resolvePrincipal = createLocalSiwePrincipalResolver() } = {}) {
  if (!roleApplicationService) throw new TypeError('roleApplicationService injection is required');
  if (typeof resolvePrincipal !== 'function') throw new TypeError('resolvePrincipal must be a function');

  return async function handleRoleApplicationRequest(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const { pathname, searchParams } = url;
    const statusMatch = pathname.match(ROLE_APPLICATION_STATUS_PATTERN);
    const reviewMatch = pathname.match(ADMIN_REVIEW_PATTERN);
    try {
      if (req.method === 'POST' && pathname === '/api/role-applications') {
        const applicant = requirePrincipal(resolvePrincipal, req, 'submission');
        const application = roleApplicationService.submit({ applicant, payload: await readJson(req) });
        return sendJson(req, res, 201, { application });
      }
      if (req.method === 'GET' && pathname === '/api/role-applications/mine') {
        const applicant = requirePrincipal(resolvePrincipal, req, 'application lookup');
        return sendJson(req, res, 200, { applications: roleApplicationService.mine({ applicant }) });
      }
      if (req.method === 'GET' && statusMatch) {
        const principal = resolvePrincipal(req);
        const application = roleApplicationService.status({ applicant: principal, reviewer: principal, applicationId: decodeURIComponent(statusMatch[1]) });
        if (!application) return sendErrorJson(req, res, 404, { error: 'not_found' });
        return sendJson(req, res, 200, { application });
      }
      if (req.method === 'GET' && pathname === '/api/admin/role-applications') {
        const reviewer = requirePrincipal(resolvePrincipal, req, 'admin queue');
        return sendJson(req, res, 200, {
          applications: roleApplicationService.listAdmin({
            reviewer,
            roleId: searchParams.get('roleId') ?? '',
            lane: searchParams.get('lane') ?? '',
          }),
        });
      }
      if (req.method === 'GET' && pathname === '/api/admin/role-applications/summary') {
        const reviewer = requirePrincipal(resolvePrincipal, req, 'admin summary');
        return sendJson(req, res, 200, roleApplicationService.summary({ reviewer }));
      }
      if (req.method === 'PATCH' && reviewMatch) {
        const reviewer = requirePrincipal(resolvePrincipal, req, 'review');
        const payload = await readJson(req);
        const application = roleApplicationService.review({
          reviewer,
          applicationId: decodeURIComponent(reviewMatch[1]),
          expectedVersion: parseExpectedVersion(payload.expectedVersion),
          action: payload.action,
          note: payload.note,
        });
        return sendJson(req, res, 200, { application });
      }
      return sendErrorJson(req, res, 405, { error: 'method_not_allowed' });
    } catch (error) {
      return roleError(req, res, error);
    }
  };
}
