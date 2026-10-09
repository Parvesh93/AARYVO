# AARYVO Shopify — embedded staging frontend

This is an isolated Shopify React Router frontend under `shopify-frontend/` on `feat/shopify-embedded-staging` in `Parvesh93/AARYVO`. Production `main` is unchanged.

## Implemented in this scaffold
- Official Shopify React Router authentication, App Bridge, and session storage
- Shopify Admin embedded merchant navigation
- Authenticated store overview and product preview
- Shopify-only billing placeholder, no Razorpay
- Shopify-authenticated install-related webhook handlers

## Not yet implemented
- Signed communication with the existing AARYVO backend
- Automated AARYVO merchant workspace provisioning
- Live Shopify App Pricing reconciliation and cancellation flows
- Theme app embed and GDPR webhooks
- Production database and hosting; live app switch-over

## How to test safely
1. Create a separate GitHub repository named `Parvesh93/aaryvo-shopify` (the available GitHub connector cannot create a repository).
2. Move the files inside `shopify-frontend/` to that repository's root.
3. Install Node 22.12+, dependencies with `npm install`; run `npx prisma migrate deploy`.
4. Run `shopify app dev` and use a **separate development Shopify app**.
5. Confirm App Bridge and the authenticated overview/catalog in the development store.
6. Do NOT link or deploy these staging files to the current production AARYVO Shopify app.

SQLite in this starter is for local staging only; use persistent production storage before go-live.
