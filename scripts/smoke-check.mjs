const DEFAULT_BASE_URL = 'https://agent.bittrees.org';

const args = process.argv.slice(2);
const baseUrlArg = args.find((arg) => arg.startsWith('--base-url='));
const baseUrl = new URL(baseUrlArg ? baseUrlArg.split('=').slice(1).join('=') : process.env.BASE_URL ?? DEFAULT_BASE_URL);

const routeChecks = [
  { path: '/', kind: 'html' },
  { path: '/identity-keys', kind: 'html' },
  { path: '/llms.txt', kind: 'text' },
  { path: '/agents.json', kind: 'json' },
  { path: '/identity-keys.json', kind: 'json' },
  { path: '/templates.json', kind: 'json' },
  { path: '/sources.json', kind: 'json' },
  { path: '/opportunities.json', kind: 'json' },
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
await checkReleaseFreshness();

if (failures.length > 0) {
  console.error(`Smoke check failed for ${baseUrl.toString()}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Smoke check passed for ${baseUrl.toString()} (${routeChecks.length} routes)`);
