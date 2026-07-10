import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_URL = 'https://json-schema.org/draft/2020-12/schema';
const PORTAL_BASE_URL = 'https://agent.bittrees.org';
export const ROBOTS_TXT_PATH = '/robots.txt';
const ROBOTS_TXT_BODY = 'User-agent: *\nDisallow: /\n';
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTRIBUTION_INTENTS_WRITE_FLAG_NAMES = [
  'CONTRIBUTION_INTENTS_WRITE_ENABLED',
  'CONTRIBUTION_INTENTS_ENABLED',
  'PORTAL_ENABLE_CONTRIBUTION_INTENTS',
];
const CONTRIBUTION_INTENT_CONTRACT_PATH = '/contribution-intents';
const GATEWAY_CONTRIBUTION_INTENT_PATH = '/gateway/contribution-intents';
const CONTRIBUTION_INTENT_POST_PATHS = new Set([
  CONTRIBUTION_INTENT_CONTRACT_PATH,
  GATEWAY_CONTRIBUTION_INTENT_PATH,
]);
const AGENT_CONTACT_KIND_VALUES = ['url', 'email', 'ens', 'xmtp', 'github', 'internal-route'];
// Approved public profiles route contact through the portal, not manager dispatch slugs.
const PUBLIC_MANAGED_AGENT_CONTACT = Object.freeze({
  kind: 'url',
  value: new URL(CONTRIBUTION_INTENT_CONTRACT_PATH, PORTAL_BASE_URL).toString(),
});
const PUBLIC_ROLE_LABELS = Object.freeze({
  lead: 'owning review lead',
  'research-lead': 'research review owner',
  'ops-lead': 'operations review owner',
  'engineering-lead': 'engineering review owner',
  'backend-engineer': 'backend implementation reviewer',
  'architecture-engineer': 'architecture reviewer',
  'qa-engineer': 'quality reviewer',
  'frontend-engineer': 'frontend reviewer',
  'technology-security/security-router': 'security review owner',
  'default team': 'validation cohort',
  'default validation route': 'validator review route',
});
const INTERNAL_ROUTE_VALUE_PATTERN = /\bM:[a-z0-9-]+\/[a-z0-9-]+\b/gi;
const INTERNAL_SLASH_VALUE_PATTERN =
  /\b(?:default|engineering-team|technology-security)\/[a-z0-9-]+\b/gi;

function publicSafeString(value) {
  const exactLabel = PUBLIC_ROLE_LABELS[value];
  if (exactLabel) return exactLabel;

  return value
    .replaceAll('default coder/researcher validation', 'technical and evidence validation')
    .replaceAll('default coder/researcher', 'technical and evidence validators')
    .replaceAll('default coder', 'technical validator')
    .replaceAll('default researcher', 'evidence validator')
    .replaceAll('default team', PUBLIC_ROLE_LABELS['default team'])
    .replaceAll('default validation route', PUBLIC_ROLE_LABELS['default validation route'])
    .replaceAll('technology-security/security-router', PUBLIC_ROLE_LABELS['technology-security/security-router'])
    .replaceAll('research-lead', PUBLIC_ROLE_LABELS['research-lead'])
    .replaceAll('ops-lead', PUBLIC_ROLE_LABELS['ops-lead'])
    .replaceAll('engineering-lead', PUBLIC_ROLE_LABELS['engineering-lead'])
    .replaceAll('backend-engineer', PUBLIC_ROLE_LABELS['backend-engineer'])
    .replaceAll('architecture-engineer', PUBLIC_ROLE_LABELS['architecture-engineer'])
    .replaceAll('qa-engineer', PUBLIC_ROLE_LABELS['qa-engineer'])
    .replaceAll('frontend-engineer', PUBLIC_ROLE_LABELS['frontend-engineer'])
    .replace(/\bowning lead review\b/gi, 'owner review')
    .replace(/\blead review\b/gi, 'owner review')
    .replace(/\blead approves\b/gi, 'owning reviewer approves')
    .replace(/\bcontact the owning lead\b/gi, 'contact the owning reviewer')
    .replace(/\bLead review has been queued\b/g, 'Owner review has been queued')
    .replace(/\bresearch or ops lead triage\b/gi, 'research or operations review triage')
    .replace(INTERNAL_ROUTE_VALUE_PATTERN, '[approved review contact]')
    .replace(INTERNAL_SLASH_VALUE_PATTERN, '[approved review contact]');
}

function publicSafeContent(value) {
  if (typeof value === 'string') return publicSafeString(value);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(publicSafeContent);

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, publicSafeContent(nestedValue)]),
  );
}
export const UNIVERSAL_PORTAL_DISCLAIMER =
  'Informational staging material only. Nothing on this portal is legal, tax, accounting, investment, trading, treasury, governance, employment, or other professional advice. Nothing here is an offer to sell or a solicitation to buy any security, token, digital asset, or other financial instrument. Nothing on this portal grants authority, authorization, approval, or permission to act on behalf of Bittrees, IDACC, or any wallet, Safe, signer, controller, registry owner, or governance body.';
export const NO_RIGHTS_CREATED_DISCLAIMER =
  'Submitting through this portal does not create employment, contractor status, agency, partnership, fiduciary duties, onboarding approval, compensation rights, token rights, equity rights, grant rights, revenue-share rights, confidentiality obligations, or acceptance into any program or workflow. Any formal contributor relationship, compensated work, token program, grant, or authority delegation requires separate written terms and explicit owner approval.';
export const CONTRIBUTION_PRIVACY_NOTICE =
  'Submit non-confidential information only. Do not submit private keys, seed phrases, raw signatures, bearer tokens, session secrets, API keys, identity documents, tax forms, sanctions materials, wallet secrets, privileged legal material, regulated personal data, or third-party confidential information through this portal. Submission data is used for staged contribution-intent routing and review, may be visible to operators, reviewers, infrastructure providers, and audit logs used to run the service, and may be retained in internal review records for audit purposes. Use `[approved privacy contact route]` for privacy questions, correction requests, or deletion requests.';
export const REGISTRY_PROFILE_PUBLICATION_NOTICE =
  'Starter IDACC-managed agent profile records are staged for review with private material redacted. Public signatures, fingerprints, and controller-signed manifest publication remain pending where marked. Listing, review, or publication status is evidence of review only and does not grant authority, delegation, or execution approval.';
export const INTERNAL_OPPORTUNITY_REVIEW_NOTICE =
  'This route supports internal review and qualification only. Public visibility does not by itself create compensation, token, grant, equity, participation, application, or onboarding rights, and it is not a public job offer, public solicitation, fundraising communication, bounty, or authorization for external outreach or execution without owner approval.';

export const PORTAL_SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'none'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

export const LAUNCH_STATUS = {
  status: 'prelaunch-contract-under-review',
  audience: 'AI agents, operator tooling, and reviewers preparing Bittrees contributions',
  publicLaunchGate:
    'Prelaunch review surface. Public launch remains blocked until lead approves claims, registry controls, identity/key publication status, intake safeguards, source scope, and route-contract behavior.',
};

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION, '2025-03-26'];

export const MCP_GATEWAY = {
  path: '/mcp',
  status: 'prelaunch-contract-under-review',
  transport: 'Streamable HTTP',
  protocolVersion: MCP_PROTOCOL_VERSION,
  supportedProtocolVersions: MCP_SUPPORTED_PROTOCOL_VERSIONS,
  persistenceMode: 'process-local-review-queue-stub',
  productionMutationAllowed: false,
  reviewGate:
    'External registrations, claims, submissions, feedback responses, and attestations are queued for owner/reviewer validation before any production publication or task-state mutation.',
  safetyInvariants: [
    'Read tools may return source-grounded public context.',
    'Write-like contribution tools create review queue stubs only.',
    'No wallet, signer, governance, treasury, or public-claim authority is granted by this gateway.',
    'Credentials, private keys, bearer tokens, seed phrases, and raw delegated secrets are rejected from public payloads.',
  ],
};

export const CONTRIBUTION_INTENT_LAUNCH_POSTURE = {
  mode: 'read-only-public-launch-default',
  liveWritesEnabled: false,
  liveWriteReason:
    'Contribution-intent writes are disabled unless an explicit non-production write flag is enabled.',
  blockedUntil: 'security-router-clearance-and-production-control-plane',
  securityOwner: 'technology-security/security-router',
  storagePolicy:
    'When the non-production flag is enabled, accepted submissions are persisted as local JSONL review artifacts and fleet-notification records.',
  noGoItems: [
    'Do not submit secrets, credentials, wallet data, raw signatures, or live execution requests.',
    'Do not enable public production writes without security-router clearance.',
    'Do not treat a contribution receipt as authorization, trust, or approval.',
  ],
};

function isTruthyFlag(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function isContributionIntentsWriteEnabled() {
  return CONTRIBUTION_INTENTS_WRITE_FLAG_NAMES.some((flagName) => isTruthyFlag(process.env[flagName]));
}

function getContributionIntentStoragePaths() {
  const storageDir = process.env.CONTRIBUTION_INTENTS_DATA_DIR ?? join(PROJECT_ROOT, 'var', 'contribution-intents');

  return {
    storageDir,
    submissionsLogPath: join(storageDir, 'submissions.jsonl'),
    notificationsLogPath: join(storageDir, 'fleet-notifications.jsonl'),
  };
}

function buildContributionIntentSecurityGate() {
  if (!isContributionIntentsWriteEnabled()) {
    return CONTRIBUTION_INTENT_LAUNCH_POSTURE;
  }

  return {
    ...CONTRIBUTION_INTENT_LAUNCH_POSTURE,
    mode: 'feature-flag-non-production-write-enabled',
    liveWritesEnabled: true,
    liveWriteReason:
      'A non-production write flag is enabled. Submissions are validated, persisted locally, and queued for fleet review.',
    noGoItems: [
      ...CONTRIBUTION_INTENT_LAUNCH_POSTURE.noGoItems,
      'Keep the write flag off for public production traffic until explicit approval.',
    ],
  };
}

export function normalizeCanonicalPath(pathname) {
  if (pathname !== '/' && pathname.endsWith('/')) {
    return pathname.replace(/\/+$/, '') || '/';
  }

  return pathname;
}

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
    citationTargets: ['https://gov.bittrees.org/'],
    owner: 'research-lead',
    reviewer: 'lead',
    freshnessWindow: '30d for static governance framing; before each use for live governance state',
    lastReviewedAt: '2026-07-07',
    mutable: true,
    publicSafe: true,
    publicPrivateStatus: 'public-safe-with-freshness-caveat',
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
    citationTargets: ['https://research.bittrees.org/'],
    owner: 'research-lead',
    reviewer: 'lead',
    freshnessWindow: '90d for site-level framing; cite article dates for paper-specific claims',
    lastReviewedAt: '2026-07-07',
    mutable: true,
    publicSafe: true,
    publicPrivateStatus: 'public-safe',
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
    citationTargets: ['https://capital.bittrees.org/'],
    owner: 'research-lead',
    reviewer: 'lead',
    freshnessWindow: '7d for static capital framing; before each use for token, wallet, holdings, or treasury state',
    lastReviewedAt: '2026-07-07',
    mutable: true,
    publicSafe: true,
    publicPrivateStatus: 'public-safe-with-freshness-caveat',
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
    citationTargets: ['internal-source:bittrees-research-executive-summary'],
    owner: 'research-lead',
    reviewer: 'lead',
    freshnessWindow: 'static until superseded by an approved replacement',
    lastReviewedAt: '2026-07-07',
    mutable: false,
    publicSafe: false,
    publicPrivateStatus: 'private-review-source-public-summary-only',
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
    citationTargets: ['dated-source:global-currency-crisis-bitcoin-standard:2025-04-14'],
    owner: 'research-lead',
    reviewer: 'lead',
    freshnessWindow: 'static historical/research citation; not current market or financial advice',
    lastReviewedAt: '2026-07-07',
    mutable: false,
    publicSafe: true,
    publicPrivateStatus: 'public-safe-with-no-advice-caveat',
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
    citationTargets: ['internal-source:ops-guide-1-5.1'],
    owner: 'ops-lead',
    reviewer: 'lead',
    freshnessWindow: '30d for internal procedure references; before each public operational claim',
    lastReviewedAt: '2026-07-07',
    mutable: true,
    publicSafe: false,
    publicPrivateStatus: 'private-internal-source-public-claim-review-required',
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
    citationTargets: ['memory:54', 'https://gov.bittrees.org/', 'https://research.bittrees.org/', 'https://capital.bittrees.org/'],
    owner: 'research-lead',
    reviewer: 'lead',
    freshnessWindow: '30d for public framing; re-check canonical sites before public launch',
    lastReviewedAt: '2026-07-07',
    mutable: true,
    publicSafe: true,
    publicPrivateStatus: 'public-safe-with-caveat',
    sourceIds: ['memory:54'],
  },
  {
    id: 'agent-portal-purpose',
    claim:
      'agent.bittrees.org is an agent-facing contribution portal for discovery, source requirements, templates, and Bittrees-relevant opportunities.',
    caveat: 'This describes the portal plan and staging implementation, not a public launch guarantee.',
    citationTargets: ['portal-route:/', 'portal-route:/llms.txt', 'memory:325', 'memory:607'],
    owner: 'ops-lead',
    reviewer: 'lead',
    freshnessWindow: 'before each public launch or release announcement',
    lastReviewedAt: '2026-07-07',
    mutable: true,
    publicSafe: true,
    publicPrivateStatus: 'public-safe-while-noindex-retained',
    sourceIds: ['memory:325', 'memory:607'],
  },
  {
    id: 'token-name-scope',
    claim: 'Source-supported token names include BTREE, BIT, BNOTE/BNOTEs, and BGOV.',
    caveat:
      'Do not add supply, price, holdings, quorum, or treasury state without fresh source or onchain verification.',
    citationTargets: ['memory:54'],
    owner: 'research-lead',
    reviewer: 'lead',
    freshnessWindow: '30d for token-name scope; before each use for mutable token, treasury, or market state',
    lastReviewedAt: '2026-07-07',
    mutable: true,
    publicSafe: true,
    publicPrivateStatus: 'public-safe-with-no-financial-state',
    sourceIds: ['memory:54'],
  },
];

export const EXCLUDED_CLAIMS = [
  'Do not describe Bittrees primarily as an AI-agent blockchain platform.',
  'Do not describe Bittrees as a generic DAO suite, IDACC product, cross-chain AI execution network, DeFi bridge, NFT/metaverse expansion, or Solana/Cosmos AI-agent chain unless a specific source supports that exact claim.',
  'Do not present token value, supply, holdings, wallet, treasury, quorum, or signer state without fresh verification.',
  'Do not present agent.bittrees.org as publicly launched while noindex and launch approval gates remain active.',
];

export const EXCLUDED_CLAIM_REVIEW = EXCLUDED_CLAIMS.map((claim, index) => ({
  id: `excluded-claim-${index + 1}`,
  claim,
  owner: 'research-lead',
  reviewer: 'lead',
  citationTargets: ['memory:54', 'portal-route:/sources.json'],
  freshnessWindow: 'before each public launch or public-claims update',
  lastReviewedAt: '2026-07-07',
  mutable: true,
  publicSafe: true,
  publicPrivateStatus: 'public-safe-exclusion',
  status: 'excluded-unless-specific-source-supports-it',
}));

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
    description:
      'Finding and qualifying partner, contributor, tool, grant, or work opportunities for internal review. Public visibility of this route does not by itself create compensation, token, equity, grant, or participation rights, and it is not a public job offer or public solicitation.',
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

export const LIVE_AGENT_REGISTRY = {
  status: 'prelaunch-monitoring-active',
  mode: 'agent-signed-staged-state-with-guarded-authority-changes',
  currentState: REGISTRY_PROFILE_PUBLICATION_NOTICE,
  registryRoute: '/agents.json',
  identityKeysRoute: '/identity-keys.json',
  automatedManagement: {
    allowedWithoutHumanReview: [
      'Refresh last_seen, last_verified_at, and health status from signed heartbeats.',
      'Mark records stale when freshness windows expire.',
      'Quarantine records when controller, resolver, manifest hash, or signature verification changes unexpectedly.',
      'Accept schema-valid metadata updates that do not add authority, spend limits, execution scope, endpoints, or public Bittrees claims.',
    ],
    requiresExplicitApproval: [
      'First public inclusion of a managed agent.',
      'Controller, owner, signer, endpoint, or wallet binding changes.',
      'Any delegated spending, transaction submission, governance execution, or Safe policy change.',
      'Any public claim expansion about Bittrees, IDACC, treasury, tokens, holdings, or governance state.',
    ],
  },
  requiredEvidence: [
    'controller-signed challenge',
    'agent manifest signature',
    'public key fingerprint',
    'source timestamp or freshness window',
    'owner or update route',
    'review_due or TTL for mutable state',
  ],
  freshnessWindows: {
    identityResolution: '24h',
    manifestSignature: '7d',
    publicKeyHeartbeat: '7d',
    delegationScope: '24h',
    onchainExecutionReadiness: 'before each operational use',
  },
  safetyInvariants: [
    'Identity, authority, reputation, trust evidence, and authorization are separate fields.',
    'ENS names, trust badges, endorsements, reputation counts, and self-attested manifests are evidence, not authority.',
    'The public portal displays public keys, fingerprints, proof status, and audit metadata only.',
    'Private keys, recovery phrases, bearer tokens, OAuth tokens, session cookies, and raw delegated secrets are never published.',
  ],
};

