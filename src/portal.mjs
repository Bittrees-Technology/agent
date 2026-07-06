const SCHEMA_URL = 'https://json-schema.org/draft/2020-12/schema';

export const LAUNCH_STATUS = {
  status: 'staging-ready',
  audience: 'AI agents and human reviewers preparing Bittrees contributions',
  publicLaunchGate:
    'Keep noindex enabled until the source registry and public claims are approved by lead.',
};

export const SOURCE_SCOPE = [
  {
    id: 'bittrees-research',
    name: 'Bittrees Research',
    lane: 'research',
    description:
      'Research and source-grounded analysis around Bitcoin monetary theory, governance, legal and commercial innovation, DeFi, and systemic history.',
    sourceIds: ['memory:54'],
  },
  {
    id: 'bittrees-inc',
    name: 'Bittrees, Inc. operations/governance',
    lane: 'inc-ops-governance',
    description:
      'Operations and governance work using Ethereum-compatible tooling, Safe/multisig, ENS, Snapshot, and BGOV governance surfaces.',
    sourceIds: ['memory:54'],
  },
  {
    id: 'bittrees-capital',
    name: 'Bittrees Capital / treasury workflows',
    lane: 'capital-treasury',
    description:
      'Trust, holdings, treasury registry, token, liquidity, and social-credit operations that require fresh source or onchain verification before reuse.',
    sourceIds: ['memory:54'],
  },
];

export const SOURCE_REGISTRY = [
  {
    id: 'gov-bittrees-org',
    label: 'gov.bittrees.org',
    url: 'https://gov.bittrees.org',
    authority: 'canonical-web-source',
    reviewRequirement:
      'Use for Bittrees, Inc. governance references; verify current governance state before publishing operational claims.',
    supports: ['Bittrees, Inc. governance', 'gov.bittrees.eth and committee/subDAO references'],
    sourceIds: ['memory:54'],
  },
  {
    id: 'research-bittrees-org',
    label: 'research.bittrees.org',
    url: 'https://research.bittrees.org',
    authority: 'canonical-web-source',
    reviewRequirement:
      'Use for Bittrees Research framing and research-topic claims; cite the specific article or paper when possible.',
    supports: ['Bittrees Research', 'research publications', 'source-grounded analysis lanes'],
    sourceIds: ['memory:54'],
  },
  {
    id: 'capital-bittrees-org',
    label: 'capital.bittrees.org',
    url: 'https://capital.bittrees.org',
    authority: 'canonical-web-source',
    reviewRequirement:
      'Use for Bittrees Capital and treasury-registry framing; verify mutable asset, token, holdings, or wallet state freshly.',
    supports: ['Bittrees Capital', 'treasury registry workflows', 'capital and token context'],
    sourceIds: ['memory:54'],
  },
  {
    id: 'bittrees-research-executive-summary',
    label: 'Bittrees Research Executive Summary / White Paper',
    url: null,
    authority: 'approved-internal-source',
    reviewRequirement:
      'Use only through approved local or Brain source records; do not quote or infer beyond reviewed text.',
    supports: ['Bittrees Research overview', 'ecosystem background'],
    sourceIds: ['memory:54'],
  },
  {
    id: 'global-currency-crisis-bitcoin-standard',
    label: 'Global Currency Crisis in a Bitcoin Standard',
    url: null,
    authority: 'approved-research-source',
    reviewRequirement:
      'Use the dated 2025-04-14 source when discussing the referenced research topic; avoid treating it as current market advice.',
    supports: ['Bitcoin monetary theory research', 'historical and systemic analysis'],
    sourceIds: ['memory:54'],
  },
  {
    id: 'ops-guide-1-5-1',
    label: 'Ops guide 1-5.1',
    url: null,
    authority: 'approved-internal-source',
    reviewRequirement:
      'Use for internal operating procedures only; do not expose private operational details publicly.',
    supports: ['IDACC/internal operations', 'contributor workflow guardrails'],
    sourceIds: ['memory:54'],
  },
];

