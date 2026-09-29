// SPOYLT production client — Supabase Auth, Database, Realtime, and Stripe Checkout
const SUPABASE_URL = 'https://xceamvdvjnutaovqpsbr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_uE5aJ-o74jGRS983ND15pg_2xxLVEzw';
const REMEMBER_KEY = 'spoylt-stay-signed-in';
const sessionStorageAdapter = {
  getItem(key) {
    return (localStorage.getItem(REMEMBER_KEY) === 'false' ? sessionStorage : localStorage).getItem(key);
  },
  setItem(key, value) {
    (localStorage.getItem(REMEMBER_KEY) === 'false' ? sessionStorage : localStorage).setItem(key, value);
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: sessionStorageAdapter },
});

const CATEGORIES = [
  { id: 'housing', label: 'Housing Crisis', icon: '🏠' },
  { id: 'gas', label: 'High Gas Prices', icon: '⛽' },
  { id: 'fire', label: 'Protection from Fires', icon: '🔥' },
  { id: 'potholes', label: 'Street Potholes', icon: '🕳️' },
  { id: 'police', label: 'Police Protection', icon: '👮' },
  { id: 'animal', label: 'Animal Services', icon: '🐾' },
  { id: 'food', label: 'Food Banks Funding', icon: '🥫' },
  { id: 'elections', label: 'Elections & Government', icon: '🗳️' },
];

const STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],
  ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],
  ['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],
  ['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],
  ['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
  ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
  ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],
  ['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],
  ['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],
  ['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
];
const stateName = (code) => STATES.find(([value]) => value === code)?.[1] || code;

const CA_COUNTIES = [
  'Alameda','Alpine','Amador','Butte','Calaveras','Colusa','Contra Costa','Del Norte',
  'El Dorado','Fresno','Glenn','Humboldt','Imperial','Inyo','Kern','Kings','Lake',
  'Lassen','Los Angeles','Madera','Marin','Mariposa','Mendocino','Merced','Modoc',
  'Mono','Monterey','Napa','Nevada','Orange','Placer','Plumas','Riverside',
  'Sacramento','San Benito','San Bernardino','San Diego','San Francisco','San Joaquin',
  'San Luis Obispo','San Mateo','Santa Barbara','Santa Clara','Santa Cruz','Shasta',
  'Sierra','Siskiyou','Solano','Sonoma','Stanislaus','Sutter','Tehama','Trinity',
  'Tulare','Tuolumne','Ventura','Yolo','Yuba'
];

let selectedCategory = null;
let propositionScope = 'local';
let currentUser = null;
let currentProfileName = '';
let verifiedOfficial = false;
let verificationType = null;
let verificationRequest = null;
let currentPlan = 'citizen';
let propositions = [];
let ballotMeasures = [];
let userLocation = { city: 'your area', county: '', stateCode: '', region: '', postalCode: '', lat: null, lng: null };
let viewingZip = '';
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function showZipSample(postalCode) {
  const visible = postalCode === '95252';
  $('#zip-sample-flyer')?.classList.toggle('hidden', !visible);
  $('#hero-layout')?.classList.toggle('has-zip-sample', visible);
}

$('#zip-sample-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const zip = $('#zip-sample-input')?.value.trim() || '';
  showZipSample(/^\d{5}$/.test(zip) ? zip : '');
});

function showToast(message, duration = 4200) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  setTimeout(() => {
    toast.classList.add('translate-y-24', 'opacity-0');
    toast.classList.remove('translate-y-0', 'opacity-100');
  }, duration);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function timeAgo(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

async function loadAccountIdentity() {
  currentProfileName = '';
  verifiedOfficial = false;
  currentPlan = 'citizen';
  if (!currentUser) {
    renderAiModeratorAccess();
    return;
  }

  const [profileResult, membershipResult] = await Promise.all([
    db.from('profiles').select('display_name').eq('id', currentUser.id).maybeSingle(),
    db.from('memberships').select('plan,status,verification_type,verification_status,verification_expires_at,verified_official').eq('user_id', currentUser.id).maybeSingle(),
  ]);

  currentProfileName = profileResult.data?.display_name || currentUser.user_metadata?.full_name || '';
  const membership = membershipResult.data;
  currentPlan = ['active', 'trialing'].includes(membership?.status) ? (membership?.plan || 'citizen') : 'citizen';
  renderAiModeratorAccess();
  const verificationCurrent = membership?.verification_status === 'verified' &&
    (!membership?.verification_expires_at || new Date(membership.verification_expires_at) > new Date());
  verifiedOfficial = Boolean(verificationCurrent && membership?.verification_type === 'official' && membership?.verified_official);
  verificationType = verificationCurrent ? membership?.verification_type : null;

  const button = $('#auth-button');
  if (button && currentUser) {
    const name = currentProfileName || currentUser.email || 'Account';
    button.textContent = verifiedOfficial
      ? '⭐ ✓ ' + name + ' · Sign out'
      : verificationType === 'candidate'
        ? '✓ Candidate ' + name + ' · Sign out'
        : name + ' · Sign out';
    button.classList.toggle('border-amber-400', verifiedOfficial);
    button.classList.toggle('text-amber-300', verifiedOfficial);
    button.classList.toggle('border-sky-400', verificationType === 'candidate');
    button.classList.toggle('text-sky-300', verificationType === 'candidate');
    button.title = verifiedOfficial
      ? 'Verified Public Official Account'
      : verificationType === 'candidate'
        ? 'Verified Candidate Account'
        : currentUser.email || '';
  }
}

function updateAuthUI() {
  const authCard = $('#auth-card');
  if (authCard) authCard.classList.toggle('hidden', Boolean(currentUser));
  let button = $('#auth-button');
  if (!button) {
    button = document.createElement('button');
    button.id = 'auth-button';
    button.className = 'text-xs border border-slate-600 hover:border-sky-400 px-3 py-2 rounded-lg transition';
    const navActions = $('#geo-btn')?.parentElement;
    navActions?.prepend(button);
  }
  const email = $('#author-email');
  if (currentUser) {
    button.textContent = 'Account · Sign out';
    button.title = currentUser.email || '';
    if (email) {
      email.value = currentUser.email || '';
      email.readOnly = true;
    }
    button.onclick = async () => {
      await db.auth.signOut();
      currentProfileName = '';
      verifiedOfficial = false;
      verificationType = null;
      verificationRequest = null;
      currentPlan = 'citizen';
      renderVerificationStatus();
      renderAiModeratorAccess();
      showToast('Signed out.');
    };
    loadAccountIdentity();
  } else {
    button.textContent = 'Sign in';
    if (email) email.readOnly = false;
    button.onclick = () => {
      document.getElementById('start').scrollIntoView({ behavior: 'smooth' });
      $('#signin-email')?.focus();
      showToast('Use Create Account if you are new, or Sign In if you already have an account.');
    };
  }
}

function friendlyAuthError(error) {
  const message = error?.message || 'Authentication failed. Please try again.';
  if (/rate limit/i.test(message)) {
    return 'Email limit reached. Please wait before creating another account, or use Sign In if you already have one.';
  }
  if (/invalid login credentials/i.test(message)) {
    return 'Email or password is incorrect.';
  }
  if (/already registered|already exists/i.test(message)) {
    return 'That email already has an account. Use the Sign In box.';
  }
  return message;
}

async function createAccount(email, password, username, firstName, lastName) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: 'https://www.spoylt.org/',
      data: { full_name: fullName, first_name: firstName, last_name: lastName, username },
    },
  });
  if (error) {
    showToast(friendlyAuthError(error), 7000);
    return;
  }
  if (data.session) {
    showToast('Your account is ready. You are signed in.');
  } else {
    showToast('Account created. Check your email once to confirm your address.', 7000);
  }
}

