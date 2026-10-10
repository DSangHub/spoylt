/* Hashtag ownership is enforced by database grants, uniqueness and RLS. */
let candidateHashtagVersion = 0;
let candidateHashtagSaved = null;
function candidateHashtagEligible(user, verification, now = new Date()) {
  return Boolean(user && verification?.user_id === user.id &&
    verification.verification_type === 'candidate' && verification.status === 'verified' &&
    verification.identity_status === 'verified' && new Date(verification.expires_at) > now &&
    verification.election_date >= now.toISOString().slice(0, 10));
}
function normalizeCandidateHashtag(value) {
  return value.trim().replace(/^#/, '').toLowerCase();
}
function hashtagStatus(message) {
  document.getElementById('candidate-hashtag-status').textContent = message;
}
async function refreshCandidateHashtag() {
  const version = ++candidateHashtagVersion;
  const owner = currentUser?.id;
  const eligible = candidateHashtagEligible(currentUser, verificationRequest);
  document.getElementById('candidate-hashtag-tools')?.classList.toggle('hidden', !eligible);
  candidateHashtagSaved = null;
  document.getElementById('candidate-hashtag').value = '';
  document.getElementById('candidate-hashtag-copy').disabled = true;
  if (!eligible) return;
  hashtagStatus('Loading your hashtag…');
  const { data, error } = await db.from('candidate_hashtags').select('hashtag').eq('owner_id', owner).maybeSingle();
  if (version !== candidateHashtagVersion || currentUser?.id !== owner) return;
  if (error) { hashtagStatus('Could not load your hashtag. Please refresh and try again.'); return; }
  candidateHashtagSaved = data?.hashtag || null;
  document.getElementById('candidate-hashtag').value = data?.hashtag || '';
  document.getElementById('candidate-hashtag-copy').disabled = !candidateHashtagSaved;
  hashtagStatus(candidateHashtagSaved ? 'Your hashtag: #' + candidateHashtagSaved : 'Choose your unique campaign hashtag.');
}
function setupCandidateHashtags() {
  document.getElementById('candidate-hashtag-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!candidateHashtagEligible(currentUser, verificationRequest)) {
      hashtagStatus('Current identity and candidate verification are required.'); return;
    }
    const owner = currentUser.id;
    const tag = normalizeCandidateHashtag(document.getElementById('candidate-hashtag').value);
    if (!/^[a-z][a-z0-9_]{2,39}$/.test(tag)) {
      hashtagStatus('Use 3–40 letters, numbers or underscores, starting with a letter.'); return;
    }
    const version = candidateHashtagVersion;
    const button = document.getElementById('candidate-hashtag-save');
    button.disabled = true;
    hashtagStatus('Saving your hashtag…');
    try {
      const query = candidateHashtagSaved
        ? db.from('candidate_hashtags').update({ hashtag: tag }).eq('owner_id', owner)
        : db.from('candidate_hashtags').insert({ owner_id: owner, hashtag: tag });
      const { data, error } = await query.select('hashtag').single();
      if (version !== candidateHashtagVersion || currentUser?.id !== owner) return;
      if (error) {
        hashtagStatus(error.code === '23505' ? 'That hashtag is already reserved. Choose another.' :
          'Could not save. Refresh your verification status and try again.'); return;
      }
      candidateHashtagSaved = data.hashtag;
      document.getElementById('candidate-hashtag').value = data.hashtag;
      document.getElementById('candidate-hashtag-copy').disabled = false;
      hashtagStatus('Saved: #' + data.hashtag + '. You can copy it into your campaign posts.');
    } catch { if (currentUser?.id === owner) hashtagStatus('Could not save. Please try again.'); }
    finally { button.disabled = false; }
  });
  document.getElementById('candidate-hashtag-copy')?.addEventListener('click', async () => {
    if (!candidateHashtagSaved || !candidateHashtagEligible(currentUser, verificationRequest)) return;
    try { await navigator.clipboard.writeText('#' + candidateHashtagSaved); hashtagStatus('Hashtag copied.'); }
    catch { hashtagStatus('Copy #' + candidateHashtagSaved + ' manually.'); }
  });
}