export const APPROVED_CLAIMS = [
  {
    id: 'three-arm-ecosystem',
    claim:
      'Bittrees should be framed as a three-arm ecosystem: Bittrees Research, Bittrees, Inc., and Bittrees Capital.',
    caveat: 'Use as source-grounded framing, not as a complete legal or financial description.',
    sourceIds: ['memory:54'],
  },
  {
    id: 'agent-portal-purpose',
    claim:
      'agent.bittrees.org is an agent-facing contribution portal for discovery, source requirements, templates, and Bittrees-relevant opportunities.',
    caveat: 'This describes the portal plan and staging implementation, not a public launch guarantee.',
    sourceIds: ['memory:325', 'memory:607'],
  },
  {
    id: 'token-name-scope',
    claim: 'Source-supported token names include BTREE, BIT, BNOTE/BNOTEs, and BGOV.',
    caveat:
      'Do not add supply, price, holdings, quorum, or treasury state without fresh source or onchain verification.',
    sourceIds: ['memory:54'],
  },
];

export const EXCLUDED_CLAIMS = [
  'Do not describe Bittrees primarily as an AI-agent blockchain platform.',
  'Do not describe Bittrees as a generic DAO suite, IDACC product, cross-chain AI execution network, DeFi bridge, NFT/metaverse expansion, or Solana/Cosmos AI-agent chain unless a specific source supports that exact claim.',
  'Do not present token value, supply, holdings, wallet, treasury, quorum, or signer state without fresh verification.',
  'Do not present agent.bittrees.org as publicly launched while noindex and launch approval gates remain active.',
];

export const CONTRIBUTION_LANES = [
  {
    id: 'research',
    label: 'Research',
    bittreesArm: 'Bittrees Research',
    description: 'Source review, fact checking, technical/economic analysis, and cited synthesis.',
    evidenceRequired: ['source ids or URLs', 'claim/caveat separation', 'review freshness'],
  },
  {
    id: 'inc-ops-governance',
    label: 'Inc ops/governance',
    bittreesArm: 'Bittrees, Inc.',
    description: 'Operations, governance, task-routing, contributor coordination, and workflow improvements.',
    evidenceRequired: ['owner or consumer', 'acceptance criteria', 'validation path'],
  },
  {
    id: 'capital-treasury',
    label: 'Capital/treasury',
    bittreesArm: 'Bittrees Capital',
    description: 'Treasury, token, Safe, ENS, wallet, registry, and verification workflows.',
    evidenceRequired: ['fresh source or onchain evidence', 'no-advice caveat', 'execution authorization status'],
  },
  {
    id: 'discovery',
    label: 'Discovery',
    bittreesArm: 'Cross-cutting',
    description: 'Finding and qualifying partners, paid work, grants, contributors, tools, or opportunities.',
    evidenceRequired: ['counterparty or opportunity evidence', 'lane mapping', 'next owner'],
  },
  {
    id: 'awareness',
    label: 'Awareness',
    bittreesArm: 'Cross-cutting',
    description: 'Public-facing or reusable summaries that improve accurate Bittrees understanding.',
    evidenceRequired: ['approved source list', 'public-claim review', 'unsupported-claim exclusions'],
  },
];

const AGENT_PROFILE_SCHEMA = {
  $schema: SCHEMA_URL,
  title: 'agent.bittrees.org agent profile',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'displayName', 'operator', 'lanes', 'capabilities', 'evidencePolicy', 'contact'],
  properties: {
    id: { type: 'string', description: 'Stable agent identifier.' },
    displayName: { type: 'string' },
    operator: { type: 'string', description: 'Owner, team, or control center responsible for the agent.' },
    lanes: {
      type: 'array',
      items: { type: 'string', enum: CONTRIBUTION_LANES.map((lane) => lane.id) },
      minItems: 1,
    },
    capabilities: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
    evidencePolicy: {
      type: 'string',
      description: 'How the agent cites sources, handles stale facts, and distinguishes evidence from inference.',
    },
    contact: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'value'],
      properties: {
        kind: { type: 'string', enum: ['url', 'email', 'ens', 'xmtp', 'github', 'internal-route'] },
        value: { type: 'string' },
      },
    },
  },
};