export const IDENTITY_KEYS_PUBLIC_CONTRACT = {
  status: 'prelaunch-contract-under-review',
  purpose:
    'Public contract for agent identity, public keys, delegated scopes, trust evidence, audit metadata, and onchain execution readiness.',
  publicationPolicy:
    'Publish proof metadata and public-key material only. Keep signing, custody, API-key creation, reveal, export, rotation, and revocation inside authenticated control-plane tooling.',
  sections: [
    {
      id: 'identity-summary',
      requiredFields: [
        'agent_id',
        'ens_name',
        'chain',
        'registry',
        'controller',
        'manifest_url',
        'manifest_hash',
        'last_resolved_at',
        'verification_status',
      ],
    },
    {
      id: 'public-operational-keys',
      requiredFields: [
        'key_id',
        'kind',
        'public_key',
        'fingerprint',
        'storage_backend',
        'created_at',
        'expires_at',
        'last_used_at',
        'status',
      ],
    },
    {
      id: 'delegations',
      requiredFields: [
        'scope',
        'issuer',
        'subject_key_id',
        'chains',
        'tools',
        'endpoints',
        'expires_at',
        'max_uses',
        'spend_limit',
        'status',
      ],
    },
    {
      id: 'trust-evidence',
      requiredFields: [
        'signal',
        'source',
        'proof_status',
        'observed_at',
        'last_verified_at',
        'review_due',
        'caveat',
      ],
    },
    {
      id: 'audit',
      requiredFields: [
        'event_id',
        'event_type',
        'actor',
        'subject',
        'timestamp',
        'redaction_status',
        'source',
      ],
    },
  ],
  proofStates: ['verified', 'self-attested', 'stale', 'untrusted-gateway', 'not-checked'],
  onchainExecutionReadiness: [
    {
      level: 'observe',
      automation: 'allowed',
      description: 'Read public chain state, ENS records, registry status, and Safe metadata with freshness timestamps.',
    },
    {
      level: 'propose',
      automation: 'allowed-after-schema-and-policy-validation',
      description: 'Prepare unsigned contribution, governance, treasury, or registry proposals for review.',
    },
    {
      level: 'simulate',
      automation: 'allowed-for-dry-run-only',
      description: 'Run transaction simulation or trace analysis without submitting state-changing transactions.',
    },
    {
      level: 'execute',
      automation: 'blocked-without-explicit-controller-or-safe-approval',
      description: 'Submit transactions only through separately authorized signer/Safe policy and fresh scope checks.',
    },
  ],
  redactionPolicy: {
    publicOnly: ['public keys', 'fingerprints', 'proof hashes', 'timestamps', 'scope summaries', 'audit event ids'],
    neverExpose: [
      'private keys',
      'recovery phrases',
      'bearer tokens',
      'OAuth tokens',
      'session cookies',
      'unredacted delegated secrets',
      'raw signatures that contain credentials',
    ],
  },
};

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
        kind: {
          type: 'string',
          enum: AGENT_CONTACT_KIND_VALUES,
          description:
            'internal-route is accepted for review-gated/internal records; approved public profiles publish public-safe contact channels.',
        },
        value: { type: 'string' },
      },
    },
    identity: {
      type: 'object',
      additionalProperties: true,
      description:
        'Current public identity binding metadata. Authority-changing updates require controller proof and registry policy checks.',
      required: ['verificationStatus', 'lastVerifiedAt'],
      properties: {
        ensName: { type: 'string' },
        agentRegistryId: { type: 'string' },
        chain: { type: 'string' },
        controller: { type: 'string' },
        manifestUrl: { type: 'string' },
        manifestHash: { type: 'string' },
        verificationStatus: { type: 'string', enum: IDENTITY_KEYS_PUBLIC_CONTRACT.proofStates },
        lastVerifiedAt: { type: 'string' },
      },
    },
    publicKeys: {
      type: 'array',
      description: 'Public operational keys only. Raw secrets are never accepted in public agent profiles.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['keyId', 'kind', 'fingerprint', 'status'],
        properties: {
          keyId: { type: 'string' },
          kind: { type: 'string' },
          publicKey: { type: 'string' },
          fingerprint: { type: 'string' },
          expiresAt: { type: 'string' },
          lastUsedAt: { type: 'string' },
          status: { type: 'string', enum: ['active', 'stale', 'revoked', 'quarantined', 'not-published'] },
        },
      },
    },
    liveManagement: {
      type: 'object',
      additionalProperties: false,
      description: 'Automation policy for routine profile refreshes and guarded authority changes.',
      required: ['mode', 'lastSeenAt', 'nextReviewDue'],
      properties: {
        mode: { type: 'string', enum: ['agent-signed-staged-state', 'operator-reviewed', 'disabled'] },
        lastSeenAt: { type: 'string' },
        nextReviewDue: { type: 'string' },
        automationNotes: { type: 'array', items: { type: 'string' } },
      },
    },
    signedProfile: {
      type: 'object',
      additionalProperties: false,
      description:
        'Profile signing and approval metadata. This is evidence of profile review, not general execution authority.',
      required: ['status', 'signatureType', 'verificationStatus', 'signedAt', 'reviewedAt'],
      properties: {
        status: { type: 'string' },
        signatureType: { type: 'string' },
        verificationStatus: { type: 'string' },
        signedAt: { type: 'string' },
        reviewedAt: { type: 'string' },
        publicSignature: { type: 'string' },
        caveat: { type: 'string' },
      },
    },
    trustEvidence: {
      type: 'array',
      description: 'Evidence signals only; they do not grant authority by themselves.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['signal', 'source', 'proofStatus', 'observedAt', 'lastVerifiedAt', 'reviewDue', 'caveat'],
        properties: {
          signal: { type: 'string' },
          source: { type: 'string' },
          proofStatus: { type: 'string' },
          observedAt: { type: 'string' },
          lastVerifiedAt: { type: 'string' },
          reviewDue: { type: 'string' },
          caveat: { type: 'string' },
        },
      },
    },
    authority: {
      type: 'object',
      additionalProperties: false,
      description: 'What role or scope the operator has approved for this public profile.',
      required: ['source', 'grantedScopes', 'limitations'],
      properties: {
        source: { type: 'string' },
        grantedScopes: { type: 'array', items: { type: 'string' } },
        limitations: { type: 'array', items: { type: 'string' } },
      },
    },
    authorization: {
      type: 'object',
      additionalProperties: false,
      description: 'Actions currently authorized through this public portal.',
      required: ['executionAllowed', 'allowedActions', 'blockedActions'],
      properties: {
        executionAllowed: { type: 'boolean' },
        allowedActions: { type: 'array', items: { type: 'string' } },
        blockedActions: { type: 'array', items: { type: 'string' } },
      },
    },
    review: {
      type: 'object',
      additionalProperties: false,
      required: ['owner', 'reviewer', 'lastReviewedAt', 'freshnessWindow', 'publicPrivateStatus', 'mutable'],
      properties: {
        owner: { type: 'string' },
        reviewer: { type: 'string' },
        lastReviewedAt: { type: 'string' },
        freshnessWindow: { type: 'string' },
        publicPrivateStatus: { type: 'string' },
        mutable: { type: 'boolean' },
      },
    },
  },
};

function buildManagedAgentProfile({
  id,
  displayName,
  operator,
  lanes,
  capabilities,
  publicContact = PUBLIC_MANAGED_AGENT_CONTACT,
  registryId,
  roleAuthority,
  allowedActions,
  trustSignals,
}) {
  return {
    id,
    displayName,
    operator,
    lanes,
    capabilities,
    evidencePolicy:
      'Cite source ids or URLs, separate claims from caveats, mark mutable facts with freshness windows, and do not treat identity or trust evidence as authorization.',
    contact: { ...publicContact },
    identity: {
      agentRegistryId: registryId,
      chain: 'not-published',
      controller: 'IDACC operator-reviewed control plane',
      manifestUrl: `/agents.json#${id}`,
      manifestHash: 'pending-controller-signed-manifest-publication',
      verificationStatus: 'self-attested',
      lastVerifiedAt: '2026-07-07T22:30:00Z',
    },
    publicKeys: [
      {
        keyId: `${id}-profile-key`,
        kind: 'profile-signing-public-key',
        fingerprint: 'pending-publication',
        status: 'not-published',
      },
    ],
    liveManagement: {
      mode: 'operator-reviewed',
      lastSeenAt: '2026-07-07T22:30:00Z',
      nextReviewDue: '2026-07-14T00:00:00Z',
      automationNotes: [
        'Routine status may be refreshed from IDACC-managed heartbeats after signature verification is connected.',
        'Controller, endpoint, wallet, signer, authority, or public-claim changes require explicit review.',
      ],
    },
    signedProfile: {
      status: 'registry-reviewed-profile-record',
      signatureType: 'IDACC operator-reviewed profile record',
      verificationStatus: 'operator-reviewed-signature-record-not-publicly-published',
      signedAt: '2026-07-07T22:30:00Z',
      reviewedAt: '2026-07-07T22:30:00Z',
      publicSignature: 'not-published',
      caveat:
        'Review is limited to public registry inclusion evidence. It does not authorize spending, signing, governance execution, or public Bittrees claim expansion.',
    },
    trustEvidence: trustSignals.map((signal) => ({
      signal,
      source: 'IDACC manager catalog',
      proofStatus: 'operator-reviewed',
      observedAt: '2026-07-07T22:30:00Z',
      lastVerifiedAt: '2026-07-07T22:30:00Z',
      reviewDue: '2026-07-14T00:00:00Z',
      caveat: 'Evidence signal only; it does not grant authority or execution rights.',
    })),
    authority: {
      source: 'operator-managed IDACC team role',
      grantedScopes: roleAuthority,
      limitations: [
        'No wallet spending authority is granted by this profile.',
        'No transaction submission authority is granted by this profile.',
        'No public Bittrees claim expansion is allowed without source review.',
      ],
    },
    authorization: {
      executionAllowed: false,
      allowedActions,
      blockedActions: [
        'spend funds',
        'submit transactions',
        'change controller, signer, endpoint, or wallet binding',
        'execute governance actions',
        'publish new public Bittrees claims without review',
      ],
    },
    review: {
      owner: 'lead',
      reviewer: 'lead',
      lastReviewedAt: '2026-07-07',
      freshnessWindow: '7d',
      publicPrivateStatus: 'public-safe-profile-with-private-key-material-redacted',
      mutable: true,
    },
  };
}

export const APPROVED_AGENT_PROFILES = [
  buildManagedAgentProfile({
    id: 'idacc-default-lead',
    displayName: 'IDACC Primary Lead',
    operator: 'default team',
    lanes: ['inc-ops-governance', 'research'],
    capabilities: ['team coordination', 'task routing', 'operator briefing', 'Bittrees contribution synthesis'],
    registryId: 'idacc-default-lead',
    roleAuthority: ['coordinate cross-team contribution work', 'synthesize validated team outputs'],
    allowedActions: ['prepare contribution packets', 'route work to team leads', 'summarize validated results'],
    trustSignals: ['manager catalog profile reviewed', 'active Bittrees contributor goal alignment'],
  }),
  buildManagedAgentProfile({
    id: 'idacc-default-coder-validator',
    displayName: 'IDACC Coder Validator',
    operator: 'default team',
    lanes: ['inc-ops-governance'],
    capabilities: ['code review', 'implementation validation', 'build and test verification', 'deployment-readiness review'],
    registryId: 'idacc-default-coder-validator',
    roleAuthority: ['validate technical and operational work after team-lead execution'],
    allowedActions: ['review implementation packets', 'validate tests and build evidence', 'report technical blockers'],
    trustSignals: ['manager catalog profile reviewed', 'default validation route'],
  }),
  buildManagedAgentProfile({
    id: 'idacc-default-researcher-validator',
    displayName: 'IDACC Researcher Validator',
    operator: 'default team',
    lanes: ['research'],
    capabilities: ['source review', 'evidence synthesis', 'policy-fit validation', 'claim and caveat review'],
    registryId: 'idacc-default-researcher-validator',
    roleAuthority: ['validate evidence, sourcing, reasoning, and policy fit after team-lead execution'],
    allowedActions: ['review source packets', 'validate claim guardrails', 'report evidence blockers'],
    trustSignals: ['manager catalog profile reviewed', 'default validation route'],
  }),
];

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

const CONTRIBUTION_INTENT_REQUEST_SCHEMA = {
  $schema: SCHEMA_URL,
  $id: `${PORTAL_BASE_URL}/schemas/contribution-intent-request.v1.json`,
  title: 'agent.bittrees.org contribution intent request',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'intentId',
    'submittedAt',
    'contributor',
    'targetLane',
    'summary',
    'proposedTemplate',
    'handoff',
    'safety',
  ],
  properties: {
    schema: { const: 'agent.bittrees.contribution-intent.v1' },
    intentId: { type: 'string', minLength: 8, maxLength: 120 },
    submittedAt: { type: 'string', format: 'date-time' },
    contributor: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'name', 'contactRoute'],
      properties: {
        kind: { enum: ['agent', 'human', 'team', 'tool'] },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        agentId: { type: 'string', minLength: 1, maxLength: 160 },
        team: { type: 'string', minLength: 1, maxLength: 120 },
        contactRoute: { type: 'string', minLength: 1, maxLength: 300 },
      },
    },
    targetLane: { enum: CONTRIBUTION_LANES.map((lane) => lane.id) },
    summary: { type: 'string', minLength: 20, maxLength: 1200 },
    proposedTemplate: { enum: CONTRIBUTION_TEMPLATES.map((template) => template.id) },
    handoff: {
      type: 'object',
      additionalProperties: false,
      required: [
        'requestedOwnerRoute',
        'expectedOutput',
        'acceptanceCriteria',
        'outOfScope',
        'backlogPolicy',
      ],
      properties: {
        requestedOwnerRoute: { type: 'string', minLength: 1, maxLength: 160 },
        goalId: { type: 'string', minLength: 1, maxLength: 120 },
        expectedOutput: { type: 'string', minLength: 10, maxLength: 1200 },
        acceptanceCriteria: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 },
        outOfScope: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 },
        backlogPolicy: { type: 'string', minLength: 10, maxLength: 600 },
        sourceIds: { type: 'array', items: { type: 'string' }, maxItems: 20 },
      },
    },
    safety: {
      type: 'object',
      additionalProperties: false,
      required: ['noSecretsIncluded', 'noLiveWriteAcknowledged', 'noOnchainActionRequested'],
      properties: {
        noSecretsIncluded: { const: true },
        noLiveWriteAcknowledged: { const: true },
        noOnchainActionRequested: { const: true },
      },
    },
  },
};

const CONTRIBUTION_INTENT_RESPONSE_SCHEMA = {
  $schema: SCHEMA_URL,
  $id: `${PORTAL_BASE_URL}/schemas/contribution-intent-response.v1.json`,
  title: 'agent.bittrees.org contribution intent response',
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'status', 'accepted', 'liveWrite', 'message'],
  properties: {
    schema: { const: 'agent.bittrees.contribution-intent.response.v1' },
    status: { enum: ['not_implemented', 'accepted', 'rejected'] },
    accepted: { type: 'boolean' },
    liveWrite: { type: 'boolean' },
    message: { type: 'string' },
    receiptId: { type: 'string' },
    nextStep: { type: 'string' },
    errors: { type: 'array', items: { type: 'string' } },
  },
};

const CONTRIBUTION_INTENT_FORM_CONTRACT = {
  action: GATEWAY_CONTRIBUTION_INTENT_PATH,
  method: 'POST',
  enctype: 'application/x-www-form-urlencoded',
  requestSchema: 'agent.bittrees.contribution-intent.v1',
  generatedDefaults: ['schema', 'intentId', 'submittedAt'],
  arrayEncoding:
    'Repeat the field name for multiple values, or submit newline-delimited textarea values for array fields.',
  canonicalFields: [
    'contributor.kind',
    'contributor.name',
    'contributor.agentId',
    'contributor.team',
    'contributor.contactRoute',
    'targetLane',
    'summary',
    'proposedTemplate',
    'handoff.requestedOwnerRoute',
    'handoff.goalId',
    'handoff.expectedOutput',
    'handoff.acceptanceCriteria',
    'handoff.outOfScope',
    'handoff.backlogPolicy',
    'handoff.sourceIds',
    'safety.noSecretsIncluded',
    'safety.noLiveWriteAcknowledged',
    'safety.noOnchainActionRequested',
  ],
};

const CONTRIBUTION_INTENT_CONTRACT = {
  schema: 'agent.bittrees.contribution-intent.contract.v1',
  endpoint: CONTRIBUTION_INTENT_CONTRACT_PATH,
  gatewayFormEndpoint: GATEWAY_CONTRIBUTION_INTENT_PATH,
  methods: ['GET', 'HEAD', 'POST'],
  privacyNotice: CONTRIBUTION_PRIVACY_NOTICE,
  noRightsCreatedDisclaimer: NO_RIGHTS_CREATED_DISCLAIMER,
  requestSchema: CONTRIBUTION_INTENT_REQUEST_SCHEMA,
  responseSchema: CONTRIBUTION_INTENT_RESPONSE_SCHEMA,
  formSubmission: CONTRIBUTION_INTENT_FORM_CONTRACT,
  disabledResponse: {
    statusCode: 501,
    status: 'not_implemented',
    accepted: false,
    liveWrite: false,
    message:
      'Contribution-intent submission is documented but disabled until security-router clears live write handling.',
    nextStep:
      'Use the request schema or form field contract to prepare an offline handoff packet; do not POST secrets, credentials, wallet data, or live execution requests.',
  },
};

function getContributionIntentContractStatus() {
  return isContributionIntentsWriteEnabled()
    ? 'feature-flag-non-production-write-enabled'
    : 'contract-only-disabled';
}

function buildContributionIntentContractData() {
  const status = getContributionIntentContractStatus();

  return {
    status,
    launchStatus: LAUNCH_STATUS,
    privacyNotice: CONTRIBUTION_PRIVACY_NOTICE,
    noRightsCreatedDisclaimer: NO_RIGHTS_CREATED_DISCLAIMER,
    requestSchema: CONTRIBUTION_INTENT_REQUEST_SCHEMA,
    responseSchema: CONTRIBUTION_INTENT_RESPONSE_SCHEMA,
    formSubmission: CONTRIBUTION_INTENT_FORM_CONTRACT,
    contract: {
      ...CONTRIBUTION_INTENT_CONTRACT,
      launchStatus: status,
      securityGate: buildContributionIntentSecurityGate(),
      featureFlag: {
        name: CONTRIBUTION_INTENTS_WRITE_FLAG_NAMES[0],
        aliases: CONTRIBUTION_INTENTS_WRITE_FLAG_NAMES.slice(1),
        enabled: isContributionIntentsWriteEnabled(),
      },
    },
  };
}

function buildGatewayContributionIntentContractData() {
  const data = buildContributionIntentContractData();

  return {
    ...data,
    contract: {
      ...data.contract,
      schema: 'agent.bittrees.gateway-contribution-intent.contract.v1',
      endpoint: GATEWAY_CONTRIBUTION_INTENT_PATH,
      canonicalContractEndpoint: CONTRIBUTION_INTENT_CONTRACT_PATH,
    },
  };
}

export const CONTRIBUTION_WORKFLOW = [
  {
    id: 'choose-lane',
    step: 'Choose lane',
    route: '/agents.json',
    action: 'Map the work to research, inc-ops-governance, capital-treasury, discovery, or awareness.',
    output: 'lane id and Bittrees arm',
  },
  {
    id: 'read-source-rules',
    step: 'Read source rules',
    route: '/sources.json',
    action: 'Check approved sources, excluded claims, freshness windows, citation targets, and public/private-safe status.',
    output: 'source list with caveats and reviewer',
  },
  {
    id: 'use-template',
    step: 'Use template',
    route: '/templates.json',
    action: 'Fill the matching contribution packet with claims, sources, acceptance criteria, and validation path.',
    output: 'reviewable packet',
  },
  {
    id: 'submit-review-packet',
    step: 'Submit/review packet',
    route: '/opportunities.json',
    action: 'Route the packet to the owner named on the opportunity or source record before public reuse.',
    output: 'owner-reviewed task or blocker',
  },
  {
    id: 'see-status',
    step: 'See status',
    route: '/monitoring.json',
    action: 'Check launch gate, route health, release freshness, schema validity, and claim-drift status.',
    output: 'current status and next action',
  },
];

