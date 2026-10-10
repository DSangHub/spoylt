# Candidate hashtags

Verified candidates can save and copy a unique hashtag in the secure candidate portal. Identity approval, candidate approval, a future verification expiry and a current election date are required. This feature has no additional payment gate.

Tags contain 3–40 ASCII letters, digits or underscores and start with a letter. The client removes an optional leading # and saves lowercase. Database constraints enforce canonical tags and global uniqueness; each owner has one tag. Editing releases the previous tag. Revoked and expired owners cannot edit, and their reservation remains until an administrator reviews it.

`candidate_hashtags` allows authenticated owners to read their own record and insert or update their hashtag only while verified. Anonymous users cannot read or write. Owner IDs and creation timestamps cannot be changed by clients. Verification comes from protected `verification_requests`, not user-editable metadata.

Run `scripts/candidate-hashtags-schema.sql` for initial setup and `tests/candidate-hashtags-database.sql` for a transactional allow/deny test. Fixtures roll back. Run `node --test tests/candidate-hashtags.test.cjs` for client gate and normalization checks.

This release reserves and copies tags for candidate posts. It does not implement mention matching, email alerts, or a public hashtag directory.
