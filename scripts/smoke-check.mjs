const DEFAULT_BASE_URL = 'https://agent.bittrees.org';

const args = process.argv.slice(2);
const baseUrlArg = args.find((arg) => arg.startsWith('--base-url='));
const expectedReleaseVersionArg = args.find((arg) => arg.startsWith('--expected-release-version='));
const expectedReleaseTagArg = args.find((arg) => arg.startsWith('--expected-release-tag='));
const expectedReleaseCommitArg = args.find((arg) => arg.startsWith('--expected-release-commit='));
const baseUrl = new URL(baseUrlArg ? baseUrlArg.split('=').slice(1).join('=') : process.env.BASE_URL ?? DEFAULT_BASE_URL);
const expectedReleaseVersion = expectedReleaseVersionArg?.split('=').slice(1).join('=')
  || process.env.EXPECTED_RELEASE_VERSION;
const expectedReleaseTag = expectedReleaseTagArg?.split('=').slice(1).join('=')
  || process.env.EXPECTED_RELEASE_TAG;
const expectedReleaseCommit = expectedReleaseCommitArg?.split('=').slice(1).join('=')
  || process.env.EXPECTED_RELEASE_COMMIT;

const routeChecks = [
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
];

const failures = [];
const jsonResponses = new Map();
const RAW_BRAIN_MEMORY_ID_PATTERN = /\bmemory:\d+\b/;

function check(condition, message) {
  if (!condition) failures.push(message);
}

function checkSecurityHeaders(response, path) {
  const csp = response.headers.get('content-security-policy') ?? '';
  const xFrameOptions = response.headers.get('x-frame-options') ?? '';
  const referrerPolicy = response.headers.get('referrer-policy') ?? '';

  check(csp.includes("default-src 'none'"), `${path} missing restrictive CSP default-src`);
  check(csp.includes("frame-ancestors 'none'"), `${path} missing CSP frame-ancestors`);
  check(xFrameOptions.toLowerCase() === 'deny', `${path} missing X-Frame-Options DENY`);
  check(referrerPolicy.toLowerCase() === 'no-referrer', `${path} missing Referrer-Policy no-referrer`);
}

function routeUrl(path) {
  return new URL(path, baseUrl).toString();
}

async function readJson(path) {
  const response = await fetch(routeUrl(path), {
    headers: { 'User-Agent': 'agent.bittrees.org-smoke-check' },
  });
  const text = await response.text();
  const robots = response.headers.get('x-robots-tag') ?? '';

  check(response.status === 200, `${path} returned ${response.status}`);
  checkSecurityHeaders(response, path);
  check(robots.toLowerCase().includes('noindex'), `${path} missing noindex header`);
  check(robots.toLowerCase().includes('nofollow'), `${path} missing nofollow header`);

  try {
    const json = JSON.parse(text);
    jsonResponses.set(path, json);
    return json;
  } catch (error) {
    check(false, `${path} did not parse as JSON: ${error.message}`);
    return null;
  }
}