async function signIn(email, password) {
  const staySignedIn = $('#stay-signed-in')?.checked !== false;
  // Move an existing session to the chosen browser storage after successful authentication.
  const oldStorage = localStorage.getItem(REMEMBER_KEY) === 'false' ? sessionStorage : localStorage;
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    showToast(friendlyAuthError(error), 7000);
    return;
  }

  const newStorage = staySignedIn ? localStorage : sessionStorage;
  if (oldStorage !== newStorage) {
    const authKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    const session = oldStorage.getItem(authKey);
    if (session) newStorage.setItem(authKey, session);
    oldStorage.removeItem(authKey);
  }
  localStorage.setItem(REMEMBER_KEY, String(staySignedIn));

  showToast('Signed in successfully.');
  await loadAccountIdentity();
}

async function requireUser() {
  if (currentUser) return currentUser;
  $('#auth-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#signup-email')?.focus();
  showToast('Create your free profile or sign in before continuing.');
  return null;
}

function setupAuthForms() {
  $$('.password-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.password);
      if (!input) return;
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', String(visible));
      button.title = visible ? 'Hide password' : 'Show password';
    });
  });
  $('#signup-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = ($('#signup-email')?.value || '').trim();
    const password = $('#signup-password')?.value || '';
    const username = ($('#signup-username')?.value || '').trim();
    const firstName = ($('#signup-first-name')?.value || '').trim();
    const lastName = ($('#signup-last-name')?.value || '').trim();
    await createAccount(email, password, username, firstName, lastName);
  });

  $('#signin-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = ($('#signin-email')?.value || '').trim();
    const password = $('#signin-password')?.value || '';
    await signIn(email, password);
  });
}

async function detectLocation() {
  const button = $('#geo-btn');
  const label = $('#location-label');
  const hero = $('#hero-location');
  if (button?.disabled) return;
  if (button) button.disabled = true;
  if (label) label.textContent = 'Locating…';
  if (hero) hero.textContent = '📍 Requesting your location from the browser…';

  try {
    if (!navigator.geolocation) throw new Error('Location requires browser support and a secure HTTPS connection.');
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false, timeout: 10000, maximumAge: 300000,
      })
    );
    if (label) label.textContent = 'Finding area…';
    if (hero) hero.textContent = '📍 Location received. Looking up your area…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
      response = await fetch(
        'https://nominatim.openstreetmap.org/reverse?format=json&lat=' +
        encodeURIComponent(pos.coords.latitude) + '&lon=' + encodeURIComponent(pos.coords.longitude) +
        '&zoom=18&addressdetails=1',
        { headers: { 'Accept-Language': 'en' }, signal: controller.signal }
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error('Your location was found, but the area lookup is unavailable. Please try again.');
    const address = (await response.json()).address || {};
    if (!address.state) throw new Error('Your location was found, but its area could not be identified. Please try again.');
    userLocation.lat = pos.coords.latitude;
    userLocation.lng = pos.coords.longitude;
    userLocation.city = address.city || address.town || address.village || address.county || 'Your area';
    userLocation.county = (address.county || '').replace(/ County$/i, '').trim();
    userLocation.stateCode = (address['ISO3166-2-lvl4'] || '').split('-')[1] ||
      STATES.find(([, name]) => name.toLowerCase() === (address.state || '').toLowerCase())?.[0] || '';
    userLocation.region = address.state || '';
    userLocation.postalCode = /^\d{5}(?:-\d{4})?$/.test(address.postcode || '')
      ? address.postcode.slice(0, 5) : '';
    showZipSample(userLocation.stateCode === 'CA' ? userLocation.postalCode : '');
    if (!$('#video-zip')?.value.trim()) {
      viewingZip = userLocation.postalCode;
      loadCandidateVideos();
    }
    const display = [userLocation.city, userLocation.region].filter(Boolean).join(', ');
    if (label) label.textContent = display;
    if (hero) hero.textContent = '📍 Showing issues near ' + display;
    updatePostingLocation();
    loadPoliticalFlyers();
  } catch (error) {
    userLocation = { city: 'your area', county: '', stateCode: '', region: '', postalCode: '', lat: null, lng: null };
    showZipSample('');
    if (!$('#video-zip')?.value.trim()) {
      viewingZip = '';
      loadCandidateVideos();
    }
    const message = error?.code === 1 ? 'Location permission is blocked. Allow it in your browser settings and try again.' :
      error?.code === 2 ? 'Your device could not determine your location. Please try again.' :
      error?.code === 3 ? 'Location timed out. Please try again.' :
      error?.name === 'AbortError' ? 'Area lookup timed out. Please try again.' :
      error?.message || 'Location unavailable. Please try again.';
    if (label) label.textContent = 'Detect location';
    if (hero) hero.textContent = '📍 ' + message;
    updatePostingLocation();
    loadPoliticalFlyers();
  } finally {
    if (button) button.disabled = false;
  }
}

