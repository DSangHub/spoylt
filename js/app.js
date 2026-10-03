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

// Register the recovery listener before initial auth-session processing completes.
window.SpoyltPasswordRecovery.init(db.auth);
window.SpoyltPropositionAds.init(db);

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
let approvedHeroFlyers = [];
let flyerLoadId = 0;
let flyerArtworkPreviewUrl = '';
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function renderHeroFlyers() {
  const aside = $('#location-flyers');
  const track = $('#location-flyer-track');
  const pause = $('#flyer-pause');
  if (!aside || !track || !pause) return;
  const cards = [];
  for (const flyer of approvedHeroFlyers) {
    const card = document.createElement('div');
    card.className = 'flyer-rotation-item flex items-center justify-center';
    const ad = makeCampaignFlyer(flyer);
    ad.style.height = '100%';
    ad.style.width = 'auto';
    ad.style.maxWidth = '100%';
    card.append(ad);
    cards.push(card);
  }
  track.replaceChildren(...cards);
  const rotating = cards.length > 1;
  if (rotating) {
    for (const card of cards) {
      const copy = card.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      track.append(copy);
    }
    track.style.setProperty('--rotation-duration', `${cards.length * 12}s`);
  }
  track.classList.toggle('is-rotating', rotating);
  aside.classList.toggle('hidden', !cards.length);
  $('#hero-layout')?.classList.toggle('has-local-flyers', !!cards.length);
  pause.classList.toggle('hidden', !rotating);
  pause.setAttribute('aria-pressed', 'false');
  pause.textContent = 'Pause flyers';
  aside.querySelector('.flyer-rotation')?.classList.remove('is-paused');
  $('#flyer-rotation-note').textContent = rotating ? 'Hover to pause · approved ads for your area' : 'Approved ad for your area';
}

