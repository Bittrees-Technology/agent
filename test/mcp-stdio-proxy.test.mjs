import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import {
  MCP_GATEWAY,
} from '../src/portal.mjs';

async function readRequestText(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }
  return body;
}

async function withProxyTargetServer(callback) {
  const received = [];
  const server = createServer(async (req, res) => {
    if (req.url !== MCP_GATEWAY.path || req.method !== 'POST') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    const message = JSON.parse(await readRequestText(req));
    received.push({
      headers: req.headers,
      message,
    });

    if (message.method === 'notifications/initialized') {
      res.writeHead(202, { 'Content-Length': '0' });
      res.end();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        forwardedMethod: message.method,
        protocolVersionHeader: req.headers['mcp-protocol-version'],
        acceptHeader: req.headers.accept,
      },
    }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await callback({ baseUrl, received });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function nextLine(iterator, stderr) {
  const result = await Promise.race([
    iterator.next(),
    delay(5_000).then(() => ({ timeout: true })),
  ]);

  assert.equal(result.timeout, undefined, `timed out waiting for proxy stdout; stderr: ${stderr()}`);
  assert.equal(result.done, false, `proxy stdout closed early; stderr: ${stderr()}`);
  return result.value;
}

async function waitForCondition(condition, stderr) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await delay(20);
  }

  assert.fail(`timed out waiting for proxy condition; stderr: ${stderr()}`);
}

test('mcp stdio proxy forwards JSON-RPC lines to streamable http gateway', async () => {
  await withProxyTargetServer(async ({ baseUrl, received }) => {
    const scriptPath = fileURLToPath(new URL('../scripts/mcp-stdio-proxy.mjs', import.meta.url));
    const child = spawn(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        BITTREES_AGENT_MCP_URL: `${baseUrl}${MCP_GATEWAY.path}`,
        MCP_PROTOCOL_VERSION: MCP_GATEWAY.protocolVersion,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const output = createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
      terminal: false,
    });
    const lines = output[Symbol.asyncIterator]();

    try {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 'stdio-list', method: 'tools/list', params: {} })}\n`);
      const listed = JSON.parse(await nextLine(lines, () => stderr));

      assert.equal(listed.id, 'stdio-list');
      assert.equal(listed.result.forwardedMethod, 'tools/list');
      assert.equal(listed.result.protocolVersionHeader, MCP_GATEWAY.protocolVersion);
      assert.match(listed.result.acceptHeader, /application\/json/);

      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
      await waitForCondition(() => received.length === 2, () => stderr);
      assert.equal(received[1].message.method, 'notifications/initialized');

      child.stdin.write('not-json\n');
      const parseError = JSON.parse(await nextLine(lines, () => stderr));
      assert.equal(parseError.id, null);
      assert.equal(parseError.error.code, -32700);

      child.stdin.end();
      const [exitCode] = await once(child, 'exit');
      assert.equal(exitCode, 0, stderr);
    } finally {
      output.close();
      if (child.exitCode === null) {
        child.kill('SIGTERM');
      }
    }
  });
});
