// Single source of truth for the production smoke / rollout contract.
//
// The route list, the release-metadata schema id, and the health/security/
// robots expectations were previously copied across smoke-check.mjs,
// rollout-check.mjs, and verify-api-handler.mjs. They now live here so the
// preview smoke, the rollout verification, and the API handler check all
// assert exactly the same policy.

export const RELEASE_METADATA_SCHEMA = 'agent.bittrees.release-metadata.v1';
export const REQUEST_ID_HEADER = 'X-Request-Id';

// Routes probed by the smoke suite. `kind` selects the per-route assertions.
export const SMOKE_ROUTES = Object.freeze([
  { path: '/', kind: 'html' },
  { path: '/identity-keys', kind: 'html' },
  { path: '/submission-status', kind: 'html' },
  { path: '/reputation', kind: 'html' },
  { path: '/terms', kind: 'html' },
  { path: '/terms-of-use', kind: 'html' },
  { path: '/privacy', kind: 'html' },
  { path: '/onboarding', kind: 'html' },
  { path: '/tou', kind: 'html' },
  { path: '/api/health', kind: 'health-json' },
  { path: '/llms.txt', kind: 'text' },
  { path: '/agents.json', kind: 'json' },
  { path: '/identity-keys.json', kind: 'json' },
  { path: '/templates.json', kind: 'json' },
  { path: '/sources.json', kind: 'json' },
  { path: '/opportunities.json', kind: 'json' },
  { path: '/onboarding.json', kind: 'json' },
  { path: '/v1/workflow/opportunities', kind: 'api-json' },
  { path: '/v1/workflow/opportunities/contribution-template-pilot', kind: 'api-json' },
  { path: '/v1/workflow/status?id=source-registry-hardening&kind=opportunity', kind: 'api-json' },
  { path: '/v1/registry/agents', kind: 'api-json' },
  { path: '/contribution-intents', kind: 'json' },
  { path: '/gateway/contribution-intents', kind: 'json' },
  { path: '/mcp', kind: 'html' },
  { path: '/mcp-docs', kind: 'html' },
  { path: '/mcp.json', kind: 'json' },
  { path: '/submission-status.json', kind: 'json' },
  { path: '/reputation.json', kind: 'json' },
  { path: '/terms-of-use.json', kind: 'json' },
  { path: '/privacy.json', kind: 'json' },
  { path: '/idacc/releases.json', kind: 'json' },
  { path: '/monitoring.json', kind: 'json' },
]);

/**
 * Assert the health-route release/observability contract. Returns an array of
 * human-readable failure messages (empty when the contract holds). `expectations`
 * may pin the release version/tag/commit.
 */
export function healthContractFailures(body, label = 'health route', expectations = {}) {
  const failures = [];
  const push = (condition, message) => {
    if (!condition) failures.push(`${label} ${message}`);
  };

  push(body?.route === '/api/health', 'did not report route /api/health');
  push(body?.status === 'ok', `status was ${body?.status ?? 'missing'}`);
  push(body?.health?.overall === 'ok', `overall health was ${body?.health?.overall ?? 'missing'}`);
  push(Array.isArray(body?.health?.checks) && body.health.checks.length > 0, 'exposed no health checks');
  push(body?.observability?.requestIdHeader === REQUEST_ID_HEADER, 'did not retain the X-Request-Id contract');
  push(body?.releaseMetadata?.schemaVersion === RELEASE_METADATA_SCHEMA, 'did not expose deployed release metadata');

  const { expectedReleaseVersion, expectedReleaseTag, expectedReleaseCommit } = expectations;
  if (expectedReleaseVersion) {
    push(body?.releaseMetadata?.version === expectedReleaseVersion, `release version ${body?.releaseMetadata?.version} did not match ${expectedReleaseVersion}`);
  }
  if (expectedReleaseTag) {
    push(body?.releaseMetadata?.tag === expectedReleaseTag, `release tag ${body?.releaseMetadata?.tag} did not match ${expectedReleaseTag}`);
  }
  if (expectedReleaseCommit) {
    push(
      String(body?.releaseMetadata?.commitSha ?? '').toLowerCase() === expectedReleaseCommit.toLowerCase(),
      `release commit ${body?.releaseMetadata?.commitSha} did not match ${expectedReleaseCommit}`,
    );
  }
  return failures;
}

/** Assert the restrictive security headers every response must carry. */
export function securityHeaderFailures(headers, path) {
  const get = (name) => String(headers.get(name) ?? '');
  const failures = [];
  const csp = get('content-security-policy');
  if (!csp.includes("default-src 'none'")) failures.push(`${path} missing restrictive CSP default-src`);
  if (!csp.includes("frame-ancestors 'none'")) failures.push(`${path} missing CSP frame-ancestors`);
  if (get('x-frame-options').toLowerCase() !== 'deny') failures.push(`${path} missing X-Frame-Options DENY`);
  if (get('referrer-policy').toLowerCase() !== 'no-referrer') failures.push(`${path} missing Referrer-Policy no-referrer`);
  return failures;
}
