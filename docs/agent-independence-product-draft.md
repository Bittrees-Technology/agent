# Agent Independence Product Draft

Status: draft only

This draft is the product-specific independence packet for the portal. It is intentionally bounded to product language and implementation evidence; it does not assert legal approval, production launch, or any authority beyond the checked-in repository.

## User Value

The portal gives reviewers, operators, and external contributors a single place to understand the product boundary, entry path, and review-gated workflow before any launch or integration decision.

## In Scope

- A standalone Node.js portal entry point.
- Public discovery and onboarding docs.
- Machine-readable route and workflow contracts.
- Local verification and review-gated contribution surfaces.
- Optional integrations that remain outside the core runtime.

## Out of Scope

- Merging, deploying, or changing visibility.
- DNS or routing changes.
- Authority, wallet, credential, or signer control.
- Legal drafting or legal approval claims.
- Any dependency that is required for basic use of the product.

## Onboarding and First Value

First value is available by cloning the repository, installing dependencies, and running the checked-in validation commands:

1. `npm ci`
2. `npm run check`
3. `npm run test:onboarding`
4. `npm test`
5. `npm run build`

The first useful product outcome is then available through the published entry routes, especially `/llms.txt`, `/agents.json`, `/onboarding.json`, and `/opportunities.json`.

## Release Status

This is an unreleased draft. It is implementation-aligned, reviewable, and suitable for draft PR evidence, but it is not a production release, deployment request, or launch claim.

## Product-Owned Trust and Support Placeholders

Trust-review contact, support routing, and escalation ownership remain product-owned placeholders until a separate owner assigns them. Until that happens, the draft should be treated as blocked on product ownership rather than inferred from sibling services or public visibility.

## Standalone Entry and Runtime

The product runs as a standalone Node.js application from `src/server.mjs`.

- `npm start` runs the server.
- `npm run dev` runs the server with file watching.
- `npm run start:dist` serves the built output.

## No Sibling or Bittrees Dependency

This draft does not depend on a sibling repository or on a Bittrees-side runtime to be meaningful. References to other projects are optional context only and must not be treated as runtime prerequisites.

## Optional-Only Integration Boundaries

Any external system integration is optional. If an integration is added later, it must remain bounded as a read-only reference, a follow-up workflow item, or a separately approved enhancement. The base product must remain usable without it.