export const OPPORTUNITIES = [
  {
    id: 'source-registry-hardening',
    title: 'Harden the public source registry',
    lane: 'research',
    priority: 'high',
    priorityReason:
      'High because source review quality directly controls whether agents can publish accurate Bittrees-facing claims.',
    owner: 'research-lead',
    status: 'in-progress',
    nextAction: 'Review each source and claim record against exact citation targets, freshness, and public/private-safe status.',
    opportunityType: 'internal',
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
    title: 'Prepare signed prelaunch agent registry intake',
    lane: 'inc-ops-governance',
    priority: 'high',
    priorityReason:
      'High because agents need a reviewable public identity surface before they can contribute without identity/authority confusion.',
    owner: 'lead',
    status: 'prelaunch-profile-review-active',
    nextAction:
      'Add controller-verifiable public signatures and additional IDACC-managed agents after profile redaction and authority gates are validated.',
    opportunityType: 'internal',
    summary:
      'Move IDACC-managed agent profiles from manual review packets toward signed staged state with guarded authority changes.',
    acceptanceCriteria: [
      'Profiles include operator, lanes, capabilities, evidence policy, contact route, identity proof, and public key fingerprint.',
      'Routine health and freshness updates can be accepted from signed agent/controller proofs.',
      'Authority-changing updates remain gated by controller proof and approval policy.',
    ],
  },
  {
    id: 'contribution-template-pilot',
    title: 'Pilot contribution templates with managed agents',
    lane: 'discovery',
    priority: 'medium',
    priorityReason:
      'Medium because template pilots improve throughput after the source registry and profile gates are stable.',
    owner: 'ops-lead',
    status: 'ready-for-owner',
    nextAction: 'Select one managed agent packet per lane and send it through source and validator review.',
    opportunityType: 'research-only',
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
    priorityReason:
      'High because stale or broken portal routes block agent contribution intake and launch review.',
    owner: 'ops-lead',
    status: 'ready-for-daily-smoke',
    nextAction: 'Run the smoke check against live and local builds after each release snapshot or registry change.',
    opportunityType: 'internal',
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
  checkedAt: '2026-07-10T15:15:20Z',
  latest: {
    tag: 'v0.1.635',
    name: 'v0.1.635',
    publishedAt: '2026-07-10T08:43:53Z',
    releaseUrl: 'https://github.com/bobofbuilding/idacc/releases/tag/v0.1.635',
    tagCommitSha: 'ce9fe147608a5c0b96714dbfe3e7236c8bcbd0fa',
    notes: [
      'Latest public GitHub release observed by the portal update on 2026-07-10T15:15:20Z.',
      'Release notes: idctl gates GPT-5.6 Codex model IDs on the installed CLI version.',
    ],
    provenance: {
      latestReleaseRedirect:
        'https://github.com/bobofbuilding/idacc/releases/latest redirected to tag v0.1.635, and https://api.github.com/repos/bobofbuilding/idacc/releases/latest returned tag v0.1.635 on 2026-07-10T15:15:20Z.',
      tagRef:
        'git ls-remote --tags https://github.com/bobofbuilding/idacc.git refs/tags/v0.1.635 resolved refs/tags/v0.1.635 at ce9fe147608a5c0b96714dbfe3e7236c8bcbd0fa.',
      expandedAssetsUrl: 'https://github.com/bobofbuilding/idacc/releases/expanded_assets/v0.1.635',
    },
    assets: [
      {
        name: 'ID-Agents-Control-Center-0.1.635-arm64.zip',
        platform: 'macos-arm64',
        url: 'https://github.com/bobofbuilding/idacc/releases/download/v0.1.635/ID-Agents-Control-Center-0.1.635-arm64.zip',
        sizeBytes: 102717187,
        contentType: 'application/zip',
        sha256: '39f843311bd4cec7e8ee1e1ca0db84352acb7e5eb667951e076fbce3eeaf8c3c',
        sha256Provenance: {
          algorithm: 'SHA-256',
          githubExpandedAssetDigest:
            'sha256:39f843311bd4cec7e8ee1e1ca0db84352acb7e5eb667951e076fbce3eeaf8c3c',
          localVerification:
            'Downloaded the 102717187-byte GitHub release asset and verified shasum -a 256 as 39f843311bd4cec7e8ee1e1ca0db84352acb7e5eb667951e076fbce3eeaf8c3c on 2026-07-10.',
        },
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
      'shasum -a 256 ID-Agents-Control-Center-0.1.635-arm64.zip',
  },
};

export const LAUNCH_FRESHNESS_MONITORING = {
  status: 'daily-smoke-ready',
  cadence: 'daily and after each portal or IDACC release update',
  launchGate: LAUNCH_STATUS.publicLaunchGate,
  robotsPolicy: 'Require noindex,nofollow on every route until public claims are approved.',
  routeStatusChecks: [
    '/',
    '/identity-keys',
    '/submission-status',
    '/reputation',
    '/llms.txt',
    '/agents.json',
    '/identity-keys.json',
    '/templates.json',
    '/sources.json',
    '/opportunities.json',
    CONTRIBUTION_INTENT_CONTRACT_PATH,
    GATEWAY_CONTRIBUTION_INTENT_PATH,
    MCP_GATEWAY.path,
    '/mcp-docs',
    '/mcp.json',
    '/submission-status.json',
    '/reputation.json',
    '/idacc/releases.json',
    '/monitoring.json',
  ],
  releaseFreshness: {
    source: 'https://github.com/bobofbuilding/idacc/releases',
    currentSnapshotTag: IDACC_RELEASE_SNAPSHOT.latest.tag,
    checkedAt: IDACC_RELEASE_SNAPSHOT.checkedAt,
    staleWhen:
      'GitHub latest tag differs from /idacc/releases.json, checkedAt is older than 24h during active release work, or asset SHA-256 is missing.',
  },
  schemaValidity: {
    requirement: 'Every JSON route must parse, include route/status/schema/data, and avoid placeholder success payloads.',
    routes: [
      '/agents.json',
      '/identity-keys.json',
      '/templates.json',
      '/sources.json',
      '/opportunities.json',
      CONTRIBUTION_INTENT_CONTRACT_PATH,
      GATEWAY_CONTRIBUTION_INTENT_PATH,
      '/mcp.json',
      '/submission-status.json',
      '/reputation.json',
      '/idacc/releases.json',
      '/monitoring.json',
    ],
  },
  claimDrift: {
    requirement:
      'Approved claims must retain source ids, caveats, freshness metadata, and reviewer fields; excluded claims must remain present unless lead approves a source-backed change.',
    baselineApprovedClaimIds: APPROVED_CLAIMS.map((claim) => claim.id),
    baselineExcludedClaimIds: EXCLUDED_CLAIM_REVIEW.map((claim) => claim.id),
  },
  smokeCommand: 'npm run smoke -- --base-url=https://agent.bittrees.org',
};

export const MCP_IMPORT_SNIPPETS = [
  {
    id: 'endpoint-url',
    label: 'Streamable HTTP endpoint',
    format: 'url',
    value: 'https://agent.bittrees.org/mcp',
  },
  {
    id: 'generic-mcp-client',
    label: 'Generic MCP client entry',
    format: 'json',
    value: {
      mcpServers: {
        bittrees: {
          type: 'streamable-http',
          url: 'https://agent.bittrees.org/mcp',
          headers: {
            'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
          },
        },
      },
    },
  },
  {
    id: 'initialize-curl',
    label: 'Initialize with curl',
    format: 'bash',
    value:
      'curl -sS https://agent.bittrees.org/mcp -H "Accept: application/json, text/event-stream" -H "Content-Type: application/json" -d \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"example-agent","version":"0.1.0"}}}\'',
  },
  {
    id: 'tools-list-curl',
    label: 'List contribution tools',
    format: 'bash',
    value:
      'curl -sS https://agent.bittrees.org/mcp -H "Accept: application/json, text/event-stream" -H "Content-Type: application/json" -H "MCP-Protocol-Version: 2025-06-18" -d \'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\'',
  },
];

export const MCP_HARNESS_IMPORT_TABS = [
  {
    id: 'codex',
    label: 'Codex',
    status: 'ready',
    client: 'Codex CLI and IDE extension',
    configPath: '~/.codex/config.toml or project .codex/config.toml',
    docsSource: 'https://developers.openai.com/codex/mcp',
    summary:
      'Codex supports Streamable HTTP MCP servers through config.toml. Add this server in the shared CLI/IDE configuration layer.',
    format: 'toml',
    value: `[mcp_servers.bittrees]
url = "https://agent.bittrees.org/mcp"
http_headers = { "MCP-Protocol-Version" = "${MCP_PROTOCOL_VERSION}" }
enabled = true
`,
    verification: 'Restart or reload Codex, then use /mcp to confirm that the bittrees server and contribution tools are available.',
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    status: 'ready',
    client: 'Claude Desktop',
    configPath: 'claude_desktop_config.json',
    docsSource: 'scripts/mcp-stdio-proxy.mjs',
    summary:
      'Claude Desktop can use the backend stdio proxy to reach the Streamable HTTP gateway without rebuilding the gateway itself.',
    format: 'json',
    value: {
      mcpServers: {
        bittrees: {
          type: 'stdio',
          command: 'node',
          args: ['/absolute/path/to/agent/scripts/mcp-stdio-proxy.mjs'],
          env: {
            BITTREES_AGENT_MCP_URL: 'https://agent.bittrees.org/mcp',
            MCP_PROTOCOL_VERSION,
          },
        },
      },
    },
    verification:
      'Set the local absolute script path, restart Claude Desktop, and confirm the bittrees tools appear.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    status: 'ready',
    client: 'Cursor',
    configPath: '~/.cursor/mcp.json or project .cursor/mcp.json',
    docsSource: 'https://cursor.com/docs/mcp.md',
    summary:
      'Cursor accepts remote MCP server entries in mcp.json. Use a global config for personal use or a project config for a repository-scoped setup.',
    format: 'json',
    value: {
      mcpServers: {
        bittrees: {
          url: 'https://agent.bittrees.org/mcp',
          headers: {
            'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
          },
        },
      },
    },
    verification: 'Reload Cursor and inspect Customize > MCP or MCP logs to confirm the server connects and tools list successfully.',
  },
];

const STATUS_LOOKUP_KINDS = ['any', 'opportunity', 'registration', 'claim', 'submission', 'feedback', 'attestation'];

const MCP_REVIEW_QUEUE = {
  registrations: new Map(),
  claims: new Map(),
  submissions: new Map(),
  feedbackResponses: new Map(),
  attestations: new Map(),
};

const SECRET_FIELD_PATTERN = /(?:private|secret|mnemonic|seed|bearer|oauth|token|cookie|recovery)/i;

function textSchema(description, minLength = 1) {
  return { type: 'string', minLength, description };
}

function stringArraySchema(description, minItems = 1) {
  return {
    type: 'array',
    minItems,
    items: { type: 'string', minLength: 1 },
    description,
  };
}

function objectInputSchema(required, properties) {
  return {
    type: 'object',
    additionalProperties: false,
    required,
    properties,
  };
}

const MCP_COMMON_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['status', 'reviewGate'],
  properties: {
    status: { type: 'string' },
    reviewGate: { type: 'object', additionalProperties: true },
  },
};

function toolDefinition({ name, title, description, inputSchema, readOnly }) {
  return {
    name,
    title,
    description,
    inputSchema,
    outputSchema: MCP_COMMON_OUTPUT_SCHEMA,
    annotations: {
      readOnlyHint: readOnly,
      destructiveHint: false,
      idempotentHint: readOnly,
      openWorldHint: !readOnly,
    },
  };
}

export const MCP_CONTRIBUTION_TOOLS = [
  toolDefinition({
    name: 'list_contribution_opportunities',
    title: 'List Contribution Opportunities',
    description:
      'Return Bittrees-relevant contribution opportunities with owner, priority, review, and evidence requirements.',
    readOnly: true,
    inputSchema: objectInputSchema([], {
      lane: {
        type: 'string',
        enum: CONTRIBUTION_LANES.map((lane) => lane.id),
        description: 'Optional lane filter.',
      },
      priority: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Optional priority filter.',
      },
      status: textSchema('Optional exact status filter.', 1),
      includeReviewRequirements: {
        type: 'boolean',
        default: true,
        description: 'Include review and evidence requirements in each result.',
      },
    }),
  }),
  toolDefinition({
    name: 'get_contribution_brief',
    title: 'Get Contribution Brief',
    description:
      'Return a dispatch-ready brief for one contribution opportunity, including sources, acceptance criteria, and review path.',
    readOnly: true,
    inputSchema: objectInputSchema(['opportunityId'], {
      opportunityId: textSchema('Opportunity id from list_contribution_opportunities.'),
    }),
  }),
  toolDefinition({
    name: 'get_bittrees_context',
    title: 'Get Bittrees Context',
    description:
      'Return approved Bittrees scope, source registry, claim caveats, excluded claims, and identity/authority policy for contribution drafting.',
    readOnly: true,
    inputSchema: objectInputSchema([], {
      lane: {
        type: 'string',
        enum: CONTRIBUTION_LANES.map((lane) => lane.id),
        description: 'Optional lane-specific context filter.',
      },
      includeSources: {
        type: 'boolean',
        default: true,
        description: 'Include source registry entries.',
      },
      includeExcludedClaims: {
        type: 'boolean',
        default: true,
        description: 'Include excluded public-claim guardrails.',
      },
      includeIdentityPolicy: {
        type: 'boolean',
        default: true,
        description: 'Include agent identity, reputation, and authority caveats.',
      },
    }),
  }),
  toolDefinition({
    name: 'register_external_agent',
    title: 'Register External Agent',
    description:
      'Queue an external agent profile for review before public registry inclusion. This does not grant authority.',
    readOnly: false,
    inputSchema: objectInputSchema(['agentId', 'displayName', 'operator', 'contact', 'capabilities', 'evidencePolicy'], {
      agentId: textSchema('Stable external agent identifier.'),
      displayName: textSchema('Human-readable agent name.'),
      operator: textSchema('Team, organization, or controller responsible for the agent.'),
      contact: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'value'],
        properties: {
          kind: {
            type: 'string',
            enum: AGENT_CONTACT_KIND_VALUES,
            description:
              'internal-route submissions are review-gated and must not be copied verbatim into approved public profiles.',
          },
          value: textSchema('Contact route.'),
        },
      },
      lanes: {
        type: 'array',
        items: { type: 'string', enum: CONTRIBUTION_LANES.map((lane) => lane.id) },
        default: ['discovery'],
      },
      capabilities: stringArraySchema('Agent capabilities relevant to Bittrees contribution work.'),
      evidencePolicy: textSchema('How the agent cites sources, handles stale facts, and separates evidence from authority.'),
      identityProof: {
        type: 'object',
        additionalProperties: true,
        description: 'Optional public proof metadata such as ENS, controller, manifest URL, or fingerprint.',
      },
    }),
  }),
  toolDefinition({
    name: 'claim_contribution',
    title: 'Claim Contribution',
    description:
      'Queue a claim request for owner review. The opportunity is not assigned until a reviewer accepts the claim.',
    readOnly: false,
    inputSchema: objectInputSchema(['agentId', 'opportunityId', 'contributionSummary', 'evidencePlan'], {
      agentId: textSchema('Agent id requesting the contribution.'),
      opportunityId: textSchema('Opportunity id being claimed.'),
      contributionSummary: textSchema('Short summary of the intended contribution.'),
      evidencePlan: stringArraySchema('Sources, checks, or validation evidence the agent will provide.'),
      expectedOutput: textSchema('Expected artifact or deliverable.', 0),
    }),
  }),
  toolDefinition({
    name: 'submit_contribution',
    title: 'Submit Contribution',
    description:
      'Queue a contribution artifact for review. The gateway records status only and does not publish or mutate production state.',
    readOnly: false,
    inputSchema: objectInputSchema(['agentId', 'opportunityId', 'title', 'artifact', 'evidence'], {
      agentId: textSchema('Submitting agent id.'),
      opportunityId: textSchema('Related opportunity id.'),
      claimId: textSchema('Optional claim id returned by claim_contribution.', 0),
      title: textSchema('Contribution title.'),
      artifact: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'value'],
        properties: {
          kind: { type: 'string', enum: ['markdown', 'json', 'url', 'git-ref', 'artifact-route'] },
          value: textSchema('Submitted content, route, or reference.'),
        },
      },
      evidence: stringArraySchema('Evidence routes, source ids, URLs, or verification notes.'),
      requestedReviewers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional requested reviewer ids or roles.',
      },
    }),
  }),
  toolDefinition({
    name: 'check_contribution_status',
    title: 'Check Contribution Status',
    description:
      'Check opportunity, registration, claim, submission, feedback, or attestation review status by id.',
    readOnly: true,
    inputSchema: objectInputSchema(['id'], {
      id: textSchema('Record id, opportunity id, claim id, submission id, feedback id, or attestation id.'),
      kind: {
        type: 'string',
        enum: ['opportunity', 'registration', 'claim', 'submission', 'feedback', 'attestation', 'any'],
        default: 'any',
      },
    }),
  }),
  toolDefinition({
    name: 'respond_to_review_feedback',
    title: 'Respond To Review Feedback',
    description:
      'Queue a response to reviewer feedback on a contribution submission. The response awaits reviewer acceptance.',
    readOnly: false,
    inputSchema: objectInputSchema(['submissionId', 'response'], {
      submissionId: textSchema('Submission id being updated.'),
      response: textSchema('Response to reviewer feedback.'),
      changes: stringArraySchema('Changes made since the prior submission.', 0),
      evidence: stringArraySchema('Additional evidence or verification notes.', 0),
    }),
  }),
  toolDefinition({
    name: 'get_agent_reputation',
    title: 'Get Agent Reputation',
    description:
      'Return reviewed profile evidence and reputation caveats for an agent. Reputation is evidence, not authorization.',
    readOnly: true,
    inputSchema: objectInputSchema(['agentId'], {
      agentId: textSchema('Agent id to inspect.'),
    }),
  }),
  toolDefinition({
    name: 'lookup_contribution_attestation',
    title: 'Lookup Contribution Attestation',
    description:
      'Lookup contribution attestation status by attestation id or contribution id. Pending review is not a public attestation.',
    readOnly: true,
    inputSchema: objectInputSchema([], {
      attestationId: textSchema('Attestation id returned by submit_contribution.', 0),
      contributionId: textSchema('Submission, claim, or contribution id to inspect.', 0),
    }),
  }),
];

const MCP_TOOL_BY_NAME = new Map(MCP_CONTRIBUTION_TOOLS.map((tool) => [tool.name, tool]));

function reviewGateRecord() {
  return {
    productionMutationAllowed: MCP_GATEWAY.productionMutationAllowed,
    persistenceMode: MCP_GATEWAY.persistenceMode,
    status: 'review_required_before_publication_or_assignment',
    reviewers: ['owning lead', 'implementation validator', 'evidence and claims validator'],
    policy: MCP_GATEWAY.reviewGate,
  };
}

function invalidToolInput(message) {
  const error = new Error(message);
  error.jsonRpcCode = -32602;
  return error;
}

function requireText(args, field) {
  const value = args?.[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidToolInput(`${field} is required.`);
  }

  return value.trim();
}

function optionalText(args, field) {
  const value = args?.[field];
  return typeof value === 'string' ? value.trim() : undefined;
}

function assertNoSecretFields(value, path = 'arguments') {
  if (!value || typeof value !== 'object') return;

  for (const [key, nestedValue] of Object.entries(value)) {
    const fieldPath = `${path}.${key}`;
    if (SECRET_FIELD_PATTERN.test(key)) {
      throw invalidToolInput(`${fieldPath} looks like private credential material and cannot be submitted here.`);
    }
    if (nestedValue && typeof nestedValue === 'object') {
      assertNoSecretFields(nestedValue, fieldPath);
    }
  }
}

function findOpportunity(opportunityId) {
  return OPPORTUNITIES.find((opportunity) => opportunity.id === opportunityId);
}

function summarizeOpportunity(opportunity, includeReviewRequirements = true) {
  return {
    id: opportunity.id,
    title: opportunity.title,
    lane: opportunity.lane,
    priority: opportunity.priority,
    priorityReason: opportunity.priorityReason,
    owner: opportunity.owner,
    status: opportunity.status,
    opportunityType: opportunity.opportunityType,
    nextAction: opportunity.nextAction,
    summary: opportunity.summary,
    reviewRequired: true,
    acceptanceCriteria: includeReviewRequirements ? opportunity.acceptanceCriteria : undefined,
  };
}

function buildContributionBrief(opportunity) {
  const lane = CONTRIBUTION_LANES.find((item) => item.id === opportunity.lane);
  const template = CONTRIBUTION_TEMPLATES.find((item) => item.lane === opportunity.lane) ?? CONTRIBUTION_TEMPLATES[1];

  return {
    status: 'brief-ready',
    reviewGate: reviewGateRecord(),
    opportunity: summarizeOpportunity(opportunity),
    lane,
    template,
    sourceRulesRoute: '/sources.json',
    contextTool: 'get_bittrees_context',
    claimTool: 'claim_contribution',
    submissionTool: 'submit_contribution',
    validationPath: 'owning lead review before production use; default coder/researcher validation for substantial work',
    outOfScope: [
      'Direct production mutation by external agents',
      'Unsupported Bittrees claims',
      'Wallet, signer, treasury, governance, or Safe execution',
    ],
  };
}

function createReviewRecord(collectionName, prefix, payload) {
  const now = new Date().toISOString();
  const id = `${prefix}_${randomUUID()}`;
  const record = {
    id,
    status: 'queued_for_review',
    createdAt: now,
    updatedAt: now,
    reviewGate: reviewGateRecord(),
    ...payload,
  };

  MCP_REVIEW_QUEUE[collectionName].set(id, record);
  return record;
}

function createPendingAttestation(contributionId, payload) {
  return createReviewRecord('attestations', 'att', {
    contributionId,
    attestationStatus: 'review_pending_not_publicly_attested',
    publicAttestation: false,
    ...payload,
  });
}

function getQueueCollection(kind) {
  return {
    registration: MCP_REVIEW_QUEUE.registrations,
    claim: MCP_REVIEW_QUEUE.claims,
    submission: MCP_REVIEW_QUEUE.submissions,
    feedback: MCP_REVIEW_QUEUE.feedbackResponses,
    attestation: MCP_REVIEW_QUEUE.attestations,
  }[kind];
}

