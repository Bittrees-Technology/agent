import test from 'node:test';
import assert from 'node:assert/strict';
import { callMcpTool } from '../src/portal.mjs';
import { reputationEvidence } from '../src/reputation-evidence.mjs';
import { renderHubPage } from '../src/ecosystem/ui.mjs';

test('workflow guide keeps delegation, history and reputation with their owning services', () => {
  const html = renderHubPage('/workflows');
  assert.match(html, /only where current permissions explicitly allow it/);
  assert.match(html, /Until-revoked delegation requires separate permission/);
  assert.match(html, /Completion and quality review are separate/);
  assert.match(html, /End-to-end identity-linked work history is not yet verified/);
  assert.doesNotMatch(html, /idacc-default|href="\/reputation/);
});

for (const agentId of ['idacc-default-lead', 'unknown-agent']) {
  test(`reputation lookup cannot turn profile inclusion into performance or authority: ${agentId}`, () => {
    const result = callMcpTool('get_agent_reputation', { agentId }).structuredContent;
    assert.equal(result.status, agentId === 'unknown-agent' ? 'not_found' : 'reviewed_profile_found');
    assert.equal(result.reputation.score, null);
    assert.equal(result.queuedSubmissionCount, null);
    assert.equal(result.reputation.status, 'insufficient-evidence');
    assert.equal(result.reputation.profileReview, agentId === 'unknown-agent' ? 'unknown-profile' : 'reviewed-profile');
    assert.equal(result.reputation.workHistory.acceptedWorkCount, null);
    assert.equal(result.reputation.workHistory.reviewedOutcomeCount, null);
    assert.equal(result.reputation.workHistory.status, 'not-verified');
    assert.equal(result.reputation.externalReputation.status, 'not-checked');
    assert.equal(result.reputation.authorization.status, 'not-evaluated');
    assert.equal(result.reputation.authorization.grantsAuthority, false);
    assert.equal(result.reputation.authorization.requiresCurrentSourceAuthorization, true);
  });
}

test('public evidence projection does not accept injected scores, receipts or permission decisions', () => {
  const r = reputationEvidence({ profileReviewed: 'true', score: 100, acceptedWorkCount: 100, allowed: true, credential: 'private' });
  assert.equal(r.profileReview, 'unknown-profile');
  assert.equal(r.score, null);
  assert.equal(r.workHistory.acceptedWorkCount, null);
  assert.equal(r.authorization.grantsAuthority, false);
  assert.doesNotMatch(JSON.stringify(r), /private|credential|100/);
  r.authorization.grantsAuthority = true;
  assert.equal(reputationEvidence().authorization.grantsAuthority, false);
});
