# Candidate video moderation and approval

Deployment status: database gates are installed and tested. The Edge Function is prepared but not deployed because approval is required to send private candidate recordings and verification metadata to OpenAI. `VIDEO_SCREENING_ENABLED=false` keeps client invocation disabled. Deploy the function after that approval, then enable the frontend flag and update the setup notice. Do not describe live speech screening as enabled before this is complete.

Verified candidates upload MP4 files to the private `candidate-videos` bucket; the existing 50 MB storage allowance is unchanged. Automatic speech screening supports recordings up to 25,000,000 bytes. Larger recordings remain private with a screening error; candidates must submit a compressed recording for automatic screening. The browser invokes `moderate-candidate-video` with only the submission ID. The server authenticates the owner, checks current identity verification and campaign filing, downloads the stored recording, transcribes speech, screens harmful language, and assesses profanity and conflicting identity claims. It does not accept a browser-provided transcript or screening verdict.

The function uses the existing server-side `OPENAI_API_KEY`. Optional overrides are `VIDEO_TRANSCRIPTION_MODEL` (default `gpt-4o-mini-transcribe`) and `VIDEO_POLICY_MODEL` (default `gpt-5-mini`). Missing configuration, silent/unreadable recordings, timeouts, invalid provider output, and flagged language keep videos private. Speech screening does not authenticate a face/voice, establish campaign authorization, detect deepfakes, or read on-screen text. No video publishes automatically.

Internal transcripts and findings are in `candidate_video_moderation`, with no browser or public table access. Candidates see only screening status on their submissions. Completed results are reused; errored or stale attempts can be retried up to three times per video, with an owner daily limit. A screening lease prevents concurrent or stale jobs from replacing a newer result.

Before approval, a trusted reviewer must:

1. Inspect the actual private MP4 and internal findings. Resolve any foul-language or identity concerns with a new corrected submission; flagged videos cannot be approved through the normal flow.
2. Compare the person shown or heard and campaign authorization against the verified identity and authoritative filing. Obtain campaign confirmation when needed, including consent/authorization for third-party narrators or endorsements. Do not treat AI speech screening as proof of identity or authenticity.
3. Review all visual content, on-screen words, sponsor disclaimer, accessibility/playback, office district, election date, and requested ZIP placement.
4. Record the reviewer identity, notes, and both human confirmations on the private moderation row, then approve the video in one transaction through a trusted administrator/service process. Example, after actual review:

```sql
begin;
update public.candidate_video_moderation
set manual_identity_confirmed=true, manual_visual_confirmed=true,
    reviewer_identifier='<reviewer identity>', review_notes='<evidence and placement review notes>'
where video_id='<video UUID>' and status='passed';
update public.candidate_videos set status='approved', reviewed_at=now()
where id='<video UUID>' and status='pending_review';
commit;
```

Approval requires completed clean screening, a recording checksum, current unchanged candidate verification, and recorded human review. Public row and storage access recheck these conditions, so verification revocation/expiry or invalidated screening hides a video. Already-issued playback links can remain valid for up to five minutes. Owners retain access to their own private submissions.

Submission metadata is immutable; corrected recordings require a new submission. Never overwrite a reviewed storage object in place, including with a service key: submit a new object/submission so its checksum and checks bind to the reviewed bytes.

Apply `scripts/video-moderation-schema.sql` through a Supabase migration named `candidate_video_moderation`, then deploy the Edge Function and frontend. Installation was checked against a project with no video submissions. No bulk publication-status update or storage-limit change is performed. This change does not add video charging, automatic reviewer approval, or modify flyer checkout enablement.

Verification: `node --test tests/video-moderation.test.mjs` and the rollback-only `tests/video-moderation-database.sql`. Test a real authorized campaign recording from its verified owner account before calling the actual OpenAI scan and playback path fully validated.
