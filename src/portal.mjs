import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_URL = 'https://json-schema.org/draft/2020-12/schema';
const PORTAL_BASE_URL = 'https://agent.bittrees.org';
export const ROBOTS_TXT_PATH = '/robots.txt';
const ROBOTS_TXT_BODY = 'User-agent: *\nDisallow: /\n';
const REVIEWED_AT = '2026-07-07';
const NEXT_REVIEW_DUE = '2026-07-21';
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTRIBUTION_INTENTS_WRITE_FLAG_NAMES = [
  'CONTRIBUTION_INTENTS_WRITE_ENABLED',
  'CONTRIBUTION_INTENTS_ENABLED',
  'PORTAL_ENABLE_CONTRIBUTION_INTENTS',
];

export const SOURCE_SCOPE = [
  'Bittrees Research',
  'Bittrees, Inc. operations/governance',
  'Bittrees Capital / treasury workflows',
];

const SOURCE_RECORDS = [
  {
    id: 'memory:642',
    label: 'Brain goal record for Plan 70',
    owner: 'control-center',
    url: 'brain://memory/642',
    retrievedAt: REVIEWED_AT,
    notes: [
      'Plan 70 defines the agent.bittrees.org portal objective and sections 4 and 6.',
      'Section 4 requires /llms.txt, /agents.json, /templates.json, /idacc/releases.json, timestamps, sources, owners, and validation status.',
      'Section 6 requires templates for research, onboarding, ops/governance, source-grounded reports, legal handoffs, and safe onchain/treasury handoffs.',
    ],
  },
  {
    id: 'memory:639',
    label: 'Brain draft plan source for Plan 70',
    owner: 'control-center',
    url: 'brain://memory/639',
    retrievedAt: REVIEWED_AT,
    notes: ['Draft plan content mirrors the approved Plan 70 structure.'],
  },
  {
    id: 'output:agent-bittrees-portal-repo-readiness',
    label: 'agent.bittrees.org portal repo readiness packet',
    owner: 'architecture-engineer',
    url: 'output/agent-bittrees-portal-repo-readiness.md',
    retrievedAt: REVIEWED_AT,
    notes: [
      'Readiness packet identifies launch blockers and security-router NO-GO controls.',
      'The repo must remain static/read-only until security gate controls clear.',
    ],
  },
  {
    id: 'output:idacc-contributor-lane-map',
    label: 'IDACC contributor lane map',
    owner: 'architecture-engineer',
    url: 'output/idacc-contributor-lane-map.md',
    retrievedAt: REVIEWED_AT,
    notes: ['Defines Bittrees contribution lanes and manager-derived agent routing evidence.'],
  },
  {
    id: 'manager:/agents-snapshot:2026-07-07',
    label: 'Local manager agent inventory snapshot',
    owner: 'engineering-team/architecture-engineer',
    url: 'http://127.0.0.1:4100/agents',
    retrievedAt: REVIEWED_AT,
    notes: ['Used only as a reviewed static snapshot, not as a live portal dependency.'],
  },
  {
    id: 'github:bobofbuilding/idacc/releases/latest:2026-07-07',
    label: 'GitHub latest release API for bobofbuilding/idacc',
    owner: 'engineering-lead',
    url: 'https://api.github.com/repos/bobofbuilding/idacc/releases/latest',
    retrievedAt: REVIEWED_AT,
    notes: ['Used for IDACC release version, publish time, asset name, and SHA-256 digest.'],
  },
];

const REVIEW_STATE = {
  reviewedAt: REVIEWED_AT,
  nextReviewDue: NEXT_REVIEW_DUE,
  reviewOwner: 'engineering-team/architecture-engineer',
  validationStatus: 'static-launch-draft',
  goalId: 'goal_plan_rzit49',
  sourceIds: SOURCE_RECORDS.map((source) => source.id),
};

const READ_ONLY_LAUNCH_POSTURE = {
  mode: 'read-only-static-launch-draft',
  liveWritesEnabled: false,
  liveWriteReason:
    'Security-router clearance is still required before any public endpoint accepts or persists contribution intent.',
  blockedUntil: 'security-router-clearance',
  securityOwner: 'technology-security/security-router',
  noGoItems: [
    {
      id: 'content-approval-integrity',
      label: 'Content approval and integrity controls for manifests and templates',
      status: 'open',
    },
    {
      id: 'idacc-release-signatures',
      label: 'Signed and hashed IDACC release artifacts',
      status: 'partial-hash-present-signature-open',
    },
    {
      id: 'static-read-only-protected-endpoints',
      label: 'Static/read-only or protected endpoint posture',
      status: 'open',
    },
    {
      id: 'client-bundle-secret-scanning',
      label: 'Client-bundle secret scanning before publish',
      status: 'open',
    },
  ],
};

function isTruthyFlag(value) {
  if (typeof value !== 'string') {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
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
    return READ_ONLY_LAUNCH_POSTURE;
  }

  return {
    ...READ_ONLY_LAUNCH_POSTURE,
    mode: 'feature-flag-live-write-enabled',
    liveWritesEnabled: true,
    liveWriteReason:
      'Contribution-intent writes are enabled in a non-production environment and are persisted locally with fleet notifications.',
  };
}

const CONTRIBUTION_LANES = [
  {
    id: 'research',
    label: 'Research',
    sourceScope: ['Bittrees Research'],
    ownerRoute: 'M:research/research-lead',
    fallbackRoute: 'M:default/researcher',
    validationPath: ['researcher'],
    dispatchStatus: 'specialist-team-not-currently-running',
  },
  {
    id: 'operations-governance',
    label: 'Operations/governance',
    sourceScope: ['Bittrees, Inc. operations/governance'],
    ownerRoute: 'M:default/lead',
    fallbackRoute: 'M:engineering-team/engineering-lead',
    validationPath: ['coder', 'researcher'],
    dispatchStatus: 'running-owner-available',
  },
  {
    id: 'treasury',
    label: 'Treasury',
    sourceScope: ['Bittrees Capital / treasury workflows'],
    ownerRoute: 'M:onchain-execution/onchain-lead',
    fallbackRoute: 'M:skillmesh/skillmesh-ops-lead',
    validationPath: ['coder', 'researcher', 'onchain-lead'],
    dispatchStatus: 'execution-gated-no-portal-action',
  },
  {
    id: 'discovery',
    label: 'Discovery',
    sourceScope: ['Bittrees Research', 'Bittrees, Inc. operations/governance'],
    ownerRoute: 'M:skillmesh/skillmesh-ops-lead',
    fallbackRoute: 'M:ops-team/task-master',
    validationPath: ['coder', 'researcher'],
    dispatchStatus: 'running-owner-available',
  },
  {
    id: 'awareness',
    label: 'Awareness',
    sourceScope: ['Bittrees Research'],
    ownerRoute: 'M:research/writer',
    fallbackRoute: 'M:default/researcher',
    validationPath: ['researcher'],
    dispatchStatus: 'specialist-team-not-currently-running',
  },
];

