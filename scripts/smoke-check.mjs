const DEFAULT_BASE_URL = 'https://agent.bittrees.org';

const args = process.argv.slice(2);
const baseUrlArg = args.find((arg) => arg.startsWith('--base-url='));
const baseUrl = new URL(baseUrlArg ? baseUrlArg.split('=').slice(1).join('=') : process.env.BASE_URL ?? DEFAULT_BASE_URL);

const routeChecks = [
  { path: '/', kind: 'html' },
  { path: '/identity-keys', kind: 'html' },
  { path: '/submission-status', kind: 'html' },
  { path: '/reputation', kind: 'html' },
  { path: '/llms.txt', kind: 'text' },
  { path: '/agents.json', kind: 'json' },
  { path: '/identity-keys.json', kind: 'json' },
  { path: '/templates.json', kind: 'json' },
  { path: '/sources.json', kind: 'json' },
  { path: '/opportunities.json', kind: 'json' },
  { path: '/contribution-intents', kind: 'json' },
  { path: '/gateway/contribution-intents', kind: 'json' },
  { path: '/mcp', kind: 'html' },
  { path: '/mcp-docs', kind: 'html' },
  { path: '/mcp.json', kind: 'json' },
  { path: '/submission-status.json', kind: 'json' },
  { path: '/reputation.json', kind: 'json' },
  { path: '/idacc/releases.json', kind: 'json' },
  { path: '/monitoring.json', kind: 'json' },
];

const failures = [];
const jsonResponses = new Map();

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
}

function checkSources() {
  const sources = jsonResponses.get('/sources.json');
  if (!sources) return;

  check(sources.data?.reviewRegistry, '/sources.json missing reviewRegistry');

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
}

async function checkReleaseFreshness() {
  const releaseRoute = jsonResponses.get('/idacc/releases.json') ?? await readJson('/idacc/releases.json');
  const snapshotTag = releaseRoute?.data?.releaseSnapshot?.latest?.tag;

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

checkSources();
checkAgents();
checkOpportunities();
await checkMcpGateway();
await checkReleaseFreshness();

if (failures.length > 0) {
  console.error(`Smoke check failed for ${baseUrl.toString()}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Smoke check passed for ${baseUrl.toString()} (${routeChecks.length} routes)`);
