# Gateway Page Forms/Data Evidence

Task: `gateway-page-forms-data` (`#efc350de`)
Date: 2026-07-08

## Code Path

- Runtime handler: `api/index.js` imports `createRequestHandler()` from `src/portal.mjs`.
- Gateway form route: `POST /gateway/contribution-intents`.
- Shared intake pipeline: `POST /contribution-intents` and `POST /gateway/contribution-intents` both use the same contribution-intent handler.
- Static output: `npm run build` refreshed `dist/` locally; `dist/` is generated and gitignored.

## Verification

- `npm run check`: passed.
- `npm test`: passed, 11 tests.
- `npm run verify:api`: passed.
- `CONTRIBUTION_INTENTS_WRITE_ENABLED=1 CONTRIBUTION_INTENTS_DATA_DIR=<tmp> node scripts/verify-api-handler.mjs`: passed.
- `npm run build`: passed, 15 static assets.

## Curl Smoke Evidence

Local server curl probes against `POST /gateway/contribution-intents`:

| Case | Result |
| --- | --- |
| Write flag off, form-encoded POST | `501 Not Implemented`, HTML body included `Offline packet template` |
| Write flag on, valid form-encoded POST | `202 Accepted`, HTML body included `Receipt ID:` |
| Write flag on, invalid form-encoded POST | `400 Bad Request`, HTML body included `body.summary must be at least 20 characters.` and re-rendered `action="/gateway/contribution-intents"` |
| Trailing slash POST | `301 Moved Permanently`, `Location: /gateway/contribution-intents` |

Persisted records from the write-enabled curl run:

```json
{
  "receiptId": "97af35ce-c719-4750-860c-f3c283a5bc01",
  "route": "/contribution-intents",
  "intentId": "intent-2026-07-08-b38807c85065",
  "summary": "Submit a gateway backend curl smoke intent through the urlencoded visitor workflow.",
  "targetLane": "inc-ops-governance"
}
```

```json
{
  "receiptId": "97af35ce-c719-4750-860c-f3c283a5bc01",
  "status": "queued",
  "channel": "fleet",
  "requestedOwnerRoute": "M:engineering-team/engineering-lead",
  "targetLane": "inc-ops-governance"
}
```

Telemetry logs from the write-enabled server contained only these keys:

```json
[
  [
    "method",
    "path",
    "status",
    "timestamp"
  ]
]
```
