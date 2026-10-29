import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequestHandler, buildStaticAssets, buildPortalManifest } from '../src/portal.mjs';
import { CONSOLIDATED_PAGES, LEGACY_DISCOVERY_PATHS, buildHubAgentGuide } from '../src/ecosystem/public-surface.mjs';

test('retired public pages redirect without publishing their old static content', async () => {
  const server = createServer(createRequestHandler());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const assets = buildStaticAssets();
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
    for (const [path, target] of Object.entries(CONSOLIDATED_PAGES)) {
      for (const suffix of ['', '/', '/index.html']) {
        for (const method of ['GET', 'HEAD']) {
          const response = await fetch(base + path + suffix + '?agentId=idacc-default-lead', { method, redirect: 'manual' });
          assert.equal(response.status, 301);
          assert.equal(response.headers.get('location'), target);
          assert.match(response.headers.get('x-robots-tag'), /noindex/);
        }
      }
      assert.ok(!assets.some(asset => asset.path === path.slice(1) + '/index.html'));
      assert.ok(config.redirects.some(item => item.source === path + '/:path*' && item.destination === target));
    }
    for (const path of ['/', '/tools', '/workflows', '/resources', '/developers', '/contribute', '/projects', '/readiness', '/mcp-docs', '/privacy', '/terms-of-use', '/does-not-exist']) {
      const response = await fetch(base + path, { headers: { Accept: 'text/html' } });
      const html = await response.text();
      assert.doesNotMatch(html, /IDACC|idacc-default|Profile &amp; roles|href="\/(?:identity-keys|reputation|onboarding|administration)(?:["?#])/i, path);
      assert.match(html, /aria-label="Supporting resources"/, path);
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('public guides and manifest focus discovery on the hub rather than internal project profiles', () => {
  for (const full of [false, true]) {
    const guide = buildHubAgentGuide({ full });
    assert.doesNotMatch(guide, /IDACC|idacc-default|\/identity-keys|\/reputation|\/administration/i);
    assert.match(guide, /https:\/\/mcp.bittrees.org\/connect/);
    assert.match(guide, /not a deletion instruction/);
  }
  const manifest = buildPortalManifest();
  assert.ok(manifest.routes.every(route => !LEGACY_DISCOVERY_PATHS.has(route.path)));
});