async function checkRoute(path, kind) {
  const response = await fetch(routeUrl(path), {
    headers: { 'User-Agent': 'agent.bittrees.org-smoke-check' },
  });
  const text = await response.text();
  const robots = response.headers.get('x-robots-tag') ?? '';

  check(response.status === 200, `${path} returned ${response.status}`);
  checkSecurityHeaders(response, path);
  check(robots.toLowerCase().includes('noindex'), `${path} missing noindex header`);
  check(robots.toLowerCase().includes('nofollow'), `${path} missing nofollow header`);

  if (kind === 'json') {
    try {
      const json = JSON.parse(text);
      jsonResponses.set(path, json);
      check(json.route === path, `${path} route field mismatch`);
      check(json.status && json.status !== 'placeholder', `${path} has placeholder or missing status`);
      check(json.schema && json.data, `${path} missing schema or data`);
    } catch (error) {
      check(false, `${path} did not parse as JSON: ${error.message}`);
    }
  }

  if (kind === 'health-json') {
    try {
      const json = JSON.parse(text);
      jsonResponses.set(path, json);
      check(json.route === path, `${path} route field mismatch`);
      check(json.status === 'ok', `${path} missing ok status`);
      check(json.health?.overall === 'ok', `${path} overall health is not ok`);
      check(Array.isArray(json.health?.checks) && json.health.checks.length > 0, `${path} missing health checks`);
      check(
        json.observability?.requestIdHeader === 'X-Request-Id',
        `${path} missing X-Request-Id observability contract`,
      );
      check(
        json.releaseMetadata?.schemaVersion === 'agent.bittrees.release-metadata.v1',
        `${path} missing deployed release metadata`,
      );
    } catch (error) {
      check(false, `${path} did not parse as JSON: ${error.message}`);
    }
  }

  if (kind === 'api-json') {
    try {
      const json = JSON.parse(text);
      jsonResponses.set(path, json);
      check(
        json.status || json.schema_version || json.schemaVersion,
        `${path} missing status or schema version`,
      );
    } catch (error) {
      check(false, `${path} did not parse as JSON: ${error.message}`);
    }
  }

  if (path === '/') {
    check(text.includes('Contribution workflow'), '/ missing contribution workflow');
    check(!text.includes('staging-ready'), '/ still contains staging-ready');
  }

  if (path === '/mcp' || path === '/mcp-docs') {
    check(text.includes('Harness imports'), `${path} missing harness import tabs`);
    check(text.includes('Codex'), `${path} missing Codex import tab`);
    check(text.includes('Claude Desktop'), `${path} missing Claude Desktop import tab`);
    check(text.includes('Cursor'), `${path} missing Cursor import tab`);
  }

  if (path === '/submission-status') {
    check(text.includes('Submission status'), '/submission-status missing title');
    check(text.includes('check_contribution_status'), '/submission-status missing MCP tool reference');
  }

  if (path === '/reputation') {
    check(text.includes('Agent reputation'), '/reputation missing title');
    check(text.includes('get_agent_reputation'), '/reputation missing MCP tool reference');
    check(text.includes('Reputation is an evidence signal'), '/reputation missing authority caveat');
  }

  if (path === '/identity-keys') {
    for (const expectedText of [
      // Public HTML shows the humanized label; the precise machine slug
      // (blocked-not-completed) stays on /identity-keys.json. The not-complete
      // evidence below plus the completion guard keep this honest.
      'Coming soon',
      '0/68 executed',
      '0 transaction hashes',
      '67 names uncreated',
      'onchainlead wallet-record mismatch',
    ]) {
      check(text.includes(expectedText), `/identity-keys missing ENS rollout status text: ${expectedText}`);
    }
    check(
      !text.includes('future-agent-provisioning-required'),
      '/identity-keys leaked the internal future-agent-provisioning-required status slug',
    );
    check(
      !/live-contract-ready|staging-ready|rollout complete|68\/68 executed|completed successfully|ready to execute/i.test(text),
      '/identity-keys implies the ENS rollout was complete or executable',
    );
  }

  if (path === '/terms' || path === '/terms-of-use') {
    check(text.includes('Terms of Use are pending legal approval'), `${path} missing legal approval status`);
  }

  if (path === '/privacy') {
    check(text.includes('Privacy policy and contact are pending legal approval'), '/privacy missing legal approval status');
    check(text.includes('not a substitute for a final policy'), '/privacy overstates the pending policy');
  }

  if (path === '/onboarding') {
    check(text.includes('Agent onboarding'), '/onboarding missing title');
    check(text.includes('/onboarding.json'), '/onboarding missing contract route reference');
  }
}

async function checkStaticStatusDelegation() {
  const path = '/submission-status/index.html?id=smoke-status&kind=submission';
  const response = await fetch(routeUrl(path), {
    redirect: 'manual',
    headers: { 'User-Agent': 'agent.bittrees.org-smoke-check' },
  });
  const location = response.headers.get('location') ?? '';
  const redirected = location ? new URL(location, baseUrl) : null;

  check(response.status === 301, `${path} returned ${response.status}; expected 301 delegation`);
  check(redirected?.pathname === '/submission-status', `${path} did not delegate to /submission-status`);
  check(redirected?.search === '?id=smoke-status&kind=submission', `${path} did not preserve lookup query`);
  checkSecurityHeaders(response, path);
  check((response.headers.get('x-robots-tag') ?? '').toLowerCase().includes('noindex'), `${path} missing noindex header`);
  check((response.headers.get('x-robots-tag') ?? '').toLowerCase().includes('nofollow'), `${path} missing nofollow header`);
}

function checkMonitoringRouteCoverage() {
  const monitoring = jsonResponses.get('/monitoring.json');
  if (!monitoring) return;

  const checkedPaths = new Set(routeChecks.map((route) => route.path));
  for (const path of monitoring.data?.monitoring?.routeStatusChecks ?? []) {
    check(checkedPaths.has(path), `/monitoring.json advertises ${path} but smoke-check.mjs does not probe it`);
  }
}

