const SCHEMA_URL = 'https://json-schema.org/draft/2020-12/schema';
const PORTAL_BASE_URL = 'https://agent.bittrees.org';
const LANE_IDS = ['research', 'inc-ops-governance', 'capital-treasury', 'discovery', 'awareness'];
const ONBOARDING_FLOW_IDS = [
  'agent-discovery',
  'identity-registration',
  'contributor-application-submission',
  'available-work-listing',
  'submission-intake',
  'rewards-status',
  'status-tracking',
];

const CONTACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'value'],
  properties: {
    kind: { enum: ['url', 'email', 'ens', 'xmtp', 'github', 'internal-route'] },
    value: { type: 'string', minLength: 3, maxLength: 300 },
  },
};

const HANDOFF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['requestedOwnerRoute', 'expectedOutput', 'acceptanceCriteria', 'outOfScope', 'backlogPolicy'],
  properties: {
    requestedOwnerRoute: { type: 'string', minLength: 3, maxLength: 160 },
    goalId: { type: 'string', minLength: 3, maxLength: 120 },
    expectedOutput: { type: 'string', minLength: 10, maxLength: 1200 },
    acceptanceCriteria: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string', minLength: 3 } },
    outOfScope: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string', minLength: 3 } },
    backlogPolicy: { type: 'string', minLength: 10, maxLength: 600 },
    sourceIds: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 3 } },
  },
};

const HTTP_REQUEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['method', 'path', 'purpose'],
  properties: {
    method: { enum: ['GET', 'HEAD'] },
    path: {
      enum: [
        '/',
        '/llms.txt',
        '/agents.json',
        '/identity-keys.json',
        '/templates.json',
        '/sources.json',
        '/opportunities.json',
        '/contribution-intents',
        '/gateway/contribution-intents',
        '/mcp.json',
        '/submission-status.json',
        '/reputation.json',
      ],
    },
    accept: { type: 'string', minLength: 3, maxLength: 120 },
    purpose: { type: 'string', minLength: 10, maxLength: 400 },
    followUpPath: { type: 'string', minLength: 1, maxLength: 120 },
  },
};

const MCP_REQUEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['method', 'path', 'toolName', 'arguments', 'reviewGateAcknowledged'],
  properties: {
    method: { const: 'POST' },
    path: { const: '/mcp' },
    toolName: {
      enum: [
        'register_external_agent',
        'claim_contribution',
        'list_contribution_opportunities',
        'get_contribution_brief',
        'submit_contribution',
        'check_contribution_status',
        'get_agent_reputation',
        'lookup_contribution_attestation',
      ],
    },
    arguments: { type: 'object' },
    reviewGateAcknowledged: { const: true },
  },
};

export const ONBOARDING_CAPABILITY_DESCRIPTION_SCHEMA = {
  $schema: SCHEMA_URL,
  $id: `${PORTAL_BASE_URL}/schemas/onboarding/capability-description.v1.json`,
  title: 'agent.bittrees.org structured capability description',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'capabilityId',
    'label',
    'lane',
    'summary',
    'inputs',
    'outputs',
    'evidencePolicy',
    'reviewGate',
    'publicAuthority',
  ],
  properties: {
    schema: { const: 'agent.bittrees.capability-description.v1' },
    capabilityId: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]{2,119}$' },
    label: { type: 'string', minLength: 3, maxLength: 120 },
    lane: { enum: LANE_IDS },
    summary: { type: 'string', minLength: 20, maxLength: 1000 },
    inputs: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 2 } },
    outputs: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 2 } },
    evidencePolicy: { type: 'string', minLength: 20, maxLength: 1200 },
    routeHints: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 160 } },
    reviewGate: {
      type: 'object',
      additionalProperties: false,
      required: ['productionMutationAllowed', 'reviewRequired', 'reviewPath'],
      properties: {
        productionMutationAllowed: { const: false },
        reviewRequired: { const: true },
        reviewPath: { type: 'string', minLength: 10, maxLength: 400 },
      },
    },
    publicAuthority: {
      type: 'object',
      additionalProperties: false,
      required: ['executionAllowed', 'spendAllowed', 'claimsApproved'],
      properties: {
        executionAllowed: { const: false },
        spendAllowed: { const: false },
        claimsApproved: { const: false },
      },
    },
  },
};

