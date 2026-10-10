# Automatic hashtag emails via Gmail

The Supabase worker sends from ispoylt@gmail.com through the Gmail API. Resend is no longer used for hashtag alerts. Accepted new comments and proposition titles/suggestions queue one email per mentioned candidate and source record. Exact case-insensitive hashtags, current identity/candidate verification, confirmed account email and opt-in are required. Self mentions, partial matches and existing content are excluded.

## One-time owner authorization

Use Google Cloud while signed in as ispoylt@gmail.com:

1. Create/select a project at https://console.cloud.google.com/ and enable Gmail API.
2. Configure Google Auth Platform branding/audience. Create a Web application OAuth client with authorized redirect URI https://developers.google.com/oauthplayground. This is a private administrative sender setup, not a candidate login.
3. At https://developers.google.com/oauthplayground open the settings gear, enable Use your own OAuth credentials and enter the client ID and secret. Request scopes https://www.googleapis.com/auth/gmail.send and https://www.googleapis.com/auth/userinfo.email. Authorize ispoylt@gmail.com, exchange the authorization code, and obtain the refresh token. The worker uses email identity only to confirm the sender is ispoylt@gmail.com. It cannot read the inbox.
4. In https://supabase.com/dashboard/project/xceamvdvjnutaovqpsbr/functions/secrets add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN. These are Supabase secrets, not Vercel variables. Never paste secrets in chat or commit them. A Gmail password or Google API key does not replace these OAuth credentials.
5. Google external apps in Testing with Gmail scopes have refresh tokens that expire after seven days. Use an appropriate Production configuration for ongoing use. Google may show an unverified-app warning or require verification depending on the app/audience; follow Google's guidance. Do not revoke the sender grant or change the OAuth project without updating credentials.

GET https://xceamvdvjnutaovqpsbr.supabase.co/functions/v1/send-hashtag-email reports provider:gmail and email_configured:true after all three secrets are present. This checks presence, not validity. No real Gmail integration test is possible before owner authorization.

## Delivery and safety

Apply scripts/hashtag-mention-emails.sql on a fresh database, then scripts/hashtag-gmail-delivery.sql. Deploy index.ts and mail.mjs. The existing one-minute scheduler uses private per-job dispatch tokens; public clients cannot choose recipients or read the queue. The worker rechecks consent, verification, expiration and source existence before sending, then verifies the OAuth account identity matches the fixed sender.

Gmail lacks a send-idempotency API. The database records a submission marker before the outbound call. Explicit quota rejection can retry; uncertain response, timeout or a crash after marking submission is held as failed for manual review. Check Gmail Sent for the stable Message-ID before any manual retry. This prioritizes avoiding duplicate notifications and can leave a notification unsent after an ambiguous failure. Successful results record the Gmail message ID. Sent means Gmail accepted the message, not confirmed inbox delivery.

A database lock caps automated submission reservations at 300 per rolling 24 hours, leaving capacity for manual email. Google can impose lower/account-wide limits; manual sends are outside this local count. Pre-submission authorization failures do not send emails. Missing secrets postpone jobs without consuming attempts. Replies go to ispoylt@gmail.com. Every alert explains how to opt out in the candidate profile.

## Validation

node --test tests/hashtag-email.test.mjs

Run tests/hashtag-email-database.sql and tests/hashtag-gmail-database.sql in SQL. Both roll back fixtures and send no email. Test one real accepted hashtag mention from another account after sender authorization, confirm a message in Gmail Sent and the candidate inbox, then verify opt-out suppression.

References: https://developers.google.com/workspace/gmail/api/guides/sending and https://developers.google.com/identity/protocols/oauth2/web-server