function checkMonitoringObservabilityCoverage() {
  const monitoring = jsonResponses.get('/monitoring.json');
  if (!monitoring) return;

  const observability = monitoring.data?.monitoring?.observability;
  check(Array.isArray(observability?.responseHeaders), '/monitoring.json missing observability responseHeaders');
  check(Array.isArray(observability?.telemetryFields), '/monitoring.json missing observability telemetryFields');
  check(
    observability?.responseHeaders?.includes('X-Request-Id'),
    '/monitoring.json observability responseHeaders missing X-Request-Id',
  );
  check(
    observability?.telemetryFields?.includes('requestId'),
    '/monitoring.json observability telemetryFields missing requestId',
  );
}

async function checkErrorPaths() {
  const monitoring = jsonResponses.get('/monitoring.json');
  const errorPathChecks = monitoring?.data?.monitoring?.errorPathChecks ?? [];
  const requestIdHeaderRequired = (monitoring?.data?.monitoring?.observability?.responseHeaders ?? [])
    .includes('X-Request-Id');
  check(errorPathChecks.length > 0, '/monitoring.json has no error-path checks');

  for (const [index, expectation] of errorPathChecks.entries()) {
    const requestId = `smoke-error-${index + 1}`;
    const response = await fetch(routeUrl(expectation.path), {
      method: expectation.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        'User-Agent': 'agent.bittrees.org-smoke-check',
      },
      ...(expectation.request === 'empty-json' ? { body: '{}' } : {}),
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (error) {
      check(false, `${expectation.method} ${expectation.path} error response was not JSON: ${error.message}`);
      continue;
    }

    check(
      response.status === expectation.expectedStatus,
      `${expectation.method} ${expectation.path} returned ${response.status}; expected ${expectation.expectedStatus}`,
    );
    checkSecurityHeaders(response, `${expectation.method} ${expectation.path}`);
    if (requestIdHeaderRequired) {
      check(
        response.headers.get('x-request-id') === requestId,
        `${expectation.method} ${expectation.path} did not echo X-Request-Id`,
      );
    }
    if (expectation.expectedError) {
      check(body.error === expectation.expectedError, `${expectation.method} ${expectation.path} error code mismatch`);
    }
    if (expectation.expectedSchema) {
      check(body.$schema === expectation.expectedSchema, `${expectation.method} ${expectation.path} schema mismatch`);
    }
    if (expectation.expectedJsonRpcCode !== undefined) {
      check(body.error?.code === expectation.expectedJsonRpcCode, `${expectation.method} ${expectation.path} JSON-RPC error mismatch`);
    }
    for (const forbiddenText of expectation.forbiddenResponseText ?? []) {
      check(!text.includes(forbiddenText), `${expectation.method} ${expectation.path} leaked forbidden text ${forbiddenText}`);
    }
    if (Object.hasOwn(body, 'requestId')) {
      check(body.requestId === requestId, `${expectation.method} ${expectation.path} requestId mismatch`);
    }
  }
}

function checkSources() {
  const sources = jsonResponses.get('/sources.json');
  if (!sources) return;

  check(sources.data?.reviewRegistry, '/sources.json missing reviewRegistry');
  check(!RAW_BRAIN_MEMORY_ID_PATTERN.test(JSON.stringify(sources)), '/sources.json leaked a raw Brain memory id');

  for (const source of sources.data?.sources ?? []) {
    check(Array.isArray(source.citationTargets) && source.citationTargets.length > 0, `${source.id} missing citationTargets`);
    check(source.owner && source.reviewer, `${source.id} missing owner or reviewer`);
    check(source.freshnessWindow && source.lastReviewedAt, `${source.id} missing freshness or lastReviewedAt`);
    check(typeof source.mutable === 'boolean', `${source.id} missing mutable flag`);
    check(source.publicPrivateStatus, `${source.id} missing publicPrivateStatus`);
  }

  for (const claim of sources.data?.approvedClaims ?? []) {
    check(Array.isArray(claim.citationTargets) && claim.citationTargets.length > 0, `${claim.id} missing citationTargets`);
    check(claim.owner && claim.reviewer, `${claim.id} missing owner or reviewer`);
    check(claim.freshnessWindow && claim.lastReviewedAt, `${claim.id} missing freshness or lastReviewedAt`);
    check(typeof claim.mutable === 'boolean', `${claim.id} missing mutable flag`);
    check(claim.publicPrivateStatus, `${claim.id} missing publicPrivateStatus`);
  }

  check((sources.data?.excludedClaimReview ?? []).length >= 4, '/sources.json missing excluded claim review registry');
}

function checkAgents() {
  const agents = jsonResponses.get('/agents.json');
  if (!agents) return;

  check((agents.data?.agents ?? []).length > 0, '/agents.json has no approved starter profiles');
  check(!RAW_BRAIN_MEMORY_ID_PATTERN.test(JSON.stringify(agents)), '/agents.json leaked a raw Brain memory id');

  for (const agent of agents.data?.agents ?? []) {
    check(agent.identity, `${agent.id} missing identity`);
    check(agent.signedProfile, `${agent.id} missing signedProfile`);
    check(Array.isArray(agent.trustEvidence), `${agent.id} missing trustEvidence`);
    check(agent.authority, `${agent.id} missing authority`);
    check(agent.authorization, `${agent.id} missing authorization`);
    check(agent.authorization?.executionAllowed === false, `${agent.id} unexpectedly allows execution`);
  }
}

function checkOpportunities() {
  const opportunities = jsonResponses.get('/opportunities.json');
  if (!opportunities) return;

  for (const opportunity of opportunities.data?.opportunities ?? []) {
    check(opportunity.owner && opportunity.status, `${opportunity.id} missing owner or status`);
    check(opportunity.nextAction, `${opportunity.id} missing nextAction`);
    check(opportunity.priorityReason, `${opportunity.id} missing priorityReason`);
    check(opportunity.opportunityType, `${opportunity.id} missing opportunityType`);
  }
}

async function postMcp(body) {
  const response = await fetch(routeUrl('/mcp'), {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-06-18',
      'User-Agent': 'agent.bittrees.org-smoke-check',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const robots = response.headers.get('x-robots-tag') ?? '';

  check(response.status === 200, `/mcp POST returned ${response.status}: ${text.slice(0, 160)}`);
  checkSecurityHeaders(response, '/mcp POST');
  check(robots.toLowerCase().includes('noindex'), '/mcp POST missing noindex header');
  check(robots.toLowerCase().includes('nofollow'), '/mcp POST missing nofollow header');

  try {
    return JSON.parse(text);
  } catch (error) {
    check(false, `/mcp POST did not parse as JSON: ${error.message}`);
    return null;
  }
}

async function checkMcpGateway() {
  const contract = jsonResponses.get('/mcp.json');
  if (contract) {
    const toolNames = new Set((contract.data?.tools ?? []).map((tool) => tool.name));
    for (const toolName of [
      'list_contribution_opportunities',
      'get_contribution_brief',
      'get_bittrees_context',
      'register_external_agent',
      'claim_contribution',
      'submit_contribution',
      'check_contribution_status',
      'respond_to_review_feedback',
      'get_agent_reputation',
      'lookup_contribution_attestation',
    ]) {
      check(toolNames.has(toolName), `/mcp.json missing ${toolName}`);
    }
    check(contract.data?.reviewGate?.productionMutationAllowed === false, '/mcp.json review gate allows production mutation');
    const importTabs = new Set((contract.data?.harnessImportTabs ?? []).map((tab) => tab.id));
    for (const tabId of ['codex', 'claude-desktop', 'cursor']) {
      check(importTabs.has(tabId), `/mcp.json missing ${tabId} import tab`);
    }
  }

  const init = await postMcp({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'smoke-check',
        version: '0.1.0',
      },
    },
  });
  check(init?.result?.protocolVersion === '2025-06-18', '/mcp initialize did not negotiate 2025-06-18');

  const tools = await postMcp({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });
  check((tools?.result?.tools ?? []).some((tool) => tool.name === 'submit_contribution'), '/mcp tools/list missing submit_contribution');

  const context = await postMcp({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'get_bittrees_context',
      arguments: {
        includeSources: false,
      },
    },
  });
  check(
    context?.result?.structuredContent?.status === 'source-grounded-context-ready',
    '/mcp get_bittrees_context returned unexpected status',
  );
  check(
    !RAW_BRAIN_MEMORY_ID_PATTERN.test(JSON.stringify(context)),
    '/mcp get_bittrees_context leaked a raw Brain memory id',
  );
}