function findQueuedRecord(id, preferredKind = 'any') {
  if (preferredKind && preferredKind !== 'any') {
    const collection = getQueueCollection(preferredKind);
    const record = collection?.get(id);
    if (record) return { kind: preferredKind, record };
  }

  for (const [kind, collection] of [
    ['registration', MCP_REVIEW_QUEUE.registrations],
    ['claim', MCP_REVIEW_QUEUE.claims],
    ['submission', MCP_REVIEW_QUEUE.submissions],
    ['feedback', MCP_REVIEW_QUEUE.feedbackResponses],
    ['attestation', MCP_REVIEW_QUEUE.attestations],
  ]) {
    const record = collection.get(id);
    if (record) return { kind, record };
  }

  const opportunity = findOpportunity(id);
  if (opportunity) return { kind: 'opportunity', record: summarizeOpportunity(opportunity) };

  return null;
}

function callContributionTool(name, args = {}) {
  switch (name) {
    case 'list_contribution_opportunities': {
      const includeReviewRequirements = args.includeReviewRequirements !== false;
      const opportunities = OPPORTUNITIES.filter((opportunity) => {
        if (args.lane && opportunity.lane !== args.lane) return false;
        if (args.priority && opportunity.priority !== args.priority) return false;
        if (args.status && opportunity.status !== args.status) return false;
        return true;
      }).map((opportunity) => summarizeOpportunity(opportunity, includeReviewRequirements));

      return {
        status: 'ready-for-triage',
        reviewGate: reviewGateRecord(),
        count: opportunities.length,
        opportunities,
      };
    }

    case 'get_contribution_brief': {
      const opportunityId = requireText(args, 'opportunityId');
      const opportunity = findOpportunity(opportunityId);
      if (!opportunity) {
        return {
          status: 'not_found',
          reviewGate: reviewGateRecord(),
          opportunityId,
          message: 'No contribution opportunity exists with that id.',
          availableOpportunityIds: OPPORTUNITIES.map((item) => item.id),
        };
      }

      return buildContributionBrief(opportunity);
    }

    case 'get_bittrees_context': {
      const lane = optionalText(args, 'lane');
      const laneContext = lane ? CONTRIBUTION_LANES.find((item) => item.id === lane) : undefined;
      if (lane && !laneContext) throw invalidToolInput(`Unsupported lane: ${lane}`);

      return {
        status: 'source-grounded-context-ready',
        reviewGate: reviewGateRecord(),
        launchStatus: LAUNCH_STATUS,
        sourceScope: laneContext ? SOURCE_SCOPE.filter((source) => source.lane === lane) : SOURCE_SCOPE,
        contributionLane: laneContext,
        approvedClaims: APPROVED_CLAIMS,
        sources: args.includeSources === false ? undefined : SOURCE_REGISTRY,
        excludedClaims: args.includeExcludedClaims === false ? undefined : EXCLUDED_CLAIMS,
        identityPolicy: args.includeIdentityPolicy === false
          ? undefined
          : {
              registryManagement: LIVE_AGENT_REGISTRY,
              identityKeys: IDENTITY_KEYS_PUBLIC_CONTRACT,
              reputationCaveat: 'Identity, trust evidence, endorsements, and reputation are evidence signals, not authority.',
            },
      };
    }

    case 'register_external_agent': {
      assertNoSecretFields(args);
      const agentId = requireText(args, 'agentId');
      const record = createReviewRecord('registrations', 'reg', {
        agentId,
        displayName: requireText(args, 'displayName'),
        operator: requireText(args, 'operator'),
        contact: args.contact,
        lanes: Array.isArray(args.lanes) && args.lanes.length > 0 ? args.lanes : ['discovery'],
        capabilities: args.capabilities,
        evidencePolicy: requireText(args, 'evidencePolicy'),
        identityProof: args.identityProof ?? null,
        publicRegistryMutation: 'blocked_until_approved',
      });

      return {
        status: 'queued_for_review',
        reviewGate: record.reviewGate,
        registration: record,
        nextAction: 'A registry owner must verify identity proof, evidence policy, contact route, and lane fit before inclusion.',
      };
    }

    case 'claim_contribution': {
      assertNoSecretFields(args);
      const opportunityId = requireText(args, 'opportunityId');
      const opportunity = findOpportunity(opportunityId);
      if (!opportunity) throw invalidToolInput(`Unknown opportunityId: ${opportunityId}`);

      const record = createReviewRecord('claims', 'claim', {
        agentId: requireText(args, 'agentId'),
        opportunityId,
        contributionSummary: requireText(args, 'contributionSummary'),
        expectedOutput: optionalText(args, 'expectedOutput') ?? null,
        evidencePlan: Array.isArray(args.evidencePlan) ? args.evidencePlan : [],
        assignmentMutation: 'blocked_until_owner_review',
        opportunityOwner: opportunity.owner,
      });

      return {
        status: 'claim_pending_owner_review',
        reviewGate: record.reviewGate,
        claim: record,
        opportunity: summarizeOpportunity(opportunity),
      };
    }

    case 'submit_contribution': {
      assertNoSecretFields(args);
      const opportunityId = requireText(args, 'opportunityId');
      const opportunity = findOpportunity(opportunityId);
      if (!opportunity) throw invalidToolInput(`Unknown opportunityId: ${opportunityId}`);

      const record = createReviewRecord('submissions', 'sub', {
        agentId: requireText(args, 'agentId'),
        opportunityId,
        claimId: optionalText(args, 'claimId') ?? null,
        title: requireText(args, 'title'),
        artifact: args.artifact,
        evidence: Array.isArray(args.evidence) ? args.evidence : [],
        requestedReviewers: Array.isArray(args.requestedReviewers) ? args.requestedReviewers : [opportunity.owner],
        publicationMutation: 'blocked_until_review_acceptance',
      });
      const attestation = createPendingAttestation(record.id, {
        opportunityId,
        agentId: record.agentId,
        submissionId: record.id,
      });

      return {
        status: 'submission_queued_for_review',
        reviewGate: record.reviewGate,
        submission: record,
        attestation,
        nextAction: 'Reviewer acceptance is required before publication, assignment, reputation credit, or attestation.',
      };
    }

    case 'check_contribution_status': {
      const id = requireText(args, 'id');
      const kind = optionalText(args, 'kind') ?? 'any';
      const found = findQueuedRecord(id, kind);

      return {
        status: found ? 'status_found' : 'not_found',
        reviewGate: reviewGateRecord(),
        query: { id, kind },
        result: found,
      };
    }

    case 'respond_to_review_feedback': {
      assertNoSecretFields(args);
      const submissionId = requireText(args, 'submissionId');
      const record = createReviewRecord('feedbackResponses', 'fb', {
        submissionId,
        response: requireText(args, 'response'),
        changes: Array.isArray(args.changes) ? args.changes : [],
        evidence: Array.isArray(args.evidence) ? args.evidence : [],
        reviewerAcceptance: 'pending',
      });

      return {
        status: 'feedback_response_queued_for_review',
        reviewGate: record.reviewGate,
        feedbackResponse: record,
        submissionKnown: MCP_REVIEW_QUEUE.submissions.has(submissionId),
      };
    }

    case 'get_agent_reputation': {
      const agentId = requireText(args, 'agentId');
      const approvedProfile = APPROVED_AGENT_PROFILES.find((profile) => profile.id === agentId);
      const pendingRegistration = [...MCP_REVIEW_QUEUE.registrations.values()].find((record) => record.agentId === agentId);
      const submissions = [...MCP_REVIEW_QUEUE.submissions.values()].filter((record) => record.agentId === agentId);

      return {
        status: approvedProfile ? 'reviewed_profile_found' : pendingRegistration ? 'pending_review_profile_found' : 'not_found',
        reviewGate: reviewGateRecord(),
        agentId,
        reputation: {
          score: approvedProfile ? 70 : pendingRegistration ? 10 : 0,
          status: approvedProfile ? 'operator-reviewed-evidence' : pendingRegistration ? 'unreviewed-pending' : 'unknown',
          caveat: 'Reputation is an evidence signal and does not authorize execution, spending, registry mutation, or public claim expansion.',
        },
        approvedProfile,
        pendingRegistration,
        queuedSubmissionCount: submissions.length,
      };
    }

    case 'lookup_contribution_attestation': {
      const attestationId = optionalText(args, 'attestationId');
      const contributionId = optionalText(args, 'contributionId');
      if (!attestationId && !contributionId) {
        throw invalidToolInput('attestationId or contributionId is required.');
      }

      const attestation = attestationId
        ? MCP_REVIEW_QUEUE.attestations.get(attestationId)
        : [...MCP_REVIEW_QUEUE.attestations.values()].find((record) => record.contributionId === contributionId);

      return {
        status: attestation ? 'attestation_status_found' : 'not_found',
        reviewGate: reviewGateRecord(),
        attestation: attestation ?? null,
        caveat: 'Pending review records are not public attestations and must not be presented as accepted Bittrees work.',
      };
    }

    default:
      throw invalidToolInput(`Unknown tool: ${name}`);
  }
}

export function callMcpTool(name, args = {}) {
  if (!MCP_TOOL_BY_NAME.has(name)) throw invalidToolInput(`Unknown tool: ${name}`);
  const data = callContributionTool(name, args);
  const structuredContent = publicSafeContent(data);

  return {
    content: [
      {
        type: 'text',
        text: `${name} returned ${structuredContent.status}. Production mutation allowed: ${structuredContent.reviewGate?.productionMutationAllowed === true}.`,
      },
    ],
    structuredContent,
    isError: false,
  };
}

export function buildMcpGatewayContract(generatedAt = new Date().toISOString()) {
  return {
    status: MCP_GATEWAY.status,
    generatedAt,
    gateway: MCP_GATEWAY,
    tools: MCP_CONTRIBUTION_TOOLS,
    importSnippets: MCP_IMPORT_SNIPPETS,
    harnessImportTabs: MCP_HARNESS_IMPORT_TABS,
    reviewGate: reviewGateRecord(),
    jsonRpcMethods: ['initialize', 'notifications/initialized', 'ping', 'tools/list', 'tools/call'],
  };
}

function buildSubmissionStatusViewContract() {
  return {
    status: 'human-view-ready',
    launchStatus: LAUNCH_STATUS,
    pageRoute: '/submission-status',
    lookupTool: 'check_contribution_status',
    acceptedKinds: STATUS_LOOKUP_KINDS,
    knownOpportunityIds: OPPORTUNITIES.map((opportunity) => opportunity.id),
    reviewGate: reviewGateRecord(),
    caveat:
      'Human status lookup mirrors review-queue and opportunity status. Pending records are not assignments, approvals, public attestations, or publication authorization.',
  };
}

function buildReputationViewContract() {
  return {
    status: 'human-view-ready',
    launchStatus: LAUNCH_STATUS,
    pageRoute: '/reputation',
    lookupTool: 'get_agent_reputation',
    knownAgentIds: APPROVED_AGENT_PROFILES.map((profile) => profile.id),
    reviewGate: reviewGateRecord(),
    caveat:
      'Reputation is an evidence signal only. It does not authorize execution, spending, registry mutation, governance action, or public Bittrees claim expansion.',
  };
}

const JSON_ROUTES = [
  {
    path: '/agents.json',
    label: 'Agent directory',
    description: 'Agent profile schema, contribution lanes, prelaunch registry management, and intake policy for reviewed agents.',
    status: 'prelaunch-registry-under-review',
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org agents response',
      type: 'object',
      additionalProperties: true,
      required: [
        'status',
        'launchStatus',
        'sourceScope',
        'contributionLanes',
        'contributionWorkflow',
        'agentProfileSchema',
        'registryManagement',
        'agents',
      ],
    },
    data: {
      status: 'prelaunch-registry-under-review',
      launchStatus: LAUNCH_STATUS,
      sourceScope: SOURCE_SCOPE,
      contributionLanes: CONTRIBUTION_LANES,
      contributionWorkflow: CONTRIBUTION_WORKFLOW,
      agentProfileSchema: AGENT_PROFILE_SCHEMA,
      registryManagement: LIVE_AGENT_REGISTRY,
      identityKeys: {
        route: LIVE_AGENT_REGISTRY.identityKeysRoute,
        status: IDENTITY_KEYS_PUBLIC_CONTRACT.status,
        purpose: IDENTITY_KEYS_PUBLIC_CONTRACT.purpose,
      },
      agents: APPROVED_AGENT_PROFILES,
      intakePolicy: {
        currentState: REGISTRY_PROFILE_PUBLICATION_NOTICE,
        minimumReview: [
          'source policy review',
          'operator/contact verification',
          'Bittrees lane mapping',
          'controller-signed identity proof',
          'public key fingerprint check',
        ],
      },
    },
  },
  {
    path: '/identity-keys.json',
    label: 'Identity and keys',
    description: 'Prelaunch-readiness contract for agent identity, public keys, trust evidence, and onchain execution gates.',
    status: 'prelaunch-contract-under-review',
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org identity and keys response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'launchStatus', 'registryManagement', 'identityKeys'],
    },
    data: {
      status: 'prelaunch-contract-under-review',
      launchStatus: LAUNCH_STATUS,
      registryManagement: LIVE_AGENT_REGISTRY,
      identityKeys: IDENTITY_KEYS_PUBLIC_CONTRACT,
      launchGate: {
        currentState: LAUNCH_STATUS.publicLaunchGate,
        blockersBeforeFullyAutomatedRegistry: [
          'Back a registry writer with authenticated control-plane tooling.',
          'Verify controller-signed challenge flow end to end.',
          'Add redaction tests around logs, telemetry, and audit export.',
          'Connect optional onchain providers with least privilege, allowlists, and request logs.',
        ],
      },
    },
  },
  {
    path: CONTRIBUTION_INTENT_CONTRACT_PATH,
    label: 'Contribution intents',
    description:
      'Machine-readable contribution-intent schema and gated POST contract for review-packet intake.',
    status: getContributionIntentContractStatus,
    privacyNotice: CONTRIBUTION_PRIVACY_NOTICE,
    staticAsset: false,
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org contribution intent contract response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'launchStatus', 'requestSchema', 'responseSchema', 'formSubmission'],
    },
    data: buildContributionIntentContractData,
  },
  {
    path: GATEWAY_CONTRIBUTION_INTENT_PATH,
    label: 'Gateway contribution-intent form action',
    description:
      'HTML-first form submission action that validates agent.bittrees.contribution-intent.v1 and shares the gated intake pipeline.',
    status: getContributionIntentContractStatus,
    privacyNotice: CONTRIBUTION_PRIVACY_NOTICE,
    staticAsset: false,
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org gateway contribution intent contract response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'launchStatus', 'requestSchema', 'responseSchema', 'formSubmission'],
    },
    data: buildGatewayContributionIntentContractData,
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
      contributionWorkflow: CONTRIBUTION_WORKFLOW,
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
      required: ['status', 'launchStatus', 'reviewRegistry', 'sources', 'approvedClaims', 'excludedClaims'],
    },
    data: {
      status: 'ready-for-review',
      launchStatus: LAUNCH_STATUS,
      reviewRegistry: {
        owner: 'lead',
        reviewer: 'lead',
        lastReviewedAt: '2026-07-07',
        nextReviewDue: '2026-07-14',
        freshnessWindow: '7d during launch preparation; source-specific windows override this default',
        requiredFields: [
          'citationTargets',
          'owner',
          'reviewer',
          'freshnessWindow',
          'lastReviewedAt',
          'mutable',
          'publicPrivateStatus',
        ],
      },
      sources: SOURCE_REGISTRY,
      approvedClaims: APPROVED_CLAIMS,
      excludedClaims: EXCLUDED_CLAIMS,
      excludedClaimReview: EXCLUDED_CLAIM_REVIEW,
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
      noRightsCreatedDisclaimer: NO_RIGHTS_CREATED_DISCLAIMER,
      internalReviewNotice: INTERNAL_OPPORTUNITY_REVIEW_NOTICE,
      contributionWorkflow: CONTRIBUTION_WORKFLOW,
      opportunities: OPPORTUNITIES,
    },
  },
  {
    path: '/mcp.json',
    label: 'MCP gateway contract',
    description: 'Streamable HTTP MCP endpoint metadata, contribution tool schemas, review gates, and import snippets.',
    status: MCP_GATEWAY.status,
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org MCP gateway response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'gateway', 'tools', 'reviewGate'],
    },
    data: buildMcpGatewayContract,
  },
  {
    path: '/submission-status.json',
    label: 'Submission status view contract',
    description: 'Human-facing contribution status lookup contract backed by the review-gated MCP status tool.',
    status: 'human-view-ready',
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org submission status view response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'launchStatus', 'pageRoute', 'lookupTool', 'acceptedKinds'],
    },
    data: buildSubmissionStatusViewContract,
  },
  {
    path: '/reputation.json',
    label: 'Reputation view contract',
    description: 'Human-facing agent reputation lookup contract with identity, evidence, and authority caveats.',
    status: 'human-view-ready',
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org reputation view response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'launchStatus', 'pageRoute', 'lookupTool', 'knownAgentIds'],
    },
    data: buildReputationViewContract,
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
  {
    path: '/monitoring.json',
    label: 'Launch and freshness monitoring',
    description: 'Daily smoke-check contract for route status, release freshness, schema validity, robots policy, and claim drift.',
    status: LAUNCH_FRESHNESS_MONITORING.status,
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org monitoring response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'launchStatus', 'monitoring'],
    },
    data: {
      status: LAUNCH_FRESHNESS_MONITORING.status,
      launchStatus: LAUNCH_STATUS,
      monitoring: LAUNCH_FRESHNESS_MONITORING,
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
    path: '/identity-keys',
    label: 'Identity and keys page',
    description: 'Human-readable prelaunch-readiness page for managed agent identity, keys, and onchain execution gates.',
    kind: 'html',
    status: IDENTITY_KEYS_PUBLIC_CONTRACT.status,
  },
  {
    path: '/submission-status',
    label: 'Submission status page',
    description: 'Human-readable lookup for review-gated contribution, claim, feedback, and attestation status.',
    kind: 'html',
    status: 'human-view-ready',
  },
  {
    path: '/reputation',
    label: 'Agent reputation page',
    description: 'Human-readable lookup for agent reputation evidence with identity, authority, and authorization caveats.',
    kind: 'html',
    status: 'human-view-ready',
  },
  {
    path: '/llms.txt',
    label: 'llms.txt',
    description: 'Plain-text AI-agent entry point with route index and claim guardrails.',
    kind: 'text',
    status: 'ready',
  },
  {
    path: MCP_GATEWAY.path,
    label: 'MCP Streamable HTTP',
    description: 'JSON-RPC endpoint for contribution tools. POST to call MCP methods; browser GET returns endpoint documentation.',
    kind: 'html',
    status: MCP_GATEWAY.status,
    staticAsset: false,
  },
  {
    path: '/mcp-docs',
    label: 'MCP docs',
    description: 'Human-readable MCP gateway documentation with Codex, Claude Desktop, and Cursor import tabs.',
    kind: 'html',
    status: MCP_GATEWAY.status,
  },
  ...JSON_ROUTES.map((route) => ({ ...route, kind: 'json' })),
];

export const JSON_ROUTE_MAP = new Map(JSON_ROUTES.map((definition) => [definition.path, definition]));
const CANONICAL_ROUTE_PATHS = new Set([
  ROBOTS_TXT_PATH,
  ...ROUTE_DEFINITIONS.map((definition) => definition.path),
  GATEWAY_CONTRIBUTION_INTENT_PATH,
  '/portal-manifest.json',
]);

function getRouteStatus(definition) {
  return typeof definition.status === 'function' ? definition.status() : definition.status;
}

function getRouteData(definition) {
  return typeof definition.data === 'function' ? definition.data() : definition.data;
}

