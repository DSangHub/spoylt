(() => {
  'use strict';
  const dialog = document.getElementById('resident-endorsement-dialog');
  const form = document.getElementById('resident-endorsement-form');
  document.getElementById('resident-endorsement-open').addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
    form.elements.resident.focus();
  });
  document.getElementById('resident-endorsement-close').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    for (const name of ['resident', 'candidate', 'office', 'location']) {
      values[name] = values[name].trim();
      if (!values[name]) { form.elements[name].focus(); return; }
      document.getElementById('endorsement-preview-' + name).textContent = values[name];
    }
    document.getElementById('resident-endorsement-preview').hidden = false;
    const body = [
      'Please review my resident endorsement request.',
      'Name: ' + values.resident,
      'Registered voter (self-reported): ' + values.registered,
      'Candidate: ' + values.candidate,
      'Running for: ' + values.office,
      'ZIP code or location: ' + values.location,
      'Disclaimer: My own views, not paid or endorsed by any Candidate.',
      'Requested placement: $49.50 for 1 week.',
      'I understand this request does not publish an ad or make a payment.'
    ].join('\n');
    document.getElementById('resident-endorsement-review').href =
      'mailto:ispoylt@gmail.com?subject=' + encodeURIComponent('Resident endorsement review request') +
      '&body=' + encodeURIComponent(body);
  });
})();