$('#flyer-pause')?.addEventListener('click', (event) => {
  const paused = $('#location-flyers .flyer-rotation')?.classList.toggle('is-paused');
  event.currentTarget.setAttribute('aria-pressed', String(!!paused));
  event.currentTarget.textContent = paused ? 'Play flyers' : 'Pause flyers';
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

function flyerSizeLabel(size) {
  return ({'2x4':'2″ × 4″','3x5':'3″ × 5″','4x5':'4″ × 5″'})[size] || '4″ × 5″';
}

function makeCampaignFlyer(flyer, preview = false) {
  const card = document.createElement('article');
  card.className = 'flex flex-col overflow-y-auto rounded-xl border border-sky-400/40 bg-slate-950 p-4 text-left';
  card.style.aspectRatio = ({'2x4':'1 / 2','3x5':'3 / 5','4x5':'4 / 5'})[flyer.flyer_size] || '4 / 5';
  card.style.width = '100%';
  card.innerHTML = '<p class="text-[10px] font-bold tracking-wide text-amber-300">' +
    (preview ? 'PRIVATE DRAFT' : 'PAID POLITICAL ADVERTISEMENT') + ' · ' + flyerSizeLabel(flyer.flyer_size) + '</p>';
  if (flyer.design_type === 'upload') {
    if (flyer.artwork_url) {
      const image = document.createElement('img');
      image.src = flyer.artwork_url;
      image.alt = 'Campaign flyer for ' + (flyer.candidate_name || flyer.headline);
      image.className = 'mt-3 w-full object-contain';
      card.append(image);
    } else {
      const missing = document.createElement('p');
      missing.className = 'my-4 text-sm text-slate-400';
      missing.textContent = preview ? 'Choose your flyer artwork to preview it here.' : 'Artwork unavailable. Campaign details below.';
      card.append(missing);
    }
  }
  card.insertAdjacentHTML('beforeend', '<h3 class="mt-3 text-xl font-black leading-tight text-white">' +
    escapeHtml(flyer.candidate_name || flyer.headline || 'Your name') + '</h3>' +
    (flyer.office_title ? '<p class="mt-2 text-sm font-bold text-sky-300">Running for ' + escapeHtml(flyer.office_title) + '</p>' : '') +
    (flyer.district_zone ? '<p class="mt-1 text-xs text-sky-200">' + escapeHtml(flyer.district_zone) + '</p>' : '') +
    (flyer.location_label ? '<p class="mt-1 text-xs text-sky-200">' + escapeHtml(flyer.location_label) + '</p>' : '') +
    '<p class="mt-4 whitespace-pre-wrap text-xs leading-relaxed text-slate-200">' + escapeHtml(flyer.body || 'Your message to voters') + '</p>' +
    '<p class="mt-auto pt-4 text-[10px] leading-tight text-slate-300">Paid for by ' + escapeHtml(flyer.paid_for_by || '[legal sponsor name]') +
    (flyer.election_date ? '<br>Election ' + escapeHtml(flyer.election_date) : '') + '</p>');
  return card;
}

function updateFlyerPreview() {
  const upload = $('#flyer-design')?.value === 'upload';
  $('#flyer-upload-label')?.classList.toggle('hidden', !upload);
  if ($('#flyer-artwork')) $('#flyer-artwork').required = upload;
  const preview = $('#flyer-template-preview');
  if (!preview) return;
  preview.style.aspectRatio = 'auto';
  preview.className = 'mx-auto max-w-[300px]';
  preview.replaceChildren(makeCampaignFlyer({
    candidate_name: $('#flyer-candidate-name').value.trim(), office_title: $('#flyer-office').value.trim(),
    district_zone: $('#flyer-district').value.trim(), location_label: $('#flyer-location').value.trim(), body: $('#flyer-body').value.trim(),
    paid_for_by: $('#flyer-sponsor').value.trim(), election_date: $('#flyer-election').value,
    flyer_size: $('#flyer-size').value, design_type: upload ? 'upload' : 'template',
    artwork_url: upload ? flyerArtworkPreviewUrl : '',
  }, true));
}

function clearFlyerDraft() {
  if (flyerArtworkPreviewUrl) URL.revokeObjectURL(flyerArtworkPreviewUrl);
  flyerArtworkPreviewUrl = '';
  $('#flyer-form')?.reset();
  updateFlyerPreview();
}

async function attachFlyerArtworkUrls(flyers) {
  return Promise.all(flyers.map(async (flyer) => {
    if (!flyer.artwork_path) return flyer;
    const {data} = await db.storage.from('candidate-flyers').createSignedUrl(flyer.artwork_path, 120);
    return {...flyer, artwork_url:data?.signedUrl || ''};
  }));
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

// External OpenAI speech screening authorized and deployed.
const VIDEO_SCREENING_ENABLED = true;

async function requestVideoScreening(id) {
  if (!VIDEO_SCREENING_ENABLED) return 'Video saved privately. Automated screening activation is pending; it cannot be published yet.';
  const { data, error } = await db.functions.invoke('moderate-candidate-video', { body: { video_id: id } });
  return error ? 'Screening did not complete. Your video remains private; retry from your submissions.'
    : (data?.message || 'Screening status: ' + (data?.moderation_status || 'queued'));
}

async function loadMyVideos() {
  const box = $('#my-videos');
  if (!box) return;
  box.replaceChildren();
  if (!currentUser) return;
  const { data, error } = await db.from('candidate_videos')
    .select('id,title,status,target_zip,moderation_status').eq('owner_id', currentUser.id)
    .order('created_at', { ascending: false }).limit(30);
  box.textContent = error ? 'Your submissions could not load.' :
    (data || []).length ? 'Your video submissions:' : 'No videos submitted yet.';
  for (const item of data || []) {
    const row = document.createElement('p');
    row.className = 'text-sm text-slate-300';
    row.textContent = item.title + ' · ZIP ' + item.target_zip + ' · ' + item.status.replaceAll('_', ' ') +
      ' · Speech screening: ' + item.moderation_status.replaceAll('_', ' ');
    box.append(row);
    if (VIDEO_SCREENING_ENABLED && item.status === 'pending_review' && ['queued', 'error', 'processing'].includes(item.moderation_status)) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'text-sm text-sky-300 underline mt-1 mb-3';
      retry.textContent = 'Retry video screening';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        $('#video-submit-status').textContent = 'Checking video speech and identity claims…';
        $('#video-submit-status').textContent = await requestVideoScreening(item.id);
        await loadMyVideos();
      });
      box.append(retry);
    }
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
    if (!error) {
      $('#candidate-video-form').reset();
      status.textContent = VIDEO_SCREENING_ENABLED
        ? 'Uploaded privately. Checking speech for foul language and conflicting identity claims…'
        : 'Uploaded privately. Automated screening activation is pending.';
      status.textContent = await requestVideoScreening(id);
      await loadMyVideos();
    }
  });
}