function normalizeArea(value) {
  return String(value || '').replace(/\s+(County|City)$/i, '').trim().toLowerCase();
}

async function loadCandidateVideos() {
  const list = $('#video-list');
  const note = $('#video-location-note');
  if (!list || !note) return;
  const requestedZip = viewingZip;
  list.replaceChildren();
  if (!/^\d{5}$/.test(requestedZip)) {
    note.textContent = 'Enter your ZIP or enable location to see reviewed candidate videos. ZIP is a viewing preference, not proof of voting residence.';
    return;
  }
  note.textContent = 'Reviewed candidate videos requested for ZIP ' + requestedZip + '. Your ZIP is not proof of voting residence.';
  const { data, error } = await db.from('candidate_videos')
    .select('id,title,paid_for_by,storage_path,election_date')
    .eq('status', 'approved').eq('target_zip', requestedZip)
    .gte('election_date', new Date().toISOString().slice(0, 10))
    .order('created_at', { ascending: false }).limit(20);
  if (requestedZip !== viewingZip) return;
  if (error) { note.textContent = 'Candidate videos are unavailable right now.'; return; }
  for (const video of data || []) {
    const { data: link, error: linkError } = await db.storage.from('candidate-videos').createSignedUrl(video.storage_path, 300);
    if (requestedZip !== viewingZip) return;
    if (linkError || !link?.signedUrl) continue;
    const article = document.createElement('article');
    article.className = 'glass rounded-xl p-4 border border-amber-500/30';
    const heading = document.createElement('h4');
    heading.className = 'font-semibold mb-2';
    heading.textContent = video.title;
    const player = document.createElement('video');
    player.controls = true;
    player.preload = 'none';
    player.className = 'w-full rounded-lg';
    player.src = link.signedUrl;
    const disclosure = document.createElement('p');
    disclosure.className = 'text-xs text-slate-300 mt-2';
    disclosure.textContent = 'Political video · Paid for by ' + video.paid_for_by;
    article.append(heading, player, disclosure);
    list.append(article);
  }
  if (!list.childElementCount) note.textContent += ' No approved videos are available.';
}

async function loadMyVideos() {
  const box = $('#my-videos');
  if (!box) return;
  box.replaceChildren();
  if (!currentUser) return;
  const { data, error } = await db.from('candidate_videos')
    .select('title,status,target_zip').eq('owner_id', currentUser.id)
    .order('created_at', { ascending: false }).limit(30);
  box.textContent = error ? 'Your submissions could not load.' :
    (data || []).length ? 'Your video submissions:' : 'No videos submitted yet.';
  for (const item of data || []) {
    const row = document.createElement('p');
    row.className = 'text-sm text-slate-300';
    row.textContent = item.title + ' · ZIP ' + item.target_zip + ' · ' + item.status.replaceAll('_', ' ');
    box.append(row);
  }
}

function setupCandidateVideos() {
  $('#video-zip-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = $('#video-zip').value.trim();
    viewingZip = /^\d{5}$/.test(value) ? value : '';
    loadCandidateVideos();
  });
  $('#candidate-video-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('#video-submit-status');
    const user = await requireUser();
    if (!user) return;
    const file = $('#video-file').files[0];
    const zip = $('#video-target-zip').value.trim();
    const election = $('#video-election').value;
    if (verificationRequest?.status !== 'verified' || verificationRequest.verification_type !== 'candidate' ||
      !file || file.type !== 'video/mp4' || !file.name.toLowerCase().endsWith('.mp4') ||
      file.size > 50 * 1024 * 1024 || file.size === 0 || !/^\d{5}$/.test(zip) ||
      election < new Date().toISOString().slice(0, 10)) {
      status.textContent = 'A current candidate verification, future election date, five-digit ZIP, and MP4 under 50 MB are required.';
      return;
    }
    const committee = $('#video-committee').value.trim();
    if (verificationRequest.filing_id && committee !== verificationRequest.filing_id) {
      status.textContent = 'The committee ID must match your verified campaign filing.';
      return;
    }
    const id = crypto.randomUUID();
    const path = user.id + '/' + id + '.mp4';
    status.textContent = 'Uploading privately…';
    const uploaded = await db.storage.from('candidate-videos').upload(path, file, { contentType: 'video/mp4', upsert: false });
    if (uploaded.error) { status.textContent = 'Private upload failed. Check your verification and video size.'; return; }
    const { error } = await db.from('candidate_videos').insert({
      id, owner_id: user.id, storage_path: path, title: $('#video-title').value.trim(),
      paid_for_by: $('#video-sponsor').value.trim(), committee_id: committee || null,
      target_zip: zip, election_date: election,
    });
    status.textContent = error ? 'Video uploaded privately, but submission failed. Contact support to complete review.' :
      'Submitted for SPOYLT review. It is hidden until verification and placement approval.';
    if (!error) { $('#candidate-video-form').reset(); loadMyVideos(); }
  });
}

async function loadPoliticalFlyers() {
  const list = $('#flyer-list');
  const note = $('#flyer-location-note');
  if (!list) return;
  if (!userLocation.stateCode) {
    list.innerHTML = '';
    note.textContent = 'Enable location to see approved local political flyers. Your current location does not establish your voting address.';
    return;
  }
  note.textContent = 'Approved ads for your current area in ' + userLocation.region + '. Location does not establish your voting address.';
  const { data, error } = await db.from('political_flyers')
    .select('id,headline,body,paid_for_by,target_scope,target_county,target_city,election_date')
    .eq('status', 'approved').eq('target_state', userLocation.stateCode)
    .gte('election_date', new Date().toISOString().slice(0, 10))
    .order('created_at', { ascending: false }).limit(100);
  if (error) {
    note.textContent = 'Political flyers are unavailable right now.';
    list.innerHTML = '';
    return;
  }
  const matches = (data || []).filter((flyer) =>
    flyer.target_scope === 'state' ||
    (normalizeArea(flyer.target_county) === normalizeArea(userLocation.county) &&
      (flyer.target_scope === 'county' || normalizeArea(flyer.target_city) === normalizeArea(userLocation.city)))
  );
  list.innerHTML = matches.map((flyer) =>
    '<article class="glass rounded-xl p-5 border border-amber-500/30" style="width:min(100%,2.5in);aspect-ratio:5/8;overflow-y:auto">' +
    '<p class="text-xs font-semibold text-amber-300 mb-3">Paid political advertisement</p>' +
    '<h3 class="text-xl font-bold mb-2">' + escapeHtml(flyer.headline) + '</h3>' +
    '<p class="text-sm text-slate-300 whitespace-pre-wrap">' + escapeHtml(flyer.body) + '</p>' +
    '<p class="text-xs text-slate-400 mt-4">Paid for by ' + escapeHtml(flyer.paid_for_by) +
    ' · Election ' + escapeHtml(flyer.election_date) + '</p></article>'
  ).join('');
  if (!matches.length) note.textContent += ' No approved political flyers match this area.';
}