async function checkWorkflowDataRoutes() {
  const opportunities = await readJson('/v1/workflow/opportunities');
  check(opportunities?.status === 'ready-for-triage', '/v1/workflow/opportunities returned an unexpected status');
  check(Array.isArray(opportunities?.opportunities) && opportunities.opportunities.length > 0, '/v1/workflow/opportunities has no opportunities');
  check(
    !(opportunities?.opportunities ?? []).some((opportunity) => ['lead', 'research-lead', 'ops-lead'].includes(opportunity.owner)),
    '/v1/workflow/opportunities exposed an internal owner label',
  );

  const opportunityId = opportunities?.opportunities?.[0]?.id;
  if (!opportunityId) return;

  const brief = await readJson(`/v1/workflow/opportunities/${encodeURIComponent(opportunityId)}`);
  check(brief?.status === 'opportunity_brief_ready', '/v1/workflow/opportunities/:id did not return an opportunity brief');
  check(
    !['lead', 'research-lead', 'ops-lead'].includes(brief?.opportunity?.owner),
    '/v1/workflow/opportunities/:id exposed an internal owner label',
  );

  const status = await readJson(`/v1/workflow/status?id=${encodeURIComponent(opportunityId)}&kind=opportunity`);
  check(status?.status === 'status_found', '/v1/workflow/status did not resolve a known opportunity');

  const registry = await readJson('/v1/registry/agents');
  check(registry?.route === '/v1/registry/agents', '/v1/registry/agents route field mismatch');
  check(Array.isArray(registry?.records), '/v1/registry/agents records must be an array');
  for (const record of registry?.records ?? []) {
    for (const field of ['controllerId', 'controller_id', 'publicKey', 'public_key', 'profileUri', 'profile_uri', 'metadata', 'contact']) {
      check(!Object.hasOwn(record, field), `/v1/registry/agents exposed ${field}`);
    }
  }
}

