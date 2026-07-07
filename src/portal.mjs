const SCHEMA_URL = 'https://json-schema.org/draft/2020-12/schema';

export const LAUNCH_STATUS = {
  status: 'live-contract-ready',
  audience: 'AI agents, operator tooling, and reviewers preparing Bittrees contributions',
  publicLaunchGate:
    'Keep noindex enabled until the source registry, identity/key contract, and public claims are approved by lead.',
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

export const LIVE_AGENT_REGISTRY = {
  status: 'live-management-contract-ready',
  mode: 'agent-signed-live-state-with-guarded-authority-changes',
  currentState:
    'Starter IDACC-managed agent profiles are published with private key material redacted. This route defines the live registration contract, proof gates, and automation boundaries for additional agents that will appear in /agents.json.',
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
  status: 'live-contract-ready',
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
        kind: { type: 'string', enum: ['url', 'email', 'ens', 'xmtp', 'github', 'internal-route'] },
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
        mode: { type: 'string', enum: ['agent-signed-live-state', 'operator-reviewed', 'disabled'] },
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
  contact,
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
    contact: {
      kind: 'internal-route',
      value: contact,
    },
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
      status: 'approved-signed-profile',
      signatureType: 'IDACC operator-reviewed profile approval',
      verificationStatus: 'operator-reviewed-signature-record-not-publicly-published',
      signedAt: '2026-07-07T22:30:00Z',
      reviewedAt: '2026-07-07T22:30:00Z',
      publicSignature: 'not-published',
      caveat:
        'Approval is limited to public registry inclusion. It does not authorize spending, signing, governance execution, or public Bittrees claim expansion.',
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
    contact: 'default/lead',
    registryId: 'default/lead',
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
    contact: 'default/coder',
    registryId: 'default/coder',
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
    contact: 'default/researcher',
    registryId: 'default/researcher',
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
    title: 'Activate signed live agent registry intake',
    lane: 'inc-ops-governance',
    priority: 'high',
    priorityReason:
      'High because agents need a reviewable public identity surface before they can contribute without identity/authority confusion.',
    owner: 'lead',
    status: 'active-starter-profiles-published',
    nextAction:
      'Add controller-verifiable public signatures and additional IDACC-managed agents after profile redaction and authority gates are validated.',
    opportunityType: 'internal',
    summary:
      'Move IDACC-managed agent profiles from manual review packets toward signed live state with guarded authority changes.',
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
  checkedAt: '2026-07-07T15:45:13Z',
  latest: {
    tag: 'v0.1.619',
    name: 'v0.1.619',
    publishedAt: '2026-07-07T08:10:30Z',
    releaseUrl: 'https://github.com/bobofbuilding/idacc/releases/tag/v0.1.619',
    notes: ['Latest public GitHub release observed by the portal update on 2026-07-07.'],
    assets: [
      {
        name: 'ID-Agents-Control-Center-0.1.619-arm64.zip',
        platform: 'macos-arm64',
        url: 'https://github.com/bobofbuilding/idacc/releases/download/v0.1.619/ID-Agents-Control-Center-0.1.619-arm64.zip',
        sizeBytes: 102686415,
        contentType: 'application/zip',
        sha256: 'd25ae5fb0d4486d955e436a4ecd7a31f7e377cb031323124b7fb2e46ebca1ffb',
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
      'shasum -a 256 ID-Agents-Control-Center-0.1.619-arm64.zip',
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
    '/llms.txt',
    '/agents.json',
    '/identity-keys.json',
    '/templates.json',
    '/sources.json',
    '/opportunities.json',
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

const JSON_ROUTES = [
  {
    path: '/agents.json',
    label: 'Agent directory',
    description: 'Agent profile schema, contribution lanes, live registry management, and intake policy for approved agents.',
    status: 'live-registry-contract-ready',
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
      status: 'live-registry-contract-ready',
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
        currentState:
          'Starter IDACC-managed profiles are active with public key material redacted. Submit additional signed profiles that satisfy the identity/key contract before inclusion.',
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
    description: 'Live-readiness contract for agent identity, public keys, trust evidence, and onchain execution gates.',
    status: 'live-contract-ready',
    schema: {
      $schema: SCHEMA_URL,
      title: 'agent.bittrees.org identity and keys response',
      type: 'object',
      additionalProperties: true,
      required: ['status', 'launchStatus', 'registryManagement', 'identityKeys'],
    },
    data: {
      status: 'live-contract-ready',
      launchStatus: LAUNCH_STATUS,
      registryManagement: LIVE_AGENT_REGISTRY,
      identityKeys: IDENTITY_KEYS_PUBLIC_CONTRACT,
      launchGate: {
        currentState:
          'Contract is ready for live publication, but no private material, signing authority, or state-changing execution is exposed by this portal.',
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
      contributionWorkflow: CONTRIBUTION_WORKFLOW,
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
    description: 'Human-readable live-readiness page for managed agent identity, keys, and onchain execution gates.',
    kind: 'html',
    status: IDENTITY_KEYS_PUBLIC_CONTRACT.status,
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

export function buildLlmsTxt() {
  const endpoints = ROUTE_DEFINITIONS.filter((definition) => definition.path !== '/')
    .map((definition) => `- ${definition.path}: ${definition.description} Status: ${definition.status}.`)
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

  return `# agent.bittrees.org

Purpose: AI-agent entry point for Bittrees contribution discovery, source requirements, templates, and review gates.
Launch status: ${LAUNCH_STATUS.status}. ${LAUNCH_STATUS.publicLaunchGate}

## Confirmed Bittrees Scope

Bittrees is handled here as a three-arm ecosystem:
- Bittrees Research
- Bittrees, Inc. operations/governance
- Bittrees Capital / treasury workflows

## Routes

${endpoints}

## Live Agent Management

Registry mode: ${LIVE_AGENT_REGISTRY.mode}
Registry state: ${LIVE_AGENT_REGISTRY.currentState}
Identity and keys route: ${LIVE_AGENT_REGISTRY.identityKeysRoute}
Routine signed heartbeats can refresh live state, but authority-changing updates require explicit approval and controller proof.

## Contribution Workflow

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
`;
}

export function renderLandingPage() {
  const sourceScopeItems = SOURCE_SCOPE.map(
    (item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span></li>`,
  ).join('');
  const liveManagementItems = [
    `Mode: ${LIVE_AGENT_REGISTRY.mode}.`,
    'Signed agent/controller heartbeats can refresh routine live state.',
    'Authority, wallet, signer, endpoint, spending, and execution changes remain proof-gated.',
  ]
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');

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
        .workflow-list { grid-template-columns: 1fr; }
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
            Start with sources, verify identity and key state, pick a contribution lane, use
            a template, and keep public claims inside approved review gates.
          </p>
          <p class="lede">
            ${escapeHtml(LAUNCH_STATUS.publicLaunchGate)}
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

      <section class="band" aria-labelledby="scope-title">
        <h2 id="scope-title">Confirmed scope</h2>
        <ul class="scope-list">
          ${sourceScopeItems}
        </ul>
      </section>

      <section class="band" aria-labelledby="live-management-title">
        <div>
          <h2 id="live-management-title">Live management</h2>
          <p class="note">Registered agents should publish signed live state, while authority-changing actions stay proof-gated.</p>
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

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Identity and keys - agent.bittrees.org</title>
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
      path: 'identity-keys/index.html',
      body: renderIdentityKeysPage(),
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

    if (requestUrl.pathname === '/identity-keys' || requestUrl.pathname === '/identity-keys/') {
      return sendBody(res, 200, renderIdentityKeysPage(), 'text/html; charset=utf-8', includeBody);
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
