import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequestHandler, buildStaticAssets } from '../src/portal.mjs';
import { HUB_PATHS, renderHubPage } from '../src/ecosystem/ui.mjs';
import { BITTREES_TOOLS, EXTERNAL_RESOURCES, HUB_PAGES } from '../src/ecosystem/resources.mjs';

test('hub resources have unique identities and fixed HTTPS destinations', () => {
  const all = [...BITTREES_TOOLS, ...EXTERNAL_RESOURCES];
  assert.equal(new Set(all.map(({ id }) => id)).size, all.length);
  for (const item of all) {
    const url = new URL(item.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.username + url.password + url.hash, '');
  }
  const home = renderHubPage();
  assert.ok(home.indexOf('Set up Bittrees AI') < home.indexOf('Understand MCP'));
  assert.match(home, /Apple signing and notarization remain open/);
  assert.match(home, /Sign-in does not grant execution access/);
  assert.doesNotMatch(home, /<form|<iframe|universal connector access/);
  assert.throws(() => renderHubPage('/unknown'));
});

test('public hub has static/live parity, canonical metadata, working links and unchanged gates', async () => {
  const server = createServer(createRequestHandler());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const assets = buildStaticAssets();
    for (const page of HUB_PAGES) {
      const response = await fetch(base + page.path);
      const html = await response.text();
      assert.equal(response.status, 200, page.path);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
      assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
      assert.ok(html.includes(`<link rel="canonical" href="https://agent.bittrees.org${page.path}">`));
      assert.match(html, /href="#main">Skip to main content/);
      assert.match(html, /id="main" tabindex="-1"/);
      assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
      const assetPath = page.path === '/' ? 'index.html' : `${page.path.slice(1)}/index.html`;
      assert.equal(assets.find(({ path }) => path === assetPath)?.body, html);
      const head = await fetch(base + page.path, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
      assert.equal((await fetch(base + page.path, { method: 'POST' })).status, 405);
      if (page.path !== '/') {
        const slash = await fetch(base + page.path + '/', { redirect: 'manual' });
        assert.equal(slash.status, 301);
        assert.equal(slash.headers.get('location'), page.path);
      }
      // Every same-origin destination advertised by the hub must actually work.
      const hrefs = [...new Set([...html.matchAll(/href="(\/(?!\/)[^"#]*)/g)].map((m) => m[1]))];
      for (const href of hrefs) assert.equal((await fetch(base + href)).status, 200, `${page.path}: ${href}`);
    }
    const css = await fetch(base + '/hub.css');
    assert.match(css.headers.get('content-type'), /^text\/css/);
    assert.equal(await css.text(), assets.find(({ path }) => path === 'hub.css').body);
    const sitemap = await (await fetch(base + '/sitemap.xml')).text();
    for (const path of HUB_PATHS) assert.ok(sitemap.includes(`<loc>https://agent.bittrees.org${path}</loc>`));
    assert.equal(await (await fetch(base + '/robots.txt')).text(), 'User-agent: *\nDisallow: /\n');
    const contribution = await (await fetch(base + '/contribute')).text();
    assert.match(contribution, /does not provide a general submission form/);
    assert.doesNotMatch(contribution, /<form/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