async function checkReleaseFreshness() {
  const releaseRoute = jsonResponses.get('/idacc/releases.json') ?? await readJson('/idacc/releases.json');
  const snapshotTag = releaseRoute?.data?.releaseSnapshot?.latest?.tag;
  const releaseMetadata = releaseRoute?.data?.releaseMetadata;

  check(
    releaseMetadata?.schemaVersion === 'agent.bittrees.release-metadata.v1',
    '/idacc/releases.json missing deployed release metadata',
  );
  check(
    typeof releaseMetadata?.version === 'string' && releaseMetadata.version.length > 0,
    '/idacc/releases.json missing deployed release version',
  );
  check(
    /^[0-9a-f]{7,64}$/i.test(releaseMetadata?.commitSha ?? ''),
    '/idacc/releases.json missing immutable deployed commit SHA',
  );
  check(
    releaseMetadata?.source !== 'package-fallback',
    '/idacc/releases.json fell back to package metadata instead of the deployed build identity',
  );
  if (expectedReleaseVersion) {
    check(
      releaseMetadata?.version === expectedReleaseVersion,
      `/idacc/releases.json version ${releaseMetadata?.version} differs from expected ${expectedReleaseVersion}`,
    );
  }
  if (expectedReleaseTag) {
    check(
      releaseMetadata?.tag === expectedReleaseTag,
      `/idacc/releases.json tag ${releaseMetadata?.tag} differs from expected ${expectedReleaseTag}`,
    );
  }
  if (expectedReleaseCommit) {
    check(
      releaseMetadata?.commitSha === expectedReleaseCommit.toLowerCase(),
      `/idacc/releases.json commit ${releaseMetadata?.commitSha} differs from expected ${expectedReleaseCommit}`,
    );
  }

  const githubResponse = await fetch('https://api.github.com/repos/bobofbuilding/idacc/releases/latest', {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'agent.bittrees.org-smoke-check',
    },
  });
  const githubLatest = await githubResponse.json();

  check(githubResponse.status === 200, `GitHub latest release returned ${githubResponse.status}`);
  check(snapshotTag === githubLatest.tag_name, `/idacc/releases.json tag ${snapshotTag} differs from GitHub ${githubLatest.tag_name}`);
}

for (const route of routeChecks) {
  await checkRoute(route.path, route.kind);
}

const identityKeysRoute = jsonResponses.get('/identity-keys.json');
check(
  identityKeysRoute?.data?.identityKeys?.ensPrimaryNameRollout?.futureAgentProvisioning?.status
    === 'future-agent-provisioning-required',
  '/identity-keys.json missing the precise future-agent-provisioning-required machine status',
);

await checkStaticStatusDelegation();
checkSources();
checkAgents();
checkOpportunities();
checkMonitoringRouteCoverage();
checkMonitoringObservabilityCoverage();
await checkErrorPaths();
await checkMcpGateway();
await checkWorkflowDataRoutes();
await checkReleaseFreshness();

if (failures.length > 0) {
  console.error(`Smoke check failed for ${baseUrl.toString()}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Smoke check passed for ${baseUrl.toString()} (${routeChecks.length} routes)`);