const ACTIVE_AGENT_SNAPSHOT = [
  {
    id: 'default.lead',
    name: 'lead',
    team: 'default',
    role: 'Primary Lead',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['operations-governance', 'research'],
    ownerRoute: 'M:default/lead',
    sourceIds: ['manager:/agents?team=default', 'output:idacc-contributor-lane-map'],
  },
  {
    id: 'default.researcher',
    name: 'researcher',
    team: 'default',
    role: 'Research and synthesis validator',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['research'],
    ownerRoute: 'M:default/researcher',
    sourceIds: ['manager:/agents?team=default', 'output:idacc-contributor-lane-map'],
  },
  {
    id: 'default.coder',
    name: 'coder',
    team: 'default',
    role: 'Implementation and code-quality validator',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['operations-governance'],
    ownerRoute: 'M:default/coder',
    sourceIds: ['manager:/agents?team=default', 'output:idacc-contributor-lane-map'],
  },
  {
    id: 'engineering-team.architect',
    name: 'architect',
    team: 'engineering-team',
    role: 'System Architect',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['operations-governance'],
    ownerRoute: 'M:engineering-team/architect',
    sourceIds: ['manager:/agents?team=engineering-team'],
  },
  {
    id: 'engineering-team.backend-engineer',
    name: 'backend-engineer',
    team: 'engineering-team',
    role: 'Backend Software Engineer',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['operations-governance'],
    ownerRoute: 'M:engineering-team/backend-engineer',
    sourceIds: ['manager:/agents?team=engineering-team'],
  },
  {
    id: 'engineering-team.frontend-engineer',
    name: 'frontend-engineer',
    team: 'engineering-team',
    role: 'Frontend Software Engineer',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['operations-governance', 'awareness'],
    ownerRoute: 'M:engineering-team/frontend-engineer',
    sourceIds: ['manager:/agents?team=engineering-team'],
  },
  {
    id: 'engineering-team.architecture-engineer',
    name: 'architecture-engineer',
    team: 'engineering-team',
    role: 'Architecture Engineering Specialist',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['operations-governance'],
    ownerRoute: 'M:engineering-team/architecture-engineer',
    sourceIds: ['manager:/agents?team=engineering-team'],
  },
  {
    id: 'engineering-team.engineering-lead',
    name: 'engineering-lead',
    team: 'engineering-team',
    role: 'Engineering Team Lead',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['operations-governance'],
    ownerRoute: 'M:engineering-team/engineering-lead',
    sourceIds: ['manager:/agents?team=engineering-team', 'output:routing-matrix'],
  },
  {
    id: 'ops-team.task-master',
    name: 'task-master',
    team: 'ops-team',
    role: 'Task and workflow supervisor',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['discovery', 'operations-governance'],
    ownerRoute: 'M:ops-team/task-master',
    sourceIds: ['manager:/agents?team=ops-team'],
  },
  {
    id: 'skillmesh.skill-discoverer',
    name: 'skill-discoverer',
    team: 'skillmesh',
    role: 'Autonomous self-improvement and skill discovery agent',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['discovery', 'awareness'],
    ownerRoute: 'M:skillmesh/skill-discoverer',
    sourceIds: ['manager:/agents?team=skillmesh'],
  },
  {
    id: 'skillmesh.ipfs-guardian',
    name: 'ipfs-guardian',
    team: 'skillmesh',
    role: 'IPFS data integrity agent',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['operations-governance', 'discovery'],
    ownerRoute: 'M:skillmesh/ipfs-guardian',
    sourceIds: ['manager:/agents?team=skillmesh'],
  },
  {
    id: 'skillmesh.event-watcher',
    name: 'event-watcher',
    team: 'skillmesh',
    role: 'On-chain event monitor',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['operations-governance', 'research'],
    ownerRoute: 'M:skillmesh/event-watcher',
    sourceIds: ['manager:/agents?team=skillmesh'],
  },
  {
    id: 'skillmesh.anomaly-classifier',
    name: 'anomaly-classifier',
    team: 'skillmesh',
    role: 'Chain activity anomaly classifier',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['research', 'operations-governance'],
    ownerRoute: 'M:skillmesh/anomaly-classifier',
    sourceIds: ['manager:/agents?team=skillmesh'],
  },
  {
    id: 'skillmesh.skillmesh-ops-lead',
    name: 'skillmesh-ops-lead',
    team: 'skillmesh',
    role: 'SkillMesh Team Lead',
    runtimeStatus: 'running',
    health: 'online',
    dispatchReady: true,
    lanes: ['discovery', 'operations-governance', 'treasury'],
    ownerRoute: 'M:skillmesh/skillmesh-ops-lead',
    sourceIds: ['manager:/agents?team=skillmesh', 'output:routing-matrix'],
  },
  {
    id: 'technology-security.security-router',
    name: 'security-router',
    team: 'technology-security',
    role: 'Security Triage Coordinator and Team Lead',
    runtimeStatus: 'stopped',
    health: 'unknown',
    dispatchReady: false,
    lanes: ['operations-governance', 'research'],
    ownerRoute: 'M:technology-security/security-router',
    sourceIds: ['manager:/agents?team=technology-security', 'output:agent-bittrees-portal-repo-readiness'],
    notes: ['Security-router clearance is required before enabling live submission writes.'],
  },
];

const TEAM_SUMMARIES = [
  {
    team: 'default',
    activeAgents: ['lead', 'researcher', 'coder'],
    contributionLanes: ['operations-governance', 'research'],
    ownerRoute: 'M:default/lead',
  },
  {
    team: 'engineering-team',
    activeAgents: ['architect', 'backend-engineer', 'frontend-engineer', 'architecture-engineer', 'engineering-lead'],
    contributionLanes: ['operations-governance', 'awareness'],
    ownerRoute: 'M:engineering-team/engineering-lead',
  },
  {
    team: 'ops-team',
    activeAgents: ['task-master'],
    contributionLanes: ['discovery', 'operations-governance'],
    ownerRoute: 'M:ops-team/ops-lead',
  },
  {
    team: 'skillmesh',
    activeAgents: ['skill-discoverer', 'ipfs-guardian', 'event-watcher', 'anomaly-classifier', 'skillmesh-ops-lead'],
    contributionLanes: ['discovery', 'operations-governance', 'research', 'treasury'],
    ownerRoute: 'M:skillmesh/skillmesh-ops-lead',
  },
  {
    team: 'technology-security',
    activeAgents: [],
    contributionLanes: ['operations-governance', 'research'],
    ownerRoute: 'M:technology-security/security-router',
    status: 'blocked-runtime-stopped',
  },
  {
    team: 'research',
    activeAgents: [],
    contributionLanes: ['research', 'awareness'],
    ownerRoute: 'M:research/research-lead',
    status: 'specialist-team-stopped',
  },
  {
    team: 'legal',
    activeAgents: [],
    contributionLanes: ['operations-governance', 'research'],
    ownerRoute: 'M:legal/general-counsel',
    status: 'specialist-team-stopped',
  },
  {
    team: 'onchain-execution',
    activeAgents: [],
    contributionLanes: ['treasury', 'research', 'operations-governance'],
    ownerRoute: 'M:onchain-execution/onchain-lead',
    status: 'specialist-team-stopped',
  },
];