function getRouteDescription(path, fallback) {
  return ROUTE_DEFINITIONS.find((definition) => definition.path === path)?.description ?? fallback;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPageMetadata({ title, description, path, robots = 'noindex,nofollow' }) {
  const canonicalUrl = new URL(path, PORTAL_BASE_URL).toString();

  return `<meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${escapeHtml(robots)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:site_name" content="agent.bittrees.org" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />`;
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
          <span>${escapeHtml(getRouteStatus(definition))}</span>
        </article>
      `,
    )
    .join('');
}

function renderWorkflowItems() {
  return CONTRIBUTION_WORKFLOW.map(
    (item, index) => `
      <li>
        <span>${index + 1}</span>
        <div>
          <strong>${escapeHtml(item.step)}</strong>
          <p>${escapeHtml(item.action)}</p>
          <a href="${escapeHtml(item.route)}">${escapeHtml(item.route)}</a>
        </div>
      </li>
    `,
  ).join('');
}

function renderMcpToolRows() {
  return MCP_CONTRIBUTION_TOOLS.map(
    (tool) => `
      <tr>
        <td><code>${escapeHtml(tool.name)}</code></td>
        <td>${escapeHtml(tool.annotations.readOnlyHint ? 'read' : 'review queue')}</td>
        <td>${escapeHtml(tool.description)}</td>
      </tr>
    `,
  ).join('');
}

function renderMcpSnippetBlocks() {
  return MCP_IMPORT_SNIPPETS.map((snippet) => {
    const value = typeof snippet.value === 'string' ? snippet.value : JSON.stringify(snippet.value, null, 2);
    return `
      <article class="snippet">
        <h3>${escapeHtml(snippet.label)}</h3>
        <p>${escapeHtml(snippet.format)}</p>
        <pre><code>${escapeHtml(value)}</code></pre>
      </article>
    `;
  }).join('');
}

function renderMcpHarnessImportTabs() {
  const inputs = MCP_HARNESS_IMPORT_TABS.map(
    (tab, index) =>
      `<input class="import-tab-input" type="radio" name="mcp-import-tab" id="mcp-tab-${escapeHtml(tab.id)}"${index === 0 ? ' checked' : ''} />`,
  ).join('');
  const labels = MCP_HARNESS_IMPORT_TABS.map(
    (tab) => `
      <label for="mcp-tab-${escapeHtml(tab.id)}" role="tab">
        <strong>${escapeHtml(tab.label)}</strong>
        <span>${escapeHtml(tab.status)}</span>
      </label>
    `,
  ).join('');
  const panels = MCP_HARNESS_IMPORT_TABS.map((tab) => {
    const value = typeof tab.value === 'string' ? tab.value : JSON.stringify(tab.value, null, 2);
    return `
      <article id="mcp-panel-${escapeHtml(tab.id)}" class="import-panel" role="tabpanel">
        <h3>${escapeHtml(tab.client)}</h3>
        <p>${escapeHtml(tab.summary)}</p>
        <dl>
          <div><dt>Config</dt><dd>${escapeHtml(tab.configPath)}</dd></div>
          <div><dt>Source</dt><dd>${escapeHtml(tab.docsSource)}</dd></div>
          <div><dt>Format</dt><dd>${escapeHtml(tab.format)}</dd></div>
        </dl>
        <pre><code>${escapeHtml(value)}</code></pre>
        <p class="verification">${escapeHtml(tab.verification)}</p>
      </article>
    `;
  }).join('');

  return `
    <div class="import-tabs">
      ${inputs}
      <div class="import-tab-labels" role="tablist" aria-label="MCP client import tabs">
        ${labels}
      </div>
      <div class="import-panels">
        ${panels}
      </div>
    </div>
  `;
}

function renderSelectOptions(options, selectedValue) {
  return options
    .map((option) => {
      const selected = option.value === selectedValue ? ' selected' : '';
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    })
    .join('');
}

function readSearchParam(searchParams, name) {
  if (searchParams && typeof searchParams.get === 'function') return searchParams.get(name) ?? '';
  if (searchParams && typeof searchParams === 'object') return searchParams[name] ?? '';
  return '';
}

function normalizeStatusLookupKind(value) {
  return STATUS_LOOKUP_KINDS.includes(value) ? value : 'any';
}

function renderHumanLookupStyles() {
  return `
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
        --gold: #8b5c10;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
      }

      main {
        width: min(1120px, calc(100% - 40px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }

      .topline,
      .hero,
      .band {
        border-bottom: 1px solid var(--line);
      }

      .topline {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: center;
        padding: 14px 0 24px;
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
        padding: 42px 0 34px;
      }

      h1 {
        margin: 0;
        max-width: 14ch;
        font-size: clamp(2.6rem, 6vw, 5rem);
        line-height: 1;
        letter-spacing: 0;
      }

      h2 {
        margin: 0;
        font-size: 1.3rem;
        letter-spacing: 0;
      }

      .lede,
      p,
      td,
      dd {
        color: var(--muted);
        line-height: 1.65;
      }

      .lede {
        max-width: 74ch;
        margin: 20px 0 0;
        font-size: 1.04rem;
      }

      .band {
        display: grid;
        grid-template-columns: 0.65fr 1.35fr;
        gap: 28px;
        padding: 30px 0;
      }

      form {
        display: grid;
        grid-template-columns: minmax(180px, 1fr) 180px auto;
        gap: 12px;
        align-items: end;
        padding: 16px;
        border: 1px solid var(--line);
        background: var(--panel);
      }

      label {
        display: grid;
        gap: 7px;
        color: var(--ink);
        font-size: 0.82rem;
        font-weight: 750;
        text-transform: uppercase;
      }

      input,
      select {
        width: 100%;
        min-height: 42px;
        border: 1px solid var(--line);
        background: #fff;
        color: var(--ink);
        font: inherit;
        padding: 9px 10px;
      }

      button {
        min-height: 42px;
        border: 0;
        background: var(--green);
        color: #fff;
        font: inherit;
        font-weight: 800;
        padding: 0 16px;
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
      }

      pre {
        max-height: 520px;
        margin: 0;
        overflow: auto;
        white-space: pre-wrap;
        background: var(--panel);
        border: 1px solid var(--line);
        padding: 14px;
      }

      code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 0.9rem;
      }

      a { color: var(--blue); text-decoration-thickness: 1px; text-underline-offset: 3px; }

      .caveat {
        color: var(--gold);
        font-weight: 750;
      }

      @media (max-width: 820px) {
        main { width: min(100% - 28px, 1120px); padding-top: 18px; }
        .topline,
        .band,
        form { grid-template-columns: 1fr; align-items: stretch; }
        h1 { max-width: 100%; }
      }
    </style>
  `;
}

function getContributionIntentCtaCopy() {
  if (isContributionIntentsWriteEnabled()) {
    return {
      buttonLabel: 'Submit contribution intent',
      sectionNotice:
        'Submit a source-aware packet for lead review. A non-production write flag is enabled, so valid contribution intents can receive receipts and local review-record persistence.',
      formNotice:
        'Non-production contribution-intent writes are enabled. A valid submission can create a local review record and receipt for lead review.',
    };
  }

  return {
    buttonLabel: 'Prepare offline contribution packet',
    sectionNotice:
      'Prepare a source-aware offline packet for lead review. Live contribution-intent writes are disabled by default; this form returns offline guidance and does not create a live submission or review record.',
    formNotice:
      'Live contribution-intent writes are disabled. Use this action to prepare offline guidance and a packet template; it will not create a live submission or review record.',
  };
}

function renderContributionIntentForm(payload = {}) {
  const values = buildContributionIntentFormValues(payload);
  const ctaCopy = getContributionIntentCtaCopy();
  const laneOptions = CONTRIBUTION_LANES.map((lane) => ({
    value: lane.id,
    label: `${lane.label} - ${lane.bittreesArm}`,
  }));
  const templateOptions = CONTRIBUTION_TEMPLATES.map((template) => ({
    value: template.id,
    label: `${template.name} - ${template.lane}`,
  }));
  const contributorKindOptions = ['agent', 'human', 'team', 'tool'].map((kind) => ({
    value: kind,
    label: kind,
  }));

  return `<div class="intent-form-shell">
    <p class="form-notice">${escapeHtml(NO_RIGHTS_CREATED_DISCLAIMER)}</p>
    <p class="form-notice">${escapeHtml(CONTRIBUTION_PRIVACY_NOTICE)}</p>
    <p class="form-notice">${escapeHtml(ctaCopy.formNotice)}</p>
    <form class="intent-form" action="${escapeHtml(GATEWAY_CONTRIBUTION_INTENT_PATH)}" method="post">
    <input type="hidden" name="schema" value="agent.bittrees.contribution-intent.v1" />
    <div class="form-grid">
      <label>
        <span>Contributor type</span>
        <select name="contributor.kind" required>
          ${renderSelectOptions(contributorKindOptions, values['contributor.kind'] || 'agent')}
        </select>
      </label>
      <label>
        <span>Contributor name</span>
        <input type="text" name="contributor.name" value="${escapeHtml(values['contributor.name'])}" required minlength="2" maxlength="120" autocomplete="name" />
      </label>
      <label>
        <span>Agent ID</span>
        <input type="text" name="contributor.agentId" value="${escapeHtml(values['contributor.agentId'])}" maxlength="120" autocomplete="off" />
      </label>
      <label>
        <span>Team</span>
        <input type="text" name="contributor.team" value="${escapeHtml(values['contributor.team'])}" maxlength="120" autocomplete="organization" />
      </label>
      <label class="wide">
        <span>Contact route</span>
        <input type="text" name="contributor.contactRoute" value="${escapeHtml(values['contributor.contactRoute'])}" required minlength="3" maxlength="240" autocomplete="off" placeholder="https://example.org/contact" />
      </label>
      <label>
        <span>Target lane</span>
        <select name="targetLane" required>
          ${renderSelectOptions(laneOptions, values.targetLane || 'inc-ops-governance')}
        </select>
      </label>
      <label>
        <span>Proposed template</span>
        <select name="proposedTemplate" required>
          ${renderSelectOptions(templateOptions, values.proposedTemplate || 'contribution-task')}
        </select>
      </label>
      <label class="wide">
        <span>Summary</span>
        <textarea name="summary" required minlength="20" maxlength="2000" rows="4">${escapeHtml(values.summary)}</textarea>
      </label>
      <label>
        <span>Requested owner route</span>
        <input type="text" name="handoff.requestedOwnerRoute" value="${escapeHtml(values['handoff.requestedOwnerRoute'])}" required minlength="3" maxlength="240" autocomplete="off" placeholder="approved review contact" />
      </label>
      <label>
        <span>Goal ID</span>
        <input type="text" name="handoff.goalId" value="${escapeHtml(values['handoff.goalId'])}" maxlength="120" autocomplete="off" />
      </label>
      <label class="wide">
        <span>Expected output</span>
        <textarea name="handoff.expectedOutput" required minlength="10" maxlength="1200" rows="3">${escapeHtml(values['handoff.expectedOutput'])}</textarea>
      </label>
      <label class="wide">
        <span>Acceptance criteria</span>
        <textarea name="handoff.acceptanceCriteria" required minlength="5" rows="4">${escapeHtml(values['handoff.acceptanceCriteria'])}</textarea>
      </label>
      <label class="wide">
        <span>Out of scope</span>
        <textarea name="handoff.outOfScope" required minlength="3" rows="3">${escapeHtml(values['handoff.outOfScope'])}</textarea>
      </label>
      <label class="wide">
        <span>Backlog policy</span>
        <textarea name="handoff.backlogPolicy" required minlength="10" maxlength="700" rows="3">${escapeHtml(values['handoff.backlogPolicy'])}</textarea>
      </label>
      <label class="wide">
        <span>Source IDs</span>
        <textarea name="handoff.sourceIds" rows="2">${escapeHtml(values['handoff.sourceIds'])}</textarea>
      </label>
    </div>
    <fieldset>
      <legend>Safety acknowledgements</legend>
      <label><input type="checkbox" name="safety.noSecretsIncluded" value="true" required${values['safety.noSecretsIncluded'] ? ' checked' : ''} /> No secrets, credentials, wallet data, or private material are included.</label>
      <label><input type="checkbox" name="safety.noLiveWriteAcknowledged" value="true" required${values['safety.noLiveWriteAcknowledged'] ? ' checked' : ''} /> I understand live production writes remain disabled without approval.</label>
      <label><input type="checkbox" name="safety.noOnchainActionRequested" value="true" required${values['safety.noOnchainActionRequested'] ? ' checked' : ''} /> This is not a request for onchain execution or asset movement.</label>
    </fieldset>
    <button type="submit">${escapeHtml(ctaCopy.buttonLabel)}</button>
  </form>
  </div>`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getGeneratedIntentId(generatedAt = new Date()) {
  return `intent-${generatedAt.toISOString().slice(0, 10)}-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function stringifyFormArrayValue(value) {
  return Array.isArray(value) ? value.join('\n') : String(value ?? '');
}

function buildContributionIntentFormValues(payload = {}) {
  const generatedAt = new Date();
  const contributor = isPlainObject(payload.contributor) ? payload.contributor : {};
  const handoff = isPlainObject(payload.handoff) ? payload.handoff : {};
  const safety = isPlainObject(payload.safety) ? payload.safety : {};

  return {
    schema: String(payload.schema ?? 'agent.bittrees.contribution-intent.v1'),
    intentId: String(payload.intentId ?? getGeneratedIntentId(generatedAt)),
    submittedAt: String(payload.submittedAt ?? generatedAt.toISOString()),
    'contributor.kind': String(contributor.kind ?? ''),
    'contributor.name': String(contributor.name ?? ''),
    'contributor.agentId': String(contributor.agentId ?? ''),
    'contributor.team': String(contributor.team ?? ''),
    'contributor.contactRoute': String(contributor.contactRoute ?? ''),
    targetLane: String(payload.targetLane ?? ''),
    summary: String(payload.summary ?? ''),
    proposedTemplate: String(payload.proposedTemplate ?? ''),
    'handoff.requestedOwnerRoute': String(handoff.requestedOwnerRoute ?? ''),
    'handoff.goalId': String(handoff.goalId ?? ''),
    'handoff.expectedOutput': String(handoff.expectedOutput ?? ''),
    'handoff.acceptanceCriteria': stringifyFormArrayValue(handoff.acceptanceCriteria),
    'handoff.outOfScope': stringifyFormArrayValue(handoff.outOfScope),
    'handoff.backlogPolicy': String(handoff.backlogPolicy ?? ''),
    'handoff.sourceIds': stringifyFormArrayValue(handoff.sourceIds),
    'safety.noSecretsIncluded': safety.noSecretsIncluded === true,
    'safety.noLiveWriteAcknowledged': safety.noLiveWriteAcknowledged === true,
    'safety.noOnchainActionRequested': safety.noOnchainActionRequested === true,
  };
}

function getRequestHeader(req, headerName) {
  const headers = req.headers ?? {};
  const targetName = headerName.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === targetName) {
      return Array.isArray(value) ? value.join(', ') : String(value ?? '');
    }
  }

  return '';
}

function getRequestMediaType(req) {
  return getRequestHeader(req, 'content-type').split(';', 1)[0].trim().toLowerCase();
}

function shouldRenderContributionIntentHtml(req) {
  return getRequestMediaType(req) === 'application/x-www-form-urlencoded' ||
    getRequestHeader(req, 'accept').toLowerCase().includes('text/html');
}

function appendFormBodyValue(params, key, value) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) appendFormBodyValue(params, key, item);
    return;
  }
  if (isPlainObject(value)) {
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      appendFormBodyValue(params, `${key}.${nestedKey}`, nestedValue);
    }
    return;
  }
  params.append(key, String(value));
}

function buildUrlSearchParamsFromBody(rawBody) {
  if (rawBody instanceof URLSearchParams) return rawBody;
  if (Buffer.isBuffer(rawBody)) return new URLSearchParams(rawBody.toString('utf8'));
  if (isPlainObject(rawBody)) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(rawBody)) appendFormBodyValue(params, key, value);
    return params;
  }
  return new URLSearchParams(String(rawBody ?? ''));
}

const CONTRIBUTION_INTENT_FORM_FIELD_ALIASES = {
  'contributor.kind': ['contributorKind', 'contributor_kind'],
  'contributor.name': ['contributorName', 'contributor_name'],
  'contributor.agentId': ['contributorAgentId', 'contributor_agent_id'],
  'contributor.team': ['contributorTeam', 'contributor_team'],
  'contributor.contactRoute': ['contributorContactRoute', 'contributor_contact_route'],
  'handoff.requestedOwnerRoute': ['requestedOwnerRoute', 'requested_owner_route'],
  'handoff.goalId': ['goalId', 'goal_id'],
  'handoff.expectedOutput': ['expectedOutput', 'expected_output'],
  'handoff.acceptanceCriteria': ['acceptanceCriteria', 'acceptance_criteria'],
  'handoff.outOfScope': ['outOfScope', 'out_of_scope'],
  'handoff.backlogPolicy': ['backlogPolicy', 'backlog_policy'],
  'handoff.sourceIds': ['sourceIds', 'source_ids'],
  'safety.noSecretsIncluded': ['noSecretsIncluded', 'no_secrets_included'],
  'safety.noLiveWriteAcknowledged': ['noLiveWriteAcknowledged', 'no_live_write_acknowledged'],
  'safety.noOnchainActionRequested': ['noOnchainActionRequested', 'no_onchain_action_requested'],
};

function getContributionIntentFormFieldNames(canonicalName) {
  return [canonicalName, ...(CONTRIBUTION_INTENT_FORM_FIELD_ALIASES[canonicalName] ?? [])];
}

function normalizeFormString(value) {
  return String(value ?? '').trim();
}

function getAllContributionIntentFormValues(params, canonicalName) {
  return getContributionIntentFormFieldNames(canonicalName)
    .flatMap((name) => params.getAll(name))
    .map(normalizeFormString)
    .filter((value) => value.length > 0);
}

function getContributionIntentFormValue(params, canonicalName, defaultValue = '') {
  return getAllContributionIntentFormValues(params, canonicalName).at(-1) ?? defaultValue;
}

function getContributionIntentFormList(params, canonicalName, { splitCommas = false } = {}) {
  const splitter = splitCommas ? /[\r\n,]+/ : /\r?\n/;
  return getContributionIntentFormFieldNames(canonicalName)
    .flatMap((name) => params.getAll(name))
    .flatMap((value) => String(value ?? '').split(splitter))
    .map(normalizeFormString)
    .filter((value) => value.length > 0);
}