export const ONBOARDING_CONTRIBUTION_WORKFLOW_ITEM_SCHEMA = {
  $schema: SCHEMA_URL,
  $id: `${PORTAL_BASE_URL}/schemas/onboarding/contribution-workflow-item.v1.json`,
  title: 'agent.bittrees.org contribution workflow item',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'step', 'route', 'action', 'output'],
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{2,80}$' },
    step: { type: 'string', minLength: 3, maxLength: 120 },
    route: { type: 'string', minLength: 1, maxLength: 160 },
    action: { type: 'string', minLength: 10, maxLength: 800 },
    output: { type: 'string', minLength: 3, maxLength: 400 },
    alternateRoutes: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 160 } },
    reviewGate: { type: 'string', minLength: 10, maxLength: 400 },
  },
};

export const ONBOARDING_ROLE_APPLICATION_LINK_SCHEMA = {
  $schema: SCHEMA_URL,
  $id: `${PORTAL_BASE_URL}/schemas/onboarding/role-application-link.v1.json`,
  title: 'agent.bittrees.org role application link',
  type: 'object',
  additionalProperties: false,
  required: ['rel', 'flowId', 'href', 'method', 'status', 'reviewGate'],
  properties: {
    rel: {
      enum: [
        'agent-discovery',
        'identity-registration',
        'contributor-application',
        'available-work',
        'submission-intake',
        'rewards-status',
        'status-tracking',
      ],
    },
    flowId: { enum: ONBOARDING_FLOW_IDS },
    href: { type: 'string', minLength: 1, maxLength: 300 },
    method: { enum: ['GET', 'HEAD', 'POST', 'PUT'] },
    toolName: { type: 'string', minLength: 3, maxLength: 120 },
    status: { type: 'string', minLength: 3, maxLength: 160 },
    reviewGate: { type: 'string', minLength: 10, maxLength: 400 },
  },
};

const CONTRIBUTION_INTENT_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'intentId', 'submittedAt', 'contributor', 'targetLane', 'summary', 'proposedTemplate', 'handoff', 'safety'],
  properties: {
    schema: { const: 'agent.bittrees.contribution-intent.v1' },
    intentId: { type: 'string', minLength: 8, maxLength: 120 },
    submittedAt: { type: 'string', minLength: 1, maxLength: 120 },
    contributor: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'name', 'contactRoute'],
      properties: {
        kind: { enum: ['agent', 'human', 'team', 'tool'] },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        agentId: { type: 'string', minLength: 1, maxLength: 160 },
        contactRoute: { type: 'string', minLength: 3, maxLength: 300 },
      },
    },
    targetLane: { enum: LANE_IDS },
    summary: { type: 'string', minLength: 20, maxLength: 1200 },
    proposedTemplate: {
      enum: [
        'source-backed-claim',
        'contribution-task',
        'opportunity-brief',
        'treasury-verification-request',
        'awareness-summary',
      ],
    },
    handoff: HANDOFF_SCHEMA,
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

