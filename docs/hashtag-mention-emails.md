# Automatic hashtag emails

Accepted new comments and proposition titles/suggestions queue one email per mentioned candidate and source record. Hashtags match exactly, case-insensitively; self mentions, partial matches, opted-out accounts and unverified/expired candidates are excluded. Existing content is not backfilled and edits do not generate new alerts.

## Activation

The backend is deployed to Supabase project xceamvdvjnutaovqpsbr. The scheduler runs every minute. Email delivery is awaiting sender configuration.

1. Create a Resend account and verify a sending domain using its DNS instructions. Use a domain you control, such as spoylt.org; do not use gmail.com as the sender domain.
2. In Supabase Dashboard → Edge Functions → Secrets, set RESEND_API_KEY to a Resend sending API key and HASHTAG_EMAIL_FROM to a plain verified address such as notifications@spoylt.org. These belong in Supabase, where the worker runs. Keep values out of source control and chat.
3. GET https://xceamvdvjnutaovqpsbr.supabase.co/functions/v1/send-hashtag-email should report email_configured:true. This confirms configuration presence, not provider authorization or inbox delivery.
4. A currently verified candidate saves a hashtag and opts into email alerts. From a different account, post an accepted comment containing that exact hashtag. Check the candidate's account email (including spam), Resend delivery logs, and private.hashtag_email_jobs. Confirm one provider acceptance and one email; repeated hashtag tokens in the same comment must not duplicate it. Opt out and post another mention: no email should be queued.

Replies go to ispoylt@gmail.com. Alerts go only to the candidate's confirmed account email. Each email explains how to opt out in the profile.

## Backend

Apply scripts/hashtag-mention-emails.sql once. Deploy supabase/functions/send-hashtag-email/index.ts with mail.mjs. JWT verification is disabled solely because each POST authenticates using an opaque, random, per-job dispatch token. The token is checked through a service-role-only RPC; clients cannot read the private job queue. The net schema is not exposed through PostgREST (verified PGRST106; exposed schemas public and graphql_public). pg_net internally grants table access to PUBLIC; postgres cannot revoke its owner grants. Never expose net through the public API or grant untrusted users direct SQL access to it. The opaque token can only trigger its fixed, consent-checked job; it cannot select recipients or email content.

Database triggers create jobs after accepted content is inserted. pg_cron/pg_net dispatch up to ten due jobs each minute. The worker rechecks current consent, hashtag, candidate/identity approval, election/verification expiration, confirmed email and source existence before sending. Missing sender configuration postpones jobs without consuming sending attempts.

Resend idempotency keys, frozen email payloads and job leases prevent duplicate provider submissions. Transient failures retry; permanent provider rejection fails the job. Maximum eight attempts within 23 hours of the first sending attempt. A changed recipient or sender stops retries to keep the provider payload stable. Sent means accepted by Resend, not guaranteed inbox delivery.

## Validation

node --test tests/hashtag-email.test.mjs

Run tests/hashtag-email-database.sql in Supabase SQL: transaction rolls back all fixtures and sends no real email. It covers exact matching, deduplication, opt-out, invalid token, configuration missing, leases, terminal replay and client access denial.

Security advisor reports RLS-without-policy for the private queue: intentional deny-all for client roles, with service-role bypass. No public read policy is appropriate.

Provider documentation: https://resend.com/docs/api-reference/emails/send-email and https://resend.com/docs/dashboard/emails/idempotency-keys
