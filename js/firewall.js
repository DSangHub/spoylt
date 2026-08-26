/**
 * SPOYLT Community Firewall
 * Detects: fake accounts, vulgar / racist / sexist language, romance scams.
 * Action: reject content, remove offender posts, permanently block origin email on-platform.
 *
 * This does NOT delete or access anyone's Gmail/Outlook mailbox.
 * It bans the email from SPOYLT accounts, posts, comments, and future signups.
 */
(function (global) {
  const STORAGE_BLOCKS = 'spoylt_blocked_emails';
  const STORAGE_LOG = 'spoylt_firewall_log';

  const DISPOSABLE_DOMAINS = new Set([
    'mailinator.com', 'guerrillamail.com', 'guerrillamail.org', '10minutemail.com',
    'tempmail.com', 'temp-mail.org', 'throwaway.email', 'yopmail.com', 'getnada.com',
    'trashmail.com', 'sharklasers.com', 'grr.am', 'dispostable.com', 'maildrop.cc',
    'moakt.com', 'tempail.com', 'fakeinbox.com', 'mailnesia.com', 'discard.email',
    'inboxkitten.com', 'emailondeck.com', 'minuteinbox.com',
  ]);

  // Normalized tokens (spaces = word boundary). Leetspeak is folded before match.
  const VULGAR = [
    'fuck', 'fucker', 'motherfucker', 'shit', 'bullshit', 'asshole', 'bastard',
    'bitch', 'cunt', 'dickhead', 'cock', 'pussy', 'slut', 'whore', 'twat',
    'wanker', 'prick',
  ];

  const RACIST = [
    'nigger', 'nigga', 'kike', 'spic', 'chink', 'gook', 'wetback', 'beaner',
    'paki', 'raghead', 'towelhead', 'cracker', 'honky', 'coon', 'jigaboo',
    'porch monkey', 'white power', 'heil hitler', 'gas the',
  ];

  const SEXIST = [
    'women belong in the kitchen', 'make me a sandwich', 'female driver',
    'bitches belong', 'all women are', 'all men are trash', 'feminazi',
    'women are property', 'she asked for it', 'locker room talk',
  ];

  const ROMANCE_SCAM = [
    { re: /\b(lonely|widowed?|widow(er)?)\b.{0,40}\b(love|heart|soulmate|marry|marriage)\b/i, label: 'lonely-widow love pitch' },
    { re: /\b(us army|u\.?s\.? (army|navy|air force|marine)|deployed (overseas|abroad)|peacekeeping)\b.{0,80}\b(send|western union|gift card|bitcoin|wallet|urgent)\b/i, label: 'military + money request' },
    { re: /\b(western union|moneygram|gift ?cards?|steam card|apple card|google play card|crypto(currency)? wallet|bitcoin|usdt|wire transfer)\b/i, label: 'payment rail used in scams' },
    { re: /\b(can'?t access (my )?(funds|money|account|inheritance))\b/i, label: 'inaccessible funds story' },
    { re: /\b(true love|soul ?mate|god brought us together|destiny)\b.{0,60}\b(send|transfer|help me|urgent|emergency)\b/i, label: 'love + urgency + money' },
    { re: /\b(whatsapp me|text me on whatsapp|telegram me)\b.{0,40}\b(dear|darling|honey|baby|love)\b/i, label: 'off-platform romance lure' },
    { re: /\b(prince|inheritance|oil money|unclaimed funds|diplomat)\b.{0,80}\b(share|partner|beloved|send)\b/i, label: 'inheritance / prince bait' },
    { re: /\bi am a (widow|widower|doctor|engineer) in (nigeria|ghana|cameroon|syria)\b/i, label: 'classic advance-fee persona' },
    { re: /\b(need you to (hold|receive|cash) (a )?(package|check|money))\b/i, label: 'mule / package request' },
  ];

  const FAKE_NAME_RE = [
    /^(user|test|asdf|qwerty|admin|xxx|hotgirl|sexy|lonelyheart)\d*$/i,
    /^[a-z]{1,2}\d{5,}$/i,
    /^(john|jane)(doe|smith)\d*$/i,
  ];

  function foldLeet(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[@àáâãäå]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö0]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/[$5]/g, 's')
      .replace(/[1!|]/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/7/g, 't')
      .replace(/8/g, 'b')
      .replace(/©/g, 'c')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function wordHit(folded, list) {
    const hits = [];
    for (const term of list) {
      const t = foldLeet(term);
      const re = new RegExp('(?:^|\\s)' + t.replace(/\s+/g, '\\s+') + '(?:s|es|ed|ing)?(?:\\s|$)');
      if (re.test(' ' + folded + ' ')) hits.push(term);
    }
    return hits;
  }

  function normalizeEmail(email) {
    if (!email) return '';
    let e = String(email).trim().toLowerCase();
    const at = e.lastIndexOf('@');
    if (at < 1) return e;
    let local = e.slice(0, at);
    let domain = e.slice(at + 1);
    if (domain === 'googlemail.com') domain = 'gmail.com';
    const plus = local.indexOf('+');
    if (plus !== -1) local = local.slice(0, plus);
    if (domain === 'gmail.com') local = local.replace(/\./g, '');
    return local + '@' + domain;
  }

  function emailDomain(email) {
    const n = normalizeEmail(email);
    const i = n.lastIndexOf('@');
    return i === -1 ? '' : n.slice(i + 1);
  }

  function loadBlocks() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_BLOCKS) || '[]');
    } catch {
      return [];
    }
  }

  function saveBlocks(list) {
    localStorage.setItem(STORAGE_BLOCKS, JSON.stringify(list));
  }

  function loadLog() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_LOG) || '[]');
    } catch {
      return [];
    }
  }

  function appendLog(entry) {
    const log = loadLog();
    log.unshift({ ...entry, at: Date.now() });
    localStorage.setItem(STORAGE_LOG, JSON.stringify(log.slice(0, 200)));
  }

  function isBlocked(email) {
    const n = normalizeEmail(email);
    if (!n) return false;
    return loadBlocks().some((b) => b.email === n && b.permanent);
  }

  function blockEmail(email, reasons, extras = {}) {
    const n = normalizeEmail(email);
    if (!n || !n.includes('@')) return null;
    const list = loadBlocks();
    const existing = list.find((b) => b.email === n);
    const record = {
      email: n,
      original: String(email).trim().toLowerCase(),
      permanent: true,
      reasons: Array.from(new Set([...(existing?.reasons || []), ...reasons])),
      blockedAt: existing?.blockedAt || Date.now(),
      updatedAt: Date.now(),
      ...extras,
    };
    const next = existing ? list.map((b) => (b.email === n ? record : b)) : [record, ...list];
    saveBlocks(next);
    appendLog({ action: 'PERMANENT_BLOCK', email: n, reasons: record.reasons });
    return record;
  }

  function scanText(text) {
    const raw = String(text || '');
    const folded = foldLeet(raw);
    const reasons = [];
    const vulgar = wordHit(folded, VULGAR);
    const racist = wordHit(folded, RACIST);
    const sexist = wordHit(folded, SEXIST);
    if (vulgar.length) reasons.push({ type: 'vulgar', hits: vulgar });
    if (racist.length) reasons.push({ type: 'racist', hits: racist });
    if (sexist.length) reasons.push({ type: 'sexist', hits: sexist });

    const scamHits = [];
    for (const rule of ROMANCE_SCAM) {
      if (rule.re.test(raw) || rule.re.test(folded)) scamHits.push(rule.label);
    }
    if (scamHits.length) reasons.push({ type: 'romance_scam', hits: scamHits });

    return { ok: reasons.length === 0, reasons };
  }

  function scanAccount({ email, displayName }) {
    const reasons = [];
    const n = normalizeEmail(email);
    if (!n || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) {
      reasons.push({ type: 'fake_account', hits: ['invalid or missing email'] });
      return { ok: false, reasons };
    }
    if (isBlocked(n)) {
      reasons.push({ type: 'blocked_email', hits: ['origin email is permanently blocked'] });
    }
    const domain = emailDomain(n);
    if (DISPOSABLE_DOMAINS.has(domain)) {
      reasons.push({ type: 'fake_account', hits: ['disposable email domain: ' + domain] });
    }
    const local = n.split('@')[0];
    if (/^[a-z0-9]{18,}$/i.test(local) && /\d{4,}/.test(local)) {
      reasons.push({ type: 'fake_account', hits: ['randomized mailbox local-part'] });
    }
    if (displayName) {
      const name = String(displayName).trim();
      if (FAKE_NAME_RE.some((re) => re.test(name.replace(/\s+/g, '')))) {
        reasons.push({ type: 'fake_account', hits: ['suspicious display name'] });
      }
    }
    return { ok: reasons.length === 0, reasons };
  }

  /**
   * Full inspect. On hard violations: block email + request content purge.
   */
  function inspect({ email, displayName, title, body, comment }) {
    const account = scanAccount({ email, displayName });
    const text = [title, body, comment].filter(Boolean).join('\n');
    const content = scanText(text);
    const reasons = [...account.reasons, ...content.reasons];
    const hardTypes = new Set(['racist', 'sexist', 'romance_scam', 'blocked_email', 'fake_account']);
    const isHard = reasons.some((r) => hardTypes.has(r.type));
    const isVulgarOnly = reasons.length && reasons.every((r) => r.type === 'vulgar');

    const result = {
      allowed: reasons.length === 0,
      blockEmail: isHard,
      deleteContent: isHard || isVulgarOnly,
      reasons,
      summary: reasons.map((r) => r.type + ': ' + r.hits.join(', ')).join(' · ') || 'clean',
    };

    if (result.blockEmail) {
      blockEmail(email, reasons.map((r) => r.type), { lastSnippet: text.slice(0, 160) });
    } else if (isVulgarOnly) {
      appendLog({ action: 'CONTENT_REJECTED', email: normalizeEmail(email), reasons: ['vulgar'] });
    }

    return result;
  }

  function purgeByEmail(items, email) {
    const n = normalizeEmail(email);
    return (items || []).filter((p) => normalizeEmail(p.email || p.authorEmail) !== n);
  }

  function publicMessage(result) {
    if (result.allowed) return 'Passed Community Firewall.';
    if (result.reasons.some((r) => r.type === 'blocked_email')) {
      return 'This email is permanently blocked from SPOYLT. You cannot post, comment, or create a new account.';
    }
    if (result.reasons.some((r) => r.type === 'romance_scam')) {
      return 'Romance-scam pattern detected. Content removed. Origin email permanently blocked.';
    }
    if (result.reasons.some((r) => r.type === 'racist' || r.type === 'sexist')) {
      return 'Hate speech detected. Content removed. Origin email permanently blocked.';
    }
    if (result.reasons.some((r) => r.type === 'fake_account')) {
      return 'Fake or disposable account detected. Origin email permanently blocked.';
    }
    if (result.reasons.some((r) => r.type === 'vulgar')) {
      return 'Vulgar language is not allowed on the Community Board. Edit and resubmit.';
    }
    return 'Blocked by Community Firewall.';
  }

  global.SpoyltFirewall = {
    inspect,
    scanText,
    scanAccount,
    isBlocked,
    blockEmail,
    loadBlocks,
    loadLog,
    purgeByEmail,
    normalizeEmail,
    publicMessage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