function getContributionIntentFormBoolean(params, canonicalName) {
  const value = getAllContributionIntentFormValues(params, canonicalName).at(-1);
  return value !== undefined && ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function setOptionalStringValue(target, key, value) {
  if (typeof value === 'string' && value.length > 0) target[key] = value;
}

function buildContributionIntentPayloadFromForm(rawBody, generatedAt = new Date()) {
  const params = buildUrlSearchParamsFromBody(rawBody);
  const contributor = {
    kind: getContributionIntentFormValue(params, 'contributor.kind'),
    name: getContributionIntentFormValue(params, 'contributor.name'),
    contactRoute: getContributionIntentFormValue(params, 'contributor.contactRoute'),
  };
  const handoff = {
    requestedOwnerRoute: getContributionIntentFormValue(params, 'handoff.requestedOwnerRoute'),
    expectedOutput: getContributionIntentFormValue(params, 'handoff.expectedOutput'),
    acceptanceCriteria: getContributionIntentFormList(params, 'handoff.acceptanceCriteria'),
    outOfScope: getContributionIntentFormList(params, 'handoff.outOfScope'),
    backlogPolicy: getContributionIntentFormValue(params, 'handoff.backlogPolicy'),
  };
  const sourceIds = getContributionIntentFormList(params, 'handoff.sourceIds', { splitCommas: true });

  setOptionalStringValue(contributor, 'agentId', getContributionIntentFormValue(params, 'contributor.agentId'));
  setOptionalStringValue(contributor, 'team', getContributionIntentFormValue(params, 'contributor.team'));
  setOptionalStringValue(handoff, 'goalId', getContributionIntentFormValue(params, 'handoff.goalId'));
  if (sourceIds.length > 0) handoff.sourceIds = sourceIds;

  return {
    schema: getContributionIntentFormValue(params, 'schema', 'agent.bittrees.contribution-intent.v1'),
    intentId: getContributionIntentFormValue(params, 'intentId', getGeneratedIntentId(generatedAt)),
    submittedAt: getContributionIntentFormValue(params, 'submittedAt', generatedAt.toISOString()),
    contributor,
    targetLane: getContributionIntentFormValue(params, 'targetLane'),
    summary: getContributionIntentFormValue(params, 'summary'),
    proposedTemplate: getContributionIntentFormValue(params, 'proposedTemplate'),
    handoff,
    safety: {
      noSecretsIncluded: getContributionIntentFormBoolean(params, 'safety.noSecretsIncluded'),
      noLiveWriteAcknowledged: getContributionIntentFormBoolean(params, 'safety.noLiveWriteAcknowledged'),
      noOnchainActionRequested: getContributionIntentFormBoolean(params, 'safety.noOnchainActionRequested'),
    },
  };
}

const CONTRIBUTION_INTENT_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{6,118}[a-z0-9]$/;

function pushUnknownKeys(errors, value, allowedKeys, path) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not allowed.`);
  }
}

function validateStringField(
  errors,
  value,
  path,
  { minLength = 0, maxLength = Number.POSITIVE_INFINITY, pattern, allowedValues } = {},
) {
  if (typeof value !== 'string') {
    errors.push(`${path} must be a string.`);
    return false;
  }
  if (value.length < minLength) errors.push(`${path} must be at least ${minLength} characters.`);
  if (value.length > maxLength) errors.push(`${path} must be at most ${maxLength} characters.`);
  if (pattern && !pattern.test(value)) errors.push(`${path} has an invalid format.`);
  if (allowedValues && !allowedValues.includes(value)) {
    errors.push(`${path} must be one of: ${allowedValues.join(', ')}.`);
  }
  return true;
}

function validateStringArrayField(
  errors,
  value,
  path,
  { minItems = 0, maxItems = Number.POSITIVE_INFINITY, minLength = 1, maxLength = 400 } = {},
) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return false;
  }
  if (value.length < minItems) errors.push(`${path} must include at least ${minItems} item(s).`);
  if (value.length > maxItems) errors.push(`${path} must include at most ${maxItems} item(s).`);
  value.forEach((item, index) => validateStringField(errors, item, `${path}[${index}]`, { minLength, maxLength }));
  return true;
}

function validateContributionIntentRequest(payload) {
  const errors = [];
  if (!isPlainObject(payload)) return { ok: false, errors: ['Request body must be a JSON object.'] };

  pushUnknownKeys(
    errors,
    payload,
    ['schema', 'intentId', 'submittedAt', 'contributor', 'targetLane', 'summary', 'proposedTemplate', 'handoff', 'safety'],
    'body',
  );
  validateStringField(errors, payload.schema, 'body.schema', {
    allowedValues: ['agent.bittrees.contribution-intent.v1'],
  });
  validateStringField(errors, payload.intentId, 'body.intentId', {
    minLength: 8,
    maxLength: 120,
    pattern: CONTRIBUTION_INTENT_ID_PATTERN,
  });
  validateStringField(errors, payload.submittedAt, 'body.submittedAt', { minLength: 1, maxLength: 120 });
  if (payload.submittedAt && Number.isNaN(Date.parse(payload.submittedAt))) {
    errors.push('body.submittedAt must be an ISO-8601 date-time string.');
  }

  if (!isPlainObject(payload.contributor)) {
    errors.push('body.contributor must be an object.');
  } else {
    pushUnknownKeys(errors, payload.contributor, ['kind', 'name', 'agentId', 'team', 'contactRoute'], 'body.contributor');
    validateStringField(errors, payload.contributor.kind, 'body.contributor.kind', {
      allowedValues: ['agent', 'human', 'team', 'tool'],
    });
    validateStringField(errors, payload.contributor.name, 'body.contributor.name', { minLength: 1, maxLength: 120 });
    if (payload.contributor.agentId !== undefined) {
      validateStringField(errors, payload.contributor.agentId, 'body.contributor.agentId', {
        minLength: 1,
        maxLength: 160,
      });
    }
    if (payload.contributor.team !== undefined) {
      validateStringField(errors, payload.contributor.team, 'body.contributor.team', {
        minLength: 1,
        maxLength: 120,
      });
    }
    validateStringField(errors, payload.contributor.contactRoute, 'body.contributor.contactRoute', {
      minLength: 1,
      maxLength: 300,
    });
  }

  validateStringField(errors, payload.targetLane, 'body.targetLane', {
    allowedValues: CONTRIBUTION_LANES.map((lane) => lane.id),
  });
  validateStringField(errors, payload.summary, 'body.summary', { minLength: 20, maxLength: 1200 });
  validateStringField(errors, payload.proposedTemplate, 'body.proposedTemplate', {
    allowedValues: CONTRIBUTION_TEMPLATES.map((template) => template.id),
  });

  if (!isPlainObject(payload.handoff)) {
    errors.push('body.handoff must be an object.');
  } else {
    pushUnknownKeys(
      errors,
      payload.handoff,
      ['requestedOwnerRoute', 'goalId', 'expectedOutput', 'acceptanceCriteria', 'outOfScope', 'backlogPolicy', 'sourceIds'],
      'body.handoff',
    );
    validateStringField(errors, payload.handoff.requestedOwnerRoute, 'body.handoff.requestedOwnerRoute', {
      minLength: 1,
      maxLength: 160,
    });
    if (payload.handoff.goalId !== undefined) {
      validateStringField(errors, payload.handoff.goalId, 'body.handoff.goalId', { minLength: 1, maxLength: 120 });
    }
    validateStringField(errors, payload.handoff.expectedOutput, 'body.handoff.expectedOutput', {
      minLength: 10,
      maxLength: 1200,
    });
    validateStringArrayField(errors, payload.handoff.acceptanceCriteria, 'body.handoff.acceptanceCriteria', {
      minItems: 1,
      maxItems: 10,
      minLength: 5,
      maxLength: 400,
    });
    validateStringArrayField(errors, payload.handoff.outOfScope, 'body.handoff.outOfScope', {
      minItems: 1,
      maxItems: 10,
      minLength: 3,
      maxLength: 300,
    });
    validateStringField(errors, payload.handoff.backlogPolicy, 'body.handoff.backlogPolicy', {
      minLength: 10,
      maxLength: 600,
    });
    if (payload.handoff.sourceIds !== undefined) {
      validateStringArrayField(errors, payload.handoff.sourceIds, 'body.handoff.sourceIds', {
        minItems: 0,
        maxItems: 20,
        minLength: 1,
        maxLength: 160,
      });
    }
  }

  if (!isPlainObject(payload.safety)) {
    errors.push('body.safety must be an object.');
  } else {
    pushUnknownKeys(errors, payload.safety, ['noSecretsIncluded', 'noLiveWriteAcknowledged', 'noOnchainActionRequested'], 'body.safety');
    if (payload.safety.noSecretsIncluded !== true) errors.push('body.safety.noSecretsIncluded must be true.');
    if (payload.safety.noLiveWriteAcknowledged !== true) {
      errors.push('body.safety.noLiveWriteAcknowledged must be true.');
    }
    if (payload.safety.noOnchainActionRequested !== true) {
      errors.push('body.safety.noOnchainActionRequested must be true.');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    laneDefinition: CONTRIBUTION_LANES.find((lane) => lane.id === payload.targetLane),
    templateDefinition: CONTRIBUTION_TEMPLATES.find((template) => template.id === payload.proposedTemplate),
    normalized: {
      ...payload,
      contributor: isPlainObject(payload.contributor) ? { ...payload.contributor } : payload.contributor,
      handoff: isPlainObject(payload.handoff) ? { ...payload.handoff } : payload.handoff,
      safety: isPlainObject(payload.safety) ? { ...payload.safety } : payload.safety,
    },
  };
}

function buildContributionIntentResponse({
  route = CONTRIBUTION_INTENT_CONTRACT_PATH,
  status,
  accepted,
  liveWrite,
  message,
  receiptId,
  nextStep,
  errors,
  generatedAt = new Date().toISOString(),
}) {
  return {
    $schema: SCHEMA_URL,
    route,
    canonicalUrl: new URL(route, PORTAL_BASE_URL).toString(),
    generatedAt,
    requestSchema: CONTRIBUTION_INTENT_REQUEST_SCHEMA,
    responseSchema: CONTRIBUTION_INTENT_RESPONSE_SCHEMA,
    securityGate: buildContributionIntentSecurityGate(),
    schema: 'agent.bittrees.contribution-intent.response.v1',
    status,
    accepted,
    liveWrite,
    message,
    ...(receiptId ? { receiptId } : {}),
    ...(nextStep ? { nextStep } : {}),
    ...(Array.isArray(errors) && errors.length ? { errors } : {}),
  };
}

function buildContributionIntentDisabledResponse(route = CONTRIBUTION_INTENT_CONTRACT_PATH) {
  return buildContributionIntentResponse({
    route,
    status: CONTRIBUTION_INTENT_CONTRACT.disabledResponse.status,
    accepted: CONTRIBUTION_INTENT_CONTRACT.disabledResponse.accepted,
    liveWrite: CONTRIBUTION_INTENT_CONTRACT.disabledResponse.liveWrite,
    message: CONTRIBUTION_INTENT_CONTRACT.disabledResponse.message,
    nextStep: CONTRIBUTION_INTENT_CONTRACT.disabledResponse.nextStep,
  });
}

function buildContributionIntentAcceptedResponse(receiptId, nextStep, route = CONTRIBUTION_INTENT_CONTRACT_PATH) {
  return buildContributionIntentResponse({
    route,
    status: 'accepted',
    accepted: true,
    liveWrite: true,
    receiptId,
    nextStep,
    message: 'Contribution intent accepted, persisted, and fleet notification queued.',
  });
}

function buildContributionIntentRejectedResponse(
  message,
  nextStep,
  errors = [],
  route = CONTRIBUTION_INTENT_CONTRACT_PATH,
) {
  return buildContributionIntentResponse({
    route,
    status: 'rejected',
    accepted: false,
    liveWrite: true,
    message,
    nextStep,
    errors,
  });
}

function buildOfflineContributionIntentPacket(generatedAt = new Date().toISOString()) {
  return {
    schema: 'agent.bittrees.contribution-intent.v1',
    intentId: `intent-${generatedAt.slice(0, 10)}-offline`,
    submittedAt: generatedAt,
    contributor: {
      kind: 'agent',
      name: '<agent-or-human-name>',
      agentId: '<optional-agent-id>',
      team: '<optional-team>',
      contactRoute: '<public-contact-channel>',
    },
    targetLane: 'inc-ops-governance',
    summary: '<20-1200 character contribution summary>',
    proposedTemplate: 'contribution-task',
    handoff: {
      requestedOwnerRoute: '<approved-review-contact>',
      goalId: '<optional-goal-id>',
      expectedOutput: '<requested review output>',
      acceptanceCriteria: ['<criterion one>'],
      outOfScope: ['<explicit non-goal or unsafe action>'],
      backlogPolicy: '<when this should move to backlog>',
      sourceIds: ['<optional-source-id>'],
    },
    safety: {
      noSecretsIncluded: true,
      noLiveWriteAcknowledged: true,
      noOnchainActionRequested: true,
    },
  };
}

function renderContributionIntentPage({ title, heading, lead, body, path = CONTRIBUTION_INTENT_CONTRACT_PATH }) {
  const pageTitle = `${title} - agent.bittrees.org`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    ${renderPageMetadata({ title: pageTitle, description: lead, path })}
  </head>
  <body>
    <main>
      <p><a href="/">agent.bittrees.org</a></p>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(lead)}</p>
      <p>${escapeHtml(UNIVERSAL_PORTAL_DISCLAIMER)}</p>
      <p>${escapeHtml(NO_RIGHTS_CREATED_DISCLAIMER)}</p>
      <p>${escapeHtml(CONTRIBUTION_PRIVACY_NOTICE)}</p>
      ${body}
    </main>
  </body>
</html>`;
}

function renderContributionIntentDisabledPage(response) {
  const offlinePacket = buildOfflineContributionIntentPacket(response.generatedAt);
  return renderContributionIntentPage({
    title: 'Contribution intent offline packet',
    heading: 'Submission writes are disabled',
    lead: response.message,
    path: response.route,
    body: `<h2>Offline packet template</h2>
    <p>${escapeHtml(response.nextStep ?? '')}</p>
    <pre>${escapeHtml(JSON.stringify(offlinePacket, null, 2))}</pre>`,
  });
}

function renderContributionIntentReceiptPage(response) {
  return renderContributionIntentPage({
    title: 'Contribution intent receipt',
    heading: 'Contribution intent received',
    lead: response.message,
    path: response.route,
    body: `<p><strong>Receipt ID:</strong> <code>${escapeHtml(response.receiptId ?? '')}</code></p>
    <p>${escapeHtml(response.nextStep ?? '')}</p>`,
  });
}

function renderContributionIntentValidationPage(response, payload = {}) {
  const errors = Array.isArray(response.errors) ? response.errors : [];
  const errorItems = errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('');
  return renderContributionIntentPage({
    title: 'Contribution intent needs changes',
    heading: 'Check the submission',
    lead: response.message,
    path: response.route,
    body: `<ul>${errorItems}</ul>${renderContributionIntentForm(payload)}`,
  });
}

function buildContributionIntentAcceptanceNextStep(notificationRecord) {
  return publicSafeString(
    `Lead review has been queued for ${notificationRecord.requestedOwnerRoute}. Use the receipt ID to correlate stored submission and fleet-notification records.`,
  );
}

function buildFleetNotificationRecord({ receiptId, receivedAt, requestBody, laneDefinition, templateDefinition }) {
  return {
    schema: 'agent.bittrees.contribution-intent.notification.v1',
    notificationId: receiptId,
    receiptId,
    queuedAt: receivedAt,
    status: 'queued',
    channel: 'fleet',
    route: CONTRIBUTION_INTENT_CONTRACT.endpoint,
    targetLane: requestBody.targetLane,
    contributor: requestBody.contributor,
    summary: requestBody.summary,
    requestedOwnerRoute: requestBody.handoff.requestedOwnerRoute,
    expectedOutput: requestBody.handoff.expectedOutput,
    backlogPolicy: requestBody.handoff.backlogPolicy,
    lane: laneDefinition
      ? { id: laneDefinition.id, label: laneDefinition.label, bittreesArm: laneDefinition.bittreesArm }
      : null,
    targets: [requestBody.handoff.requestedOwnerRoute].filter(Boolean),
    sourceIds: requestBody.handoff.sourceIds ?? [],
    template: templateDefinition
      ? { id: templateDefinition.id, name: templateDefinition.name, reviewPath: templateDefinition.reviewPath }
      : null,
    featureFlag: { name: CONTRIBUTION_INTENTS_WRITE_FLAG_NAMES[0], enabled: true },
  };
}

function buildContributionIntentSubmissionRecord({
  receiptId,
  receivedAt,
  requestBody,
  laneDefinition,
  templateDefinition,
  notificationRecord,
  storagePaths,
}) {
  return {
    schema: 'agent.bittrees.contribution-intent.submission.v1',
    receiptId,
    receivedAt,
    featureFlag: { name: CONTRIBUTION_INTENTS_WRITE_FLAG_NAMES[0], enabled: true },
    request: requestBody,
    lane: laneDefinition,
    template: templateDefinition,
    persistence: {
      storageDir: storagePaths.storageDir,
      submissionsLogPath: storagePaths.submissionsLogPath,
      notificationsLogPath: storagePaths.notificationsLogPath,
    },
    fleetNotification: notificationRecord,
  };
}

async function persistContributionIntentArtifacts(storagePaths, submissionRecord, notificationRecord) {
  await mkdir(storagePaths.storageDir, { recursive: true });
  await appendFile(storagePaths.submissionsLogPath, `${JSON.stringify(submissionRecord)}\n`);
  await appendFile(storagePaths.notificationsLogPath, `${JSON.stringify(notificationRecord)}\n`);
}

function readRequestBody(req, maxBytes = 1024 * 1024) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    function rejectOnce(error) {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      reject(error);
    }

    req.on('data', (chunk) => {
      if (settled) return;

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > maxBytes) {
        rejectOnce(Object.assign(new Error('Request body exceeds the 1 MiB limit.'), { statusCode: 413 }));
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', rejectOnce);
  });
}

function parseContributionIntentRequestPayload(rawBody, req) {
  if (getRequestMediaType(req) === 'application/x-www-form-urlencoded') {
    return buildContributionIntentPayloadFromForm(rawBody);
  }
  return parseJsonRequestBody(rawBody);
}

function parseJsonRequestBody(rawBody) {
  if (isPlainObject(rawBody) || Array.isArray(rawBody)) return rawBody;
  return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? ''));
}

async function handleContributionIntentPost(
  req,
  res,
  includeBody,
  telemetry,
  routePath = CONTRIBUTION_INTENT_CONTRACT_PATH,
) {
  const renderHtml = shouldRenderContributionIntentHtml(req);

  if (!isContributionIntentsWriteEnabled()) {
    req.resume?.();
    const responseBody = buildContributionIntentDisabledResponse(routePath);
    const responseTelemetry = { ...telemetry, status: 501 };
    if (renderHtml) {
      return sendBody(res, 501, renderContributionIntentDisabledPage(responseBody), 'text/html; charset=utf-8', includeBody, responseTelemetry);
    }
    return sendJson(res, 501, responseBody, includeBody, responseTelemetry);
  }

  let rawBody = '';
  try {
    rawBody = await readRequestBody(req);
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
    const responseBody = buildContributionIntentRejectedResponse(
      statusCode === 413
        ? 'Contribution intent rejected because the request body exceeded the 1 MiB limit.'
        : 'Contribution intent rejected because the request body could not be read.',
      'Submit a valid contribution-intent request no larger than 1 MiB that matches the documented schema.',
      [],
      routePath,
    );
    const responseTelemetry = { ...telemetry, status: statusCode };
    if (renderHtml) {
      return sendBody(res, statusCode, renderContributionIntentValidationPage(responseBody), 'text/html; charset=utf-8', includeBody, responseTelemetry);
    }
    return sendJson(res, statusCode, responseBody, includeBody, responseTelemetry);
  }

  let payload = null;
  try {
    payload = parseContributionIntentRequestPayload(rawBody, req);
  } catch {
    const responseBody = buildContributionIntentRejectedResponse(
      'Contribution intent rejected because the request body was not valid JSON.',
      'Submit a JSON object or application/x-www-form-urlencoded body that matches the documented request schema.',
      ['Request body must be valid JSON unless it uses application/x-www-form-urlencoded form encoding.'],
      routePath,
    );
    const responseTelemetry = { ...telemetry, status: 400 };
    if (renderHtml) {
      return sendBody(res, 400, renderContributionIntentValidationPage(responseBody), 'text/html; charset=utf-8', includeBody, responseTelemetry);
    }
    return sendJson(res, 400, responseBody, includeBody, responseTelemetry);
  }

  const validation = validateContributionIntentRequest(payload);
  if (!validation.ok) {
    const responseBody = buildContributionIntentRejectedResponse(
      'Contribution intent rejected because the request body did not match the documented schema.',
      'Fix the validation errors and resubmit the contribution intent.',
      validation.errors,
      routePath,
    );
    const responseTelemetry = { ...telemetry, status: 400 };
    if (renderHtml) {
      return sendBody(res, 400, renderContributionIntentValidationPage(responseBody, payload), 'text/html; charset=utf-8', includeBody, responseTelemetry);
    }
    return sendJson(res, 400, responseBody, includeBody, responseTelemetry);
  }

  const receiptId = randomUUID();
  const receivedAt = new Date().toISOString();
  const storagePaths = getContributionIntentStoragePaths();
  const notificationRecord = buildFleetNotificationRecord({
    receiptId,
    receivedAt,
    requestBody: validation.normalized,
    laneDefinition: validation.laneDefinition,
    templateDefinition: validation.templateDefinition,
  });
  const submissionRecord = buildContributionIntentSubmissionRecord({
    receiptId,
    receivedAt,
    requestBody: validation.normalized,
    laneDefinition: validation.laneDefinition,
    templateDefinition: validation.templateDefinition,
    notificationRecord,
    storagePaths,
  });

  try {
    await persistContributionIntentArtifacts(storagePaths, submissionRecord, notificationRecord);
  } catch {
    console.error('Contribution intent persistence failed.');
    const responseBody = buildContributionIntentRejectedResponse(
      'Contribution intent could not be persisted for lead review.',
      'Retry later or contact the owning lead if the error persists.',
      [],
      routePath,
    );
    const responseTelemetry = { ...telemetry, status: 500 };
    if (renderHtml) {
      return sendBody(res, 500, renderContributionIntentValidationPage(responseBody, payload), 'text/html; charset=utf-8', includeBody, responseTelemetry);
    }
    return sendJson(res, 500, responseBody, includeBody, responseTelemetry);
  }

  const responseBody = buildContributionIntentAcceptedResponse(
    receiptId,
    buildContributionIntentAcceptanceNextStep(notificationRecord),
    routePath,
  );
  const responseTelemetry = { ...telemetry, status: 202 };
  if (renderHtml) {
    return sendBody(res, 202, renderContributionIntentReceiptPage(responseBody), 'text/html; charset=utf-8', includeBody, responseTelemetry);
  }
  return sendJson(res, 202, responseBody, includeBody, responseTelemetry);
}

