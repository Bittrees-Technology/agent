import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../scripts/serve-dist.mjs', import.meta.url));
const distDir = fileURLToPath(new URL('../dist', import.meta.url));

// Fixture assets written into dist/ so the static server has real SVG and XML
// files to negotiate. Names are namespaced and removed in a finally block so a
// crashed run never leaves them tracked or shipped.
const SVG_FIXTURE = '__serve-dist-mime-fixture__.svg';
const XML_FIXTURE = '__serve-dist-mime-fixture__.xml';
const SVG_BODY = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
const XML_BODY = '<?xml version="1.0" encoding="UTF-8"?><urlset></urlset>';

async function findFreePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitForReady(baseUrl, child, stderrRef) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`serve-dist exited early (${child.exitCode})\n${stderrRef.value}`);
    }
    try {
      const res = await fetch(`${baseUrl}/index.html`);
      await res.arrayBuffer();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`serve-dist did not become ready\n${stderrRef.value}`);
}

async function withDistServer(run) {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const svgPath = join(distDir, SVG_FIXTURE);
  const xmlPath = join(distDir, XML_FIXTURE);
  await writeFile(svgPath, SVG_BODY);
  await writeFile(xmlPath, XML_BODY);

  const stderrRef = { value: '' };
  const child = spawn(process.execPath, [scriptPath], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrRef.value += chunk;
  });

  try {
    await waitForReady(baseUrl, child, stderrRef);
    await run(baseUrl);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit').catch(() => {});
    }
    await rm(svgPath, { force: true });
    await rm(xmlPath, { force: true });
  }
}

test('dist server sends explicit SVG and XML types alongside nosniff', async () => {
  await withDistServer(async (baseUrl) => {
    const svg = await fetch(`${baseUrl}/${SVG_FIXTURE}`);
    const svgBody = await svg.text();
    assert.equal(svg.status, 200);
    assert.equal(svg.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    assert.equal(svg.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(svgBody, SVG_BODY);

    const svgHead = await fetch(`${baseUrl}/${SVG_FIXTURE}`, { method: 'HEAD' });
    const svgHeadBody = await svgHead.text();
    assert.equal(svgHead.status, svg.status);
    assert.equal(svgHead.headers.get('content-type'), svg.headers.get('content-type'));
    assert.equal(svgHead.headers.get('content-length'), svg.headers.get('content-length'));
    assert.equal(svgHead.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(svgHeadBody, '');

    const xml = await fetch(`${baseUrl}/${XML_FIXTURE}`);
    const xmlBody = await xml.text();
    assert.equal(xml.status, 200);
    assert.equal(xml.headers.get('content-type'), 'application/xml; charset=utf-8');
    assert.equal(xml.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(xmlBody, XML_BODY);
  });
});

test('dist server never falls back to octet-stream under nosniff for known static kinds', async () => {
  await withDistServer(async (baseUrl) => {
    // Regression guard: nosniff means the browser will not infer a type, so an
    // octet-stream fallback silently breaks rendering. Assert the served kinds
    // all carry a concrete, renderable content type.
    const cases = [
      { path: '/index.html', type: 'text/html; charset=utf-8' },
      { path: '/agents.json', type: 'application/json; charset=utf-8' },
      { path: '/llms.txt', type: 'text/plain; charset=utf-8' },
      { path: `/${SVG_FIXTURE}`, type: 'image/svg+xml; charset=utf-8' },
      { path: `/${XML_FIXTURE}`, type: 'application/xml; charset=utf-8' },
    ];
    for (const { path, type } of cases) {
      const res = await fetch(`${baseUrl}${path}`);
      await res.arrayBuffer();
      assert.equal(res.status, 200, `${path} should resolve`);
      assert.equal(res.headers.get('content-type'), type, `${path} content-type`);
      assert.notEqual(
        res.headers.get('content-type'),
        'application/octet-stream',
        `${path} must not fall back to octet-stream under nosniff`,
      );
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', `${path} nosniff`);
    }
  });
});