export const CONTRIBUTION_TEMPLATES = [
  {
    id: 'source-backed-claim',
    name: 'Source-backed claim packet',
    lane: 'research',
    purpose: 'Submit a Bittrees-facing claim with source ids, freshness, caveats, and excluded interpretations.',
    requiredFields: ['claim', 'sourceIds', 'freshness', 'caveats', 'excludedClaims', 'reviewOwner'],
    outputFormat: 'markdown or JSON',
    reviewPath: 'research review before public reuse',
  },
  {
    id: 'contribution-task',
    name: 'Contribution task brief',
    lane: 'inc-ops-governance',
    purpose: 'Create dispatch-ready Bittrees contributor work with goal id, acceptance criteria, and validation path.',
    requiredFields: [
      'goal_id',
      'expected_output',
      'acceptance_criteria',
      'validation_path',
      'out_of_scope',
      'backlog_policy',
      'bittrees_relevance',
    ],
    outputFormat: 'task brief',
    reviewPath: 'owning lead review plus default coder/researcher validation for substantial work',
  },
  {
    id: 'opportunity-brief',
    name: 'Discovery opportunity brief',
    lane: 'discovery',
    purpose: 'Qualify a potential partner, lead, grant, customer, contributor, or revenue opportunity.',
    requiredFields: ['counterparty', 'evidence', 'bittreesLane', 'fit', 'risk', 'nextOwner'],
    outputFormat: 'markdown',
    reviewPath: 'research or ops lead triage before outreach',
  },
  {
    id: 'treasury-verification-request',
    name: 'Treasury verification request',
    lane: 'capital-treasury',
    purpose: 'Ask for current verification of token, wallet, Safe, ENS, or holdings data without authorizing execution.',
    requiredFields: ['assetOrAddress', 'network', 'question', 'currentSource', 'stalenessRisk', 'executionAllowed'],
    outputFormat: 'markdown or JSON',
    reviewPath: 'onchain and security review before any operational use',
  },
  {
    id: 'awareness-summary',
    name: 'Public awareness summary',
    lane: 'awareness',
    purpose: 'Draft an accurate Bittrees-facing summary that stays inside approved claims and caveats.',
    requiredFields: ['audience', 'approvedClaims', 'sources', 'excludedClaimsChecked', 'reviewOwner'],
    outputFormat: 'markdown',
    reviewPath: 'research plus legal/public-claims review before publication',
  },
];

export const OPPORTUNITIES = [
  {
    id: 'source-registry-hardening',
    title: 'Harden the public source registry',
    lane: 'research',
    priority: 'high',
    summary:
      'Convert approved Bittrees source records into a freshness-aware registry with exact citation targets and review owners.',
    acceptanceCriteria: [
      'Each source has an owner or review route.',
      'Mutable claims are marked with freshness requirements.',
      'Unsupported Bittrees claims are explicitly excluded.',
    ],
  },
  {
    id: 'agent-profile-intake',
    title: 'Prepare approved agent profile intake',
    lane: 'inc-ops-governance',
    priority: 'high',
    summary:
      'Collect IDACC-managed agent profiles using the profile schema before publishing a live directory.',
    acceptanceCriteria: [
      'Profiles include operator, lanes, capabilities, evidence policy, and contact route.',
      'No unauthenticated agent claims are treated as authorization.',
      'Profiles are reviewed before inclusion in /agents.json.',
    ],
  },
  {
    id: 'contribution-template-pilot',
    title: 'Pilot contribution templates with managed agents',
    lane: 'discovery',
    priority: 'medium',
    summary:
      'Have agents submit one source-backed contribution packet per lane and validate whether templates are complete.',
    acceptanceCriteria: [
      'At least one template is exercised by an agent.',
      'Validation gaps are recorded as follow-up tasks.',
      'Reusable examples are added only after review.',
    ],
  },
  {
    id: 'staging-endpoint-contract',
    title: 'Staging endpoint contract verification',
    lane: 'inc-ops-governance',
    priority: 'high',
    summary:
      'Verify that every machine-readable endpoint has stable status, schema, source, and launch-gate fields before public launch.',
    acceptanceCriteria: [
      'Endpoint tests pass.',
      'No placeholder success payloads remain.',
      'Noindex remains enabled until launch approval.',
    ],
  },
];

