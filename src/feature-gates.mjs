// Single source of truth for agent.bittrees.org production feature gates.
//
// Two launch-critical capabilities are held behind explicit, default-off gates
// so the deployed portal is fail-closed until an operator makes a reviewed
// decision to enable each one:
//
//   1. publicIndexing            — allow search engines to index the portal.
//   2. durableContributionWrites — persist contribution-intent submissions.
//
// Every consumer (portal request handling, preflight evidence, launch-readiness
// checklist) reads these gates from here so there is exactly one place that
// decides the default posture and the flag names that flip it.

export const PUBLIC_INDEXING_FLAG_NAMES = Object.freeze([
  'PUBLIC_INDEXING_ENABLED',
  'PORTAL_ENABLE_PUBLIC_INDEXING',
]);

// Historical aliases are retained so an already-configured deployment keeps
// working; the first name is the canonical flag.
export const DURABLE_CONTRIBUTION_WRITES_FLAG_NAMES = Object.freeze([
  'CONTRIBUTION_INTENTS_WRITE_ENABLED',
  'CONTRIBUTION_INTENTS_ENABLED',
  'PORTAL_ENABLE_CONTRIBUTION_INTENTS',
]);

export function isTruthyFlag(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function anyFlagEnabled(flagNames, env) {
  return flagNames.some((flagName) => isTruthyFlag(env[flagName]));
}

export function isPublicIndexingEnabled(env = process.env) {
  return anyFlagEnabled(PUBLIC_INDEXING_FLAG_NAMES, env);
}

export function isDurableContributionWritesEnabled(env = process.env) {
  return anyFlagEnabled(DURABLE_CONTRIBUTION_WRITES_FLAG_NAMES, env);
}

// Robots directive resolved from the public-indexing gate. Fail-closed default
// keeps every response noindex,nofollow until indexing is explicitly enabled.
export function robotsTagFor(env = process.env) {
  return isPublicIndexingEnabled(env) ? 'index, follow' : 'noindex, nofollow';
}

export function robotsTxtBodyFor(env = process.env) {
  return isPublicIndexingEnabled(env)
    ? 'User-agent: *\nAllow: /\n'
    : 'User-agent: *\nDisallow: /\n';
}

/**
 * Resolve the current posture of every gate as a frozen, machine-readable
 * record. `default` is always the fail-closed value; `enabled` reflects the
 * live environment.
 */
export function resolveFeatureGates(env = process.env) {
  const publicIndexingEnabled = isPublicIndexingEnabled(env);
  const durableWritesEnabled = isDurableContributionWritesEnabled(env);

  return Object.freeze({
    schemaVersion: 'agent.bittrees.feature-gates.v1',
    publicIndexing: Object.freeze({
      id: 'public-indexing',
      flag: PUBLIC_INDEXING_FLAG_NAMES[0],
      aliases: PUBLIC_INDEXING_FLAG_NAMES.slice(1),
      default: false,
      enabled: publicIndexingEnabled,
      failClosedBehavior: 'Responses retain X-Robots-Tag: noindex, nofollow and /robots.txt disallows all.',
    }),
    durableContributionWrites: Object.freeze({
      id: 'durable-contribution-writes',
      flag: DURABLE_CONTRIBUTION_WRITES_FLAG_NAMES[0],
      aliases: DURABLE_CONTRIBUTION_WRITES_FLAG_NAMES.slice(1),
      default: false,
      enabled: durableWritesEnabled,
      failClosedBehavior: 'Contribution-intent submissions are rejected/echoed only; nothing is persisted.',
    }),
  });
}