const TEMPLATE_LIBRARY = [
  {
    id: 'bittrees-research-task',
    name: 'Bittrees Research task',
    purpose: 'Route source-grounded research, fact-checking, and synthesis work.',
    owner: 'research-lead',
    sourceScope: ['Bittrees Research'],
    bittreesRelevance: 'high',
    defaultLane: 'research',
    requiredFields: [
      'goal_id',
      'research_question',
      'source_requirements',
      'expected_output',
      'acceptance_criteria',
      'validation_path',
      'out_of_scope',
      'backlog_policy',
    ],
    acceptanceCriteria: [
      'Primary sources or explicit source gaps are listed.',
      'Claims are scoped to Bittrees Research and cite source IDs.',
      'Default researcher validation is required before publication-sensitive use.',
    ],
    validationPath: ['researcher'],
    outOfScope: ['Legal advice', 'onchain execution', 'unsupported public Bittrees claims'],
    backlogPolicy: 'Non-essential reading lists or broad market scans become backlog candidates.',
    sourceIds: ['memory:642', 'output:goal-aligned-task-brief-template'],
    reviewedAt: REVIEWED_AT,
  },
  {
    id: 'contributor-onboarding',
    name: 'Contributor onboarding',
    purpose: 'Help a human or agent choose a Bittrees contribution lane and first task shape.',
    owner: 'lead',
    sourceScope: ['Bittrees Research', 'Bittrees, Inc. operations/governance'],
    bittreesRelevance: 'high',
    defaultLane: 'operations-governance',
    requiredFields: [
      'contributor_type',
      'skills_or_capabilities',
      'desired_lane',
      'available_time_window',
      'expected_output',
      'acceptance_criteria',
      'validation_path',
      'backlog_policy',
    ],
    acceptanceCriteria: [
      'The handoff names one primary lane and owner route.',
      'The first task has concrete output and acceptance criteria.',
      'Authority-sensitive work is gated to the relevant lead.',
    ],
    validationPath: ['coder', 'researcher'],
    outOfScope: ['Credential collection', 'wallet signing', 'employment or compensation commitments'],
    backlogPolicy: 'Unscoped contributor interests remain discovery backlog until an owner accepts them.',
    sourceIds: ['memory:642', 'output:idacc-contributor-lane-map'],
    reviewedAt: REVIEWED_AT,
  },
  {
    id: 'ops-governance-work',
    name: 'Operations/governance work',
    purpose: 'Frame Bittrees, Inc. operations, governance, routing, or workflow improvements.',
    owner: 'ops-lead',
    sourceScope: ['Bittrees, Inc. operations/governance'],
    bittreesRelevance: 'high',
    defaultLane: 'operations-governance',
    requiredFields: [
      'goal_id',
      'operational_problem',
      'owner_route',
      'expected_output',
      'acceptance_criteria',
      'validation_path',
      'out_of_scope',
      'backlog_policy',
    ],
    acceptanceCriteria: [
      'The task reduces duplicated work, routing ambiguity, or validation loops.',
      'Implementation and evidence responsibilities are separated when needed.',
      'No production, credential, or destructive action is implied without approval.',
    ],
    validationPath: ['coder', 'researcher'],
    outOfScope: ['Production deploys', 'destructive manager actions', 'credential changes'],
    backlogPolicy: 'Generic automation ideas without a goal or efficiency justification move to backlog.',
    sourceIds: ['memory:296', 'output:routing-matrix'],
    reviewedAt: REVIEWED_AT,
  },
  {
    id: 'source-grounded-report',
    name: 'Source-grounded report',
    purpose: 'Produce a report with source accounting, evidence quality notes, and residual risk.',
    owner: 'researcher',
    sourceScope: ['Bittrees Research', 'Bittrees, Inc. operations/governance'],
    bittreesRelevance: 'medium',
    defaultLane: 'research',
    requiredFields: [
      'question',
      'source_set',
      'method',
      'findings',
      'limitations',
      'used_source_ids',
      'validation_path',
    ],
    acceptanceCriteria: [
      'Findings are separated from assumptions.',
      'Every material claim has a source ID or explicit source-gap note.',
      'Residual risk and validation status are explicit.',
    ],
    validationPath: ['researcher'],
    outOfScope: ['Unsourced claims', 'binding legal/financial advice', 'private or secret data'],
    backlogPolicy: 'Nice-to-have appendix work stays backlog unless requested by a validator.',
    sourceIds: ['memory:642', 'output:goal-aligned-task-brief-template'],
    reviewedAt: REVIEWED_AT,
  },
  {
    id: 'legal-review-handoff',
    name: 'Legal review handoff',
    purpose: 'Prepare a scoped legal or compliance review request without giving legal advice.',
    owner: 'general-counsel',
    sourceScope: ['Bittrees, Inc. operations/governance'],
    bittreesRelevance: 'high',
    defaultLane: 'operations-governance',
    requiredFields: [
      'review_question',
      'jurisdiction_or_policy_scope',
      'source_materials',
      'requested_decision',
      'acceptance_criteria',
      'out_of_scope',
      'validation_path',
    ],
    acceptanceCriteria: [
      'The request distinguishes facts, assumptions, and requested legal review.',
      'No agent presents the handoff as binding legal advice.',
      'Default researcher validation and legal lead review are both represented.',
    ],
    validationPath: ['researcher', 'general-counsel'],
    outOfScope: ['Binding legal advice by non-legal agents', 'external filings', 'signatures'],
    backlogPolicy: 'Non-urgent legal research questions wait for legal owner acceptance.',
    sourceIds: ['memory:45', 'output:routing-matrix'],
    reviewedAt: REVIEWED_AT,
  },
  {
    id: 'safe-onchain-treasury-handoff',
    name: 'Safe onchain/treasury handoff',
    purpose: 'Route treasury, wallet, governance, or onchain work through explicit approval gates.',
    owner: 'onchain-lead',
    sourceScope: ['Bittrees Capital / treasury workflows'],
    bittreesRelevance: 'high',
    defaultLane: 'treasury',
    requiredFields: [
      'chain_or_protocol',
      'read_only_question_or_action_request',
      'funds_or_signature_implications',
      'expected_output',
      'acceptance_criteria',
      'operator_approval_requirement',
      'validation_path',
      'out_of_scope',
    ],
    acceptanceCriteria: [
      'Read-only analysis is separated from any execution request.',
      'Any transfer, signature, deployment, or governance action requires explicit operator approval.',
      'Coder, researcher, onchain, and security review requirements are named before execution.',
    ],
    validationPath: ['coder', 'researcher', 'onchain-lead', 'security-router'],
    outOfScope: ['Portal-triggered signing', 'wallet custody', 'transaction broadcast', 'credential handling'],
    backlogPolicy: 'Speculative treasury ideas become backlog unless tied to an active approved objective.',
    sourceIds: ['memory:45', 'output:routing-matrix', 'output:agent-bittrees-portal-repo-readiness'],
    reviewedAt: REVIEWED_AT,
  },
];

const IDACC_RELEASES = [
  {
    version: 'v0.1.615',
    status: 'discoverable-not-install-approved',
    publishedAt: '2026-07-07T05:14:15Z',
    releaseUrl: 'https://github.com/bobofbuilding/idacc/releases/tag/v0.1.615',
    sourceRepository: 'https://github.com/bobofbuilding/idacc',
    sourceCommit: '2b3dd0b',
    notes: ['Automated release of outstanding ID Agents Control Center code.'],
    assets: [
      {
        name: 'ID-Agents-Control-Center-0.1.615-arm64.zip',
        platform: 'darwin-arm64',
        contentType: 'application/zip',
        sizeBytes: 102677733,
        sha256: 'd708188ff7160ba6b8f5e2909585f5d70f9889e1206a58a4e470b2a05a2291e5',
        downloadUrl:
          'https://github.com/bobofbuilding/idacc/releases/download/v0.1.615/ID-Agents-Control-Center-0.1.615-arm64.zip',
        installAllowedFromPortal: false,
        verificationStatus: 'hash-present-signature-pending-security-review',
      },
    ],
    owner: 'engineering-lead',
    reviewedAt: REVIEWED_AT,
    sourceIds: ['github:bobofbuilding/idacc/releases/latest:2026-07-07'],
  },
];

