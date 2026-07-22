import { readFileSync } from 'node:fs';

const PACKAGE_JSON = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._/+:-]*$/;
const COMMIT_SHA = /^[0-9a-f]{7,64}$/i;

function cleanIdentifier(value, name) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const normalized = String(value).trim();
  if (normalized.length > 160 || !SAFE_IDENTIFIER.test(normalized)) {
    throw new Error(`${name} must be a safe release identifier.`);
  }
  return normalized;
}

function cleanCommitSha(value) {
  const normalized = cleanIdentifier(value, 'release commit SHA');
  if (normalized === undefined) return undefined;
  if (!COMMIT_SHA.test(normalized)) throw new Error('release commit SHA must be a hexadecimal git object id.');
  return normalized.toLowerCase();
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function versionFromTag(tag) {
  return /^v\d/.test(tag) ? tag.slice(1) : tag;
}

/**
 * Resolve the public release identity from deployment/build inputs.
 *
 * A configured version wins, then an exact release tag, then the immutable
 * commit. package.json is only the final local-development fallback. This
 * keeps a deployed route from claiming a stale package version when the
 * actual build commit is available.
 */
export function resolveReleaseMetadata({
  env = process.env,
  packageVersion = PACKAGE_JSON.version,
  gitTag,
  gitCommitSha,
  dirty = false,
} = {}) {
  const configuredVersion = cleanIdentifier(
    firstDefined(env.AGENT_RELEASE_VERSION, env.PORTAL_RELEASE_VERSION),
    'configured release version',
  );
  const githubTag = env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : undefined;
  const tag = cleanIdentifier(
    firstDefined(env.AGENT_RELEASE_TAG, env.PORTAL_RELEASE_TAG, env.RELEASE_TAG, githubTag, gitTag),
    'release tag',
  );
  const commitSha = cleanCommitSha(firstDefined(
    env.AGENT_RELEASE_COMMIT_SHA,
    env.PORTAL_RELEASE_COMMIT_SHA,
    env.VERCEL_GIT_COMMIT_SHA,
    env.GITHUB_SHA,
    env.SOURCE_VERSION,
    gitCommitSha,
  ));
  const deploymentId = cleanIdentifier(
    firstDefined(env.AGENT_DEPLOYMENT_ID, env.VERCEL_DEPLOYMENT_ID),
    'deployment id',
  );
  const gitRef = cleanIdentifier(
    firstDefined(env.VERCEL_GIT_COMMIT_REF, env.GITHUB_REF_NAME),
    'git ref',
  );
  const normalizedPackageVersion = cleanIdentifier(packageVersion, 'package version');
  const commitVersion = commitSha
    ? `${normalizedPackageVersion}+${commitSha.slice(0, 12)}${dirty ? '.dirty' : ''}`
    : undefined;
  const version = configuredVersion
    ?? (tag ? versionFromTag(tag) : undefined)
    ?? commitVersion
    ?? normalizedPackageVersion;
  const source = configuredVersion
    ? 'configured-version'
    : tag
      ? 'release-tag'
      : commitSha
        ? 'git-commit'
        : 'package-fallback';

  return Object.freeze({
    schemaVersion: 'agent.bittrees.release-metadata.v1',
    service: 'agent.bittrees.org',
    version,
    tag: tag ?? null,
    commitSha: commitSha ?? null,
    buildId: deploymentId ?? commitSha?.slice(0, 12) ?? version,
    deploymentId: deploymentId ?? null,
    gitRef: gitRef ?? null,
    packageVersion: normalizedPackageVersion,
    dirty: Boolean(dirty),
    source,
  });
}

/**
 * Hosted builders identify the immutable source revision explicitly. Files
 * generated or normalized by the platform must not make that revision appear
 * dirty in static release artifacts. Local builds still honor Git's tracked
 * worktree result so they cannot claim clean provenance accidentally.
 */
export function resolveBuildDirtyState({ env = process.env, trackedChanges = '' } = {}) {
  const hostedCommit = firstDefined(env.VERCEL_GIT_COMMIT_SHA, env.GITHUB_SHA);
  return hostedCommit ? false : Boolean(String(trackedChanges).trim());
}

export const DEPLOYED_RELEASE_METADATA = resolveReleaseMetadata();
