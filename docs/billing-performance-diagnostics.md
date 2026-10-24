# Backend Shopify App Pricing timing metrics

Enabled only when AARYVO_BILLING_PERF_LOGS=true in a staging backend.
The internal authenticated billing POST accepts an optional diagnostic trace
header from the Shopify app. The header never affects authentication or plan.

After valid bridge HMAC verification, backend logs an AARYVO_PERF JSON event:
backend_billing_verification, traceId, totalMs, outcome, merchantLinkMs,
shopStoreMs, pricingUrlMs, pricingVerificationMs, businessLookupMs,
partnerApiMs and subscriptionWriteMs when each stage ran.

Logs contain only randomly generated tracing IDs, durations, event names
and coarse outcomes. No domains, Shopify IDs, customer data, JWTs, credentials,
headers, request or response bodies, or API URLs are logged by these events.

Keep this off in production until staging checks are complete; collect a
short window of 10+ tests; compare Partner API and database durations.
All security checks, pricing behavior, and subscription writes are unchanged.
