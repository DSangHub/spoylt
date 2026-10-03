# California proposition flyer placement

Price: 79500 USD cents per week. California statewide only. Mobile: 2 by 4 inch proportions; desktop (1024px and wider): 3 by 5 inch proportions. Right hero column, seamless bottom-to-top rotation, hover/focus/button pause, reduced-motion support.

## Current state

Landing card, private template/preview and mailto review requests are available. No new Stripe checkout is implemented or enabled. The production database schema change was rejected by automatic approval review and has NOT been applied. The frontend hides the public slot when the table is unavailable. The proposed schema is in supabase/proposition-flyers-schema.sql for explicit review and approval. Existing payment gate stays closed.

## Publication prerequisites

Apply and verify the reviewed schema; implement sponsor/content review; implement the separate $795 weekly checkout and signed invoice/payment/refund fulfillment. Authenticate owner, pin server price, correlate sessions and intents, and grant paid seven-day periods only after successful signed events. Recurring renewals need unique invoice IDs and idempotent entitlement extension. Stop by 2026-11-03T08:00:00Z (midnight after November 2 Pacific). Never manually mark a review request paid.

The proposed table prevents clients changing owner, price, payment, status or display timestamps. Public reads require approved, paid, started and unexpired rows. Browser geography filters display only; statewide political content is public information, not private access restricted by geographic location.

## Verification

JavaScript syntax checks and HTML ID/reference checks. Schema application and authenticated/anonymous RLS integration tests remain blocked pending production migration approval. No paid deliveries or email messages were sent.