const CONTRIBUTION_INTENT_REQUEST_SCHEMA = {
  $schema: SCHEMA_URL,
  $id: `${PORTAL_BASE_URL}/schemas/contribution-intent-request.v1.json`,
  title: 'agent.bittrees.org contribution intent request',
  description:
    'Contract for a future contribution-intent submission. The launch portal documents this schema but does not accept live writes.',
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
    intentId: {
      type: 'string',
      minLength: 8,
      maxLength: 120,
      pattern: '^[a-z0-9][a-z0-9._:-]{6,118}[a-z0-9]$',
    },
    submittedAt: {
      type: 'string',
      format: 'date-time',
    },
    contributor: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'name', 'contactRoute'],
      properties: {
        kind: { enum: ['agent', 'human', 'team'] },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        agentId: { type: 'string', minLength: 1, maxLength: 160 },
        team: { type: 'string', minLength: 1, maxLength: 120 },
        contactRoute: { type: 'string', minLength: 1, maxLength: 300 },
      },
    },
    targetLane: {
      enum: CONTRIBUTION_LANES.map((lane) => lane.id),
    },
    summary: {
      type: 'string',
      minLength: 20,
      maxLength: 1200,
    },
    proposedTemplate: {
      enum: TEMPLATE_LIBRARY.map((template) => template.id),
    },
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
        acceptanceCriteria: {
          type: 'array',
          items: { type: 'string', minLength: 5, maxLength: 400 },
          minItems: 1,
          maxItems: 10,
        },
        outOfScope: {
          type: 'array',
          items: { type: 'string', minLength: 3, maxLength: 300 },
          minItems: 1,
          maxItems: 10,
        },
        backlogPolicy: { type: 'string', minLength: 10, maxLength: 600 },
        sourceIds: {
          type: 'array',
          items: { type: 'string', minLength: 1, maxLength: 160 },
          maxItems: 20,
        },
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
  description: 'Response contract for the contribution-intent route.',
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
    errors: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

const CONTRIBUTION_INTENT_CONTRACT = {
  schema: 'agent.bittrees.contribution-intent.contract.v1',
  endpoint: '/contribution-intents',
  methods: ['GET', 'HEAD', 'POST'],
  launchStatus: 'contract-only-disabled',
  requestSchema: CONTRIBUTION_INTENT_REQUEST_SCHEMA,
  responseSchema: CONTRIBUTION_INTENT_RESPONSE_SCHEMA,
  disabledResponse: {
    statusCode: 501,
    schema: 'agent.bittrees.contribution-intent.response.v1',
    status: 'not_implemented',
    accepted: false,
    liveWrite: false,
    message:
      'Contribution-intent submission is documented but disabled until security-router clears live write handling.',
    nextStep: 'Use this schema for offline handoff packets; do not POST secrets, credentials, wallet data, or live execution requests.',
  },
  securityGate: READ_ONLY_LAUNCH_POSTURE,
  reviewedAt: REVIEWED_AT,
  sourceIds: ['memory:642', 'output:agent-bittrees-portal-repo-readiness'],
};

function buildStringArraySchema(description, minItems = 1) {
  return {
    type: 'array',
    description,
    items: { type: 'string' },
    minItems,
  };
}

const sourceRecordSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'owner', 'url', 'retrievedAt', 'notes'],
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    owner: { type: 'string' },
    url: { type: 'string' },
    retrievedAt: { type: 'string' },
    notes: buildStringArraySchema('Source-specific notes.'),
  },
};

const reviewStateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reviewedAt', 'nextReviewDue', 'reviewOwner', 'validationStatus', 'goalId', 'sourceIds'],
  properties: {
    reviewedAt: { type: 'string' },
    nextReviewDue: { type: 'string' },
    reviewOwner: { type: 'string' },
    validationStatus: { type: 'string' },
    goalId: { type: 'string' },
    sourceIds: buildStringArraySchema('Source IDs used for this reviewed route.'),
  },
};

function buildDataSchema({ id, title, description, required, properties }) {
  return {
    $schema: SCHEMA_URL,
    $id: `${PORTAL_BASE_URL}/schemas/${id}.json`,
    title,
    description,
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'status', 'review', 'sources', ...required],
    properties: {
      schema: { type: 'string' },
      status: { type: 'string' },
      review: reviewStateSchema,
      sources: {
        type: 'array',
        items: sourceRecordSchema,
        minItems: 1,
      },
      ...properties,
    },
  };
}

function buildLlmsData() {
  const contributionIntentGate = buildContributionIntentSecurityGate();
  const liveWritesEnabled = contributionIntentGate.liveWritesEnabled === true;

  return {
    schema: 'agent.bittrees.llms.v1',
    status: 'active-static-reviewed',
    review: REVIEW_STATE,
    sources: SOURCE_RECORDS,
    portal: {
      name: 'agent.bittrees.org',
      baseUrl: PORTAL_BASE_URL,
      purpose:
        'Source-grounded onboarding and machine-readable discovery for agents contributing to Bittrees-scoped work.',
      launchPosture: contributionIntentGate,
    },
    instructions: [
      'Use this portal as a static discovery layer, not as an authority to submit live work.',
      liveWritesEnabled
        ? 'Route contribution intent through the documented schema only; feature-flagged non-production POST writes persist local review artifacts and queue fleet notifications.'
        : 'Route contribution intent through the documented schema only; POST defaults to 501 until non-production write capture is explicitly enabled.',
      'Do not infer public Bittrees identity, authorization, trust, wallet authority, or legal authority from a route listing.',
      'Use owner routes and validation paths when handing work to IDACC-managed agents.',
    ],
    routes: [
      {
        path: '/agents.json',
        schema: 'agent.bittrees.agents.v1',
        purpose: 'Reviewed static snapshot of contribution lanes, owner routes, and dispatch-ready agents.',
        owner: 'engineering-team/architecture-engineer',
      },
      {
        path: '/templates.json',
        schema: 'agent.bittrees.templates.v1',
        purpose: 'Reusable Bittrees-scoped task templates with acceptance and validation requirements.',
        owner: 'engineering-team/architecture-engineer',
      },
      {
        path: '/idacc/releases.json',
        schema: 'agent.bittrees.idacc-releases.v1',
        purpose: 'IDACC release discovery metadata with integrity and install-approval status.',
        owner: 'engineering-lead',
      },
      {
        path: '/contribution-intents',
        schema: 'agent.bittrees.contribution-intent.contract.v1',
        purpose: liveWritesEnabled
          ? 'Documented submission contract; feature-flagged POST writes persist local review artifacts and queue fleet notifications.'
          : 'Documented submission contract; POST defaults to 501 until non-production write capture is enabled.',
        owner: 'technology-security/security-router',
      },
    ],
    sourceScope: SOURCE_SCOPE,
  };
}

const agentsData = {
  schema: 'agent.bittrees.agents.v1',
  status: 'active-static-reviewed',
  review: REVIEW_STATE,
  sources: SOURCE_RECORDS.filter((source) =>
    ['memory:642', 'output:idacc-contributor-lane-map', 'manager:/agents-snapshot:2026-07-07'].includes(source.id),
  ),
  sourceScope: SOURCE_SCOPE,
  lanes: CONTRIBUTION_LANES,
  teams: TEAM_SUMMARIES,
  agents: ACTIVE_AGENT_SNAPSHOT.map((agent) => ({
    reviewedAt: REVIEWED_AT,
    ...agent,
  })),
  caveats: [
    'This is a reviewed snapshot, not a live manager inventory feed.',
    'dispatchReady only means the manager snapshot showed running/online at review time.',
    'Stopped specialist owners remain the correct authority route for their domains even when not immediately dispatch-ready.',
  ],
};