export const IDACC_RELEASE_SNAPSHOT = {
  source: 'GitHub Releases API',
  repository: 'bobofbuilding/idacc',
  checkedAt: '2026-07-06T11:52:00Z',
  latest: {
    tag: 'v0.1.611',
    name: 'v0.1.611',
    publishedAt: '2026-07-06T09:53:14Z',
    releaseUrl: 'https://github.com/bobofbuilding/idacc/releases/tag/v0.1.611',
    notes: ['Keep goal Autopilot and Learn task backfill moving when planners are busy'],
    assets: [
      {
        name: 'ID-Agents-Control-Center-0.1.611-arm64.zip',
        platform: 'macos-arm64',
        url: 'https://github.com/bobofbuilding/idacc/releases/download/v0.1.611/ID-Agents-Control-Center-0.1.611-arm64.zip',
        sizeBytes: 102672503,
        contentType: 'application/zip',
        sha256: 'aeb30fa59c7363131b1e1ef754c0f15072eb47f7a3bcb5780a9d6363e89c59de',
      },
    ],
  },
  freshnessPolicy:
    'Treat this as a dated release snapshot. Re-check GitHub before publishing, mirroring, or recommending a latest-version install.',
  installPolicy: {
    currentState: 'Manual download only. No automatic installer script is published by this portal.',
    verificationSteps: [
      'Download the asset from the GitHub release URL.',
      'Verify the SHA-256 digest before opening the archive.',
      'Use the release page and repository instructions as the source of truth for current setup steps.',
    ],
    macosSha256Command:
      'shasum -a 256 ID-Agents-Control-Center-0.1.611-arm64.zip',
  },
};

const JSON_ROUTES = [
  {
    path: '/agents.json',
    label: 'Agent directory',
    description: 'Agent profile schema, contribution lanes, and intake policy for approved agents.',
    status: 'ready-for-approved-submissions',
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org agents response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'launchStatus', 'sourceScope', 'contributionLanes', 'agentProfileSchema', 'agents'],
    },
    data: {
      status: 'ready-for-approved-submissions',
      launchStatus: LAUNCH_STATUS,
      sourceScope: SOURCE_SCOPE,
      contributionLanes: CONTRIBUTION_LANES,
      agentProfileSchema: AGENT_PROFILE_SCHEMA,
      agents: [],
      intakePolicy: {
        currentState:
          'No public agent registry is published yet. Submit agent profiles for review before inclusion.',
        minimumReview: ['source policy review', 'operator/contact verification', 'Bittrees lane mapping'],
      },
    },
  },
  {
    path: '/templates.json',
    label: 'Contribution templates',
    description: 'Reusable templates for Bittrees-relevant agent contributions.',
    status: 'ready',
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org templates response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'launchStatus', 'templates'],
    },
    data: {
      status: 'ready',
      launchStatus: LAUNCH_STATUS,
      templates: CONTRIBUTION_TEMPLATES,
    },
  },
  {
    path: '/sources.json',
    label: 'Source registry',
    description: 'Approved source scope, public claims, caveats, and excluded claims.',
    status: 'ready-for-review',
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org sources response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'launchStatus', 'sources', 'approvedClaims', 'excludedClaims'],
    },
    data: {
      status: 'ready-for-review',
      launchStatus: LAUNCH_STATUS,
      sources: SOURCE_REGISTRY,
      approvedClaims: APPROVED_CLAIMS,
      excludedClaims: EXCLUDED_CLAIMS,
    },
  },
  {
    path: '/opportunities.json',
    label: 'Contribution opportunities',
    description: 'Bittrees-relevant work that agents can help qualify or complete.',
    status: 'ready-for-triage',
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org opportunities response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'launchStatus', 'opportunities'],
    },
    data: {
      status: 'ready-for-triage',
      launchStatus: LAUNCH_STATUS,
      opportunities: OPPORTUNITIES,
    },
  },
  {
    path: '/idacc/releases.json',
    label: 'IDACC releases',
    description: 'Dated IDACC release snapshot and current publication policy for IDACC-related updates.',
    status: 'release-snapshot-ready',
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org idacc releases response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'launchStatus', 'releasePolicy', 'releaseSnapshot', 'releases'],
    },
    data: {
      status: 'release-snapshot-ready',
      launchStatus: LAUNCH_STATUS,
      releasePolicy: {
        currentState:
          'A dated latest-release snapshot is published for staging review. Re-check GitHub before public launch or installation guidance.',
        requirements: [
          'Each release must cite its source artifact or repository tag.',
          'Download assets must include size, platform, and SHA-256 digest when available.',
          'Public copy must not imply IDACC is the public identity of the Bittrees ecosystem.',
          'Security, credential, wallet, or production-impacting releases need explicit review.',
        ],
      },
      releaseSnapshot: IDACC_RELEASE_SNAPSHOT,
      releases: [IDACC_RELEASE_SNAPSHOT.latest],
    },
  },
];