function setupPoliticalFlyers() {
  const state = $('#flyer-state');
  if (!state) return;
  state.innerHTML = '<option value="">Choose state</option>' + STATES.map(([code, name]) =>
    '<option value="' + code + '">' + escapeHtml(name) + '</option>').join('');
  const updateCommitteeId = () => {
    const field = $('#flyer-committee-id');
    field.classList.toggle('hidden', state.value !== 'CA');
    field.required = state.value === 'CA';
  };
  state.addEventListener('change', updateCommitteeId);
  updateCommitteeId();
  const scope = $('#flyer-scope');
  const updateScope = () => {
    $('#flyer-county').classList.toggle('hidden', scope.value === 'state');
    $('#flyer-county').required = scope.value !== 'state';
    $('#flyer-city').classList.toggle('hidden', scope.value !== 'city');
    $('#flyer-city').required = scope.value === 'city';
  };
  scope.addEventListener('change', updateScope);
  updateScope();
  $('#my-flyers')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-pay-flyer]');
    if (!button || button.disabled) return;
    button.disabled = true;
    button.textContent = 'Opening checkout…';
    const { data, error } = await db.functions.invoke('create-flyer-checkout', {
      body: { flyer_id: button.dataset.payFlyer },
    });
    if (error || !data?.url) {
      $('#flyer-submit-status').textContent = data?.error || error?.message || 'Checkout could not start.';
      button.disabled = false;
      button.textContent = button.dataset.payLabel;
      return;
    }
    window.location.assign(data.url);
  });
  $('#flyer-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const user = await requireUser();
    if (!user) return;
    const status = $('#flyer-submit-status');
    if (state.value === 'CA' &&
      $('#flyer-committee-id').value.trim() !== ($('#verification-filing-id').value || '').trim()) {
      status.textContent = 'Enter the same California campaign committee ID in your verification profile and on this flyer.';
      return;
    }
    const { error } = await db.from('political_flyers').insert({
      owner_id: user.id,
      headline: $('#flyer-headline').value.trim(),
      body: $('#flyer-body').value.trim(),
      paid_for_by: $('#flyer-sponsor').value.trim(),
      target_state: state.value,
      committee_id: state.value === 'CA' ? $('#flyer-committee-id').value.trim() : null,
      target_scope: scope.value,
      target_county: scope.value === 'state' ? null : $('#flyer-county').value.trim(),
      target_city: scope.value === 'city' ? $('#flyer-city').value.trim() : null,
      election_date: $('#flyer-election').value,
    });
    status.textContent = error ? 'Could not save your flyer. Check the election date and required fields.' :
      'Saved to your profile. It stays hidden until identity, campaign ID, sponsor, and placement are approved.';
    if (!error) {
      $('#flyer-form').reset();
      loadMyFlyers();
    }
    updateScope();
    updateCommitteeId();
  });
}

function setupPopulationTable() {
  const state = $('#population-state');
  const type = $('#population-type');
  if (!state || !type) return;
  state.innerHTML = '<option value="">Choose state</option>' + STATES.map(([code, name]) =>
    '<option value="' + escapeHtml(code) + '">' + escapeHtml(name) + '</option>').join('');
  let page = 0;
  let request = 0;
  async function load(reset = false) {
    if (reset) { page = 0; $('#population-rows').innerHTML = ''; }
    const token = ++request;
    if (!state.value) {
      $('#population-status').textContent = 'Choose a state to view population data.';
      $('#population-more').classList.add('hidden');
      return;
    }
    $('#population-status').textContent = 'Loading population data…';
    const { data, error } = await db.from('flyer_population_areas')
      .select('name,population,estimate_year,source_url,area_type')
      .eq('state_code', state.value).eq('area_type', type.value).eq('estimate_year', 2024)
      .order('name').range(page * 100, page * 100 + 99);
    if (token !== request) return;
    if (error) {
      $('#population-status').textContent = 'Population data is unavailable right now.';
      $('#population-more').classList.add('hidden');
      return;
    }
    $('#population-rows').insertAdjacentHTML('beforeend', (data || []).map((area) =>
      '<tr class="border-t border-slate-700"><td class="py-2 pr-3">' + escapeHtml(area.name) +
      '</td><td class="py-2 pr-3">' + Number(area.population).toLocaleString() +
      '</td><td class="py-2 pr-3">$' + (area.area_type === 'congressional' ? '495' :
        Number(area.population) <= 100000 ? '149' : '299') +
      '</td><td class="py-2"><a class="text-sky-300 underline" target="_blank" rel="noopener noreferrer" href="' +
        escapeHtml(area.source_url) + '">Census</a></td></tr>').join(''));
    $('#population-status').textContent = data?.length ? '2024 Census ACS estimates; a reviewer confirms the office before pricing.' :
      'No imported population data for this area yet. Pricing stays pending.';
    $('#population-more').classList.toggle('hidden', (data?.length || 0) < 100);
    page++;
  }
  state.addEventListener('change', () => load(true));
  type.addEventListener('change', () => load(true));
  $('#population-more').addEventListener('click', () => load());
}