async function loadPoliticalFlyers() {
  window.SpoyltPropositionAds.load(userLocation.stateCode);
  const loadId = ++flyerLoadId;
  const list = $('#flyer-list');
  const note = $('#flyer-location-note');
  if (!list) return;
  if (!userLocation.stateCode) {
    approvedHeroFlyers = [];
    renderHeroFlyers();
    list.innerHTML = '';
    note.textContent = 'Enable location to see approved local political flyers. Your current location does not establish your voting address.';
    return;
  }
  note.textContent = 'Approved ads for your current area in ' + userLocation.region + '. Location does not establish your voting address.';
  const { data, error } = await db.from('political_flyers')
    .select('id,headline,body,paid_for_by,target_scope,target_county,target_city,election_date,candidate_name,office_title,district_zone,location_label,flyer_size,design_type,artwork_path')
    .eq('status', 'approved').eq('payment_status', 'paid').eq('target_state', userLocation.stateCode)
    .gte('election_date', new Date().toISOString().slice(0, 10))
    .order('created_at', { ascending: false }).limit(100);
  if (loadId !== flyerLoadId) return;
  if (error) {
    approvedHeroFlyers = [];
    renderHeroFlyers();
    note.textContent = 'Political flyers are unavailable right now.';
    list.innerHTML = '';
    return;
  }
  const matches = (data || []).filter((flyer) =>
    flyer.target_scope === 'state' ||
    (normalizeArea(flyer.target_county) === normalizeArea(userLocation.county) &&
      (flyer.target_scope === 'county' || normalizeArea(flyer.target_city) === normalizeArea(userLocation.city)))
  );
  const hydrated = await attachFlyerArtworkUrls(matches);
  if (loadId !== flyerLoadId) return;
  approvedHeroFlyers = hydrated;
  renderHeroFlyers();
  list.replaceChildren(...hydrated.map((flyer) => {
    const card = makeCampaignFlyer(flyer);
    card.style.maxWidth = '300px';
    return card;
  }));
  if (!matches.length) note.textContent += ' No approved political flyers match this area.';
}