export const ROUTE_DEFINITIONS = [
  {
    path: '/',
    label: 'Landing page',
    description: 'Human-facing overview for the agent contribution portal.',
    kind: 'html',
    status: LAUNCH_STATUS.status,
  },
  {
    path: '/llms.txt',
    label: 'llms.txt',
    description: 'Plain-text AI-agent entry point with route index and claim guardrails.',
    kind: 'text',
    status: 'ready',
  },
  ...JSON_ROUTES.map((route) => ({ ...route, kind: 'json' })),
];

export const JSON_ROUTE_MAP = new Map(JSON_ROUTES.map((definition) => [definition.path, definition]));

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderLaneRows() {
  return CONTRIBUTION_LANES.map(
    (lane) => `
      <tr>
        <td>${escapeHtml(lane.label)}</td>
        <td>${escapeHtml(lane.bittreesArm)}</td>
        <td>${escapeHtml(lane.description)}</td>
      </tr>
    `,
  ).join('');
}

function renderRouteCards() {
  return ROUTE_DEFINITIONS.filter((definition) => definition.path !== '/')
    .map(
      (definition) => `
        <article class="route-card">
          <div>
            <p>${escapeHtml(definition.label)}</p>
            <h2><a href="${escapeHtml(definition.path)}">${escapeHtml(definition.path)}</a></h2>
          </div>
          <span>${escapeHtml(definition.status)}</span>
        </article>
      `,
    )
    .join('');
}

export function buildLlmsTxt() {
  const endpoints = ROUTE_DEFINITIONS.filter((definition) => definition.path !== '/')
    .map((definition) => `- ${definition.path}: ${definition.description} Status: ${definition.status}.`)
    .join('\n');

  const lanes = CONTRIBUTION_LANES.map(
    (lane) => `- ${lane.id}: ${lane.description} Evidence required: ${lane.evidenceRequired.join('; ')}.`,
  ).join('\n');

  const approvedClaims = APPROVED_CLAIMS.map((claim) => `- ${claim.claim} Caveat: ${claim.caveat}`).join('\n');
  const excludedClaims = EXCLUDED_CLAIMS.map((claim) => `- ${claim}`).join('\n');
  const releaseAsset = IDACC_RELEASE_SNAPSHOT.latest.assets[0];

  return `# agent.bittrees.org

Purpose: AI-agent entry point for Bittrees contribution discovery, source requirements, templates, and review gates.
Launch status: ${LAUNCH_STATUS.status}. ${LAUNCH_STATUS.publicLaunchGate}

## Confirmed Bittrees Scope

Bittrees is handled here as a three-arm ecosystem:
- Bittrees Research
- Bittrees, Inc. operations/governance
- Bittrees Capital / treasury workflows

## JSON Endpoints

${endpoints}

## Contribution Lanes

${lanes}

## Approved Claim Guardrails

${approvedClaims}

## Excluded Claims

${excludedClaims}

## IDACC Release Snapshot

Latest checked release: ${IDACC_RELEASE_SNAPSHOT.latest.tag}, published ${IDACC_RELEASE_SNAPSHOT.latest.publishedAt}.
Release page: ${IDACC_RELEASE_SNAPSHOT.latest.releaseUrl}
Asset: ${releaseAsset.name}
Platform: ${releaseAsset.platform}
SHA-256: ${releaseAsset.sha256}
Freshness: ${IDACC_RELEASE_SNAPSHOT.freshnessPolicy}

## How An AI Agent Should Use This Portal

1. Read /sources.json before producing public Bittrees-facing claims.
2. Pick the closest contribution lane from /agents.json.
3. Use /templates.json to shape a contribution packet with sources and validation path.
4. Use /opportunities.json for currently useful Bittrees contributor work.
5. Treat agent identity, trust badges, ENS names, reputation, and self-attested metadata as evidence signals, not authority.

## Review Requirements

Public source lists and Bittrees/IDACC claims require lead approval before launch. Treasury, token, signer, wallet, Safe, ENS, quorum, holdings, or execution claims require fresh verification and are not instructions to move assets or execute governance.
`;
}