async function loadMyFlyers() {
  const box = $('#my-flyers');
  if (!box) return;
  if (!currentUser) {
    box.innerHTML = '<p class="text-sm text-slate-400">Sign in to see your submitted flyers.</p>';
    return;
  }
  const { data, error } = await db.from('political_flyers')
    .select('id,headline,status,payment_status,created_at,committee_id,fee_amount_cents,fee_geography_id').eq('owner_id', currentUser.id)
    .order('created_at', { ascending: false }).limit(30);
  if (error) {
    box.textContent = 'Your flyers could not load right now.';
    return;
  }
  box.innerHTML = '<h4 class="font-semibold">My campaign flyers</h4>' +
    ((data || []).length ? data.map((flyer) =>
      '<div class="border border-slate-700 rounded-lg p-3 text-sm"><strong>' + escapeHtml(flyer.headline) +
      '</strong><span class="text-slate-400"> · ' + escapeHtml(flyer.status.replaceAll('_', ' ')) +
      '</span>' + (flyer.status === 'awaiting_payment' && flyer.payment_status === 'unpaid'
        ? (flyer.fee_geography_id && [14900, 29900, 49500].includes(flyer.fee_amount_cents)
          ? '<button type="button" data-pay-flyer="' + escapeHtml(flyer.id) +
            '" data-pay-label="Pay $' + (flyer.fee_amount_cents / 100).toFixed(0) + ' for this flyer"' +
            ' class="block mt-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-2 rounded-lg">Pay $' +
            (flyer.fee_amount_cents / 100).toFixed(0) + ' for this flyer</button>'
          : '<p class="mt-3 text-amber-300">Fee pending reviewer assignment.</p>')
        : '') + '</div>').join('') : '<p class="text-sm text-slate-400">No flyers saved yet.</p>');
}

function renderCategories() {
  $('#category-grid').innerHTML = CATEGORIES.map((c) =>
    '<button data-cat="' + c.id + '" class="category-card glass rounded-xl p-5 text-left card-hover group">' +
    '<div class="text-3xl mb-3">' + c.icon + '</div>' +
    '<h3 class="font-semibold text-slate-100 group-hover:text-sky-300 transition">' + c.label + '</h3>' +
    '<p class="text-xs text-slate-500 mt-1">Start a Spoylt →</p></button>'
  ).join('');

  $('#category-chips').innerHTML = CATEGORIES.map((c) =>
    '<button type="button" data-cat="' + c.id + '" class="category-chip border border-slate-600 text-slate-300 text-sm px-3 py-1.5 rounded-full">' +
    c.icon + ' ' + c.label + '</button>'
  ).join('');

  $$('.category-card').forEach((button) => button.addEventListener('click', () => {
    selectedCategory = button.dataset.cat;
    highlightChip(selectedCategory);
    document.getElementById('start').scrollIntoView({ behavior: 'smooth' });
  }));
  $$('.category-chip').forEach((button) => button.addEventListener('click', () => {
    selectedCategory = button.dataset.cat;
    highlightChip(selectedCategory);
  }));
}

function highlightChip(id) {
  $$('.category-chip').forEach((button) => button.classList.toggle('active', button.dataset.cat === id));
}

function matchingBallotMeasures() {
  const state = $('#state-select')?.value || '';
  const county = $('#county-select')?.value || '';
  return ballotMeasures.filter((measure) => {
    if (measure.state_code !== state || measure.scope !== propositionScope) return false;
    return propositionScope === 'state' || measure.county_name === county;
  });
}

function refreshBallotMeasureOptions() {
  const select = $('#ballot-measure-select');
  if (!select) return;
  const matches = matchingBallotMeasures().sort((a, b) =>
    String(a.measure_number).localeCompare(String(b.measure_number), undefined, { numeric: true })
  );
  const fallback = propositionScope === 'state'
    ? 'Other state proposition — enter number below'
    : 'Other local proposition — enter measure letter/number below';
  select.innerHTML = '<option value="">' + fallback + '</option>' +
    matches.map((measure) =>
      '<option value="' + escapeHtml(measure.id) + '">' +
      (measure.scope === 'state' ? 'Proposition ' : 'Measure ') +
      escapeHtml(measure.measure_number) + ' — ' + escapeHtml(measure.title) +
      '</option>'
    ).join('');
}

function applySelectedBallotMeasure() {
  const id = $('#ballot-measure-select')?.value || '';
  const measure = ballotMeasures.find((item) => item.id === id);
  const source = $('#ballot-source-link');
  if (!measure) {
    if (source) source.classList.add('hidden');
    updatePostingLocation();
    return;
  }
  $('#proposition-number').value = measure.measure_number || '';
  const title = $('#title');
  if (title) title.value = (measure.title || '').slice(0, 120);
  selectedCategory = 'elections';
  highlightChip(selectedCategory);
  if (source) {
    source.href = measure.source_url;
    source.classList.remove('hidden');
  }
  updatePostingLocation();
}

async function loadBallotMeasures() {
  const { data, error } = await db
    .from('ballot_measures')
    .select('id,election_date,state_code,county_name,jurisdiction,scope,measure_number,title,source_url')
    .eq('active', true)
    .eq('election_date', '2026-11-03')
    .order('measure_number', { ascending: true });
  if (error) {
    console.error(error);
    const select = $('#ballot-measure-select');
    if (select) select.innerHTML = '<option value="">Enter a proposition manually below</option>';
    return;
  }
  ballotMeasures = data || [];
  refreshBallotMeasureOptions();
}

function updateScopeUI() {
  propositionScope = $('input[name="proposition-scope"]:checked')?.value || 'local';
  const isState = propositionScope === 'state';
  $('#county-field')?.classList.toggle('hidden', isState);
  $('#suggestion-label').textContent = 'Add your opinion';
  $('#suggestion').placeholder = isState
    ? 'Share your opinion on this state proposition and explain why you support or oppose it.'
    : 'Share your opinion on this local proposition and explain why you support or oppose it.';
  refreshBallotMeasureOptions();
  applySelectedBallotMeasure();
  updatePostingLocation();
}

function updatePostingLocation() {
  const formLocation = $('#form-location');
  if (!formLocation) return;
  const stateCode = $('#state-select')?.value || '';
  const state = stateName(stateCode);
  const county = $('#county-select')?.value || '';
  const number = ($('#proposition-number')?.value || '').trim();
  if (propositionScope === 'state') {
    formLocation.textContent = stateCode
      ? state + (number ? ' · Proposition ' + number : ' statewide')
      : 'choose a state';
  } else {
    const place = county
      ? county + ' County, ' + (stateCode || 'CA')
      : ([userLocation.city, userLocation.region].filter(Boolean).join(', ') || 'your area');
    formLocation.textContent = place + (number ? ' · Measure ' + number : '');
  }
}

