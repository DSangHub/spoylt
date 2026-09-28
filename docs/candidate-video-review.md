# Candidate video review

Candidates submit a video file, legal sponsor, filing ID, election date, and requested five-digit ZIP. Uploads go into the private `candidate-videos` bucket. The browser has no permission to approve or delete records or replace files.

Before approving an individual submission, an authorized reviewer must:

1. Confirm the candidate's identity and active election filing against the authoritative source; check that the committee ID and sponsor disclosure match the submitted ad.
2. Inspect the actual private MP4 for content, accessibility and playback; validate the requested ZIP against the office's district and the approved placement arrangement. Confirm applicable political-ad disclosures and any campaign-ad requirements for that jurisdiction.
3. Record approval through a trusted service role or admin process by setting `status = 'approved'` and `reviewed_at = now()` on the reviewed row. The database trigger rejects approval without a current verified candidate. Set `status = 'rejected'` or `paused` when appropriate. Never put the service role key in a browser or Vercel variable exposed to the client.
4. Check the public page for the specified ZIP and ensure it displays the right video and legal sponsor. Check another ZIP and anonymous access to a pending video; neither should display it. A signed playback URL is short lived, so revocation of a previously issued URL can take up to five minutes.

There is no video payment or automated reviewer workflow in this release. Reviewing a submission does not authorize charging a candidate. The flyer checkout switch remains independent and disabled until its signed live Stripe webhook has been verified.
