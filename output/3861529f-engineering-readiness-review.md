# Task 3861529f Review: Agent Portal Identity/Keys Readiness

## Verdict

Not live-ready yet. The repo has a solid static discovery scaffold, but there is no identity/keys route or schema in the portal, so the page the task asks about is not actually published anywhere yet.

## Findings

1. Missing route contract for identity/keys.
   - `src/portal.mjs` defines the public route set in `ROUTE_DEFINITIONS`, and it currently stops at `/contribution-intents` with `/llms.txt`, `/agents.json`, `/templates.json`, and `/idacc/releases.json` before that. There is no identity/keys route entry to make machine-readable.
   - The build and dist server are both route-driven off that same definition list, so the missing route is a source-level gap, not a deployment quirk.

2. No source-backed identity/key data exists yet.
   - The portal’s `SOURCE_RECORDS` only track the Plan 70 memory records, the readiness packet, the contributor lane map, the manager snapshot, and the IDACC release API. None of those is a source of truth for public identity material or keys.
   - Because the portal is source-aware by design, identity/key content cannot be safely published without a new explicit source record and review state.

3. Test coverage does not exercise an identity/keys contract.
   - `scripts/verify-api-handler.mjs` currently checks the existing discovery routes and the contribution-intent flow only. There is no assertion for an identity/keys payload, its canonical route, or its safety envelope.

## Minimal Code Changes

1. Add a new route definition in `src/portal.mjs` for the identity/keys page.
   - Keep it read-only (`GET`/`HEAD` only) unless there is a very specific, separately approved write use case.
   - Give it a schema ID and data builder like the other discovery routes so the output stays machine-readable and versioned.

2. Add the page’s data contract to `src/portal.mjs`.
   - Use the existing `buildDataSchema()` pattern so the response envelope stays consistent with the other JSON routes.
   - Include explicit review metadata, source IDs, and a narrow field set for whatever “keys” means here.

3. Update the landing-page and README route inventories.
   - The landing page route cards are generated from `ROUTE_DEFINITIONS`, so they will pick up the new route automatically.
   - `README.md` still lists only the current four discovery routes plus `/contribution-intents`; it needs to name the new page if it becomes public.

4. Extend verification to cover the new contract.
   - Add a `GET`/`HEAD`/trailing-slash redirect check for the new route in `scripts/verify-api-handler.mjs`.
   - Assert the JSON envelope keys, the `schema` value, and the absence of any unsafe fields.

## Route Contract Requirements

- The route should be explicitly versioned, like the existing `agent.bittrees.*` schemas.
- The JSON envelope should stay consistent with the other discovery routes: `$schema`, `route`, `canonicalUrl`, `generatedAt`, `schema`, and `data`.
- If the page exposes key material, it should expose only public identifiers or fingerprints, not private keys, seed phrases, signing material, or custody data.
- The route should not imply authority, wallet control, legal authority, or identity verification beyond what the reviewed source records support.

## Public Safety Constraints

- Preserve the current read-only posture and noindex behavior.
- Keep the page source-grounded and explicit about provenance.
- Do not publish private keys, secret keys, credentials, or signing material.
- Do not imply that the page confers trust, authorization, or wallet custody.
- If the page describes public keys, include rotation/revocation status and the source record that approved publication.

## Implementation Blockers

1. The route name and payload shape are unspecified.
   - “Identity and keys” could mean public agent identifiers, SSH/GPG keys, wallet addresses, or some other public contract. Those are materially different payloads and safety profiles.

2. There is no existing source record for identity/key data.
   - The current portal can only publish what it can point to in source records. That provenance gap needs to be closed before the page can be considered live-ready.

3. The current launch posture is still read-only with open security gates.
   - `READ_ONLY_LAUNCH_POSTURE` still marks live writes off and keeps the security-router gate open. Even a read-only page should stay aligned with that posture and not be presented as authority-bearing.

## Build / Serve Notes

- `scripts/build.mjs` writes static assets from `buildStaticAssets()`, so a new route will flow into `dist/` automatically once it is added to `ROUTE_DEFINITIONS`.
- `scripts/serve-dist.mjs` also derives its canonical route set from `ROUTE_DEFINITIONS`, so the dist server will follow the same source of truth.
- I ran the repo checks and they passed:
  - `npm run check`
  - `npm run verify:api`
  - `npm run build`

## References

- [`src/portal.mjs:25`](/Users/jhineline/bob/Library/Assistants/idagents/id-agents/workspace/projects/agent/src/portal.mjs#L25)
- [`src/portal.mjs:92`](/Users/jhineline/bob/Library/Assistants/idagents/id-agents/workspace/projects/agent/src/portal.mjs#L92)
- [`src/portal.mjs:876`](/Users/jhineline/bob/Library/Assistants/idagents/id-agents/workspace/projects/agent/src/portal.mjs#L876)
- [`src/portal.mjs:1036`](/Users/jhineline/bob/Library/Assistants/idagents/id-agents/workspace/projects/agent/src/portal.mjs#L1036)
- [`src/portal.mjs:1165`](/Users/jhineline/bob/Library/Assistants/idagents/id-agents/workspace/projects/agent/src/portal.mjs#L1165)
- [`scripts/build.mjs:5`](/Users/jhineline/bob/Library/Assistants/idagents/id-agents/workspace/projects/agent/scripts/build.mjs#L5)
- [`scripts/serve-dist.mjs:6`](/Users/jhineline/bob/Library/Assistants/idagents/id-agents/workspace/projects/agent/scripts/serve-dist.mjs#L6)
- [`scripts/verify-api-handler.mjs:72`](/Users/jhineline/bob/Library/Assistants/idagents/id-agents/workspace/projects/agent/scripts/verify-api-handler.mjs#L72)
