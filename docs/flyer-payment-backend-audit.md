# Flyer payment backend audit — 2026-09-30

Live checkout remains disabled. A public-key-authorized request to the deployed
checkout returned HTTP 400: `Flyer payments are being configured. No charge has
been made.` No flags or secrets were changed and no Stripe charges were made.

## Verified

- Deployed sources matched the repository before the audit: checkout v6 and webhook v13.
- Stripe account `spoylt.org` has one enabled live webhook destination, pointing to
  `https://xceamvdvjnutaovqpsbr.supabase.co/functions/v1/stripe-webhook`.
  No Manus webhook endpoint remains on that account.
- The live webhook returned HTTP 400 for missing and invalid signatures. The
  checkout gateway returned HTTP 401 without authorization.
- 34 automated tests run the actual TypeScript handlers with the real Stripe SDK
  signature verifier, an isolated signing secret, and in-memory database/API adapters.
  These are handler integration tests, not live Stripe deliveries.
- Tests cover reviewed $149/$299/$495 amounts; exact USD totals; flyer ownership;
  session ID and client reference; PaymentIntent amount/status/metadata; unpaid and
  async events; duplicate and concurrent deliveries; partial/full refunds; refund
  ordering; mismatched identities; and transient database failures.
- A rolled-back transaction against the deployed database verified the exact
  49,500-cent congressional fee, immutable reviewed pricing, approval guard,
  owner payment denial, public visibility only after payment, conditional duplicate
  updates, and removal from public view on refund. No fixtures remain.

## Fixes

- Concurrent checkout requests sharing Stripe's idempotency key no longer expire
  the session successfully attached by the other request. Uncertain database errors
  return a retryable checkout error without expiring a possibly attached session.
- Reused open sessions must match owner, flyer, client reference, mode, currency,
  reviewed fee, and metadata.
- Success processing requires an expanded charge and reconciles refunds again
  after attaching the PaymentIntent. This catches a refund delivered between the
  initial Stripe lookup and database update; retries remain safe after refunds.
- A completed unpaid checkout with a confirmed failed/canceled PaymentIntent can
  start a new checkout attempt. Processing payments cannot start another charge.
  Failed async events never approve a flyer; retry eligibility comes from the
  current Stripe PaymentIntent, rather than event arrival order.

## Repeat checks

Use Node 24 or later:

```bash
npm ci --prefix tests
npm test --prefix tests
```

`tests/flyer-payments-database.sql` is a trusted-administrator transaction that
rolls back every fixture. Review it before executing against another database.

## Activation still blocked

A correct URL and rejection of forged signatures do not demonstrate that the
stored `STRIPE_WEBHOOK_SECRET` matches the live destination. Signed live Stripe
delivery and correct persisted flyer state have not been verified in this audit.
Keep `FLYER_PAYMENTS_ENABLED` absent or `false` until that evidence is available.
An isolated signed handler test does not replace live destination verification.
