import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_WALLET_POLICY_SCHEMA, AGENT_WALLET_DEFAULT_DURATION, validateAgentWalletPolicy, agentWalletPolicyDigest, prepareAgentWalletPolicyChange, agentWalletLifecycleView } from '../shared/agent-wallet-policy.mjs';
import { renderHubPage } from '../src/ecosystem/ui.mjs';
const addr = digit => '0x' + digit.repeat(40);
function policy() {
  return { schema: AGENT_WALLET_POLICY_SCHEMA, agentId: 'agent:local-ai', revision: 1, chainId: 1,
    safe: addr('1'), signer: addr('2'), duration: { ...AGENT_WALLET_DEFAULT_DURATION },
    signIns: [{domain:'roles.bittrees.org', uri:'https://roles.bittrees.org/'}],
    calls: [{ruleId:'transfer-one',target:addr('3'),calldata:'0xa9059cbb'+'0'.repeat(64)+'0'.repeat(63)+'1',maxNativeValue:'0',maxNativePerPeriod:'0',assetLimits:[{token:addr('3'),maxPerTransaction:'1',maxPerPeriod:'10'}],maxCallsPerPeriod:10,gasLimit:'100000',maxFeePerGas:'1000000000'}],
    periodSeconds:86400,nativeBudgetPerPeriod:'0',assetBudgets:[{token:addr('3'),maxPerPeriod:'100'}],administration:'safe-threshold',delegatecall:'deny',unknownCalls:'deny' };
}
test('review binds exact network, signer, Safe, calldata and raw-unit amounts without granting access', () => {
  const p=policy(),draft=prepareAgentWalletPolicyChange(null,p);
  assert.equal(draft.grantsAuthority,false);assert.equal(draft.requiresSafeApproval,true);
  assert.equal(draft.requiresConfirmedOnchainEnforcement,true);assert.equal(draft.expectedRevision,0);
  assert.equal(draft.status,'awaiting-wallet-review');assert.equal(p.duration.kind,'until-revoked');
  assert.equal(agentWalletPolicyDigest({...p,calls:structuredClone(p.calls)}),agentWalletPolicyDigest(p));
  for(const change of [v=>v.calls[0].calldata+='00',v=>v.calls[0].assetLimits[0].maxPerPeriod='11',v=>v.signIns[0].uri+='profile']) {
    const changed=structuredClone(p);change(changed);assert.notEqual(agentWalletPolicyDigest(changed),agentWalletPolicyDigest(p));
  }
  draft.proposed.calls[0].maxNativeValue='99';assert.equal(p.calls[0].maxNativeValue,'0');
});
test('mainnet policy denies wildcards, unknown fields, unsafe signatures/calls and unbounded or imprecise limits',()=>{
  const mutations=[p=>p.chainId=10,p=>p.signer=p.safe,p=>p.unknownCalls='allow',p=>p.delegatecall='allow',
    p=>p.privateKey='secret',p=>p.signIns[0].domain='*.bittrees.org',p=>p.signIns[0].uri='https://roles.bittrees.org.evil.org/',
    p=>p.signIns[0].uri='https://roles.bittrees.org/#sign',p=>p.signIns[0].uri='https://user@roles.bittrees.org/',
    p=>p.signIns[0].domain='example.org',p=>p.calls[0].target=p.safe,p=>p.calls[0].calldata='0x',
    p=>p.calls[0].maxNativeValue=1,p=>p.calls[0].maxNativeValue='1e20',p=>p.calls[0].maxNativeValue=(2n**256n).toString(),
    p=>p.calls[0].assetLimits[0].maxPerPeriod='0',p=>p.calls[0].assetLimits[0].maxPerTransaction='11',
    p=>p.calls[0].gasLimit='0',p=>p.calls[0].maxFeePerGas='0',p=>p.calls[0].maxCallsPerPeriod=0,
    p=>p.calls.push(structuredClone(p.calls[0])),p=>p.calls[0].assetLimits.push(structuredClone(p.calls[0].assetLimits[0])),
    p=>{p.calls=[];p.signIns=[];},p=>p.duration={kind:'unlimited'},p=>p.duration={kind:'expires',expiresAt:0}];
  for(const mutate of mutations){const p=policy();mutate(p);assert.throws(()=>validateAgentWalletPolicy(p,{now:1000}));}
});
test('amending limits preserves the agent and binds current revision/digest for source compare-and-swap',()=>{
  const current=policy(),next=structuredClone(current);next.revision=2;next.calls[0].assetLimits[0].maxPerPeriod='20';
  const review=prepareAgentWalletPolicyChange(current,next);
  assert.deepEqual(review.changedFields,['calls']);assert.equal(review.expectedRevision,1);
  assert.equal(review.expectedPolicyDigest,agentWalletPolicyDigest(current));assert.equal(review.current.calls[0].assetLimits[0].maxPerPeriod,'10');
  assert.equal(review.proposed.calls[0].assetLimits[0].maxPerPeriod,'20');assert.equal(review.grantsAuthority,false);
  for(const mutate of [p=>p.revision=1,p=>p.revision=3,p=>p.safe=addr('4'),p=>p.signer=addr('5'),p=>p.agentId='agent:another']) {
    const stale=structuredClone(next);mutate(stale);assert.throws(()=>prepareAgentWalletPolicyChange(current,stale));
  }
  assert.throws(()=>prepareAgentWalletPolicyChange(current,{...current,revision:2}));
});
test('pending suspension/revocation never claims wallet access stopped; edits do not resume suspended access',()=>{
  assert.equal(agentWalletLifecycleView({desired:'suspended',observed:'active'}).status,'suspension-pending');
  assert.equal(agentWalletLifecycleView({desired:'revoked',observed:'unverified'}).status,'revocation-pending');
  assert.equal(agentWalletLifecycleView({desired:'active',observed:'suspended',pendingChange:true}).status,'suspended');
  assert.equal(agentWalletLifecycleView({desired:'active',observed:'revoked',pendingChange:true}).status,'revoked');
  const pending=agentWalletLifecycleView({desired:'active',observed:'active',pendingChange:true});
  assert.equal(pending.status,'update-pending');assert.match(pending.label,/existing wallet limits remain/);assert.equal(pending.grantsAuthority,false);
  assert.equal(agentWalletLifecycleView({desired:'active',observed:'unverified'}).status,'unverified');
});
test('setup guide separates all four owner steps and makes current availability explicit',()=>{
  const html=renderHubPage('/workflows');
  for(const text of ['id="agent-wallet"','Create the agent identity','Connect its wallet','Review exact permissions','Approve and confirm activation','Wallet activation is not available yet.','Existing limits remain in force']) assert.ok(html.includes(text),text);
  assert.ok(html.includes('https://roles.bittrees.org/profile'));
  assert.doesNotMatch(html, /<button[^>]*>Activate|<input[^>]*private/i);
});

