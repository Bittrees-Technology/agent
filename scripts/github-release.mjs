const IDACC_LATEST_RELEASE = 'https://api.github.com/repos/bobofbuilding/idacc/releases/latest';

export async function fetchLatestIdaccRelease({
  fetchImpl = globalThis.fetch,
  token = process.env.GITHUB_TOKEN,
  timeoutMs = 10_000,
} = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'agent.bittrees.org-smoke-check',
  };
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  let response;
  try {
    response = await fetchImpl(IDACC_LATEST_RELEASE, {
      headers,
      // Never forward the CI credential to a redirected destination.
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error('release lookup failed or timed out; portal availability is a separate check');
  }
  if (response.status !== 200) {
    const limited = response.status === 429
      || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
    throw new Error(`HTTP ${response.status}${limited ? ' (GitHub API rate limit)' : ''}; release comparison was not performed`);
  }
  let release;
  try {
    release = await response.json();
  } catch {
    throw new Error('GitHub returned invalid JSON; release comparison was not performed');
  }
  if (typeof release?.tag_name !== 'string' || !release.tag_name.trim()
      || !Number.isFinite(Date.parse(release.published_at))) {
    throw new Error('GitHub release metadata is incomplete; release comparison was not performed');
  }
  return release;
}