const templatesData = {
  schema: 'agent.bittrees.templates.v1',
  status: 'active-static-reviewed',
  review: REVIEW_STATE,
  sources: SOURCE_RECORDS.filter((source) =>
    [
      'memory:642',
      'memory:639',
      'output:idacc-contributor-lane-map',
      'output:agent-bittrees-portal-repo-readiness',
    ].includes(source.id),
  ),
  sourceScope: SOURCE_SCOPE,
  templates: TEMPLATE_LIBRARY,
  requiredTemplateFields: [
    'scope',
    'acceptanceCriteria',
    'bittreesRelevance',
    'outOfScope',
    'backlogPolicy',
    'owner',
    'validationPath',
    'sourceIds',
    'reviewedAt',
  ],
  contributionIntentDefaults: {
    endpoint: CONTRIBUTION_INTENT_CONTRACT.endpoint,
    launchStatus: CONTRIBUTION_INTENT_CONTRACT.launchStatus,
    acceptedLiveSubmission: false,
    requestSchemaId: CONTRIBUTION_INTENT_REQUEST_SCHEMA.$id,
  },
};

const idaccReleasesData = {
  schema: 'agent.bittrees.idacc-releases.v1',
  status: 'active-static-reviewed-install-gated',
  review: REVIEW_STATE,
  sources: SOURCE_RECORDS.filter((source) =>
    [
      'memory:642',
      'github:bobofbuilding/idacc/releases/latest:2026-07-07',
      'output:agent-bittrees-portal-repo-readiness',
    ].includes(source.id),
  ),
  project: {
    id: 'idacc',
    name: 'ID Agents Control Center',
    repository: 'https://github.com/bobofbuilding/idacc',
    relationToIdAgents:
      'Control client for an id-agents manager; it observes and commands a running manager rather than owning manager state.',
    owner: 'engineering-lead',
  },
  releases: IDACC_RELEASES,
  installPolicy: {
    portalInstallAllowed: false,
    reason:
      'Release is discoverable, but portal install/download promotion remains blocked until security-router clears release integrity and endpoint controls.',
    requiredBeforeInstallPromotion: [
      'Signed release artifacts or an approved equivalent verification policy.',
      'Hash manifest review against the published assets.',
      'Security-router review of download and update UX.',
      'Secret-scan and client-bundle review before public launch.',
    ],
  },
  securityGate: READ_ONLY_LAUNCH_POSTURE,
};

function buildContributionIntentContractData() {
  const liveWritesEnabled = isContributionIntentsWriteEnabled();
  const securityGate = buildContributionIntentSecurityGate();

  return {
    schema: 'agent.bittrees.contribution-intent.contract.v1',
    status: liveWritesEnabled ? 'feature-flag-live-write-enabled' : 'contract-only-disabled',
    review: REVIEW_STATE,
    sources: SOURCE_RECORDS.filter((source) =>
      ['memory:642', 'output:agent-bittrees-portal-repo-readiness'].includes(source.id),
    ),
    contract: {
      ...CONTRIBUTION_INTENT_CONTRACT,
      launchStatus: liveWritesEnabled ? 'feature-flag-live-write-enabled' : 'contract-only-disabled',
      securityGate,
      featureFlag: {
        name: CONTRIBUTION_INTENTS_WRITE_FLAG_NAMES[0],
        aliases: CONTRIBUTION_INTENTS_WRITE_FLAG_NAMES.slice(1),
        enabled: liveWritesEnabled,
      },
    },
  };
}

function buildRouteDefinition({ path, label, title, description, schema, data, methods = ['GET', 'HEAD'] }) {
  return {
    path,
    label,
    title,
    description,
    schema,
    data,
    methods,
    stub: false,
  };
}

export const ROUTE_DEFINITIONS = [
  {
    path: '/',
    label: 'Landing page',
    title: 'agent.bittrees.org landing page',
    description: 'Human-facing overview for the static agent.bittrees.org portal.',
    methods: ['GET', 'HEAD'],
  },
  buildRouteDefinition({
    path: '/llms.txt',
    label: 'llms.txt',
    title: 'agent.bittrees.org llms.txt data',
    description: 'Agent-readable route index, launch posture, source scope, and integration instructions.',
    schema: buildDataSchema({
      id: 'llms.v1',
      title: 'agent.bittrees.org llms.txt data schema',
      description: 'Schema for the JSON-encoded llms.txt route.',
      required: ['portal', 'instructions', 'routes', 'sourceScope'],
      properties: {
        portal: { type: 'object' },
        instructions: buildStringArraySchema('Agent crawler instructions.'),
        routes: { type: 'array', items: { type: 'object' }, minItems: 1 },
        sourceScope: buildStringArraySchema('Approved Bittrees source scope.'),
      },
    }),
    data: buildLlmsData,
  }),
  buildRouteDefinition({
    path: '/agents.json',
    label: 'agents.json',
    title: 'agent.bittrees.org agents data',
    description: 'Reviewed static snapshot of contribution lanes, owner routes, teams, and agents.',
    schema: buildDataSchema({
      id: 'agents.v1',
      title: 'agent.bittrees.org agents data schema',
      description: 'Schema for contribution lane and agent routing discovery.',
      required: ['sourceScope', 'lanes', 'teams', 'agents', 'caveats'],
      properties: {
        sourceScope: buildStringArraySchema('Approved Bittrees source scope.'),
        lanes: { type: 'array', items: { type: 'object' }, minItems: 1 },
        teams: { type: 'array', items: { type: 'object' }, minItems: 1 },
        agents: { type: 'array', items: { type: 'object' }, minItems: 1 },
        caveats: buildStringArraySchema('Snapshot caveats.'),
      },
    }),
    data: agentsData,
  }),
  buildRouteDefinition({
    path: '/templates.json',
    label: 'templates.json',
    title: 'agent.bittrees.org templates data',
    description: 'Reusable Bittrees-scoped task and handoff templates.',
    schema: buildDataSchema({
      id: 'templates.v1',
      title: 'agent.bittrees.org templates data schema',
      description: 'Schema for reviewed template library metadata.',
      required: ['sourceScope', 'templates', 'requiredTemplateFields', 'contributionIntentDefaults'],
      properties: {
        sourceScope: buildStringArraySchema('Approved Bittrees source scope.'),
        templates: { type: 'array', items: { type: 'object' }, minItems: 1 },
        requiredTemplateFields: buildStringArraySchema('Fields every template must expose.'),
        contributionIntentDefaults: { type: 'object' },
      },
    }),
    data: templatesData,
  }),
  buildRouteDefinition({
    path: '/idacc/releases.json',
    label: 'idacc/releases.json',
    title: 'agent.bittrees.org IDACC releases data',
    description: 'IDACC release discovery metadata with integrity and install-gate status.',
    schema: buildDataSchema({
      id: 'idacc-releases.v1',
      title: 'agent.bittrees.org IDACC releases data schema',
      description: 'Schema for IDACC release discovery metadata.',
      required: ['project', 'releases', 'installPolicy', 'securityGate'],
      properties: {
        project: { type: 'object' },
        releases: { type: 'array', items: { type: 'object' }, minItems: 1 },
        installPolicy: { type: 'object' },
        securityGate: { type: 'object' },
      },
    }),
    data: idaccReleasesData,
  }),
  buildRouteDefinition({
    path: '/contribution-intents',
    label: 'contribution-intents',
    title: 'agent.bittrees.org contribution intent contract',
    description: 'Documented contribution-intent submission contract; POST defaults to 501 and can be feature-flag enabled for non-production review capture.',
    schema: buildDataSchema({
      id: 'contribution-intent-contract.v1',
      title: 'agent.bittrees.org contribution intent contract schema',
      description: 'Schema for the contribution-intent contract route.',
      required: ['contract'],
      properties: {
        contract: { type: 'object' },
      },
    }),
    data: buildContributionIntentContractData,
    methods: ['GET', 'HEAD', 'POST'],
  }),
];

