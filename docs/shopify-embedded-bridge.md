# AARYVO Embedded Shopify Bridge (read-only phase)

This route is intentionally staged on `feat/shopify-embedded-bridge`, **not production main**.

Endpoint: `POST /api/internal/shopify-bridge/status`

The authenticated Shopify React Router frontend signs a request using a shared
server-only secret and passes a Shopify-verified `session.shop`. The backend uses
that store domain to look up its existing Shopify-connected workspace. It never
trusts a workspace ID supplied by a browser.

## Environment (configure in BOTH deployments when ready)

`AARYVO_BRIDGE_SECRET`: Same randomly generated, **at least 32-character** secret
on Shopify frontend and AARYVO backend. Keep server-only; never prefix `NEXT_PUBLIC_`
and never commit it.

Shopify frontend also sets:

`AARYVO_BACKEND_URL=https://aaryvo.ppdesigntech.com`

## Signature contract

- Body JSON: `{"shop":"example.myshopify.com"}`
- `x-aaryvo-bridge-timestamp`: Unix timestamp in milliseconds
- `x-aaryvo-bridge-nonce`: random UUID
- `x-aaryvo-bridge-signature`: lowercase hex SHA256 HMAC of:

```text
<timestamp>
<nonce>
<shop>
POST
/api/internal/shopify-bridge/status
```

The request expires after two minutes. The endpoint is read-only, so a request
replayed within that window cannot change store state. Use a persistent nonce
store for future write operations and separate permission checks per operation.

## Expected behavior

- Missing or incorrect secret: 401 (generic message).
- Unknown or disconnected store: `{connected:false,shop}`.
- Connected Shopify workspace: returns plan, monthly usage limit, product count,
  and sync status, but **no access token, refresh token, lead details or PII**.
- No implicit workspace creation or subscription activation.

## Important rollout safeguard

Do not release this branch until the endpoint has passed build/security review
and a production Hostinger rollback point exists. Deploying this *read-only*
route has no schema migration, but still triggers a full Next.js rebuild.

Subsequent phases: secure merchant provisioning, per-operation authorization,
Shopify-token synchronization, Shopify App Pricing reconciliation, lifecycle
webhooks, and theme app embed. These must not be inferred from this status route.