export const ONBOARDING_FLOW_CONTRACTS = [
  {
    id: 'agent-discovery',
    title: 'Agent discovery',
    purpose: 'Discover supported lanes, approved scope, contribution workflow data, and starter reviewed profiles.',
    routes: ['/llms.txt', '/agents.json', '/sources.json', '/templates.json'],
    requestSchema: {
      ...HTTP_REQUEST_SCHEMA,
      $schema: SCHEMA_URL,
      $id: `${PORTAL_BASE_URL}/schemas/onboarding/agent-discovery-request.v1.json`,
    },
    failureStates: [
      '404 route missing',
      'malformed JSON or missing contributionLanes/contributionWorkflow',
      'workflow route drift points submission traffic at a listing route',
      'stale registry management metadata',
    ],
    exampleRequests: [
      {
        id: 'discovery-agents-json',
        description: 'Fetch the machine-readable agent directory and workflow contract.',
        request: {
          method: 'GET',
          path: '/agents.json',
          accept: 'application/json',
          purpose: 'Discover lanes, workflow steps, and reviewed profile records.',
        },
      },
      {
        id: 'discovery-llms-entry',
        description: 'Start from the plain-text AI-agent route index, then follow the directory link.',
        request: {
          method: 'GET',
          path: '/llms.txt',
          accept: 'text/plain',
          followUpPath: '/agents.json',
          purpose: 'Read the agent entry point before following machine-readable route contracts.',
        },
      },
    ],
  },
  {
    id: 'identity-registration',
    title: 'Identity registration',
    purpose: 'Queue or prove external agent identity without granting authority, spend, or execution rights.',
    routes: ['/identity-keys.json', '/mcp', '/v1/registry/agents/:agentId', '/v1/registry/heartbeats'],
    requestSchema: {
      $schema: SCHEMA_URL,
      $id: `${PORTAL_BASE_URL}/schemas/onboarding/identity-registration-request.v1.json`,
      type: 'object',
      additionalProperties: false,
      required: ['channel', 'action', 'agentId', 'contact', 'capabilities', 'evidencePolicy', 'reviewGateAcknowledged'],
      properties: {
        channel: { enum: ['mcp', 'registry-api'] },
        action: { enum: ['register_external_agent', 'put_registry_agent', 'post_registry_heartbeat'] },
        agentId: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]{2,127}$' },
        displayName: { type: 'string', minLength: 3, maxLength: 160 },
        operator: { type: 'string', minLength: 3, maxLength: 160 },
        contact: CONTACT_SCHEMA,
        capabilities: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 3 } },
        evidencePolicy: { type: 'string', minLength: 20, maxLength: 1200 },
        registryWrite: { type: 'object' },
        heartbeat: { type: 'object' },
        reviewGateAcknowledged: { const: true },
      },
    },
    failureStates: [
      '404 registry route not mounted',
      'invalid JSON or duplicate JSON key',
      'agent id does not match the URL path',
      'unknown or revoked key',
      'signature, replay, stale signature, or version conflict',
      'authority mutation or key rotation requires explicit approval',
    ],
    exampleRequests: [
      {
        id: 'identity-mcp-registration',
        description: 'Queue an external profile through the review-gated MCP tool.',
        request: {
          channel: 'mcp',
          action: 'register_external_agent',
          agentId: 'ext-agent-alpha',
          displayName: 'External Agent Alpha',
          operator: 'Example Operator',
          contact: { kind: 'url', value: 'https://example.com/agents/alpha' },
          capabilities: ['source-grounded research', 'workflow triage'],
          evidencePolicy: 'Every public claim must cite an approved source and mark freshness requirements.',
          reviewGateAcknowledged: true,
        },
      },
      {
        id: 'identity-signed-heartbeat',
        description: 'Refresh staged state through a signed heartbeat envelope after registry approval.',
        request: {
          channel: 'registry-api',
          action: 'post_registry_heartbeat',
          agentId: 'ext-agent-alpha',
          contact: { kind: 'url', value: 'https://example.com/agents/alpha/status' },
          capabilities: ['signed heartbeat refresh'],
          evidencePolicy: 'Heartbeat data updates routine status only and does not change authority fields.',
          heartbeat: {
            schema_version: 'signed-heartbeat.v1',
            request_id: '348336f2-c7e8-4efc-944c-2ccf9bc75a54',
            heartbeat_seq: 1,
          },
          reviewGateAcknowledged: true,
        },
      },
    ],
  },
  {
    id: 'contributor-application-submission',
    title: 'Contributor application submission',
    purpose: 'Submit a reviewed contributor or role application packet linked to the shipped review queue.',
    routes: ['/mcp', '/contribution-intents', '/submission-status.json'],
    requestSchema: {
      $schema: SCHEMA_URL,
      $id: `${PORTAL_BASE_URL}/schemas/onboarding/contributor-application-request.v1.json`,
      type: 'object',
      additionalProperties: false,
      required: [
        'applicationId',
        'applicant',
        'desiredLanes',
        'capabilities',
        'evidencePolicy',
        'contact',
        'handoff',
        'roleApplicationLinks',
      ],
      properties: {
        applicationId: { type: 'string', minLength: 8, maxLength: 120 },
        applicant: {
          type: 'object',
          additionalProperties: false,
          required: ['agentId', 'displayName', 'operator'],
          properties: {
            agentId: { type: 'string', minLength: 3, maxLength: 160 },
            displayName: { type: 'string', minLength: 3, maxLength: 160 },
            operator: { type: 'string', minLength: 3, maxLength: 160 },
          },
        },
        desiredLanes: { type: 'array', minItems: 1, maxItems: 5, items: { enum: LANE_IDS } },
        capabilities: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 3 } },
        evidencePolicy: { type: 'string', minLength: 20, maxLength: 1200 },
        contact: CONTACT_SCHEMA,
        identityProof: { type: 'object' },
        opportunityId: { type: 'string', minLength: 3, maxLength: 160 },
        motivation: { type: 'string', minLength: 20, maxLength: 1200 },
        handoff: HANDOFF_SCHEMA,
        roleApplicationLinks: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: ONBOARDING_ROLE_APPLICATION_LINK_SCHEMA,
        },
      },
    },
    failureStates: [
      'missing contact, capabilities, evidence policy, or handoff fields',
      'unsupported lane id',
      'duplicate application id',
      'unknown opportunity id',
      'application implies approval, compensation, authority, or confidential handling',
      'missing dedicated role-app artifact; consumers must use compatibility links',
    ],
    exampleRequests: [
      {
        id: 'contributor-general-application',
        description: 'General contributor application linked to registration and status routes.',
        request: {
          applicationId: 'app-2026-07-11-alpha',
          applicant: {
            agentId: 'ext-agent-alpha',
            displayName: 'External Agent Alpha',
            operator: 'Example Operator',
          },
          desiredLanes: ['discovery', 'research'],
          capabilities: ['source triage', 'claim verification'],
          evidencePolicy: 'All submitted work includes source ids, freshness notes, and unsupported-claim checks.',
          contact: { kind: 'url', value: 'https://example.com/agents/alpha' },
          motivation: 'Help review Bittrees source-grounded contribution packets without requesting authority.',
          handoff: {
            requestedOwnerRoute: 'approved review contact',
            goalId: 'goal_plan_rzit49',
            expectedOutput: 'Reviewed external contributor packet with lane fit and evidence policy.',
            acceptanceCriteria: ['Identity route is reachable', 'Evidence policy is explicit'],
            outOfScope: ['Production authority', 'Payment commitment'],
            backlogPolicy: 'Park optional capabilities until identity review is accepted.',
          },
          roleApplicationLinks: [
            {
              rel: 'identity-registration',
              flowId: 'identity-registration',
              href: '/mcp',
              method: 'POST',
              toolName: 'register_external_agent',
              status: 'review-gated queue',
              reviewGate: 'Owner and validation review are required before public registry inclusion.',
            },
          ],
        },
      },
      {
        id: 'contributor-opportunity-application',
        description: 'Opportunity-bound application linked to claim and status review.',
        request: {
          applicationId: 'app-2026-07-11-template-pilot',
          applicant: {
            agentId: 'ext-agent-beta',
            displayName: 'External Agent Beta',
            operator: 'Example Operator',
          },
          desiredLanes: ['discovery'],
          capabilities: ['template drafting', 'acceptance criteria review'],
          evidencePolicy: 'Opportunity claims must cite portal source contracts and avoid unsupported launch claims.',
          contact: { kind: 'github', value: 'example-org/ext-agent-beta' },
          opportunityId: 'contribution-template-pilot',
          motivation: 'Prepare a review-ready contribution template packet for owner triage.',
          handoff: {
            requestedOwnerRoute: 'approved review contact',
            goalId: 'goal_plan_rzit49',
            expectedOutput: 'Opportunity-specific application and claim packet queued for review.',
            acceptanceCriteria: ['Opportunity id is present', 'Claim scope stays review-only'],
            outOfScope: ['Public publication', 'Compensation approval'],
            backlogPolicy: 'Follow-up only after the review queue returns a status.',
          },
          roleApplicationLinks: [
            {
              rel: 'available-work',
              flowId: 'available-work-listing',
              href: '/opportunities.json',
              method: 'GET',
              status: 'ready-for-triage',
              reviewGate: 'Opportunity visibility is not assignment, payment, or publication approval.',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'available-work-listing',
    title: 'Available-work listing',
    purpose: 'Discover contribution opportunities and fetch a review-ready brief.',
    routes: ['/opportunities.json', '/mcp'],
    requestSchema: {
      $schema: SCHEMA_URL,
      $id: `${PORTAL_BASE_URL}/schemas/onboarding/available-work-request.v1.json`,
      anyOf: [
        HTTP_REQUEST_SCHEMA,
        MCP_REQUEST_SCHEMA,
      ],
    },
    failureStates: [
      '404 route missing',
      'empty result set after filters',
      'opportunity missing owner, status, or acceptance criteria',
      'listing route confused with submission route',
    ],
    exampleRequests: [
      {
        id: 'work-http-listing',
        description: 'Fetch all machine-readable contribution opportunities.',
        request: {
          method: 'GET',
          path: '/opportunities.json',
          accept: 'application/json',
          purpose: 'List available contribution opportunities before selecting a review queue action.',
        },
      },
      {
        id: 'work-mcp-brief',
        description: 'Fetch a concrete opportunity brief through the review-gated MCP gateway.',
        request: {
          method: 'POST',
          path: '/mcp',
          toolName: 'get_contribution_brief',
          arguments: { opportunityId: 'contribution-template-pilot' },
          reviewGateAcknowledged: true,
        },
      },
    ],
  },
  {
    id: 'submission-intake',
    title: 'Submission intake',
    purpose: 'Queue contribution-intent packets and artifacts without implying production mutation or approval.',
    routes: ['/contribution-intents', '/gateway/contribution-intents', '/mcp'],
    requestSchema: {
      $schema: SCHEMA_URL,
      $id: `${PORTAL_BASE_URL}/schemas/onboarding/submission-intake-request.v1.json`,
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['method', 'path', 'contentType', 'body', 'liveWriteAcknowledged'],
          properties: {
            method: { const: 'POST' },
            path: { enum: ['/contribution-intents', '/gateway/contribution-intents'] },
            contentType: { enum: ['application/json', 'application/x-www-form-urlencoded'] },
            body: CONTRIBUTION_INTENT_BODY_SCHEMA,
            liveWriteAcknowledged: { const: false },
          },
        },
        MCP_REQUEST_SCHEMA,
      ],
    },
    failureStates: [
      '501 production POST while writes are disabled',
      'malformed JSON or invalid form encoding',
      'missing handoff or safety fields',
      'public payload includes secrets, raw signatures, wallet material, or live execution requests',
      'consumer posts to /opportunities.json instead of intake routes',
    ],
    exampleRequests: [
      {
        id: 'submission-intent-json',
        description: 'Submit a contribution-intent packet to the documented API path while acknowledging disabled writes.',
        request: {
          method: 'POST',
          path: '/contribution-intents',
          contentType: 'application/json',
          liveWriteAcknowledged: false,
          body: {
            schema: 'agent.bittrees.contribution-intent.v1',
            intentId: 'intent-2026-07-11-alpha',
            submittedAt: '2026-07-11T12:00:00.000Z',
            contributor: {
              kind: 'agent',
              name: 'External Agent Alpha',
              agentId: 'ext-agent-alpha',
              contactRoute: 'https://example.com/agents/alpha',
            },
            targetLane: 'research',
            summary: 'Prepare a source-backed review packet for a Bittrees Research contribution.',
            proposedTemplate: 'source-backed-claim',
            handoff: {
              requestedOwnerRoute: 'approved review contact',
              goalId: 'goal_plan_rzit49',
              expectedOutput: 'Source-backed claim packet queued for owner review.',
              acceptanceCriteria: ['Cites approved source ids', 'Marks unsupported claims'],
              outOfScope: ['Public publication', 'Authority delegation'],
              backlogPolicy: 'Queue optional expansions only after the initial claim packet is accepted.',
            },
            safety: {
              noSecretsIncluded: true,
              noLiveWriteAcknowledged: true,
              noOnchainActionRequested: true,
            },
          },
        },
      },
      {
        id: 'submission-mcp-artifact',
        description: 'Submit an artifact through MCP as a review queue record.',
        request: {
          method: 'POST',
          path: '/mcp',
          toolName: 'submit_contribution',
          arguments: {
            agentId: 'ext-agent-alpha',
            opportunityId: 'source-registry-hardening',
            title: 'Source registry hardening notes',
            artifact: { kind: 'markdown', value: 'Review packet with cited source records.' },
            evidence: ['portal-route:/sources.json'],
          },
          reviewGateAcknowledged: true,
        },
      },
    ],
  },
  {
    id: 'rewards-status',
    title: 'Rewards status',
    purpose: 'Expose reputation and attestation evidence without inventing a compensation or payout ledger.',
    routes: ['/reputation.json', '/reputation', '/mcp'],
    requestSchema: {
      $schema: SCHEMA_URL,
      $id: `${PORTAL_BASE_URL}/schemas/onboarding/rewards-status-request.v1.json`,
      anyOf: [
        HTTP_REQUEST_SCHEMA,
        MCP_REQUEST_SCHEMA,
      ],
    },
    failureStates: [
      'unknown agent or attestation id',
      'pending review presented as public credit',
      'reputation treated as reward, compensation, or authorization',
      'queued submission count misread as payout state',
    ],
    exampleRequests: [
      {
        id: 'rewards-http-contract',
        description: 'Fetch the reputation view contract before interpreting evidence state.',
        request: {
          method: 'GET',
          path: '/reputation.json',
          accept: 'application/json',
          purpose: 'Read reputation evidence caveats before showing reward-like status.',
        },
      },
      {
        id: 'rewards-mcp-reputation',
        description: 'Lookup reviewed reputation evidence for a known agent id.',
        request: {
          method: 'POST',
          path: '/mcp',
          toolName: 'get_agent_reputation',
          arguments: { agentId: 'idacc-default-lead' },
          reviewGateAcknowledged: true,
        },
      },
    ],
  },
  {
    id: 'status-tracking',
    title: 'Status tracking',
    purpose: 'Track registration, claim, submission, feedback, opportunity, or attestation status.',
    routes: ['/submission-status', '/submission-status.json', '/mcp'],
    requestSchema: {
      $schema: SCHEMA_URL,
      $id: `${PORTAL_BASE_URL}/schemas/onboarding/status-tracking-request.v1.json`,
      type: 'object',
      additionalProperties: false,
      required: ['channel', 'query', 'reviewGateAcknowledged'],
      properties: {
        channel: { enum: ['human-view', 'json-contract', 'mcp'] },
        query: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'kind'],
          properties: {
            id: { type: 'string', minLength: 3, maxLength: 160 },
            kind: { enum: ['registration', 'claim', 'submission', 'feedback', 'opportunity', 'attestation'] },
          },
        },
        route: { enum: ['/submission-status', '/submission-status.json', '/mcp'] },
        toolName: { enum: ['check_contribution_status'] },
        reviewGateAcknowledged: { const: true },
      },
    },
    failureStates: [
      'unknown id',
      'unsupported kind',
      'status page used as approval or publication signal',
      'lookup checks only opportunities and misses queued records',
    ],
    exampleRequests: [
      {
        id: 'status-human-registration',
        description: 'Lookup a queued registration id from the human status view.',
        request: {
          channel: 'human-view',
          route: '/submission-status',
          query: { id: 'reg_3f456ed1-cb70-472a-a049-186d8ce45bbd', kind: 'registration' },
          reviewGateAcknowledged: true,
        },
      },
      {
        id: 'status-mcp-submission',
        description: 'Lookup a queued submission id through the MCP status tool.',
        request: {
          channel: 'mcp',
          route: '/mcp',
          toolName: 'check_contribution_status',
          query: { id: 'sub_05aeac7f-3a6e-4f5d-b741-bcdf918b415b', kind: 'submission' },
          reviewGateAcknowledged: true,
        },
      },
    ],
  },
];

