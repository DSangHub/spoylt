// Candidate email intake. Gmail trigger calls this after the attachment arrives.
// Required email fields: Name, Office, Location, Paid for by, Committee ID (CA).

window.SpoyltFlyerIntake = (function () {
  const LEGAL = 'Paid political advertisement. Paid for by {sponsor}. Not authorized by any candidate or candidate committee unless this committee is the candidate committee.';

  function field(text, label) {
    const match = String(text || '').match(new RegExp('^' + label + '\\s*:\\s*(.+)$', 'im'));
    return match ? match[1].trim() : '';
  }

  function stamp(sponsor, committeeId) {
    const who = (sponsor || '').trim();
    if (!who) return { ok: false, reason: 'Missing Paid for by line. Flyer held.' };
    let line = 'Paid for by ' + who;
    if (committeeId) line += ' · FPPC ID ' + committeeId;
    return {
      ok: true,
      disclaimer: line,
      legal: LEGAL.replace('{sponsor}', who),
    };
  }

  function parse(emailText) {
    const name = field(emailText, 'Name');
    const office = field(emailText, 'Office');
    const location = field(emailText, 'Location');
    const sponsor = field(emailText, 'Paid for by');
    const committeeId = field(emailText, 'Committee ID');
    const message = field(emailText, 'Message');
    const stampResult = stamp(sponsor, committeeId);
    return {
      name,
      office,
      location,
      sponsor,
      committeeId,
      message,
      ...stampResult,
      held: !name || !office || !location || !stampResult.ok,
    };
  }

  function matchesRequestedLocation(adLocation, viewer) {
    const want = (adLocation || '').toLowerCase();
    const city = (viewer.city || '').toLowerCase();
    const county = (viewer.county || '').toLowerCase();
    if (!want || !city) return false;
    return want.includes(city) || (county && want.includes(county));
  }

  return { parse, stamp, matchesRequestedLocation };
})();