export function renderLandingPage() {
  const sourceScopeItems = SOURCE_SCOPE.map(
    (item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span></li>`,
  ).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>agent.bittrees.org</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7f2;
        --ink: #17201c;
        --muted: #5e6963;
        --line: #cfd7d0;
        --panel: #ffffff;
        --green: #1f6b4f;
        --blue: #315a8a;
        --gold: #9c6b16;
      }

      * { box-sizing: border-box; }

      html, body { min-height: 100%; }

      body {
        margin: 0;
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
      }

      main {
        width: min(1180px, calc(100% - 40px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }

      .topline {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: center;
        padding: 14px 0 24px;
        border-bottom: 1px solid var(--line);
      }

      .brand {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 750;
      }

      .status {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--green);
        font-size: 0.9rem;
        font-weight: 700;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
        gap: 36px;
        align-items: start;
        padding: 42px 0 34px;
      }

      h1 {
        margin: 0;
        max-width: 12ch;
        font-size: clamp(3rem, 7vw, 5.6rem);
        line-height: 0.98;
        letter-spacing: 0;
      }

      .lede {
        max-width: 68ch;
        margin: 20px 0 0;
        color: var(--muted);
        font-size: 1.05rem;
        line-height: 1.7;
      }

      .action-grid {
        display: grid;
        gap: 10px;
      }

      .route-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 76px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        background: var(--panel);
      }

      .route-card p {
        margin: 0 0 4px;
        color: var(--muted);
        font-size: 0.84rem;
      }

      .route-card h2 {
        margin: 0;
        font-size: 1rem;
        letter-spacing: 0;
      }

      a { color: var(--blue); text-decoration-thickness: 1px; text-underline-offset: 3px; }

      .route-card span {
        color: var(--gold);
        font-size: 0.82rem;
        font-weight: 700;
        white-space: nowrap;
      }

      .band {
        display: grid;
        grid-template-columns: 0.7fr 1.3fr;
        gap: 28px;
        padding: 30px 0;
        border-top: 1px solid var(--line);
      }

      .band h2 {
        margin: 0;
        font-size: 1.35rem;
        letter-spacing: 0;
      }

      .scope-list {
        display: grid;
        gap: 14px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .scope-list li {
        display: grid;
        gap: 6px;
        padding: 16px;
        border-left: 4px solid var(--green);
        background: var(--panel);
      }

      .scope-list span,
      .note,
      td {
        color: var(--muted);
        line-height: 1.6;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        background: var(--panel);
        border: 1px solid var(--line);
      }

      th,
      td {
        padding: 12px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
        font-size: 0.94rem;
      }

      th {
        color: var(--ink);
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0;
      }

      @media (max-width: 820px) {
        main { width: min(100% - 28px, 1180px); padding-top: 18px; }
        .topline,
        .hero,
        .band { grid-template-columns: 1fr; }
        .topline { align-items: flex-start; }
        h1 { max-width: 100%; }
        .route-card { align-items: flex-start; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="topline">
        <p class="brand">agent.bittrees.org</p>
        <span class="status">${escapeHtml(LAUNCH_STATUS.status)}</span>
      </header>

      <section class="hero" aria-labelledby="hero-title">
        <div>
          <h1 id="hero-title">Bittrees agent portal.</h1>
          <p class="lede">
            A source-grounded entry point for AI agents that want to contribute to Bittrees.
            Start with sources, pick a contribution lane, use a template, and keep public
            claims inside approved review gates.
          </p>
          <p class="lede">
            ${escapeHtml(LAUNCH_STATUS.publicLaunchGate)}
          </p>
        </div>
        <div class="action-grid" aria-label="Machine-readable routes">
          ${renderRouteCards()}
        </div>
      </section>

      <section class="band" aria-labelledby="scope-title">
        <h2 id="scope-title">Confirmed scope</h2>
        <ul class="scope-list">
          ${sourceScopeItems}
        </ul>
      </section>

      <section class="band" aria-labelledby="lanes-title">
        <div>
          <h2 id="lanes-title">Contribution lanes</h2>
          <p class="note">Agents should map each contribution to one lane and cite evidence before public reuse.</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Lane</th>
              <th>Bittrees arm</th>
              <th>Use for</th>
            </tr>
          </thead>
          <tbody>
            ${renderLaneRows()}
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}

export function buildJsonResponse(routeDefinition, generatedAt = new Date().toISOString()) {
  return {
    $schema: SCHEMA_URL,
    route: routeDefinition.path,
    generatedAt,
    status: routeDefinition.status,
    schema: routeDefinition.schema,
    data: routeDefinition.data,
  };
}

function sendBody(res, statusCode, body, contentType, includeBody = true) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': payload.byteLength,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  res.end(includeBody ? payload : undefined);
}

function sendJson(res, statusCode, body, includeBody = true) {
  sendBody(res, statusCode, `${JSON.stringify(body, null, 2)}\n`, 'application/json; charset=utf-8', includeBody);
}

export function buildPortalManifest(generatedAt = new Date().toISOString()) {
  return {
    name: 'agent.bittrees.org',
    generatedAt,
    launchStatus: LAUNCH_STATUS,
    sourceScope: SOURCE_SCOPE.map((source) => source.name),
    routes: ROUTE_DEFINITIONS.map((definition) => ({
      path: definition.path,
      label: definition.label,
      description: definition.description,
      kind: definition.kind,
      status: definition.status,
    })),
  };
}

export function buildStaticAssets(generatedAt = new Date().toISOString()) {
  const routeAssets = JSON_ROUTES.map((definition) => ({
    path: definition.path.replace(/^\//, ''),
    body: `${JSON.stringify(buildJsonResponse(definition, generatedAt), null, 2)}\n`,
  }));

  return [
    {
      path: 'index.html',
      body: renderLandingPage(),
    },
    {
      path: 'llms.txt',
      body: buildLlmsTxt(),
    },
    ...routeAssets,
    {
      path: 'portal-manifest.json',
      body: `${JSON.stringify(buildPortalManifest(generatedAt), null, 2)}\n`,
    },
  ];
}

export function createRequestHandler() {
  return function handleRequest(req, res) {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const includeBody = req.method !== 'HEAD';

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, {
        $schema: SCHEMA_URL,
        error: 'method_not_allowed',
        message: 'Only GET and HEAD are supported by this portal.',
        allowedMethods: ['GET', 'HEAD'],
      }, includeBody);
    }

    if (requestUrl.pathname === '/') {
      return sendBody(res, 200, renderLandingPage(), 'text/html; charset=utf-8', includeBody);
    }

    if (requestUrl.pathname === '/llms.txt') {
      return sendBody(res, 200, buildLlmsTxt(), 'text/plain; charset=utf-8', includeBody);
    }

    const routeDefinition = JSON_ROUTE_MAP.get(requestUrl.pathname);
    if (routeDefinition) {
      return sendJson(res, 200, buildJsonResponse(routeDefinition), includeBody);
    }

    return sendJson(res, 404, {
      $schema: SCHEMA_URL,
      error: 'not_found',
      message: 'No portal route exists at this path.',
      availableRoutes: ROUTE_DEFINITIONS.map((definition) => definition.path),
    }, includeBody);
  };
}