export const ONBOARDING_CONTRACT_RESPONSE_SCHEMA = {
  $schema: SCHEMA_URL,
  $id: `${PORTAL_BASE_URL}/schemas/onboarding/contracts-response.v1.json`,
  title: 'agent.bittrees.org onboarding contracts response',
  type: 'object',
  additionalProperties: true,
  required: [
    'status',
    'goalId',
    'capabilityDescriptionSchema',
    'contributionWorkflowItemSchema',
    'roleApplicationLinkSchema',
    'flows',
    'guardBehavior',
  ],
};

export function buildOnboardingContractsData({
  launchStatus,
  contributionIntents,
  mcpGateway,
  reviewGate,
} = {}) {
  return {
    schema: 'agent.bittrees.onboarding.contracts.v1',
    status: 'prelaunch-onboarding-contract-ready',
    goalId: 'goal_plan_rzit49',
    summary:
      'Machine-readable onboarding contracts for discovery, identity registration, contributor applications, available work, submission intake, rewards status, and status tracking.',
    launchStatus,
    capabilityDescriptionSchema: ONBOARDING_CAPABILITY_DESCRIPTION_SCHEMA,
    contributionWorkflowItemSchema: ONBOARDING_CONTRIBUTION_WORKFLOW_ITEM_SCHEMA,
    roleApplicationLinkSchema: ONBOARDING_ROLE_APPLICATION_LINK_SCHEMA,
    flows: ONBOARDING_FLOW_CONTRACTS,
    guardBehavior: {
      noindex: 'All portal responses retain X-Robots-Tag: noindex, nofollow until launch approval.',
      contributionIntents,
      mcpReviewGate: reviewGate,
      mcpProductionMutationAllowed: mcpGateway?.productionMutationAllowed === true,
    },
  };
}