function setupPoliticalFlyers() {
  const state = $('#flyer-state');
  if (!state) return;
  $('#flyer-form').addEventListener('input', updateFlyerPreview);
  $('#flyer-form').addEventListener('change', updateFlyerPreview);
  $('#flyer-artwork').addEventListener('change', () => {
    if (flyerArtworkPreviewUrl) URL.revokeObjectURL(flyerArtworkPreviewUrl);
    const file = $('#flyer-artwork').files[0];
    flyerArtworkPreviewUrl = file && ['image/png','image/jpeg','image/webp'].includes(file.type) &&
      file.size <= 10485760 ? URL.createObjectURL(file) : '';
    updateFlyerPreview();
  });
  updateFlyerPreview();
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
    const button = event.submitter;
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = 'Saving your private flyer…';
    let artworkPath = null;
    let saved = false;
    try {
      const id = crypto.randomUUID();
      const design = $('#flyer-design').value;
      if (design === 'upload') {
        const file = $('#flyer-artwork').files[0];
        if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type) ||
            file.size === 0 || file.size > 10485760) throw new Error('Choose a PNG, JPEG or WebP flyer up to 10 MB.');
        const bytes = new Uint8Array(await file.slice(0,12).arrayBuffer());
        const valid = file.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v) :
          file.type === 'image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255 :
          String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP';
        if (!valid) throw new Error('The artwork contents do not match its image type.');
        const ext = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];
        artworkPath = user.id + '/' + id + '.' + ext;
        const {error:uploadError} = await db.storage.from('candidate-flyers').upload(artworkPath,file,{contentType:file.type,upsert:false});
        if (uploadError) throw new Error('Could not upload the private flyer artwork. Try again.');
      }
      const name = $('#flyer-candidate-name').value.trim();
      const office = $('#flyer-office').value.trim();
      const { error } = await db.from('political_flyers').insert({
      id,
      owner_id: user.id,
      headline: name + ' for ' + office,
      candidate_name: name,
      office_title: office,
      district_zone: $('#flyer-district').value.trim(),
      location_label: $('#flyer-location').value.trim(),
      flyer_size: $('#flyer-size').value,
      design_type: design,
      artwork_path: artworkPath,
      requested_fee_amount_cents: Number($('#flyer-requested-price').value),
      body: $('#flyer-body').value.trim(),
      paid_for_by: $('#flyer-sponsor').value.trim(),
      target_state: state.value,
      committee_id: state.value === 'CA' ? $('#flyer-committee-id').value.trim() : null,
      target_scope: scope.value,
      target_county: scope.value === 'state' ? null : $('#flyer-county').value.trim(),
      target_city: scope.value === 'city' ? $('#flyer-city').value.trim() : null,
      election_date: $('#flyer-election').value,
    });
      if (error) throw new Error('Could not save your flyer. Check the election date, verification and required fields.');
      saved = true;
      status.textContent = 'Saved privately for review. SPOYLT confirms the area and price, then your payment button appears below. Public placement requires approval and confirmed payment.';
      clearFlyerDraft();
      await loadMyFlyers();
    } catch (error) {
      if (artworkPath && !saved) await db.storage.from('candidate-flyers').remove([artworkPath]);
      status.textContent = error.message || 'Could not save your flyer.';
    } finally {
      button.disabled = false;
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
  const ownerId = currentUser.id;
  const { data, error } = await db.from('political_flyers')
    .select('id,headline,body,paid_for_by,election_date,status,payment_status,created_at,committee_id,fee_amount_cents,fee_geography_id,candidate_name,office_title,district_zone,location_label,flyer_size,design_type,artwork_path,requested_fee_amount_cents').eq('owner_id', ownerId)
    .order('created_at', { ascending: false }).limit(30);
  if (currentUser?.id !== ownerId) return;
  if (error) {
    box.textContent = 'Your flyers could not load right now.';
    return;
  }
  box.innerHTML = '<h4 class="font-semibold">My campaign flyers</h4>' +
    ((data || []).length ? data.map((flyer) =>
      '<div class="border border-slate-700 rounded-lg p-3 text-sm"><strong>' + escapeHtml(flyer.headline) +
      '</strong><span class="text-slate-400"> · ' + escapeHtml(flyer.status.replaceAll('_', ' ')) +
      '</span><p class="mt-2 text-slate-300">' + flyerSizeLabel(flyer.flyer_size) +
      (flyer.requested_fee_amount_cents ? ' · Requested area price $' + (flyer.requested_fee_amount_cents / 100).toFixed(0) : '') +
      '</p><div data-flyer-preview="' + escapeHtml(flyer.id) + '" class="mt-3 max-w-[240px]"></div>' +
      (flyer.status === 'awaiting_payment' && flyer.payment_status === 'unpaid'
        ? (flyer.fee_geography_id && [14900, 29900, 49500].includes(flyer.fee_amount_cents)
          ? '<button type="button" data-pay-flyer="' + escapeHtml(flyer.id) +
            '" data-pay-label="Pay $' + (flyer.fee_amount_cents / 100).toFixed(0) + ' for this flyer"' +
            ' class="block mt-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-2 rounded-lg">Pay $' +
            (flyer.fee_amount_cents / 100).toFixed(0) + ' for this flyer</button>'
          : '<p class="mt-3 text-amber-300">Fee pending reviewer assignment.</p>')
        : '') + '</div>').join('') : '<p class="text-sm text-slate-400">No flyers saved yet.</p>');
  const hydrated = await attachFlyerArtworkUrls(data || []);
  if (currentUser?.id !== ownerId) return;
  hydrated.forEach((flyer) => box.querySelector('[data-flyer-preview="' + flyer.id + '"]')?.replaceChildren(makeCampaignFlyer(flyer,true)));
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

function refreshCountyOptions() {
  const select = $('#county-select');
  if (!select) return;
  const state = $('#state-select')?.value || '';
  const selected = select.value;
  const counties = [...new Set([
    ...(state === 'CA' ? CA_COUNTIES : []),
    ...ballotMeasures.filter((measure) => measure.state_code === state && measure.scope === 'county')
      .map((measure) => measure.county_name).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b));
  const boroughs = { Bronx: 'Bronx', Kings: 'Brooklyn', 'New York': 'Manhattan', Queens: 'Queens', Richmond: 'Staten Island' };
  select.innerHTML = '<option value="">Choose a county for local measures</option>' +
    counties.map((county) => '<option value="' + escapeHtml(county) + '">' +
      escapeHtml(state === 'NY' && boroughs[county]
        ? boroughs[county] + ' (' + county + ' County)' : county + ' County') + '</option>').join('');
  select.value = counties.includes(selected) ? selected : '';
}

function matchingBallotMeasures() {
  const state = $('#state-select')?.value || '';
  const county = $('#county-select')?.value || '';
  return ballotMeasures.filter((measure) => {
    if (measure.state_code !== state || measure.scope !== (propositionScope === 'state' ? 'state' : 'county')) return false;
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
      (measure.scope === 'state' ? 'Proposition ' : (measure.jurisdiction ? escapeHtml(measure.jurisdiction) + ' · ' : '') + 'Measure ') +
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
  refreshCountyOptions();
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
  refreshCountyOptions();
  $$('input[name="proposition-scope"]').forEach((input) =>
    input.addEventListener('change', updateScopeUI)
  );
  stateSelect?.addEventListener('change', () => {
    refreshCountyOptions();
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
  if (!verified) {
    clearFlyerDraft();
    $('#my-flyers')?.replaceChildren();
  }
  $('#official-gate-note')?.classList.toggle('hidden', verified);
  if (typeof refreshOfficialAssistant === 'function') refreshOfficialAssistant();
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
  if (typeof refreshOfficialAssistant === "function") refreshOfficialAssistant();
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
  setupOfficialAssistant();
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