function setupScopeControls() {
  const stateSelect = $('#state-select');
  const countySelect = $('#county-select');
  if (stateSelect) {
    stateSelect.insertAdjacentHTML('beforeend', STATES.map(([code, name]) =>
      '<option value="' + code + '">' + name + '</option>'
    ).join(''));
    stateSelect.value = 'CA';
  }
  if (countySelect) {
    countySelect.insertAdjacentHTML('beforeend', CA_COUNTIES.map((county) =>
      '<option value="' + county + '">' + county + ' County</option>'
    ).join(''));
  }
  $$('input[name="proposition-scope"]').forEach((input) =>
    input.addEventListener('change', updateScopeUI)
  );
  stateSelect?.addEventListener('change', () => {
    if (stateSelect.value !== 'CA' && countySelect) countySelect.value = '';
    refreshBallotMeasureOptions();
    applySelectedBallotMeasure();
    updatePostingLocation();
  });
  countySelect?.addEventListener('change', () => {
    refreshBallotMeasureOptions();
    applySelectedBallotMeasure();
    updatePostingLocation();
  });
  $('#ballot-measure-select')?.addEventListener('change', applySelectedBallotMeasure);
  $('#proposition-number')?.addEventListener('input', updatePostingLocation);
  updateScopeUI();
  loadBallotMeasures();
}

async function loadPropositions() {
  const { data, error } = await db
    .from('propositions')
    .select('id,user_id,category,title,suggestion,scope,state_code,proposition_number,location_city,location_region,created_at,interactions(kind)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error(error);
    showToast('Community Board could not load. Please refresh.');
    return;
  }
  propositions = (data || []).map((p) => ({
    ...p,
    likes: (p.interactions || []).filter((i) => i.kind === 'like').length,
    supports: (p.interactions || []).filter((i) => i.kind === 'support').length,
    comments: (p.interactions || []).filter((i) => i.kind === 'comment').length,
  }));
  renderBoard();
}

function renderBoard() {
  const board = $('#community-board');
  $('#board-count').textContent = propositions.length;
  if (!propositions.length) {
    board.innerHTML = '<div class="glass rounded-xl p-8 text-center text-slate-400">' +
      '<p class="text-lg font-semibold text-white mb-2">Be the first voice in your community.</p>' +
      '<p>Start the first SPOYLT above.</p></div>';
    return;
  }

  board.innerHTML = propositions.map((p) => {
    const cat = CATEGORIES.find((c) => c.id === p.category) || { icon: '📌', label: 'General' };
    const location = p.scope === 'state'
      ? stateName(p.state_code) + ' · Proposition #' + escapeHtml(p.proposition_number)
      : ([p.location_city, p.location_region].filter(Boolean).join(', ') || 'Local');
    const locationIcon = p.scope === 'state' ? '🏛️ ' : '📍 ';
    return '<article class="glass rounded-xl p-5 card-hover" data-id="' + p.id + '">' +
      '<div class="flex items-start justify-between gap-3 mb-3"><div class="flex items-center gap-2">' +
      '<span class="text-lg">' + cat.icon + '</span><span class="text-xs font-medium text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">' +
      escapeHtml(cat.label) + '</span></div><span class="text-xs text-slate-500">' + timeAgo(p.created_at) + '</span></div>' +
      '<h3 class="font-semibold text-lg mb-2 leading-snug">' + escapeHtml(p.title) + '</h3>' +
      '<p class="text-sm text-slate-400 mb-4 line-clamp-3">' + escapeHtml(p.suggestion) + '</p>' +
      '<div class="flex flex-wrap items-center gap-4 text-xs text-slate-500"><span>' + locationIcon + escapeHtml(location) +
      '</span><span>by SPOYLT member</span></div>' +
      '<div class="flex items-center gap-3 mt-4 pt-4 border-t border-slate-700/60">' +
      '<button class="interaction-btn text-sm text-slate-400 hover:text-sky-400 transition" data-kind="like" data-id="' + p.id + '">👍 ' + p.likes + '</button>' +
      '<button class="interaction-btn text-sm text-slate-400 hover:text-emerald-400 transition" data-kind="support" data-id="' + p.id + '">✓ ' + p.supports + ' Support</button>' +
      '<button class="interaction-btn text-sm text-slate-400 hover:text-amber-400 transition" data-kind="comment" data-id="' + p.id + '">💬 ' + p.comments + '</button>' +
      '</div></article>';
  }).join('');

  $$('.interaction-btn').forEach((button) => button.addEventListener('click', async () => {
    const user = await requireUser();
    if (!user) return;
    const kind = button.dataset.kind;
    let body = null;
    if (kind === 'comment') {
      body = window.prompt('Add a comment:');
      if (body == null || !body.trim()) return;
      body = body.trim();
    }
    const { data: moderation, error } = await db.rpc('submit_interaction', {
      p_proposition_id: button.dataset.id,
      p_kind: kind,
      p_body: body,
    });
    if (error) {
      showToast('The Community Firewall could not process that request. Please try again.');
      return;
    }
    if (!moderation?.ok) {
      showToast(moderation?.message || 'Blocked by the Community Firewall.', 7000);
      if (moderation?.blocked) await db.auth.signOut();
      return;
    }
    showToast(kind === 'comment' ? 'Comment posted.' : 'Your support is counted.');
    await loadPropositions();
  }));
}