test('historical policy digests survive expiry; renewal requires approval and never resumes authority',()=>{
  const old=policy();old.duration={kind:'expires',expiresAt:2000};
  const digest=agentWalletPolicyDigest(old);
  assert.equal(agentWalletPolicyDigest(validateAgentWalletPolicy(old)),digest);
  const next=structuredClone(old);next.revision=2;next.duration={kind:'until-revoked'};
  const review=prepareAgentWalletPolicyChange(old,next,{now:3000});
  assert.equal(review.expectedPolicyDigest,digest);assert.equal(review.requiresActivationReview,true);assert.equal(review.resumesAuthority,false);
  assert.throws(()=>prepareAgentWalletPolicyChange(old,{...old,revision:2},{now:3000}));
});
test('aggregate budgets and stable counters cannot be bypassed through a revision or rule rename',()=>{
  const old=policy();
  for(const mutate of [p=>p.calls[0].maxNativePerPeriod='1',p=>p.calls[0].maxNativeValue='1',p=>p.calls[0].assetLimits[0].maxPerPeriod='101']) {
    const bad=structuredClone(old);mutate(bad);assert.throws(()=>validateAgentWalletPolicy(bad));
  }
  for(const mutate of [p=>p.periodSeconds=3600,p=>p.calls[0].ruleId='fresh-counter',p=>p.calls[0].calldata+='00']) {
    const bad=structuredClone(old);bad.revision=2;mutate(bad);assert.throws(()=>prepareAgentWalletPolicyChange(old,bad));
  }
  const next=structuredClone(old);next.revision=2;next.assetBudgets[0].maxPerPeriod='200';
  const review=prepareAgentWalletPolicyChange(old,next);
  assert.match(review.counterMigration,/no-revision-reset/);assert.ok(review.activationHolds.includes('semantic-effect-and-budget-enforcement'));
});
