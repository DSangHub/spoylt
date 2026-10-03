(() => {
  'use strict';
  const dialog = document.getElementById('resident-endorsement-dialog');
  const form = document.getElementById('resident-endorsement-form');
  let artworkUrl = '';
  function clearArtwork() {
    if (artworkUrl) URL.revokeObjectURL(artworkUrl);
    artworkUrl = '';
    document.getElementById('resident-endorsement-artwork').removeAttribute('src');
    document.getElementById('resident-endorsement-preview').hidden = true;
  }
  document.getElementById('resident-endorsement-download').addEventListener('click', () => {
    if (document.getElementById('resident-endorsement-download').disabled) return;
    if (!artworkUrl || document.getElementById('resident-endorsement-preview').hidden) return;
    const link = document.createElement('a');
    link.href = artworkUrl; link.download = 'spoylt-favorite-candidate-2x4.svg';
    document.body.appendChild(link); link.click(); link.remove();
  });
  window.addEventListener('pagehide', clearArtwork);
  document.getElementById('resident-endorsement-open').addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
    form.elements.resident.focus();
  });
  document.getElementById('resident-endorsement-close').addEventListener('click', () => dialog.close());
  const candidateOption = document.getElementById('flyer-display-option');
  const candidateRequest = document.getElementById('flyer-duration-request');
  function updateCandidateRequest() {
    const get = id => document.getElementById(id)?.value || '';
    const body = [
      'Please review my flyer display-option request.',
      'Candidate: ' + get('flyer-candidate-name'),
      'Running for: ' + get('flyer-office'),
      'Location: ' + get('flyer-location'),
      'Requested rate: $' + (Number(get('flyer-requested-price')) / 100) + ' per week, subject to review.',
      'Display option: ' + (candidateOption.value === 'weekly_subscription' ? 'Weekly subscription' : 'One-time seven-day placement'),
      'Cutoff: end of November 2, 2026, Pacific Time (2026-11-03T08:00:00Z).',
      'This request does not activate billing or publication.'
    ].join('\n');
    candidateRequest.href = 'mailto:ispoylt@gmail.com?subject=' + encodeURIComponent('Flyer weekly display request') + '&body=' + encodeURIComponent(body);
  }
  document.getElementById('flyer-form').addEventListener('input', updateCandidateRequest);
  document.getElementById('flyer-form').addEventListener('change', updateCandidateRequest);
  candidateRequest.addEventListener('click', updateCandidateRequest);
  updateCandidateRequest();
  form.addEventListener('input', clearArtwork);
  form.addEventListener('change', clearArtwork);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    for (const name of ['resident', 'candidate', 'office', 'location']) {
      values[name] = values[name].trim();
      if (!values[name]) { form.elements[name].focus(); return; }

    }
    clearArtwork();
    artworkUrl = URL.createObjectURL(new Blob([window.SpoyltEndorsementDesign.svg(values, values.frame !== 'blue')], {type:'image/svg+xml;charset=utf-8'}));
    document.getElementById('resident-endorsement-artwork').src = artworkUrl;
    document.getElementById('resident-endorsement-artwork').alt = 'Your personal candidate endorsement in a ' + (values.frame === 'blue' ? 'blue' : 'gold-style') + ' frame';
    document.getElementById('resident-endorsement-preview').hidden = false;
    const body = [
      'Please review my resident endorsement request.',
      'Name: ' + values.resident,
      'Registered voter (self-reported): ' + values.registered,
      'Candidate: ' + values.candidate,
      'Running for: ' + values.office,
      'ZIP code or location: ' + values.location,
      'Disclaimer: My own views, not paid or endorsed by any Candidate.',
      'Requested flyer placement: $49.95 per week.',
      'Framed picture download: ' + (values.frame_purchase === 'yes' ? '$4.95 one-time purchase requested' : 'Not requested'),
      'Display option: ' + (values.display_option === 'weekly_subscription' ? 'Weekly subscription' : 'One-time seven-day placement'),
      'Cutoff: end of November 2, 2026, Pacific Time (2026-11-03T08:00:00Z).',
      'No placement beyond this cutoff.',
      'I understand this request does not publish an ad or make a payment.'
    ].join('\n');
    document.getElementById('resident-endorsement-review').href =
      'mailto:ispoylt@gmail.com?subject=' + encodeURIComponent('Resident endorsement review request') +
      '&body=' + encodeURIComponent(body);
  });
})();
