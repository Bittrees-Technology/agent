// Machine-readable launch-readiness checklist for agent.bittrees.org.
//
// This is the single structured go/no-go surface. Each decision names the
// owning domain (legal | security | ops), an accountable owner, its current
// status, and the gate it clears. Overall readiness is GO only when every
// decision is accepted; otherwise the portal stays prelaunch and fail-closed.

import { resolveFeatureGates } from './feature-gates.mjs';
import { DEPLOYED_RELEASE_METADATA } from './release-metadata.mjs';

export const LAUNCH_READINESS_SCHEMA = 'agent.bittrees.launch-readiness.v1';

// Decisions are declared as data so validators and operators read the same
// list. `status` is one of: accepted | pending | blocked.
const DECISIONS = [
  {
    id: 'legal-terms-of-use',
    domain: 'legal',
    owner: 'legal/hr-manager',
    status: 'pending',
    gate: 'Publish legal-approved Terms of Use before presenting the portal as launched.',
  },
  {
    id: 'legal-privacy-policy',
    domain: 'legal',
    owner: 'legal/hr-manager',
    status: 'pending',
    gate: 'Publish legal-approved Privacy Policy and a public contact route.',
  },
  {
    id: 'security-router-clearance',
    domain: 'security',
    owner: 'technology-security/security-router',
    status: 'pending',
    gate: 'Security-router sign-off before durable contribution writes are enabled in production.',
  },
  {
    id: 'security-secret-rejection',
    domain: 'security',
    owner: 'technology-security/security-router',
    status: 'accepted',
    gate: 'Secrets, keys, and bearer tokens are rejected/redacted from public payloads and logs.',
  },
  {
    id: 'ops-rollback-rehearsal',
    domain: 'ops',
    owner: 'engineering-team',
    status: 'accepted',
    gate: 'A production alias rollback has been rehearsed with health + smoke verification evidence.',
  },
  {
    id: 'ops-observability-backups',
    domain: 'ops',
    owner: 'engineering-team',
    status: 'accepted',
    gate: 'Scheduled health/smoke monitoring and production backups are wired.',
  },
];

function gateDecision(gates) {
  return [
    {
      id: 'ops-public-indexing-default-off',
      domain: 'ops',
      owner: 'engineering-team',
      status: gates.publicIndexing.enabled ? 'accepted' : 'pending',
      gate: `Public indexing gate (${gates.publicIndexing.flag}) is default-off; enable only after legal + ops approval.`,
    },
    {
      id: 'security-durable-writes-default-off',
      domain: 'security',
      owner: 'technology-security/security-router',
      status: gates.durableContributionWrites.enabled ? 'accepted' : 'pending',
      gate: `Durable contribution writes gate (${gates.durableContributionWrites.flag}) is default-off; enable only after security-router clearance.`,
    },
  ];
}

/**
 * Build the launch-readiness checklist. Pass `now` for a deterministic
 * `generatedAt` in tests.
 */
export function buildLaunchReadiness({ env = process.env, releaseMetadata = DEPLOYED_RELEASE_METADATA, now = new Date() } = {}) {
  const gates = resolveFeatureGates(env);
  const decisions = [...DECISIONS, ...gateDecision(gates)];
  const blockers = decisions.filter((decision) => decision.status !== 'accepted');
  const overallStatus = blockers.length === 0 ? 'go' : 'no-go';

  return {
    schema: LAUNCH_READINESS_SCHEMA,
    service: 'agent.bittrees.org',
    generatedAt: now.toISOString(),
    overallStatus,
    release: {
      version: releaseMetadata.version,
      commitSha: releaseMetadata.commitSha,
      source: releaseMetadata.source,
    },
    featureGates: gates,
    decisions,
    blockers: blockers.map((decision) => ({ id: decision.id, domain: decision.domain, gate: decision.gate })),
    summary: {
      total: decisions.length,
      accepted: decisions.length - blockers.length,
      outstanding: blockers.length,
      byDomain: {
        legal: decisions.filter((decision) => decision.domain === 'legal').length,
        security: decisions.filter((decision) => decision.domain === 'security').length,
        ops: decisions.filter((decision) => decision.domain === 'ops').length,
      },
    },
  };
}