export const ROUTE_MAP = new Map(ROUTE_DEFINITIONS.slice(1).map((definition) => [definition.path, definition]));
const CANONICAL_ROUTE_PATHS = new Set([ROBOTS_TXT_PATH, ...ROUTE_DEFINITIONS.map((definition) => definition.path)]);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildCanonicalUrl(pathname) {
  return new URL(pathname, PORTAL_BASE_URL).toString();
}

export function normalizeCanonicalPath(pathname) {
  if (pathname === '/') {
    return pathname;
  }

  const normalizedPath = pathname.replace(/\/+$/, '');
  return normalizedPath === '' ? '/' : normalizedPath;
}

export function renderLandingPage() {
  const contributionIntentGate = buildContributionIntentSecurityGate();
  const liveWritesEnabled = contributionIntentGate.liveWritesEnabled === true;
  const routeCards = ROUTE_DEFINITIONS.slice(1)
    .map(
      (definition) => `
        <article class="card">
          <p class="card-kicker">${escapeHtml(definition.label)}</p>
          <h2>${escapeHtml(definition.path)}</h2>
          <p>${escapeHtml(definition.description)}</p>
        </article>
      `,
    )
    .join('');

  const sourceScopeItems = SOURCE_SCOPE.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const noGoItems = READ_ONLY_LAUNCH_POSTURE.noGoItems
    .map((item) => `<li>${escapeHtml(item.label)}: ${escapeHtml(item.status)}</li>`)
    .join('');
  const heroCopy = liveWritesEnabled
    ? 'This launch draft publishes reviewed machine-readable manifests for Bittrees-scoped contribution lanes, reusable task templates, and IDACC release discovery. A feature-flagged non-production intake path is enabled: contribution intent submissions are validated, persisted locally, and queued for fleet review.'
    : 'This launch draft publishes reviewed machine-readable manifests for Bittrees-scoped contribution lanes, reusable task templates, and IDACC release discovery. The portal is intentionally read-only: contribution intent is documented as a schema and route contract, but live submission writes are disabled pending security-router clearance.';
  const launchPostureCopy = liveWritesEnabled
    ? 'Feature-flag intake capture is enabled for non-production review, while public launch, install promotion, and broader security clearance remain blocked until the open security gate clears.'
    : 'Live writes, install promotion, and public launch remain blocked until the open security gate clears.';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="canonical" href="${PORTAL_BASE_URL}/" />
    <meta name="robots" content="noindex,nofollow" />
    <title>agent.bittrees.org</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0a1219;
        --bg-2: #162018;
        --panel: rgba(11, 20, 26, 0.86);
        --text: #f4f7ef;
        --muted: #bdc8b9;
        --accent: #65e0b7;
        --accent-2: #f0cf75;
        --border: rgba(255, 255, 255, 0.14);
        --shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
      }

      * { box-sizing: border-box; }
      html, body { min-height: 100%; }
      body {
        margin: 0;
        color: var(--text);
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        background:
          linear-gradient(140deg, rgba(101, 224, 183, 0.16), transparent 34%),
          linear-gradient(220deg, rgba(240, 207, 117, 0.13), transparent 30%),
          linear-gradient(160deg, var(--bg), var(--bg-2));
      }

      main {
        position: relative;
        max-width: 1120px;
        margin: 0 auto;
        padding: 64px 24px 56px;
      }

      .hero {
        display: grid;
        gap: 24px;
        padding: 32px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--panel);
        box-shadow: var(--shadow);
      }

      .eyebrow {
        margin: 0 0 14px;
        color: var(--accent);
        letter-spacing: 0;
        text-transform: uppercase;
        font-size: 0.78rem;
      }

      h1 {
        margin: 0;
        max-width: 12ch;
        font-size: clamp(2.8rem, 8vw, 5.4rem);
        line-height: 0.98;
        letter-spacing: 0;
      }

      .lede {
        max-width: 72ch;
        margin: 0;
        color: var(--muted);
        font-size: 1.05rem;
        line-height: 1.72;
      }

      .grid,
      .sections {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
        margin-top: 18px;
      }

      .card,
      .section {
        padding: 18px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: rgba(10, 16, 22, 0.72);
      }

      .card h2,
      .section h2 {
        margin: 0 0 10px;
        font-size: 1.05rem;
      }

      .card p,
      .section p,
      .section li {
        margin: 0;
        color: var(--muted);
        line-height: 1.65;
      }

      .card-kicker {
        margin: 0 0 10px;
        color: var(--accent);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0;
      }

      .section ul {
        margin: 10px 0 0;
        padding-left: 18px;
      }

      .pill-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 8px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 7px 12px;
        border-radius: 8px;
        border: 1px solid rgba(101, 224, 183, 0.28);
        background: rgba(101, 224, 183, 0.08);
        color: var(--text);
        text-decoration: none;
        font-size: 0.9rem;
      }

      .footer-note {
        margin-top: 12px;
        color: var(--muted);
        font-size: 0.94rem;
      }

      @media (max-width: 720px) {
        main { padding: 20px; }
        .hero { padding: 22px; }
        h1 { max-width: 100%; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero" aria-labelledby="hero-title">
        <div>
          <p class="eyebrow">agent.bittrees.org static discovery portal</p>
          <h1 id="hero-title">Bittrees contribution discovery for agents.</h1>
        </div>
        <p class="lede">${escapeHtml(heroCopy)}</p>
        <div class="pill-row" aria-label="Machine-readable routes">
          <a class="pill" href="/llms.txt">/llms.txt</a>
          <a class="pill" href="/agents.json">/agents.json</a>
          <a class="pill" href="/templates.json">/templates.json</a>
          <a class="pill" href="/idacc/releases.json">/idacc/releases.json</a>
          <a class="pill" href="/contribution-intents">/contribution-intents</a>
        </div>
      </section>

      <section class="sections" aria-label="Portal notes">
        <article class="section">
          <h2>Source-aware scope</h2>
          <p>Static content is limited to reviewed Bittrees source areas.</p>
          <ul>
            ${sourceScopeItems}
          </ul>
        </article>
        <article class="section">
          <h2>Launch posture</h2>
          <p>${escapeHtml(launchPostureCopy)}</p>
          <ul>
            ${noGoItems}
          </ul>
          <p class="footer-note">Last reviewed: ${escapeHtml(REVIEWED_AT)}.</p>
        </article>
      </section>

      <section class="grid" aria-label="Discovery routes">
        ${routeCards}
      </section>
    </main>
  </body>
</html>`;
}

export function buildDiscoveryResponse(routeDefinition, generatedAt = new Date().toISOString()) {
  return {
    $schema: SCHEMA_URL,
    route: routeDefinition.path,
    canonicalUrl: buildCanonicalUrl(routeDefinition.path),
    generatedAt,
    stub: routeDefinition.stub ?? false,
    schema: routeDefinition.schema,
    data: typeof routeDefinition.data === 'function' ? routeDefinition.data({ generatedAt }) : routeDefinition.data,
  };
}

function buildContributionIntentResponse({
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
    route: CONTRIBUTION_INTENT_CONTRACT.endpoint,
    canonicalUrl: buildCanonicalUrl(CONTRIBUTION_INTENT_CONTRACT.endpoint),
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

function buildContributionIntentDisabledResponse() {
  return buildContributionIntentResponse({
    status: CONTRIBUTION_INTENT_CONTRACT.disabledResponse.status,
    accepted: CONTRIBUTION_INTENT_CONTRACT.disabledResponse.accepted,
    liveWrite: CONTRIBUTION_INTENT_CONTRACT.disabledResponse.liveWrite,
    message: CONTRIBUTION_INTENT_CONTRACT.disabledResponse.message,
    nextStep: CONTRIBUTION_INTENT_CONTRACT.disabledResponse.nextStep,
  });
}

function buildContributionIntentAcceptedResponse(receiptId, nextStep) {
  return buildContributionIntentResponse({
    status: 'accepted',
    accepted: true,
    liveWrite: true,
    receiptId,
    nextStep,
    message: 'Contribution intent accepted, persisted, and fleet notification queued.',
  });
}

function buildContributionIntentRejectedResponse(message, nextStep, errors = []) {
  return buildContributionIntentResponse({
    status: 'rejected',
    accepted: false,
    liveWrite: true,
    message,
    nextStep,
    errors,
  });
}

function buildContributionIntentAcceptanceNextStep(notificationRecord) {
  const primaryRoute = notificationRecord.ownerRoute || notificationRecord.requestedOwnerRoute;
  const targetList = Array.isArray(notificationRecord.targets) ? notificationRecord.targets.filter(Boolean) : [];
  const targetText = targetList.length ? ` Notification targets: ${targetList.join(', ')}.` : '';

  if (primaryRoute) {
    return `Lead review has been queued for ${primaryRoute}.${targetText} Use the receipt ID to correlate stored submission and fleet-notification records.`;
  }

  return `Lead review has been queued.${targetText} Use the receipt ID to correlate stored submission and fleet-notification records.`;
}

function logTelemetryRequest({ timestamp = new Date().toISOString(), method, path, status }) {
  console.log(JSON.stringify({ timestamp, method, path, status }));
}

function sendResponse(res, statusCode, headers, body, includeBody = true, telemetry = null) {
  const payload = body ?? '';
  res.writeHead(statusCode, {
    ...headers,
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(includeBody ? payload : undefined);

  if (telemetry) {
    logTelemetryRequest(telemetry);
  }
}

function sendJson(res, statusCode, body, includeBody = true, telemetry = null) {
  return sendResponse(
    res,
    statusCode,
    {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
    `${JSON.stringify(body, null, 2)}\n`,
    includeBody,
    telemetry,
  );
}

function sendHtml(res, statusCode, body, includeBody = true, telemetry = null) {
  return sendResponse(
    res,
    statusCode,
    {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
    body,
    includeBody,
    telemetry,
  );
}

function sendText(res, statusCode, body, includeBody = true, telemetry = null) {
  return sendResponse(
    res,
    statusCode,
    {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
    body,
    includeBody,
    telemetry,
  );
}

function sendRedirect(res, statusCode, location, telemetry = null) {
  return sendResponse(
    res,
    statusCode,
    {
      Location: location,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
    '',
    false,
    telemetry,
  );
}

const CONTRIBUTION_INTENT_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{6,118}[a-z0-9]$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pushUnknownKeys(errors, value, allowedKeys, path) {
  const allowed = new Set(allowedKeys);

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(`${path}.${key} is not allowed.`);
    }
  }
}

function validateStringField(errors, value, path, { minLength = 0, maxLength = Number.POSITIVE_INFINITY, pattern, allowedValues } = {}) {
  if (typeof value !== 'string') {
    errors.push(`${path} must be a string.`);
    return false;
  }

  if (value.length < minLength) {
    errors.push(`${path} must be at least ${minLength} characters.`);
  }

  if (value.length > maxLength) {
    errors.push(`${path} must be at most ${maxLength} characters.`);
  }

  if (pattern && !pattern.test(value)) {
    errors.push(`${path} has an invalid format.`);
  }

  if (allowedValues && !allowedValues.includes(value)) {
    errors.push(`${path} must be one of: ${allowedValues.join(', ')}.`);
  }

  return true;
}

function validateStringArrayField(errors, value, path, { minItems = 0, maxItems = Number.POSITIVE_INFINITY, minLength = 1, maxLength = 400 } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return false;
  }

  if (value.length < minItems) {
    errors.push(`${path} must include at least ${minItems} item(s).`);
  }

  if (value.length > maxItems) {
    errors.push(`${path} must include at most ${maxItems} item(s).`);
  }

  value.forEach((item, index) => {
    validateStringField(errors, item, `${path}[${index}]`, { minLength, maxLength });
  });

  return true;
}

function validateContributionIntentRequest(payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      errors: ['Request body must be a JSON object.'],
    };
  }

  pushUnknownKeys(errors, payload, CONTRIBUTION_INTENT_REQUEST_SCHEMA.required.concat(['schema', 'intentId', 'submittedAt', 'contributor', 'targetLane', 'summary', 'proposedTemplate', 'handoff', 'safety']), 'body');
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
      allowedValues: ['agent', 'human', 'team'],
    });
    validateStringField(errors, payload.contributor.name, 'body.contributor.name', {
      minLength: 1,
      maxLength: 120,
    });
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
  validateStringField(errors, payload.summary, 'body.summary', {
    minLength: 20,
    maxLength: 1200,
  });
  validateStringField(errors, payload.proposedTemplate, 'body.proposedTemplate', {
    allowedValues: TEMPLATE_LIBRARY.map((template) => template.id),
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
      validateStringField(errors, payload.handoff.goalId, 'body.handoff.goalId', {
        minLength: 1,
        maxLength: 120,
      });
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
    if (payload.safety.noSecretsIncluded !== true) {
      errors.push('body.safety.noSecretsIncluded must be true.');
    }
    if (payload.safety.noLiveWriteAcknowledged !== true) {
      errors.push('body.safety.noLiveWriteAcknowledged must be true.');
    }
    if (payload.safety.noOnchainActionRequested !== true) {
      errors.push('body.safety.noOnchainActionRequested must be true.');
    }
  }

  const laneDefinition = CONTRIBUTION_LANES.find((lane) => lane.id === payload.targetLane);
  const templateDefinition = TEMPLATE_LIBRARY.find((template) => template.id === payload.proposedTemplate);

  return {
    ok: errors.length === 0,
    errors,
    laneDefinition,
    templateDefinition,
    normalized: {
      ...payload,
      contributor: isPlainObject(payload.contributor) ? { ...payload.contributor } : payload.contributor,
      handoff: isPlainObject(payload.handoff) ? { ...payload.handoff } : payload.handoff,
      safety: isPlainObject(payload.safety) ? { ...payload.safety } : payload.safety,
    },
  };
}

function readRequestText(req, maxBytes = 1024 * 1024) {
  if (typeof req.body === 'string') {
    return Promise.resolve(req.body);
  }

  if (Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body.toString('utf8'));
  }

  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(JSON.stringify(req.body));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    req.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;

      if (totalBytes > maxBytes) {
        reject(Object.assign(new Error('Request body exceeds the 1 MiB limit.'), { statusCode: 413 }));
        req.destroy?.();
        return;
      }

      chunks.push(buffer);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', reject);
  });
}

function buildContributionIntentSubmissionRecord({ receiptId, receivedAt, requestBody, laneDefinition, templateDefinition, notificationRecord, storagePaths }) {
  return {
    schema: 'agent.bittrees.contribution-intent.submission.v1',
    receiptId,
    receivedAt,
    featureFlag: {
      name: CONTRIBUTION_INTENTS_WRITE_FLAG_NAMES[0],
      enabled: true,
    },
    request: requestBody,
    lane: laneDefinition
      ? {
          id: laneDefinition.id,
          label: laneDefinition.label,
          ownerRoute: laneDefinition.ownerRoute,
          fallbackRoute: laneDefinition.fallbackRoute,
          validationPath: laneDefinition.validationPath,
        }
      : null,
    template: templateDefinition
      ? {
          id: templateDefinition.id,
          name: templateDefinition.name,
          owner: templateDefinition.owner,
          validationPath: templateDefinition.validationPath,
        }
      : null,
    persistence: {
      storageDir: storagePaths.storageDir,
      submissionsLogPath: storagePaths.submissionsLogPath,
      notificationsLogPath: storagePaths.notificationsLogPath,
    },
    fleetNotification: notificationRecord,
  };
}

function buildFleetNotificationRecord({ receiptId, receivedAt, requestBody, laneDefinition, templateDefinition }) {
  const targets = new Set([
    requestBody?.handoff?.requestedOwnerRoute,
    laneDefinition?.ownerRoute,
    laneDefinition?.fallbackRoute,
    ...(laneDefinition?.validationPath ?? []),
  ]);

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
    validationPath: laneDefinition?.validationPath ?? [],
    ownerRoute: laneDefinition?.ownerRoute ?? null,
    fallbackRoute: laneDefinition?.fallbackRoute ?? null,
    targets: Array.from(targets).filter(Boolean),
    sourceIds: requestBody.handoff.sourceIds ?? [],
    template: templateDefinition
      ? {
          id: templateDefinition.id,
          name: templateDefinition.name,
          owner: templateDefinition.owner,
        }
      : null,
    featureFlag: {
      name: CONTRIBUTION_INTENTS_WRITE_FLAG_NAMES[0],
      enabled: true,
    },
  };
}

async function persistContributionIntentArtifacts(storagePaths, submissionRecord, notificationRecord) {
  await mkdir(storagePaths.storageDir, { recursive: true });
  await appendFile(storagePaths.submissionsLogPath, `${JSON.stringify(submissionRecord)}\n`);
  await appendFile(storagePaths.notificationsLogPath, `${JSON.stringify(notificationRecord)}\n`);
}

export function buildPortalManifest(generatedAt = new Date().toISOString()) {
  return {
    name: 'agent.bittrees.org portal scaffold',
    generatedAt,
    sourceScope: [...SOURCE_SCOPE],
    launchPosture: buildContributionIntentSecurityGate(),
    routes: ROUTE_DEFINITIONS.map((definition) => ({
      path: definition.path,
      label: definition.label,
      description: definition.description ?? 'Landing page',
      kind: definition.path === '/' ? 'html' : 'json',
      methods: definition.methods,
      stub: definition.stub ?? false,
      schemaTitle: definition.schema?.title ?? null,
    })),
  };
}

export function buildStaticAssets(generatedAt = new Date().toISOString()) {
  const routeAssets = ROUTE_DEFINITIONS.slice(1).map((definition) => ({
    path: definition.path.replace(/^\//, ''),
    body: `${JSON.stringify(buildDiscoveryResponse(definition, generatedAt), null, 2)}\n`,
  }));

  return [
    {
      path: 'index.html',
      body: renderLandingPage(),
    },
    {
      path: ROBOTS_TXT_PATH.replace(/^\//, ''),
      body: ROBOTS_TXT_BODY,
    },
    ...routeAssets,
    {
      path: 'portal-manifest.json',
      body: `${JSON.stringify(buildPortalManifest(generatedAt), null, 2)}\n`,
    },
  ];
}

async function handleContributionIntentPost(req, res, includeBody, telemetry) {
  if (!isContributionIntentsWriteEnabled()) {
    req.resume?.();
    return sendJson(res, 501, buildContributionIntentDisabledResponse(), includeBody, {
      ...telemetry,
      status: 501,
    });
  }

  let requestText = '';

  try {
    requestText = await readRequestText(req);
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
    return sendJson(
      res,
      statusCode,
      buildContributionIntentRejectedResponse(
        statusCode === 413
          ? 'Contribution intent rejected because the request body exceeded the 1 MiB limit.'
          : 'Contribution intent rejected because the request body could not be read.',
        'Submit a valid JSON body no larger than 1 MiB that matches the documented schema.',
      ),
      includeBody,
      {
        ...telemetry,
        status: statusCode,
      },
    );
  }

  let payload = null;

  try {
    payload = JSON.parse(requestText);
  } catch {
    return sendJson(
      res,
      400,
      buildContributionIntentRejectedResponse(
        'Contribution intent rejected because the request body was not valid JSON.',
        'Submit a JSON object that matches the documented request schema.',
        ['Request body must be valid JSON.'],
      ),
      includeBody,
      {
        ...telemetry,
        status: 400,
      },
    );
  }

  const validation = validateContributionIntentRequest(payload);

  if (!validation.ok) {
    return sendJson(
      res,
      400,
      buildContributionIntentRejectedResponse(
        'Contribution intent rejected because the request body did not match the documented schema.',
        'Fix the validation errors and resubmit the contribution intent.',
        validation.errors,
      ),
      includeBody,
      {
        ...telemetry,
        status: 400,
      },
    );
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
  } catch (error) {
    console.error('Contribution intent persistence failed:', error);
    return sendJson(
      res,
      500,
      buildContributionIntentRejectedResponse(
        'Contribution intent could not be persisted for lead review.',
        'Retry later or contact the owning lead if the error persists.',
      ),
      includeBody,
      {
        ...telemetry,
        status: 500,
      },
    );
  }

  return sendJson(
    res,
    202,
    buildContributionIntentAcceptedResponse(
      receiptId,
      buildContributionIntentAcceptanceNextStep(notificationRecord),
    ),
    includeBody,
    {
      ...telemetry,
      status: 202,
    },
  );
}

export function createRequestHandler() {
  return async function handleRequest(req, res) {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const includeBody = req.method !== 'HEAD';
    const pathname = requestUrl.pathname;
    const telemetry = { method: req.method ?? 'GET', path: pathname };

    if (req.method !== 'GET' && req.method !== 'HEAD' && !(pathname === '/contribution-intents' && req.method === 'POST')) {
      req.resume();
    }

    const normalizedPath = normalizeCanonicalPath(pathname);
    if (pathname !== normalizedPath && CANONICAL_ROUTE_PATHS.has(normalizedPath)) {
      return sendRedirect(res, 301, `${normalizedPath}${requestUrl.search}`, {
        ...telemetry,
        status: 301,
      });
    }

    const routeDefinition = ROUTE_MAP.get(pathname);

    if (pathname === ROBOTS_TXT_PATH) {
      return sendText(res, 200, ROBOTS_TXT_BODY, includeBody, {
        ...telemetry,
        status: 200,
      });
    }

    if (pathname === '/contribution-intents' && req.method === 'POST') {
      return handleContributionIntentPost(req, res, includeBody, telemetry);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(
        res,
        405,
        {
          $schema: SCHEMA_URL,
          error: 'method_not_allowed',
          message: 'Only GET and HEAD are enabled, except POST /contribution-intents which is reserved for contribution-intent intake.',
          allowedMethods: ['GET', 'HEAD'],
          disabledSubmissionStub: {
            path: '/contribution-intents',
            method: 'POST',
            statusCode: 501,
          },
        },
        includeBody,
        {
          ...telemetry,
          status: 405,
        },
      );
    }

    if (pathname === '/') {
      return sendHtml(res, 200, renderLandingPage(), includeBody, {
        ...telemetry,
        status: 200,
      });
    }

    if (routeDefinition) {
      return sendJson(res, 200, buildDiscoveryResponse(routeDefinition), includeBody, {
        ...telemetry,
        status: 200,
      });
    }

    return sendJson(
      res,
      404,
      {
        $schema: SCHEMA_URL,
        error: 'not_found',
        message: 'No portal route exists at this path.',
        availableRoutes: ROUTE_DEFINITIONS.map((definition) => definition.path),
      },
      includeBody,
      {
        ...telemetry,
        status: 404,
      },
    );
  };
}