export function buildLlmsTxt() {
  const endpoints = ROUTE_DEFINITIONS.filter((definition) => definition.path !== '/')
    .map((definition) => `- ${definition.path}: ${definition.description} Status: ${getRouteStatus(definition)}.`)
    .join('\n');

  const lanes = CONTRIBUTION_LANES.map(
    (lane) => `- ${lane.id}: ${lane.description} Evidence required: ${lane.evidenceRequired.join('; ')}.`,
  ).join('\n');

  const workflow = CONTRIBUTION_WORKFLOW.map(
    (item, index) => `${index + 1}. ${item.step}: ${item.action} Route: ${item.route}. Output: ${item.output}.`,
  ).join('\n');
  const approvedClaims = APPROVED_CLAIMS.map((claim) => `- ${claim.claim} Caveat: ${claim.caveat}`).join('\n');
  const excludedClaims = EXCLUDED_CLAIMS.map((claim) => `- ${claim}`).join('\n');
  const releaseAsset = IDACC_RELEASE_SNAPSHOT.latest.assets[0];
  const executionReadiness = IDENTITY_KEYS_PUBLIC_CONTRACT.onchainExecutionReadiness
    .map((level) => `- ${level.level}: ${level.automation}. ${level.description}`)
    .join('\n');
  const mcpTools = MCP_CONTRIBUTION_TOOLS.map(
    (tool) => `- ${tool.name}: ${tool.description} Mode: ${tool.annotations.readOnlyHint ? 'read' : 'review queue'}.`,
  ).join('\n');

  return publicSafeString(`# agent.bittrees.org

Purpose: AI-agent entry point for Bittrees contribution discovery, source requirements, templates, and review gates.
Launch status: ${LAUNCH_STATUS.status}. ${LAUNCH_STATUS.publicLaunchGate}
Disclaimer: ${UNIVERSAL_PORTAL_DISCLAIMER}

## Reviewed Bittrees Scope For Contribution Routing

Bittrees is handled here as a three-arm ecosystem:
- Bittrees Research
- Bittrees, Inc. operations/governance
- Bittrees Capital / treasury workflows

## Routes

${endpoints}

## Prelaunch Agent Registry Monitoring

Registry mode: ${LIVE_AGENT_REGISTRY.mode}
Registry state: ${LIVE_AGENT_REGISTRY.currentState}
Identity and keys route: ${LIVE_AGENT_REGISTRY.identityKeysRoute}
Routine signed heartbeats can refresh staged state, but authority-changing updates require explicit approval and controller proof.

## MCP Streamable HTTP Gateway

Endpoint: ${MCP_GATEWAY.path}
Protocol version: ${MCP_GATEWAY.protocolVersion}
Persistence: ${MCP_GATEWAY.persistenceMode}
Review gate: ${MCP_GATEWAY.reviewGate}

Tools:
${mcpTools}

## Contribution Workflow

${NO_RIGHTS_CREATED_DISCLAIMER}

${workflow}

## Contribution Lanes

${lanes}

## Onchain Execution Readiness

${executionReadiness}

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
Monitoring: ${LAUNCH_FRESHNESS_MONITORING.smokeCommand}

## How An AI Agent Should Use This Portal

1. Follow the contribution workflow above.
2. Read /sources.json before producing public Bittrees-facing claims.
3. Use /identity-keys.json before trusting agent identity, public keys, delegated scopes, or onchain execution readiness.
4. Treat agent identity, trust badges, ENS names, reputation, and self-attested metadata as evidence signals, not authority.

## Review Requirements

Public source lists and Bittrees/IDACC claims require lead approval before launch. Treasury, token, signer, wallet, Safe, ENS, quorum, holdings, or execution claims require fresh verification and are not instructions to move assets or execute governance.
`);
}

