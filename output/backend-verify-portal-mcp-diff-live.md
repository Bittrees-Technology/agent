# backend-verify-portal-mcp-diff-live

Status: completed
Agent: backend-engineer
Project: `/Users/jhineline/bob/Library/Assistants/idagents/id-agents/workspace/projects/agent`
Commit: `4bbdb3b Add review-gated MCP contribution gateway`

## Brain and task context

- `curl -s http://127.0.0.1:4200/health` -> `ok: true`
- `curl -s "http://127.0.0.1:4200/memory/shared?q=portal%20mcp%20diff%20contribution&limit=5"` -> no exact shared prior memory.
- `POST /graph/recommend` for backend portal MCP verification returned `json-schema-validate` as the top recommendation.
- Saved reusable verification outcome to Brain: `memoryId: 760`, key `last-backend-verify-portal-mcp-diff-live`.

## Live server

Command:

```bash
PORT=3137 HOST=127.0.0.1 node src/server.mjs
```

Observed:

```text
agent.bittrees.org portal listening on http://127.0.0.1:3137
```

Server was stopped cleanly with SIGINT after verification. No DNS or Vercel provisioning commands were run.

## Live MCP curl evidence

Profile registration success path:

```bash
node -e 'process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:"profile-success-final",method:"tools/call",params:{name:"register_external_agent",arguments:{agentId:"live-curl-agent-20260708-final",displayName:"Live Curl Verification Agent",operator:"backend-engineer",contact:{kind:"internal-route",value:"engineering-team/backend-engineer"},lanes:["discovery"],capabilities:["schema validation","source-grounded evidence"],evidencePolicy:"Cites Brain source ids and command evidence; separates evidence from authority.",identityProof:{manifestUrl:"https://agent.bittrees.org/mcp.json",fingerprint:"live-curl-verification"}}}}))' \
  | curl -sS -w '\nHTTP_STATUS:%{http_code}\n' http://127.0.0.1:3137/mcp \
      -H 'Accept: application/json, text/event-stream' \
      -H 'Content-Type: application/json' \
      -H 'MCP-Protocol-Version: 2025-06-18' \
      --data-binary @-
```

Observed: `HTTP_STATUS:200`; `structuredContent.status: queued_for_review`; `registration.status: queued_for_review`; `reviewGate.productionMutationAllowed: false`; registration id `reg_fcf1c5e1-9761-444a-9754-ca094354e436`.

Contribution submission success path:

```bash
node -e 'process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:"contribution-success-final",method:"tools/call",params:{name:"submit_contribution",arguments:{agentId:"live-curl-agent-20260708-final",opportunityId:"agent-profile-intake",title:"Live MCP verification contribution",artifact:{kind:"markdown",value:"Command evidence for backend-verify-portal-mcp-diff-live."},evidence:["curl profile queued_for_review","curl rejection cases","npm test"]}}}))' \
  | curl -sS -w '\nHTTP_STATUS:%{http_code}\n' http://127.0.0.1:3137/mcp \
      -H 'Accept: application/json, text/event-stream' \
      -H 'Content-Type: application/json' \
      -H 'MCP-Protocol-Version: 2025-06-18' \
      --data-binary @-
```

Observed: `HTTP_STATUS:200`; `structuredContent.status: submission_queued_for_review`; `submission.status: queued_for_review`; `reviewGate.productionMutationAllowed: false`; `attestation.publicAttestation: false`; submission id `sub_5d31ba1a-e538-4f1e-9f6d-1528a1786b68`.

Invalid schema / missing required field rejection:

```bash
node -e 'process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:"invalid-schema-final",method:"tools/call",params:{name:"register_external_agent",arguments:{displayName:"Missing Agent Id",operator:"backend-engineer",contact:{kind:"internal-route",value:"engineering-team/backend-engineer"},capabilities:["schema validation"],evidencePolicy:"No agentId provided, should fail required field validation."}}}))' \
  | curl -sS -w '\nHTTP_STATUS:%{http_code}\n' http://127.0.0.1:3137/mcp \
      -H 'Accept: application/json, text/event-stream' \
      -H 'Content-Type: application/json' \
      -H 'MCP-Protocol-Version: 2025-06-18' \
      --data-binary @-
```

Observed: `HTTP_STATUS:400`; JSON-RPC `error.code: -32602`; `message: agentId is required.`

Secret-bearing field rejection:

```bash
node -e 'process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:"secret-field-final",method:"tools/call",params:{name:"register_external_agent",arguments:{agentId:"live-curl-agent-secret-check-final",displayName:"Secret Check Agent",operator:"backend-engineer",contact:{kind:"internal-route",value:"engineering-team/backend-engineer"},capabilities:["schema validation"],evidencePolicy:"Payload intentionally contains forbidden field name for rejection evidence.",identityProof:{secretToken:"redacted-placeholder"}}}}))' \
  | curl -sS -w '\nHTTP_STATUS:%{http_code}\n' http://127.0.0.1:3137/mcp \
      -H 'Accept: application/json, text/event-stream' \
      -H 'Content-Type: application/json' \
      -H 'MCP-Protocol-Version: 2025-06-18' \
      --data-binary @-
```

Observed: `HTTP_STATUS:400`; JSON-RPC `error.code: -32602`; message rejected `arguments.identityProof.secretToken` as private credential material.

Oversized body rejection:

```bash
node -e 'process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:"oversized-body-final",method:"tools/call",params:{name:"register_external_agent",arguments:{agentId:"live-curl-agent-oversized-final",displayName:"Oversized Agent",operator:"backend-engineer",contact:{kind:"internal-route",value:"engineering-team/backend-engineer"},capabilities:["schema validation"],evidencePolicy:"x".repeat(1100000)}}}))' \
  | curl -sS -w '\nHTTP_STATUS:%{http_code}\n' http://127.0.0.1:3137/mcp \
      -H 'Accept: application/json, text/event-stream' \
      -H 'Content-Type: application/json' \
      -H 'MCP-Protocol-Version: 2025-06-18' \
      --data-binary @-
```

Observed: `HTTP_STATUS:413`; JSON-RPC `error.code: -32000`; `message: Request body exceeds the 1 MiB limit.`

## Verification commands

```bash
npm run check
```

Result: passed.

```bash
npm test
```

Result: passed, `18` tests, `18` pass, including `mcp endpoint rejects oversized request bodies with 413`.

```bash
git diff --check
git diff --cached --check
```

Result: no whitespace errors.

```bash
npm run verify:api
```

Result: passed; ended with `All api/index.js handler checks passed.`

```bash
npm run build
```

Result: passed; `built dist/ with 17 static assets`.

```bash
npm run smoke -- --base-url=http://127.0.0.1:3137
```

Result: passed; `Smoke check passed for http://127.0.0.1:3137/ (14 routes)`.

Note: `PORTAL_BASE_URL=http://127.0.0.1:3137 npm run smoke` was also attempted first, but the script uses `BASE_URL` or `--base-url`, so that run hit the production default and failed on the not-yet-deployed MCP routes. The supported localhost flag passed.

## Diff audit

Reviewed and committed files:

- `src/portal.mjs`
- `scripts/serve-dist.mjs`
- `scripts/smoke-check.mjs`
- `scripts/verify-api-handler.mjs`
- `test/portal.test.mjs`
- `README.md`

Commands:

```bash
git diff -- src/portal.mjs scripts/serve-dist.mjs scripts/smoke-check.mjs scripts/verify-api-handler.mjs test/portal.test.mjs README.md \
  | rg -n "productionMutationAllowed:\s*true|liveWritesEnabled:\s*true|publicAttestation:\s*true|CONTRIBUTION_INTENTS_WRITE_ENABLED\s*=\s*['\"]1|PORTAL_ENABLE_CONTRIBUTION_INTENTS\s*=\s*['\"]1|CONTRIBUTION_INTENTS_ENABLED\s*=\s*['\"]1"
```

Result: no matches.

```bash
git diff -- src/portal.mjs scripts/serve-dist.mjs scripts/smoke-check.mjs scripts/verify-api-handler.mjs test/portal.test.mjs README.md \
  | rg -n "AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY|ghp_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|sk-[A-Za-z0-9]{20,}|(api[_-]?key|secret|token|mnemonic|seed|bearer|cookie)\s*[:=]\s*['\"][^'\"]{12,}"
```

Result: no matches.

Context grep for guardrail terms showed only protective docs/tests and false assertions, including `productionMutationAllowed: false`, `publicAttestation: false`, secret-field rejection regexes, and identity route tests that assert forbidden secret field names are absent.

## Commit and repository state

```bash
git commit -m "Add review-gated MCP contribution gateway"
```

Result:

```text
[main 4bbdb3b] Add review-gated MCP contribution gateway
 6 files changed, 1906 insertions(+), 64 deletions(-)
```

Final `git status --short` after commit showed only pre-existing untracked output artifacts:

```text
?? output/874bc1ef-agent-portal-finalization/
?? output/gateway-page-forms-data-curl-intents/
?? output/gateway-page-forms-data-evidence.md
```

This report file is intentionally uncommitted task evidence under `./output/`.
