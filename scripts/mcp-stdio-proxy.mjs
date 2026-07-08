#!/usr/bin/env node
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MCP_HTTP_URL = 'https://agent.bittrees.org/mcp';
export const DEFAULT_MCP_PROTOCOL_VERSION = '2025-06-18';
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveProxyConfig(env = process.env) {
  return {
    targetUrl:
      env.BITTREES_AGENT_MCP_URL ??
      env.BITTREES_MCP_HTTP_URL ??
      env.MCP_HTTP_URL ??
      env.MCP_TARGET_URL ??
      DEFAULT_MCP_HTTP_URL,
    protocolVersion: env.MCP_PROTOCOL_VERSION ?? DEFAULT_MCP_PROTOCOL_VERSION,
    requestTimeoutMs: parsePositiveInteger(env.MCP_HTTP_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
  };
}

function isJsonRpcRequest(message) {
  return message && typeof message === 'object' && !Array.isArray(message) && Object.hasOwn(message, 'id');
}

function jsonRpcError(id, code, message, data = undefined) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function getRequestId(message) {
  return isJsonRpcRequest(message) ? message.id : undefined;
}

function parseSseDataPayload(body) {
  const events = body.split(/\r?\n\r?\n/);

  for (const event of events) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart())
      .join('\n')
      .trim();

    if (!data || data === '[DONE]') continue;
    return JSON.parse(data);
  }

  return null;
}

export function parseMcpHttpResponseBody(body, contentType = '') {
  if (!body.trim()) return null;

  if (contentType.toLowerCase().includes('text/event-stream')) {
    return parseSseDataPayload(body);
  }

  return JSON.parse(body);
}

export async function forwardJsonRpcMessage(message, config = resolveProxyConfig(), fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation is available for the MCP stdio proxy.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetchImpl(config.targetUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': config.protocolVersion,
        'User-Agent': 'agent-bittrees-mcp-stdio-proxy/0.1.0',
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });

    const responseBody = await response.text();
    if (!responseBody.trim()) return null;

    try {
      return parseMcpHttpResponseBody(responseBody, response.headers.get('content-type') ?? '');
    } catch (error) {
      const detail = {
        status: response.status,
        statusText: response.statusText,
        bodyStart: responseBody.slice(0, 512),
      };
      throw new Error(`MCP HTTP gateway returned an unparsable response: ${error.message}`, {
        cause: detail,
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function writeJsonLine(stream, payload) {
  const line = `${JSON.stringify(payload)}\n`;
  if (!stream.write(line)) {
    await once(stream, 'drain');
  }
}

function writeDiagnostic(stderr, message) {
  stderr.write(`[mcp-stdio-proxy] ${message}\n`);
}

export async function runStdioProxy({
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  config = resolveProxyConfig(),
  fetchImpl = globalThis.fetch,
} = {}) {
  const input = createInterface({
    input: stdin,
    crlfDelay: Infinity,
    terminal: false,
  });

  for await (const rawLine of input) {
    const line = rawLine.trim();
    if (!line) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      await writeJsonLine(stdout, jsonRpcError(null, -32700, `Parse error: ${error.message}`));
      continue;
    }

    try {
      const response = await forwardJsonRpcMessage(message, config, fetchImpl);
      if (response !== null) {
        await writeJsonLine(stdout, response);
      }
    } catch (error) {
      const requestId = getRequestId(message);
      const detail = error.name === 'AbortError'
        ? `MCP HTTP gateway timed out after ${config.requestTimeoutMs}ms.`
        : error.message;

      if (requestId !== undefined) {
        await writeJsonLine(stdout, jsonRpcError(requestId, -32000, detail));
      } else {
        writeDiagnostic(stderr, detail);
      }
    }
  }
}

function isMainModule() {
  return resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  runStdioProxy().catch((error) => {
    writeDiagnostic(process.stderr, error.stack ?? error.message);
    process.exitCode = 1;
  });
}
