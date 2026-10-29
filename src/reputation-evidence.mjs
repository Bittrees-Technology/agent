// Public discovery projection only. Profile inclusion cannot establish work
// quality, external identity verification or current permission to execute.
export function reputationEvidence({ profileReviewed = false } = {}) {
  return {
    schema: 'bittrees.agent.reputation-evidence.v1',
    score: null,
    status: 'insufficient-evidence',
    profileReview: profileReviewed === true ? 'reviewed-profile' : 'unknown-profile',
    workHistory: {
      source: 'https://workflow.bittrees.org/',
      status: 'not-verified',
      acceptedWorkCount: null,
      reviewedOutcomeCount: null,
    },
    externalReputation: { status: 'not-checked', score: null },
    authorization: {
      source: 'https://roles.bittrees.org/',
      status: 'not-evaluated',
      grantsAuthority: false,
      requiresCurrentSourceAuthorization: true,
    },
    caveat: 'Reputation is an evidence signal and does not authorize execution, spending, registry mutation, or public claim expansion. Profile review is not measured work performance. Unknown evidence is not a zero score.',
  };
}
