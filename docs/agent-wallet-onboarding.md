# Agent wallet onboarding

Implementation status: review model implemented; live wallet adapter, signing
and transaction activation are not installed. No Safe is deployed by this code.

## Owner flow

1. Register the signed-in human as an agent owner in Roles. Display the saved
   state beside the control, including after reload. This grants no access.
2. Pair the Mac through its native owner-confirmed key possession flow. Keep
   identity and Ethereum transaction keys separate. Never export private keys
   to the browser, model, MCP, logs or a policy document.
3. Connect an existing Ethereum mainnet Safe and verify its deployed code,
   chain, current owners/threshold, module path and recovery control. Check
   that the agent cannot change owners, threshold, modules or its own limits.
   Creating/funding a Safe is a separate reviewed transaction and gas approval.
4. Review sign-ins and transactions separately. Default duration is Until
   revoked. Sign-ins are exact Bittrees HTTPS domain/URI SIWE challenges with
   current nonce, audience, chain, expiry and replay enforcement. A sign-in
   permission never covers arbitrary messages, permits, orders or typed data.
5. Review exact verified Bittrees contract addresses and calls, recipient
   parameters, token and native amounts, period quotas and gas bounds. Labels,
   DNS names and caller-supplied addresses are not contract provenance. Review
   proxy implementation changes. Unsupported/unknown calls and delegatecall
   are denied. The initial review model accepts exact calldata only; broader
   function parameter policies need a separate reviewed adapter/schema.
6. Display the full old/new policy difference and simulate the concrete Safe
   transaction. Required owners approve using the native Safe threshold. Only
   confirmed chain enforcement and a current source read can activate access.
   An available key, login, policy draft, signature or pending transaction is
   not activation evidence.

## Change limits without recreating the agent

`prepareAgentWalletPolicyChange` binds the exact previous policy digest and
revision to the next revision for the same agent, Safe, network and signer.
It produces review material only, with `grantsAuthority: false`.

Store proposals separately from current enforced policy. Compare-and-swap
against the current source revision before submission and after confirmation;
reject stale proposals and reconcile uncertain transaction outcomes by their
original operation/transaction reference. Never blindly resubmit. The current
limits remain in force until the change executes and is confirmed. Failed or
cancelled proposals do not change the active policy. Changes may add/remove
calls or increase/decrease limits, each with explicit approval. No automatic
resumption of suspended access; revoked authority cannot be revived by edit.
Expired policies retain their canonical digest and remain available for history
and a new renewal proposal. Renewal or extending expiry explicitly requires
activation review and Safe approval; it never resumes authority by itself.

All rules share policy-wide token and native period budgets in addition to
their individual limits. Budget windows are anchored to Unix epoch multiples
of `periodSeconds`. A limit edit preserves already consumed amounts, including
when limits are lowered below usage. Rule IDs remain stable for unchanged
target/calldata; rule reordering, removal and re-addition never reset counters.
Preserve counter tombstones. Changing period duration, wallet or signer is a
separate migration/rotation review, not a normal limit edit. The wallet adapter
must prove these counter semantics before activation, including aggregate
budgets across calls and the actual native/token/gas cost exposure.

## Suspend, revoke and rotate

Stop the local executor immediately on an authenticated suspension request.
On-chain access can remain usable until the wallet enforcement path is
disabled, so display Suspension pending or Revocation pending until confirmed.
Do not substitute a Roles database flag for on-chain enforcement. Reading
activity and reducing access must not depend on the agent/model being online.
Human recovery signers retain their independent path. In-flight/confirmed
transactions cannot be undone by revocation. Resume and key rotation require
separate review; signer changes cannot use the limit-amendment helper.

## Integration contract and activation gates

Canonical review helper: `shared/agent-wallet-policy.mjs`. Amounts are decimal
strings in raw token units/wei, not USD estimates or JavaScript floating point.
`calls` bind stable rule IDs, exact target/calldata, per-call and per-period
native/asset caps, call quota, gas and fee cap. Global native/asset budgets
share one policy period. These fields are requirements for the wallet adapter,
not a claim any deployed module supports them. An adapter must reject any
policy it cannot fully enforce, including recipient and asset-outflow limits;
basic Safe token allowances alone do not enforce the whole policy. Exact
calldata can still approve an allowance, operator, order or nested batch with
effects beyond the immediate transfer. Require semantic decoding and effect
enforcement for all paths; no selector blacklist establishes completeness.
The review always carries explicit provenance, semantic-enforcement, Safe
approval and confirmed-readback holds. It never asserts money is protected by
limits that an installed module has not actually proved it enforces.

Roles owns authenticated review, durable revision/lifecycle storage and source
role checks. Native AI owns key custody, explicit local consent and execution.
The wallet adapter owns contract provenance, ownership, reviewed module code,
simulation, Safe owner approval, confirmations/reorg handling, current policy
readback, revocation and every-execution enforcement. No adapter is installed
by this helper, and no caller-supplied boolean can activate it.

Live activation still requires the actual Safe address, approved contracts,
calls and asset/gas limits. Mainnet was selected by the user; no asset amounts,
Safe deployment or gas spending were approved. Use existing resources and
retain the project's additional-spending boundary.
