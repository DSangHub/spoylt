# Automatic official and candidate FAQ assistant

This opt-in Premium feature answers questions or comments addressed to a selected verified official/candidate in the **Ask AI** panel. It does not reply to unrelated proposition comments or publish public thread messages. Replies and questions are private to the asking account and account owner.

Account owners add up to 20 factual FAQs, each with a public HTTPS reference. They approve the answers, explicitly authorize OpenAI processing, and choose whether to enable replies. Pausing is immediate and does not require an AI call. No accounts are enrolled automatically.

AI screens FAQ content and matches each question to one approved FAQ. The database returns the exact approved answer with an immutable `AI assistant for [verified name] · Approved FAQ answer` label and source URL. The model never writes the automatic answer. Missing or ambiguous coverage, unsafe content, personal cases, political persuasion and new commitments do not generate an answer. The service covers neutral factual information; it does not profile voters, recommend a vote, fundraise, advocate for a candidate or tailor political messages.

OpenAI receives the approved FAQs and incoming question text. No email, ZIP, demographic profile, verification documents, or conversation history is sent. The question form requires the visitor to accept an AI/privacy notice. The account owner must consent before configuration is saved. OpenAI Responses requests use `store:false`; that is not a promise of zero provider retention. Stored questions, approved answers and review history are in Supabase with participant-only RLS. API keys stay in Edge Function secrets.

Questions with no answer or an API failure appear in the owner's private inbox. The owner can write and send a manually moderated reply, visibly labeled as their response. A stranded request becomes eligible for manual reply after five minutes. Visitors use Refresh to retrieve a later response. There are no email notifications or autonomous follow-up messages.

Automatic answers require current Stripe identity and office/candidate verification, an unexpired verification record, a current Premium membership and explicit enablement. These checks run again in the transaction that saves the answer, together with the FAQ revision and verification snapshot. Pausing or changing FAQs during generation prevents an outdated answer from publishing. Revocation or subscription expiry prevents new automatic replies and removes the account from the signed-in directory. Previously saved exchanges remain available to their participants.

Service-only mutation RPCs prevent browser-forged settings or answers. Request-key uniqueness prevents duplicate model calls; limits are five questions/hour and twenty/day per visitor, and one hundred/day per owner. FAQ configuration/manual moderation reuse the existing moderator quota. Silent provider errors, malformed JSON, refusals and incomplete decisions produce a private review handoff rather than an answer.

Sources are supplied and approved by account owners. The model does not fetch them, fact-check them, prove identity or guarantee correct FAQ matching. Owners must keep FAQs current and review the inbox. Human identity verification and moderation remain necessary.

Deploy `scripts/official-assistant-schema.sql` and the `official-auto-assistant` function (JWT enabled, existing `OPENAI_API_KEY`, pinned Supabase client), then publish `js/official-assistant.js`, the modified `js/app.js` and `index.html`.

Validation: `node --test tests/official-assistant.test.mjs`, JavaScript syntax checks, and rollback-only `tests/official-assistant-database.sql`. Mock provider tests verify selection and failure handling; an actual authorized Premium owner and visitor must still test a real FAQ/question exchange before claiming live AI matching has been validated.