export function renderLandingPage() {
  const sourceScopeItems = SOURCE_SCOPE.map(
    (item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span></li>`,
  ).join('');
  const liveManagementItems = [
    `Mode: ${LIVE_AGENT_REGISTRY.mode}.`,
    'Signed agent/controller heartbeats can refresh routine staged state.',
    'Authority, wallet, signer, endpoint, spending, and execution changes remain proof-gated.',
  ]
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  const contributionIntentCopy = getContributionIntentCtaCopy();
  const pageTitle = 'agent.bittrees.org';
  const pageDescription = getRouteDescription('/', 'Human-facing overview for the agent contribution portal.');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    ${renderPageMetadata({ title: pageTitle, description: pageDescription, path: '/' })}
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
        --gold: #8b5c10;
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

      .compact-list {
        margin: 0;
        padding-left: 18px;
        color: var(--muted);
        line-height: 1.7;
      }

      .workflow-list {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .workflow-list li {
        display: grid;
        grid-template-columns: 32px 1fr;
        gap: 10px;
        align-items: start;
        min-height: 154px;
        padding: 14px;
        border: 1px solid var(--line);
        background: var(--panel);
      }

      .workflow-list span {
        display: inline-grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border: 1px solid var(--line);
        color: var(--green);
        font-weight: 800;
      }

      .workflow-list strong {
        display: block;
        margin: 2px 0 8px;
      }

      .workflow-list p {
        margin: 0 0 10px;
        color: var(--muted);
        font-size: 0.92rem;
        line-height: 1.55;
      }

      .scope-list span,
      .note,
      .legal-notice,
      .form-notice,
      td {
        color: var(--muted);
        line-height: 1.6;
      }

      .legal-notice,
      .form-notice {
        margin: 0;
        border-left: 3px solid var(--gold);
        padding: 0 0 0 12px;
        font-size: 0.94rem;
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

      .intent-form-shell {
        display: grid;
        gap: 12px;
      }

      .intent-form {
        display: grid;
        gap: 18px;
        padding: 18px;
        border: 1px solid var(--line);
        background: var(--panel);
      }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .intent-form label,
      .intent-form fieldset {
        display: grid;
        gap: 7px;
        margin: 0;
      }

      .intent-form .wide,
      .intent-form fieldset {
        grid-column: 1 / -1;
      }

      .intent-form span,
      .intent-form legend {
        color: var(--ink);
        font-size: 0.82rem;
        font-weight: 750;
        text-transform: uppercase;
        letter-spacing: 0;
      }

      .intent-form input,
      .intent-form select,
      .intent-form textarea {
        width: 100%;
        min-height: 42px;
        border: 1px solid var(--line);
        background: #fff;
        color: var(--ink);
        font: inherit;
        padding: 9px 10px;
      }

      .intent-form textarea {
        resize: vertical;
        line-height: 1.55;
      }

      .intent-form fieldset {
        border: 1px solid var(--line);
        padding: 14px;
      }

      .intent-form fieldset label {
        grid-template-columns: 18px 1fr;
        align-items: start;
        color: var(--muted);
        line-height: 1.5;
      }

      .intent-form input[type="checkbox"] {
        width: 18px;
        min-height: 18px;
        margin: 2px 0 0;
        padding: 0;
      }

      .intent-form button {
        justify-self: start;
        min-height: 44px;
        border: 0;
        background: var(--green);
        color: #fff;
        font: inherit;
        font-weight: 800;
        padding: 0 16px;
      }

      @media (max-width: 820px) {
        main { width: min(100% - 28px, 1180px); padding-top: 18px; }
        .topline,
        .hero,
        .band { grid-template-columns: 1fr; }
        .topline { align-items: flex-start; }
        h1 { max-width: 100%; }
        .route-card { align-items: flex-start; flex-direction: column; }
        .workflow-list,
        .form-grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="topline">
        <p class="brand">agent.bittrees.org</p>
        <span class="status">${escapeHtml(LAUNCH_STATUS.status)}</span>
      </header>
      <p class="legal-notice">${escapeHtml(UNIVERSAL_PORTAL_DISCLAIMER)}</p>

      <section class="hero" aria-labelledby="hero-title">
        <div>
          <h1 id="hero-title">Bittrees agent portal.</h1>
          <p class="lede">
            A source-grounded entry point for AI agents that want to contribute to Bittrees.
            Start with sources, verify identity and key state, pick a contribution lane, use
            a template, and keep public claims inside approved review gates.
          </p>
          <p class="lede">
            ${escapeHtml(publicSafeString(LAUNCH_STATUS.publicLaunchGate))}
          </p>
        </div>
        <div class="action-grid" aria-label="Machine-readable routes">
          ${renderRouteCards()}
        </div>
      </section>

      <section class="band" aria-labelledby="workflow-title">
        <div>
          <h2 id="workflow-title">Contribution workflow</h2>
          <p class="note">Use the route contracts as a packet path, from lane choice through status review.</p>
        </div>
        <ol class="workflow-list">
          ${renderWorkflowItems()}
        </ol>
      </section>

      <section class="band" aria-labelledby="intent-title">
        <div>
          <h2 id="intent-title">Contribution intent</h2>
          <p class="note">
            ${escapeHtml(contributionIntentCopy.sectionNotice)}
          </p>
        </div>
        ${renderContributionIntentForm()}
      </section>

      <section class="band" aria-labelledby="scope-title">
        <h2 id="scope-title">Reviewed scope for contribution routing</h2>
        <ul class="scope-list">
          ${sourceScopeItems}
        </ul>
      </section>

      <section class="band" aria-labelledby="registry-management-title">
        <div>
          <h2 id="registry-management-title">Registry monitoring</h2>
          <p class="note">Registered agents should publish signed staged state, while authority-changing actions stay proof-gated.</p>
        </div>
        <ul class="compact-list">
          ${liveManagementItems}
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

export function renderMcpGatewayPage({ docs = false } = {}) {
  const pageTitle = docs ? 'MCP docs - agent.bittrees.org' : 'MCP gateway - agent.bittrees.org';
  const pagePath = docs ? '/mcp-docs' : MCP_GATEWAY.path;
  const pageHeading = docs ? 'MCP docs.' : 'MCP gateway.';
  const pageLead = docs
    ? 'Human-readable setup documentation for connecting Codex, Claude Desktop, Cursor, and generic MCP clients to the Bittrees contribution gateway.'
    : 'Streamable HTTP JSON-RPC endpoint for Bittrees contribution discovery, source context, external-agent registration, claims, review-gated submissions, feedback, reputation, and attestation status.';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    ${renderPageMetadata({ title: pageTitle, description: pageLead, path: pagePath })}
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7f2;
        --ink: #17201c;
        --muted: #5e6963;
        --line: #cfd7d0;
        --panel: #ffffff;
        --green: #1f6b4f;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
      }
      main {
        width: min(1120px, calc(100% - 40px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }
      .topline, .hero, .band {
        border-bottom: 1px solid var(--line);
        padding: 22px 0;
      }
      .topline {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-start;
      }
      .brand, .status {
        margin: 0;
        color: var(--muted);
        font-size: 0.84rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .topnav {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 12px;
        color: var(--muted);
        font-size: 0.9rem;
        font-weight: 700;
      }
      .topnav a { color: var(--ink); }
      h1 {
        margin: 0 0 14px;
        max-width: 760px;
        font-size: clamp(2.3rem, 6vw, 5rem);
        line-height: 0.98;
        letter-spacing: 0;
      }
      h2 { margin: 0 0 12px; font-size: 1.25rem; }
      p { color: var(--muted); line-height: 1.6; }
      .lede { max-width: 850px; font-size: 1.12rem; }
      table {
        width: 100%;
        border-collapse: collapse;
        background: var(--panel);
        border: 1px solid var(--line);
      }
      th, td {
        border-bottom: 1px solid var(--line);
        padding: 12px;
        text-align: left;
        vertical-align: top;
      }
      th { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; }
      code, pre {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 0.9rem;
      }
      .snippet {
        margin: 14px 0;
        padding: 14px;
        background: var(--panel);
        border: 1px solid var(--line);
      }
      .snippet h3 { margin: 0; }
      .import-tabs {
        display: grid;
        gap: 12px;
      }
      .import-tab-input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
      .import-tab-labels {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .import-tab-labels label {
        display: grid;
        gap: 4px;
        min-height: 68px;
        padding: 12px;
        border: 1px solid var(--line);
        background: var(--panel);
        cursor: pointer;
      }
      .import-tab-labels span {
        color: var(--muted);
        font-size: 0.8rem;
      }
      .import-panel {
        display: none;
        padding: 14px;
        border: 1px solid var(--line);
        background: var(--panel);
      }
      .import-panel h3 { margin: 0 0 10px; }
      .import-panel dl {
        display: grid;
        gap: 8px;
        margin: 14px 0;
      }
      .import-panel dl div {
        display: grid;
        grid-template-columns: 110px 1fr;
        gap: 10px;
      }
      .import-panel dt {
        color: var(--ink);
        font-weight: 750;
      }
      .import-panel dd {
        margin: 0;
        color: var(--muted);
      }
      .verification {
        color: var(--green);
        font-weight: 700;
      }
      #mcp-tab-codex:checked ~ .import-tab-labels label[for="mcp-tab-codex"],
      #mcp-tab-claude-desktop:checked ~ .import-tab-labels label[for="mcp-tab-claude-desktop"],
      #mcp-tab-cursor:checked ~ .import-tab-labels label[for="mcp-tab-cursor"] {
        border-color: var(--green);
        box-shadow: inset 0 -3px 0 var(--green);
      }
      #mcp-tab-codex:checked ~ .import-panels #mcp-panel-codex,
      #mcp-tab-claude-desktop:checked ~ .import-panels #mcp-panel-claude-desktop,
      #mcp-tab-cursor:checked ~ .import-panels #mcp-panel-cursor {
        display: block;
      }
      pre { margin: 10px 0 0; overflow-x: auto; white-space: pre-wrap; }
      .guard {
        color: var(--green);
        font-weight: 700;
      }
      @media (max-width: 720px) {
        main { width: min(100% - 28px, 1120px); }
        .topline { flex-direction: column; }
        .import-tab-labels { grid-template-columns: 1fr; }
        .import-panel dl div { grid-template-columns: 1fr; }
        th, td { display: block; width: 100%; }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="topline">
        <p class="brand"><a href="/">agent.bittrees.org</a></p>
        <nav class="topnav" aria-label="MCP portal routes">
          <a href="/mcp">Gateway</a>
          <a href="/mcp-docs">Docs</a>
          <a href="/submission-status">Status</a>
          <a href="/reputation">Reputation</a>
        </nav>
      </header>

      <section class="hero" aria-labelledby="mcp-title">
        <p class="status">${escapeHtml(MCP_GATEWAY.status)}</p>
        <h1 id="mcp-title">${escapeHtml(pageHeading)}</h1>
        <p class="lede">${escapeHtml(pageLead)}</p>
        <p class="lede">
          Endpoint: <code>${escapeHtml(MCP_GATEWAY.path)}</code>. Protocol:
          <code>${escapeHtml(MCP_GATEWAY.protocolVersion)}</code>. Persistence:
          <code>${escapeHtml(MCP_GATEWAY.persistenceMode)}</code>.
        </p>
      </section>

      <section class="band" aria-labelledby="tools-title">
        <h2 id="tools-title">Contribution tools</h2>
        <table>
          <thead>
            <tr><th>Tool</th><th>Mode</th><th>Purpose</th></tr>
          </thead>
          <tbody>${renderMcpToolRows()}</tbody>
        </table>
      </section>

      <section class="band" aria-labelledby="import-title">
        <h2 id="import-title">Harness imports</h2>
        ${renderMcpHarnessImportTabs()}
      </section>

      <section class="band" aria-labelledby="generic-import-title">
        <h2 id="generic-import-title">Generic snippets</h2>
        ${renderMcpSnippetBlocks()}
      </section>

      <section class="band" aria-labelledby="gate-title">
        <h2 id="gate-title">Review gate</h2>
        <p class="guard">${escapeHtml(MCP_GATEWAY.reviewGate)}</p>
        <p>Direct external-agent production mutation, unsupported public Bittrees claims, and secret-bearing payloads are out of scope.</p>
      </section>
    </main>
  </body>
</html>`;
}

export function renderMcpDocsPage() {
  return renderMcpGatewayPage({ docs: true });
}

export function renderSubmissionStatusPage(searchParams = new URLSearchParams()) {
  const id = readSearchParam(searchParams, 'id').trim();
  const kind = normalizeStatusLookupKind(readSearchParam(searchParams, 'kind').trim() || 'any');
  const lookup = id ? callMcpTool('check_contribution_status', { id, kind }).structuredContent : null;
  const kindOptions = STATUS_LOOKUP_KINDS.map((item) => ({ value: item, label: item }));
  const resultBody = lookup
    ? `<pre><code>${escapeHtml(JSON.stringify(lookup, null, 2))}</code></pre>`
    : '<p class="lede">Enter an opportunity id, queued review id, submission id, feedback id, or attestation id to inspect review status.</p>';
  const opportunityRows = OPPORTUNITIES.map(
    (opportunity) => `
      <tr>
        <td><code>${escapeHtml(opportunity.id)}</code></td>
        <td>${escapeHtml(opportunity.status)}</td>
        <td>${escapeHtml(publicSafeString(opportunity.owner))}</td>
        <td>${escapeHtml(opportunity.nextAction)}</td>
      </tr>
    `,
  ).join('');
  const pageTitle = 'Submission status - agent.bittrees.org';
  const pageDescription = getRouteDescription(
    '/submission-status',
    'Human-readable lookup for review-gated contribution, claim, feedback, and attestation status.',
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    ${renderPageMetadata({ title: pageTitle, description: pageDescription, path: '/submission-status' })}
    ${renderHumanLookupStyles()}
  </head>
  <body>
    <main>
      <header class="topline">
        <p class="brand"><a href="/">agent.bittrees.org</a></p>
        <span class="status">human-view-ready</span>
      </header>

      <section class="hero" aria-labelledby="status-title">
        <h1 id="status-title">Submission status.</h1>
        <p class="lede">
          Human-readable lookup for review-gated contribution status. It mirrors the
          <code>check_contribution_status</code> MCP tool and separates queued review records
          from assignments, approvals, publication, and public attestations.
        </p>
        <p class="lede caveat">
          Pending records are not assignments, approvals, publication, public attestations,
          accepted Bittrees work, execution authority, or publication authority.
        </p>
      </section>

      <section class="band" aria-labelledby="lookup-title">
        <h2 id="lookup-title">Lookup</h2>
        <form method="get" action="/submission-status">
          <label>
            Record id
            <input name="id" value="${escapeHtml(id)}" placeholder="source-registry-hardening or sub_..." />
          </label>
          <label>
            Kind
            <select name="kind">${renderSelectOptions(kindOptions, kind)}</select>
          </label>
          <button type="submit">Check</button>
        </form>
      </section>

      <section class="band" aria-labelledby="result-title">
        <h2 id="result-title">Result</h2>
        ${resultBody}
      </section>

      <section class="band" aria-labelledby="known-title">
        <div>
          <h2 id="known-title">Known opportunities</h2>
          <p class="lede">Use these ids as stable starting points for status lookup.</p>
        </div>
        <table>
          <thead>
            <tr><th>ID</th><th>Status</th><th>Owner</th><th>Next action</th></tr>
          </thead>
          <tbody>${opportunityRows}</tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}

export function renderReputationPage(searchParams = new URLSearchParams()) {
  const agentId = readSearchParam(searchParams, 'agentId').trim();
  const lookup = agentId ? callMcpTool('get_agent_reputation', { agentId }).structuredContent : null;
  const resultBody = lookup
    ? `<pre><code>${escapeHtml(JSON.stringify(lookup, null, 2))}</code></pre>`
    : '<p class="lede">Enter an approved or pending agent id to inspect public reputation evidence and caveats.</p>';
  const agentRows = APPROVED_AGENT_PROFILES.map(
    (agent) => `
      <tr>
        <td><code>${escapeHtml(agent.id)}</code></td>
        <td>${escapeHtml(agent.displayName)}</td>
        <td>${escapeHtml(agent.lanes.join(', '))}</td>
        <td>${escapeHtml(agent.authorization.executionAllowed ? 'execution allowed' : 'execution blocked')}</td>
      </tr>
    `,
  ).join('');
  const pageTitle = 'Agent reputation - agent.bittrees.org';
  const pageDescription = getRouteDescription(
    '/reputation',
    'Human-readable lookup for agent reputation evidence with identity, authority, and authorization caveats.',
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    ${renderPageMetadata({ title: pageTitle, description: pageDescription, path: '/reputation' })}
    ${renderHumanLookupStyles()}
  </head>
  <body>
    <main>
      <header class="topline">
        <p class="brand"><a href="/">agent.bittrees.org</a></p>
        <span class="status">human-view-ready</span>
      </header>

      <section class="hero" aria-labelledby="reputation-title">
        <h1 id="reputation-title">Agent reputation.</h1>
        <p class="lede">
          Human-readable lookup for reviewed profile evidence and queued contribution counts.
          It mirrors the <code>get_agent_reputation</code> MCP tool.
        </p>
        <p class="lede caveat">
          Reputation is an evidence signal only. It does not authorize execution, spending,
          registry mutation, governance action, or public Bittrees claim expansion.
        </p>
      </section>

      <section class="band" aria-labelledby="lookup-title">
        <h2 id="lookup-title">Lookup</h2>
        <form method="get" action="/reputation">
          <label>
            Agent id
            <input name="agentId" value="${escapeHtml(agentId)}" placeholder="idacc-default-lead" />
          </label>
          <button type="submit">Check</button>
        </form>
      </section>

      <section class="band" aria-labelledby="result-title">
        <h2 id="result-title">Result</h2>
        ${resultBody}
      </section>

      <section class="band" aria-labelledby="known-title">
        <div>
          <h2 id="known-title">Approved profiles</h2>
          <p class="lede">These starter profiles expose public evidence without execution authority.</p>
        </div>
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Lanes</th><th>Authorization</th></tr>
          </thead>
          <tbody>${agentRows}</tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}

export function renderIdentityKeysPage() {
  const sectionRows = IDENTITY_KEYS_PUBLIC_CONTRACT.sections
    .map(
      (section) => `
        <tr>
          <td>${escapeHtml(section.id)}</td>
          <td>${escapeHtml(section.requiredFields.join(', '))}</td>
        </tr>
      `,
    )
    .join('');
  const readinessRows = IDENTITY_KEYS_PUBLIC_CONTRACT.onchainExecutionReadiness
    .map(
      (level) => `
        <tr>
          <td>${escapeHtml(level.level)}</td>
          <td>${escapeHtml(level.automation)}</td>
          <td>${escapeHtml(level.description)}</td>
        </tr>
      `,
    )
    .join('');
  const automationItems = LIVE_AGENT_REGISTRY.automatedManagement.allowedWithoutHumanReview
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  const approvalItems = LIVE_AGENT_REGISTRY.automatedManagement.requiresExplicitApproval
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  const pageTitle = 'Identity and keys - agent.bittrees.org';
  const pageDescription = getRouteDescription(
    '/identity-keys',
    'Human-readable prelaunch-readiness page for managed agent identity, keys, and onchain execution gates.',
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    ${renderPageMetadata({ title: pageTitle, description: pageDescription, path: '/identity-keys' })}
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
        --gold: #8b5c10;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
      }

      main {
        width: min(1120px, calc(100% - 40px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }

      .topline,
      .band {
        border-bottom: 1px solid var(--line);
      }

      .topline {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: center;
        padding: 14px 0 24px;
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
        padding: 42px 0 34px;
        border-bottom: 1px solid var(--line);
      }

      h1 {
        margin: 0;
        max-width: 14ch;
        font-size: clamp(2.6rem, 6vw, 5rem);
        line-height: 1;
        letter-spacing: 0;
      }

      h2 {
        margin: 0;
        font-size: 1.3rem;
        letter-spacing: 0;
      }

      .lede {
        max-width: 74ch;
        margin: 20px 0 0;
        color: var(--muted);
        font-size: 1.04rem;
        line-height: 1.7;
      }

      .band {
        display: grid;
        grid-template-columns: 0.65fr 1.35fr;
        gap: 28px;
        padding: 30px 0;
      }

      ul {
        margin: 0;
        padding-left: 18px;
        color: var(--muted);
        line-height: 1.7;
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

      td {
        color: var(--muted);
        line-height: 1.6;
      }

      th {
        color: var(--ink);
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0;
      }

      a { color: var(--blue); text-decoration-thickness: 1px; text-underline-offset: 3px; }

      @media (max-width: 820px) {
        main { width: min(100% - 28px, 1120px); padding-top: 18px; }
        .topline,
        .band { grid-template-columns: 1fr; align-items: flex-start; }
        h1 { max-width: 100%; }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="topline">
        <p class="brand"><a href="/">agent.bittrees.org</a></p>
        <span class="status">${escapeHtml(IDENTITY_KEYS_PUBLIC_CONTRACT.status)}</span>
      </header>

      <section class="hero" aria-labelledby="identity-title">
        <h1 id="identity-title">Identity and keys.</h1>
        <p class="lede">
          ${escapeHtml(IDENTITY_KEYS_PUBLIC_CONTRACT.purpose)}
          ${escapeHtml(IDENTITY_KEYS_PUBLIC_CONTRACT.publicationPolicy)}
        </p>
        <p class="lede">
          Registry mode: ${escapeHtml(LIVE_AGENT_REGISTRY.mode)}. Routine signed state can move live;
          authority-changing actions stay proof-gated.
        </p>
      </section>

      <section class="band" aria-labelledby="sections-title">
        <h2 id="sections-title">Public sections</h2>
        <table>
          <thead>
            <tr>
              <th>Section</th>
              <th>Required fields</th>
            </tr>
          </thead>
          <tbody>${sectionRows}</tbody>
        </table>
      </section>

      <section class="band" aria-labelledby="automation-title">
        <h2 id="automation-title">Live automation</h2>
        <div>
          <p class="lede">Allowed without human review:</p>
          <ul>${automationItems}</ul>
          <p class="lede">Requires explicit approval:</p>
          <ul>${approvalItems}</ul>
        </div>
      </section>

      <section class="band" aria-labelledby="execution-title">
        <h2 id="execution-title">Onchain execution</h2>
        <table>
          <thead>
            <tr>
              <th>Level</th>
              <th>Automation</th>
              <th>Use</th>
            </tr>
          </thead>
          <tbody>${readinessRows}</tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}

export function buildJsonResponse(routeDefinition, generatedAt = new Date().toISOString()) {
  const routeData = typeof routeDefinition.data === 'function' ? routeDefinition.data() : routeDefinition.data;
  const publicRouteData = publicSafeContent(routeData);

  return {
    $schema: SCHEMA_URL,
    route: routeDefinition.path,
    generatedAt,
    status: publicRouteData?.status ?? routeDefinition.status,
    disclaimer: UNIVERSAL_PORTAL_DISCLAIMER,
    noRightsCreatedDisclaimer: NO_RIGHTS_CREATED_DISCLAIMER,
    ...(routeDefinition.privacyNotice ? { privacyNotice: routeDefinition.privacyNotice } : {}),
    schema: routeDefinition.schema,
    data: publicRouteData,
  };
}

function logTelemetryRequest({ timestamp = new Date().toISOString(), method, path, status }) {
  console.log(JSON.stringify({ timestamp, method, path, status }));
}

function sendBody(res, statusCode, body, contentType, includeBody = true, telemetry = null, extraHeaders = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': payload.byteLength,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    ...PORTAL_SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(includeBody ? payload : undefined);

  if (telemetry) logTelemetryRequest(telemetry);
}

function sendJson(res, statusCode, body, includeBody = true, telemetry = null, extraHeaders = {}) {
  sendBody(res, statusCode, `${JSON.stringify(body, null, 2)}\n`, 'application/json; charset=utf-8', includeBody, telemetry, extraHeaders);
}

function sendEmpty(res, statusCode, telemetry = null, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Length': '0',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    ...PORTAL_SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end();

  if (telemetry) logTelemetryRequest(telemetry);
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function sendMcpJson(res, statusCode, body, includeBody = true, telemetry = null, extraHeaders = {}) {
  return sendJson(res, statusCode, body, includeBody, telemetry, {
    'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    ...extraHeaders,
  });
}

function parseAcceptedTypes(req) {
  return String(req.headers.accept ?? '')
    .toLowerCase()
    .split(',')
    .map((item) => item.split(';')[0].trim())
    .filter(Boolean);
}

function acceptsMcpPost(req) {
  const accepted = parseAcceptedTypes(req);
  if (accepted.length === 0 || accepted.includes('*/*')) return true;
  return accepted.includes('application/json') && accepted.includes('text/event-stream');
}

function wantsEventStream(req) {
  return parseAcceptedTypes(req).includes('text/event-stream');
}

function isAllowedMcpOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;

  const allowed = new Set([
    'https://agent.bittrees.org',
    'http://agent.bittrees.org',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...(process.env.MCP_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ]);

  const host = req.headers.host;
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }

  return allowed.has(origin);
}

function isJsonRpcRequest(message) {
  return message && typeof message === 'object' && typeof message.method === 'string' && Object.hasOwn(message, 'id');
}

function isJsonRpcNotificationOrResponse(message) {
  return message && typeof message === 'object' && !Object.hasOwn(message, 'id');
}

function negotiateProtocolVersion(params = {}) {
  const requested = params.protocolVersion;
  return MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSION;
}

function validateProtocolHeader(req, message) {
  if (message?.method === 'initialize') return;
  const requestedVersion = req.headers['mcp-protocol-version'];
  if (!requestedVersion) return;
  if (!MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)) {
    const error = new Error(`Unsupported MCP protocol version: ${requestedVersion}`);
    error.statusCode = 400;
    error.jsonRpcCode = -32602;
    error.jsonRpcData = { supported: MCP_SUPPORTED_PROTOCOL_VERSIONS, requested: requestedVersion };
    throw error;
  }
}

function handleMcpJsonRpcMessage(message, req) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw invalidToolInput('MCP POST body must be a single JSON-RPC object.');
  }

  if (message.jsonrpc !== '2.0') {
    const error = new Error('JSON-RPC version must be 2.0.');
    error.jsonRpcCode = -32600;
    throw error;
  }

  validateProtocolHeader(req, message);

  if (!isJsonRpcRequest(message)) {
    return null;
  }

  switch (message.method) {
    case 'initialize': {
      const protocolVersion = negotiateProtocolVersion(message.params ?? {});
      return jsonRpcResult(message.id, {
        protocolVersion,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: 'agent.bittrees.org-contribution-gateway',
          title: 'Bittrees Agent Contribution Gateway',
          version: '0.1.0',
        },
        instructions:
          'Use tools/list to discover Bittrees contribution tools. Write-like tools queue review records only and do not grant production mutation, execution authority, or public attestation.',
      });
    }

    case 'notifications/initialized':
    case 'ping':
      return jsonRpcResult(message.id, {});

    case 'tools/list':
      return jsonRpcResult(message.id, {
        tools: MCP_CONTRIBUTION_TOOLS,
      });

    case 'tools/call': {
      const params = message.params ?? {};
      if (typeof params.name !== 'string') throw invalidToolInput('tools/call params.name is required.');
      if (!MCP_TOOL_BY_NAME.has(params.name)) throw invalidToolInput(`Unknown tool: ${params.name}`);
      return jsonRpcResult(message.id, callMcpTool(params.name, params.arguments ?? {}));
    }

    default:
      return jsonRpcError(message.id, -32601, `Method not found: ${message.method}`);
  }
}

export async function handleMcpRequest(req, res, telemetry = { method: req.method ?? 'GET', path: MCP_GATEWAY.path }) {
  const includeBody = req.method !== 'HEAD';

  if (!isAllowedMcpOrigin(req)) {
    return sendMcpJson(res, 403, {
      error: 'origin_not_allowed',
      message: 'Origin is not allowed for the MCP gateway.',
    }, includeBody, { ...telemetry, status: 403 });
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (wantsEventStream(req)) {
      return sendMcpJson(res, 405, {
        error: 'sse_stream_not_available',
        message: 'This MCP gateway supports POST JSON-RPC. Server-initiated SSE streams are not available.',
        allowedMethods: ['POST'],
      }, includeBody, { ...telemetry, status: 405 }, {
        Allow: 'POST',
      });
    }

    return sendBody(res, 200, renderMcpGatewayPage(), 'text/html; charset=utf-8', includeBody, {
      ...telemetry,
      status: 200,
    }, {
      Allow: 'GET, HEAD, POST',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    });
  }

  if (req.method !== 'POST') {
    return sendMcpJson(res, 405, {
      error: 'method_not_allowed',
      message: 'The MCP gateway accepts POST JSON-RPC requests. Browser GET returns documentation.',
      allowedMethods: ['GET', 'HEAD', 'POST'],
    }, includeBody, { ...telemetry, status: 405 }, {
      Allow: 'GET, HEAD, POST',
    });
  }

  if (!acceptsMcpPost(req)) {
    return sendMcpJson(res, 406, {
      error: 'not_acceptable',
      message: 'Streamable HTTP clients should send Accept: application/json, text/event-stream.',
    }, includeBody, { ...telemetry, status: 406 });
  }

  const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return sendMcpJson(res, 415, jsonRpcError(null, -32000, 'Content-Type must be application/json.'), includeBody, {
      ...telemetry,
      status: 415,
    });
  }

  let message;
  try {
    message = parseJsonRequestBody(await readRequestBody(req));
  } catch (error) {
    const statusCode = error.statusCode ?? 400;
    return sendMcpJson(
      res,
      statusCode,
      jsonRpcError(null, error.statusCode === 413 ? -32000 : -32700, error.message),
      includeBody,
      { ...telemetry, status: statusCode },
    );
  }

  try {
    const response = handleMcpJsonRpcMessage(message, req);
    if (response === null || isJsonRpcNotificationOrResponse(message)) {
      return sendEmpty(res, 202, { ...telemetry, status: 202 }, {
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      });
    }

    return sendMcpJson(res, 200, response, includeBody, { ...telemetry, status: 200 });
  } catch (error) {
    const id = message && typeof message === 'object' && Object.hasOwn(message, 'id') ? message.id : null;
    const code = error.jsonRpcCode ?? -32603;
    const statusCode = error.statusCode ?? (code === -32602 || code === -32600 ? 400 : 200);
    return sendMcpJson(
      res,
      statusCode,
      jsonRpcError(id, code, error.message, error.jsonRpcData),
      includeBody,
      { ...telemetry, status: statusCode },
    );
  }
}

function sendRedirect(res, statusCode, location, telemetry = null) {
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

  if (telemetry) logTelemetryRequest(telemetry);
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
      status: getRouteStatus(definition),
    })),
  };
}

export function buildStaticAssets(generatedAt = new Date().toISOString()) {
  const routeAssets = JSON_ROUTES
    .filter((definition) => definition.staticAsset !== false && !CONTRIBUTION_INTENT_POST_PATHS.has(definition.path))
    .map((definition) => ({
      path: definition.path.replace(/^\//, ''),
      body: `${JSON.stringify(buildJsonResponse(definition, generatedAt), null, 2)}\n`,
    }));

  return [
    {
      path: 'index.html',
      body: renderLandingPage(),
    },
    {
      path: 'identity-keys/index.html',
      body: renderIdentityKeysPage(),
    },
    {
      path: 'submission-status/index.html',
      body: renderSubmissionStatusPage(),
    },
    {
      path: 'reputation/index.html',
      body: renderReputationPage(),
    },
    {
      path: 'mcp-docs/index.html',
      body: renderMcpDocsPage(),
    },
    {
      path: ROBOTS_TXT_PATH.replace(/^\//, ''),
      body: ROBOTS_TXT_BODY,
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
  return async function handleRequest(req, res) {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const includeBody = req.method !== 'HEAD';
    const pathname = requestUrl.pathname;
    const telemetry = { method: req.method ?? 'GET', path: pathname };
    const normalizedPath = normalizeCanonicalPath(pathname);

    if (pathname !== normalizedPath && CANONICAL_ROUTE_PATHS.has(normalizedPath)) {
      return sendRedirect(res, 301, `${normalizedPath}${requestUrl.search}`, {
        ...telemetry,
        status: 301,
      });
    }

    const isContributionIntentPost = req.method === 'POST' && CONTRIBUTION_INTENT_POST_PATHS.has(pathname);

    if (pathname === MCP_GATEWAY.path) {
      return handleMcpRequest(req, res, telemetry);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD' && !isContributionIntentPost) {
      req.resume?.();
    }

    if (pathname === ROBOTS_TXT_PATH && (req.method === 'GET' || req.method === 'HEAD')) {
      return sendBody(res, 200, ROBOTS_TXT_BODY, 'text/plain; charset=utf-8', includeBody, {
        ...telemetry,
        status: 200,
      });
    }

    if (isContributionIntentPost) {
      return handleContributionIntentPost(req, res, includeBody, telemetry, pathname);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, {
        $schema: SCHEMA_URL,
        error: 'method_not_allowed',
        message:
          'Only GET and HEAD are supported by this portal, except gated POST contribution-intent intake paths.',
        allowedMethods: ['GET', 'HEAD'],
        contributionIntentPostPaths: Array.from(CONTRIBUTION_INTENT_POST_PATHS),
      }, includeBody, {
        ...telemetry,
        status: 405,
      });
    }

    if (pathname === '/') {
      return sendBody(res, 200, renderLandingPage(), 'text/html; charset=utf-8', includeBody, {
        ...telemetry,
        status: 200,
      });
    }

    if (pathname === '/identity-keys') {
      return sendBody(res, 200, renderIdentityKeysPage(), 'text/html; charset=utf-8', includeBody, {
        ...telemetry,
        status: 200,
      });
    }

    if (pathname === '/submission-status') {
      return sendBody(res, 200, renderSubmissionStatusPage(requestUrl.searchParams), 'text/html; charset=utf-8', includeBody, {
        ...telemetry,
        status: 200,
      });
    }

    if (pathname === '/reputation') {
      return sendBody(res, 200, renderReputationPage(requestUrl.searchParams), 'text/html; charset=utf-8', includeBody, {
        ...telemetry,
        status: 200,
      });
    }

    if (pathname === '/mcp-docs') {
      return sendBody(res, 200, renderMcpDocsPage(), 'text/html; charset=utf-8', includeBody, {
        ...telemetry,
        status: 200,
      }, {
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
      });
    }

    if (pathname === '/llms.txt') {
      return sendBody(res, 200, buildLlmsTxt(), 'text/plain; charset=utf-8', includeBody, {
        ...telemetry,
        status: 200,
      });
    }

    const routeDefinition = JSON_ROUTE_MAP.get(pathname);
    if (routeDefinition) {
      return sendJson(res, 200, buildJsonResponse(routeDefinition), includeBody, {
        ...telemetry,
        status: 200,
      });
    }

    return sendJson(res, 404, {
      $schema: SCHEMA_URL,
      error: 'not_found',
      message: 'No portal route exists at this path.',
      availableRoutes: ROUTE_DEFINITIONS.map((definition) => definition.path),
    }, includeBody, {
      ...telemetry,
      status: 404,
    });
  };
}
