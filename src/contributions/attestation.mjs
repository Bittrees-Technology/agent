export const CONTRIBUTION_ATTESTATION_SCHEMA = 'agent.bittrees.contribution-attestation.v1';
export const CONTRIBUTION_ATTESTATION_STATUS = 'review_pending_not_publicly_attested';
export const CONTRIBUTION_ATTESTATION_TERMINAL_STATUS = Object.freeze({
  approved: 'reviewed_not_publicly_attested',
  rejected: 'review_rejected_not_publicly_attested',
});

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;

const DEFAULT_REVIEW_GATE = Object.freeze({
  productionMutationAllowed: false,
  contributorCapabilityGranted: false,
  walletAuthorityGranted: false,
  transactionSubmissionAllowed: false,
  registryMutationAllowed: false,
  status: 'review_required_before_publication_or_assignment',
});

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function bounded(value, limit = 180) {
  return (typeof value === 'string' ? value : '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, limit)
    .trim();
}

export function contributionAttestationId(contributionId) {
  const id = bounded(contributionId);
  if (!id || !SAFE_ID.test(id)) return undefined;
  return `att_${id}`;
}

export function contributionIdFromAttestationId(attestationId) {
  const id = bounded(attestationId);
  if (!id.startsWith('att_')) return id || undefined;
  const contributionId = id.slice(4);
  return contributionId && SAFE_ID.test(contributionId) ? contributionId : undefined;
}

export function contributionAttestationStatusForReviewStatus(reviewStatus) {
  const normalized = bounded(reviewStatus, 120).toLowerCase();
  return CONTRIBUTION_ATTESTATION_TERMINAL_STATUS[normalized] ?? CONTRIBUTION_ATTESTATION_STATUS;
}

/**
 * Build the only public attestation projection used by HTTP and MCP submit
 * paths. A queued record is evidence of intake only; it is never a public
 * acceptance or authority grant.
 */
export function buildContributionAttestation({
  contributionId,
  submissionId = contributionId,
  agentId,
  opportunityId,
  createdAt,
  updatedAt = createdAt,
  status = CONTRIBUTION_ATTESTATION_STATUS,
  lifecycleStatus = status === CONTRIBUTION_ATTESTATION_STATUS ? 'review_pending' : 'terminal',
  reviewStatus = status === CONTRIBUTION_ATTESTATION_STATUS ? 'queued_for_review' : 'reviewed',
  reviewGate = DEFAULT_REVIEW_GATE,
} = {}) {
  const normalizedContributionId = bounded(contributionId);
  const id = contributionAttestationId(normalizedContributionId);
  if (!id) throw new TypeError('contributionId is required to build an attestation');

  return {
    schema: CONTRIBUTION_ATTESTATION_SCHEMA,
    kind: 'attestation',
    id,
    attestationId: id,
    contributionId: normalizedContributionId,
    submissionId: bounded(submissionId) || normalizedContributionId,
    ...(bounded(agentId) ? { agentId: bounded(agentId) } : {}),
    ...(bounded(opportunityId) ? { opportunityId: bounded(opportunityId) } : {}),
    status: bounded(status, 120) || CONTRIBUTION_ATTESTATION_STATUS,
    lifecycleStatus: bounded(lifecycleStatus, 120) || 'review_pending',
    reviewStatus: bounded(reviewStatus, 120) || 'queued_for_review',
    attestationStatus: bounded(status, 120) || CONTRIBUTION_ATTESTATION_STATUS,
    publicAttestation: false,
    ...(bounded(createdAt, 120) ? { createdAt: bounded(createdAt, 120) } : {}),
    ...(bounded(updatedAt, 120) ? { updatedAt: bounded(updatedAt, 120) } : {}),
    reviewGate: clone(reviewGate ?? DEFAULT_REVIEW_GATE),
    caveat: 'Pending review records are not public attestations and must not be presented as accepted Bittrees work.',
  };
}

export const CONTRIBUTION_ATTESTATION_REVIEW_GATE = DEFAULT_REVIEW_GATE;
