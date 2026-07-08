# backend-implement-agent-bittrees-mcp-stdio-proxy-evidence

Status: completed
Agent: backend-engineer
Task: `implement-agent-bittrees-mcp-stdio-proxy`
Project: `/Users/jhineline/bob/Library/Assistants/idagents/id-agents/workspace/projects/agent`
Date: 2026-07-08

## Scope

Built and verified the stdio-to-HTTP MCP proxy surface for Plan 71 Phase 3. The proxy forwards newline-delimited JSON-RPC messages from stdin to the already-live Streamable HTTP `/mcp` gateway and writes JSON-RPC responses to stdout. It does not rebuild or replace the verified gateway.

## Implementation Evidence

- `scripts/mcp-stdio-proxy.mjs`
  - Defaults to `https://agent.bittrees.org/mcp`.
  - Supports `BITTREES_AGENT_MCP_URL`, `BITTREES_MCP_HTTP_URL`, `MCP_HTTP_URL`, or `MCP_TARGET_URL` override.
  - Sends `Accept: application/json, text/event-stream`, `Content-Type: application/json`, and `MCP-Protocol-Version`.
  - Handles normal JSON responses and SSE `data:` response payloads.
  - Converts invalid stdin JSON into JSON-RPC parse errors.
  - For request failures, writes JSON-RPC `-32000` errors when the input had an id; notification-only diagnostics go to stderr.

- `test/mcp-stdio-proxy.test.mjs`
  - Starts a local HTTP target at `/mcp`.
  - Spawns the stdio proxy as a child process.
  - Verifies `tools/list` forwarding, protocol-version header forwarding, notification forwarding with no stdout response, and invalid-JSON parse error handling.

- `package.json`
  - Adds `npm run mcp:stdio`.
  - Extends `npm run check` to syntax-check `scripts/mcp-stdio-proxy.mjs` and `test/mcp-stdio-proxy.test.mjs`.

- `README.md` and `/mcp` docs
  - Document stdio client config and local verification override through `BITTREES_AGENT_MCP_URL`.

## Live Proxy Smoke

Local gateway:

```bash
PORT=3147 HOST=127.0.0.1 node src/server.mjs
```

Proxy smoke:

```bash
printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":"live-init","method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"stdio-live-smoke","version":"0.1.0"}}}' \
  '{"jsonrpc":"2.0","id":"live-tools","method":"tools/list","params":{}}' \
  | BITTREES_AGENT_MCP_URL=http://127.0.0.1:3147/mcp MCP_PROTOCOL_VERSION=2025-06-18 node scripts/mcp-stdio-proxy.mjs
```

Observed:

- `live-init` returned `protocolVersion: "2025-06-18"`.
- `live-tools` returned the Bittrees contribution tool list through the proxy.
- Gateway logs showed two `POST /mcp` requests with status `200`.
- Local server stopped cleanly with SIGINT.

## Verification Commands

```bash
npm run check
```

Result: passed.

```bash
npm test
```

Result: passed, `22` tests, `22` pass, including both `mcp stdio proxy forwards JSON-RPC lines to streamable http gateway` test paths.

```bash
npm run verify:api
```

Result: passed; ended with `All api/index.js handler checks passed.`

```bash
npm run build
```

Result: passed; `built dist/ with 21 static assets`.

```bash
npm run smoke -- --base-url=http://127.0.0.1:3147
```

Result: passed; `Smoke check passed for http://127.0.0.1:3147/ (19 routes)`.

```bash
git diff --check
```

Result: passed with no whitespace errors.

## Task Manager Note

The dispatch-specified task lookup returned `{"error":"Task \"implement-agent-bittrees-mcp-stdio-proxy\" not found"}` from `GET http://127.0.0.1:4100/tasks/implement-agent-bittrees-mcp-stdio-proxy` in this runtime before implementation verification. Completion was still performed against the requested project scope.
