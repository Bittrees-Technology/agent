# Trust and Authority Safeguards Threat Notes

Task: `add-trust-and-authority-safeguards` (`#b2fbd7c7`)

## Implemented Controls

- Contribution-intent POSTs now fail closed on unsupported media types, oversized bodies, malformed schemas, authority-escalation text, wallet/signing material, live transaction requests, and repeated write bursts.
- MCP HTTP write-like tools now require a scoped bearer token from `MCP_WRITE_TOKENS`; missing tokens return `401`, wrong scopes return `403`, and token subjects must match `arguments.agentId`.
- Accepted MCP review-queue records persist `authenticatedSubject` separately from asserted agent identity.
- Review gates explicitly keep `contributorCapabilityGranted`, `walletAuthorityGranted`, `transactionSubmissionAllowed`, and `registryMutationAllowed` false.
- Pre-parsed request bodies are size-, depth-, and property-count checked before JSON-RPC or contribution validation.

## Threat Boundaries

- Identity, trust evidence, ENS/onchain facts, reputation, and self-attested metadata remain evidence only. They are not authorization.
- Contribution and MCP write-like routes queue review records only; they do not assign work, publish attestations, register agents, mutate registries, sign, spend, broadcast, or execute governance.
- Bearer-token authorization is process/env configured and suitable for bounded staging review. Production should put the same subject/scope policy behind managed secret storage and platform-level rate limiting.
- The in-process rate limiter is a local abuse control only. Multi-instance production still needs edge/platform throttling.

## Verification Evidence

- `npm run check` passed.
- `npm test` passed: 54 tests, including negative tests for unsupported media, execution-request text, repeated contribution POSTs, missing MCP token, wrong MCP scope, MCP subject mismatch, and oversized/deep pre-parsed bodies.
- `npm run build` passed and built `dist/` with 21 static assets.
- `npm run verify:api` passed.
- `npm run smoke` against live `https://agent.bittrees.org/` failed on deployment drift: live `/onboarding.json` is 404 and live IDACC release snapshot is `v0.1.635` while GitHub latest is `v0.1.636`. This is a live deployment/freshness blocker, not a local build failure.

Child coordination: `review-contributor-authority-negative-tests` (`#cfaf10ba`) was created for independent negative-test review. The manager assigned it to `onchain-lead` by default; a prior notification to `contract-auditor` was advisory only because the first child-row create attempt was rejected by brief validation.
