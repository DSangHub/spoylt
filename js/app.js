// SPOYLT production client — Supabase Auth, Database, Realtime, and Stripe Checkout
const SUPABASE_URL = 'https://xceamvdvjnutaovqpsbr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_uE5aJ-o74jGRS983ND15pg_2xxLVEzw';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
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
let userLocation = { city: 'your area', region: '', lat: null, lng: null };

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

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

async function createAccount(email, password, fullName) {
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: 'https://www.spoylt.org/',
      data: { full_name: fullName.trim() || 'SPOYLT member' },
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

async function signIn(email, password, fullName) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    showToast(friendlyAuthError(error), 7000);
    return;
  }

  const name = fullName.trim();
  if (name && data.user) {
    const { error: profileError } = await db
      .from('profiles')
      .update({ display_name: name })
      .eq('id', data.user.id);
    if (profileError) console.warn('Profile name could not be updated:', profileError.message);
  }

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
  $('#signup-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = ($('#signup-email')?.value || '').trim();
    const password = $('#signup-password')?.value || '';
    const fullName = ($('#signup-name')?.value || '').trim();
    await createAccount(email, password, fullName);
  });

  $('#signin-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fullName = ($('#signin-name')?.value || '').trim();
    const email = ($('#signin-email')?.value || '').trim();
    const password = $('#signin-password')?.value || '';
    await signIn(email, password, fullName);
  });
}

async function detectLocation() {
  const label = $('#location-label');
  const hero = $('#hero-location');
  const form = $('#form-location');
  if (label) label.textContent = 'Locating…';
  if (!navigator.geolocation) return;

  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false, timeout: 10000, maximumAge: 300000,
      })
    );
    userLocation.lat = pos.coords.latitude;
    userLocation.lng = pos.coords.longitude;
    const response = await fetch(
      'https://nominatim.openstreetmap.org/reverse?format=json&lat=' +
      userLocation.lat + '&lon=' + userLocation.lng + '&zoom=10',
      { headers: { 'Accept-Language': 'en' } }
    );
    const address = (await response.json()).address || {};
    userLocation.city = address.city || address.town || address.village || address.county || 'Your area';
    userLocation.region = address.state || '';
    const display = [userLocation.city, userLocation.region].filter(Boolean).join(', ');
    if (label) label.textContent = display;
    if (hero) hero.textContent = '📍 Showing issues near ' + display;
    updatePostingLocation();
  } catch {
    userLocation = { city: 'Sacramento', region: 'CA', lat: null, lng: null };
    if (label) label.textContent = 'Location unavailable';
    if (hero) hero.textContent = '📍 Enable location to see nearby propositions';
    updatePostingLocation();
  }
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
  $('.category-chip').forEach((button) => button.classList.toggle('active', button.dataset.cat === id));
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
  const matches = matchingBallotMeasures();
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
  $('input[name="proposition-scope"]').forEach((input) =>
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
}

async function loadVerificationRequest() {
  verificationRequest = null;
  if (!currentUser) return renderVerificationStatus();
  const { data, error } = await db.from('verification_requests').select('*').eq('user_id', currentUser.id).maybeSingle();
  if (error) {
    console.error(error);
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
  renderCategories();
  setupAuthForms();
  setupScopeControls();
  setupForm();
  setupVerification();
  setupStripeButtons();
  setupAiModerator();
  renderFirewallPanel();
  $('#geo-btn')?.addEventListener('click', detectLocation);

  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user || null;
  updateAuthUI();
  await loadVerificationRequest();
  db.auth.onAuthStateChange((_event, nextSession) => {
    currentUser = nextSession?.user || null;
    updateAuthUI();
    loadVerificationRequest();
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

  await Promise.all([loadPropositions(), detectLocation()]);
  db.channel('spoylt-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'propositions' }, loadPropositions)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, loadPropositions)
    .subscribe();
});