function setupForm() {
  const form = $('#spoylt-form');
  const textarea = $('#suggestion');
  textarea.addEventListener('input', () => $('#char-count').textContent = textarea.value.length);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = ($('#author-email').value || '').trim();
    const user = await requireUser();
    if (!user) return;
    if (user.email?.toLowerCase() !== email.toLowerCase()) {
      showToast('Use the email address connected to your signed-in account.');
      return;
    }
    if (!selectedCategory) return showToast('Please select a category first.');

    const title = $('#title').value.trim();
    const suggestion = textarea.value.trim();
    const stateCode = ($('#state-select')?.value || '').trim();
    const county = ($('#county-select')?.value || '').trim();
    const propositionNumber = ($('#proposition-number')?.value || '').trim();
    if (!stateCode) {
      showToast('Choose a state first.');
      return;
    }
    if (propositionScope === 'state' && !propositionNumber) {
      showToast('Choose an official proposition or enter its number.');
      return;
    }
    const { data: moderation, error } = await db.rpc('submit_proposition', {
      p_category: selectedCategory,
      p_title: title,
      p_suggestion: suggestion,
      p_scope: propositionScope,
      p_state_code: stateCode,
      p_proposition_number: propositionNumber || null,
      p_location_city: propositionScope === 'local' ? (county || userLocation.city) : null,
      p_location_region: propositionScope === 'local' ? stateCode : stateCode,
      p_latitude: propositionScope === 'local' && !county ? userLocation.lat : null,
      p_longitude: propositionScope === 'local' && !county ? userLocation.lng : null,
    });
    if (error) {
      showToast('The Community Firewall could not process that proposition. Please try again.');
      return;
    }
    if (!moderation?.ok) {
      showToast(moderation?.message || 'Blocked by the Community Firewall.', 7000);
      if (moderation?.limit) document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
      if (moderation?.blocked) await db.auth.signOut();
      return;
    }

    form.reset();
    $('#author-email').value = user.email || '';
    if ($('#state-select')) $('#state-select').value = 'CA';
    if ($('#county-select')) $('#county-select').value = '';
    selectedCategory = null;
    propositionScope = 'local';
    highlightChip(null);
    $('#char-count').textContent = '0';
    updateScopeUI();
    await loadPropositions();
    document.getElementById('board').scrollIntoView({ behavior: 'smooth' });
    showToast('🎉 Your SPOYLT is live!');
  });
}

async function beginCheckout(plan) {
  const user = await requireUser();
  if (!user) return;
  showToast('Opening secure Stripe Checkout…');
  const { data, error } = await db.functions.invoke('create-checkout', { body: { plan } });
  if (error || !data?.url) {
    showToast(data?.error || error?.message || 'Stripe Checkout is not configured yet.');
    return;
  }
  window.location.assign(data.url);
}


function renderVerificationStatus() {
  const badge = $('#verification-status');
  const form = $('#verification-form');
  if (!badge || !form) return;
  form.classList.toggle('opacity-60', !currentUser);
  const labels = {
    pending_identity: 'Identity verification required',
    pending_review: 'Identity verified · Evidence under review',
    verified: verificationRequest?.verification_type === 'official' ? '⭐ ✓ Verified Public Official' : '✓ Verified Candidate',
    rejected: 'Application needs correction',
    expired: 'Verification expired',
    revoked: 'Verification revoked',
  };
  badge.textContent = currentUser ? (labels[verificationRequest?.status] || 'Ready to apply') : 'Sign in to apply';
  badge.className = 'text-xs font-semibold px-3 py-1.5 rounded-full ' +
    (verificationRequest?.status === 'verified' ? 'bg-emerald-500/15 text-emerald-300' :
     verificationRequest?.status === 'pending_review' ? 'bg-sky-500/15 text-sky-300' :
     'bg-slate-800 text-slate-400');
  const today = new Date().toISOString().slice(0, 10);
  const verified = Boolean(currentUser && verificationRequest?.status === 'verified' &&
    ['official', 'candidate'].includes(verificationRequest.verification_type) &&
    (!verificationRequest.expires_at || new Date(verificationRequest.expires_at) > new Date()) &&
    (!verificationRequest.election_date || verificationRequest.election_date >= today) &&
    (!verificationRequest.term_end || verificationRequest.term_end >= today));
  ['#official-showcase', '#my-campaign-profile', '#official-ai-tools'].forEach((selector) =>
    $(selector)?.classList.toggle('hidden', !verified));
  $('#official-gate-note')?.classList.toggle('hidden', verified);
}

async function loadVerificationRequest() {
  verificationRequest = null;
  renderVerificationStatus();
  if (!currentUser) return;
  const { data, error } = await db.from('verification_requests').select('*').eq('user_id', currentUser.id).maybeSingle();
  if (error) {
    console.error(error);
    renderVerificationStatus();
    return;
  }
  verificationRequest = data;
  if (data) {
    $('#verification-type').value = data.verification_type;
    $('#verification-legal-name').value = data.legal_name || '';
    $('#verification-office').value = data.office_title || '';
    $('#verification-jurisdiction').value = data.jurisdiction || '';
    $('#verification-district').value = data.district || '';
    $('#verification-filing-id').value = data.filing_id || '';
    if ($('#flyer-committee-id') && data.filing_id) $('#flyer-committee-id').value = data.filing_id;
    $('#verification-source').value = data.authoritative_source_url || '';
    $('#verification-email').value = data.official_contact_email || '';
    $('#verification-date').value = data.verification_type === 'candidate'
      ? (data.election_date || '') : (data.term_end || '');
  } else if (currentProfileName) {
    $('#verification-legal-name').value = currentProfileName;
  }
  renderVerificationStatus();
}

function setupVerification() {
  $$('.campaign-advertise-link').forEach((link) => link.addEventListener('click', () => {
    if (!verificationRequest && $('#verification-type')) $('#verification-type').value = 'candidate';
  }));
  $('#verification-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const user = await requireUser();
    if (!user) return;
    const type = $('#verification-type').value;
    const date = $('#verification-date').value || null;
    const record = {
      user_id: user.id,
      verification_type: type,
      legal_name: $('#verification-legal-name').value.trim(),
      office_title: $('#verification-office').value.trim(),
      jurisdiction: $('#verification-jurisdiction').value.trim(),
      district: $('#verification-district').value.trim() || null,
      authoritative_source_url: $('#verification-source').value.trim(),
      filing_id: $('#verification-filing-id').value.trim() || null,
      official_contact_email: $('#verification-email').value.trim() || null,
      election_date: type === 'candidate' ? date : null,
      term_end: type === 'official' ? date : null,
      identity_status: 'not_started',
      status: 'pending_identity',
      rejection_reason: null,
    };
    if (type === 'candidate' && !record.filing_id) {
      showToast('Candidates should enter an election filing or FEC ID.');
      return;
    }

    let error;
    if (verificationRequest) {
      ({ error } = await db.from('verification_requests').update(record).eq('id', verificationRequest.id));
    } else {
      ({ error } = await db.from('verification_requests').insert(record));
    }
    if (error) {
      showToast(error.message, 7000);
      return;
    }

    showToast('Application saved. Opening secure identity verification…');
    const result = await db.functions.invoke('create-identity-verification');
    if (result.error || !result.data?.url) {
      showToast(result.data?.error || result.error?.message || 'Identity verification could not start.', 7000);
      await loadVerificationRequest();
      return;
    }
    window.location.assign(result.data.url);
  });
}

function renderAiModeratorAccess() {
  const premium = Boolean(currentUser && currentPlan === 'premium');
  const badge = $('#ai-moderator-access');
  if (badge) {
    badge.textContent = premium ? 'Premium access active' : currentUser ? 'Upgrade to Premium' : 'Sign in · Premium required';
    badge.className = 'text-xs font-semibold px-3 py-1.5 rounded-full ' +
      (premium ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400');
  }
  ['#ai-check-content', '#ai-draft-reply'].forEach((selector) => {
    const button = $(selector);
    if (button) {
      button.disabled = !premium;
      button.classList.toggle('opacity-50', !premium);
      button.classList.toggle('cursor-not-allowed', !premium);
    }
  });
}

async function runAiModerator(action) {
  const user = await requireUser();
  if (!user) return;
  if (currentPlan !== 'premium') {
    showToast('The OpenAI Chat Moderator is included with the Premium Official plan.');
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const text = ($('#ai-moderator-input')?.value || '').trim();
  const context = ($('#ai-moderator-context')?.value || '').trim();
  if (!text) {
    showToast('Paste a comment or reply first.');
    return;
  }

  const output = $('#ai-moderator-output');
  const button = action === 'draft_reply' ? $('#ai-draft-reply') : $('#ai-check-content');
  const originalLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = action === 'draft_reply' ? 'Drafting…' : 'Checking…';
  }
  if (output) output.value = 'OpenAI is reviewing the content…';

  const { data, error } = await db.functions.invoke('openai-moderator', {
    body: { action, text, context },
  });

  if (button) {
    button.disabled = false;
    button.textContent = originalLabel;
  }
  if (error || data?.error) {
    const message = data?.error || error?.message || 'The AI moderator is unavailable.';
    if (output) output.value = message;
    showToast(message, 7000);
    return;
  }
  if (!data?.allowed) {
    const categories = Array.isArray(data?.categories) && data.categories.length
      ? '\nFlagged categories: ' + data.categories.join(', ')
      : '';
    if (output) output.value = (data?.message || 'Content was flagged.') + categories;
    showToast('Content was flagged. Review it before posting.', 7000);
    return;
  }

  if (output) output.value = data.reply || data.message || 'No high-risk content was detected.';
  showToast(action === 'draft_reply' ? 'Suggested reply is ready for your review.' : 'Content check complete.');
}

function setupAiModerator() {
  $('#ai-check-content')?.addEventListener('click', () => runAiModerator('moderate'));
  $('#ai-draft-reply')?.addEventListener('click', () => runAiModerator('draft_reply'));
  $('#ai-copy-reply')?.addEventListener('click', async () => {
    const text = $('#ai-moderator-output')?.value || '';
    if (!text) return showToast('There is no result to copy yet.');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Result copied.');
    } catch {
      showToast('Copy failed. Select the text and copy it manually.');
    }
  });
  renderAiModeratorAccess();
}

function setupStripeButtons() {
  $('#stripe-unlimited')?.addEventListener('click', () => beginCheckout('unlimited'));
  $('#stripe-official')?.addEventListener('click', () => beginCheckout('official'));
  $('#stripe-premium')?.addEventListener('click', () => beginCheckout('premium'));
  $('#official-cta')?.addEventListener('click', () =>
    document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' })
  );
}

function renderFirewallPanel() {
  const blocks = window.SpoyltFirewall?.loadBlocks() || [];
  const log = window.SpoyltFirewall?.loadLog() || [];
  if ($('#fw-block-count')) $('#fw-block-count').textContent = blocks.length;
  if ($('#fw-log-count')) $('#fw-log-count').textContent = log.length;
  if (!blocks.length || !$('#fw-block-list')) return;
  $('#fw-block-list').innerHTML = blocks.map((b) =>
    '<li class="border-b border-slate-800 pb-2"><span class="text-rose-300 font-mono text-xs">' +
    escapeHtml(b.email) + '</span></li>'
  ).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  setupPopulationTable();
  renderCategories();
  setupAuthForms();
  setupScopeControls();
  setupForm();
  setupVerification();
  setupPoliticalFlyers();
  setupCandidateVideos();
  setupStripeButtons();
  setupAiModerator();
  renderFirewallPanel();
  $('#geo-btn')?.addEventListener('click', detectLocation);

  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user || null;
  updateAuthUI();
  await loadVerificationRequest();
  await loadMyFlyers();
  await loadMyVideos();
  db.auth.onAuthStateChange((_event, nextSession) => {
    currentUser = nextSession?.user || null;
    updateAuthUI();
    loadVerificationRequest();
    loadMyFlyers();
    loadMyVideos();
  });

  if (new URLSearchParams(window.location.search).get('identity') === 'return') {
    showToast('Identity information received. Verification status will update after Stripe confirms it.', 7000);
    history.replaceState({}, '', window.location.pathname + '#officials');
    await loadVerificationRequest();
  }

  if (new URLSearchParams(window.location.search).get('checkout') === 'success') {
    showToast('Subscription received. Your plan will update shortly.', 7000);
    history.replaceState({}, '', window.location.pathname);
  }

  if (new URLSearchParams(window.location.search).get('flyer_checkout') === 'return') {
    showToast('Payment received by Stripe. Your flyer will appear when its payment status is confirmed.', 7000);
    history.replaceState({}, '', window.location.pathname + '#my-campaign-profile');
    await loadMyFlyers();
  }

  await Promise.all([loadPropositions(), loadPoliticalFlyers(), loadCandidateVideos()]);
  db.channel('spoylt-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'propositions' }, loadPropositions)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, loadPropositions)
    .subscribe();
});
