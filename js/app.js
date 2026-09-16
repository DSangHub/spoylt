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
];

let selectedCategory = null;
let currentUser = null;
let propositions = [];
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

function updateAuthUI() {
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
    button.textContent = 'Sign out';
    button.title = currentUser.email || '';
    if (email) {
      email.value = currentUser.email || '';
      email.readOnly = true;
    }
    button.onclick = async () => {
      await db.auth.signOut();
      showToast('Signed out.');
    };
  } else {
    button.textContent = 'Sign in';
    if (email) email.readOnly = false;
    button.onclick = () => {
      document.getElementById('start').scrollIntoView({ behavior: 'smooth' });
      email?.focus();
      showToast('Enter your email, then submit a proposition. We will email you a secure sign-in link.');
    };
  }
}

async function requestSignIn(email) {
  if (!email) {
    showToast('Enter your email to sign in.');
    return false;
  }
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) {
    showToast(error.message);
    return false;
  }
  showToast('Check your email for the secure SPOYLT sign-in link.', 7000);
  return false;
}

async function requireUser() {
  if (currentUser) return currentUser;
  const email = ($('#author-email')?.value || '').trim();
  await requestSignIn(email);
  return null;
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
    if (form) form.textContent = display;
  } catch {
    userLocation = { city: 'Sacramento', region: 'CA', lat: null, lng: null };
    if (label) label.textContent = 'Location unavailable';
    if (hero) hero.textContent = '📍 Enable location to see nearby propositions';
    if (form) form.textContent = 'Sacramento, CA';
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
  $$('.category-chip').forEach((button) => button.classList.toggle('active', button.dataset.cat === id));
}

async function loadPropositions() {
  const { data, error } = await db
    .from('propositions')
    .select('id,user_id,category,title,suggestion,location_city,location_region,created_at,interactions(kind)')
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
    const location = [p.location_city, p.location_region].filter(Boolean).join(', ') || 'Local';
    return '<article class="glass rounded-xl p-5 card-hover" data-id="' + p.id + '">' +
      '<div class="flex items-start justify-between gap-3 mb-3"><div class="flex items-center gap-2">' +
      '<span class="text-lg">' + cat.icon + '</span><span class="text-xs font-medium text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">' +
      escapeHtml(cat.label) + '</span></div><span class="text-xs text-slate-500">' + timeAgo(p.created_at) + '</span></div>' +
      '<h3 class="font-semibold text-lg mb-2 leading-snug">' + escapeHtml(p.title) + '</h3>' +
      '<p class="text-sm text-slate-400 mb-4 line-clamp-3">' + escapeHtml(p.suggestion) + '</p>' +
      '<div class="flex flex-wrap items-center gap-4 text-xs text-slate-500"><span>📍 ' + escapeHtml(location) +
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
      const result = window.SpoyltFirewall.inspect({
        email: user.email, displayName: 'Member', comment: body.trim(),
      });
      if (!result.allowed) return showToast(window.SpoyltFirewall.publicMessage(result));
      body = body.trim();
    }
    const { error } = await db.from('interactions').insert({
      proposition_id: button.dataset.id, user_id: user.id, kind, body,
    });
    if (error) {
      showToast(error.code === '23505' ? 'You already counted that reaction.' : error.message);
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
    const firewall = window.SpoyltFirewall.inspect({
      email: user.email, displayName: 'Member', title, body: suggestion,
    });
    if (!firewall.allowed) return showToast(window.SpoyltFirewall.publicMessage(firewall));

    const { error } = await db.from('propositions').insert({
      user_id: user.id,
      category: selectedCategory,
      title,
      suggestion,
      location_city: userLocation.city,
      location_region: userLocation.region,
      latitude: userLocation.lat,
      longitude: userLocation.lng,
    });
    if (error) {
      if (error.message.includes('Free plan limit')) {
        showToast('Free limit reached: 5 SPOYLTs this month. Upgrade for unlimited posting.');
        document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
      } else showToast(error.message);
      return;
    }

    form.reset();
    $('#author-email').value = user.email || '';
    selectedCategory = null;
    highlightChip(null);
    $('#char-count').textContent = '0';
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

function setupStripeButtons() {
  $('#stripe-unlimited')?.addEventListener('click', () => beginCheckout('unlimited'));
  $('#stripe-official')?.addEventListener('click', () => beginCheckout('official'));
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
  setupForm();
  setupStripeButtons();
  renderFirewallPanel();
  $('#geo-btn')?.addEventListener('click', detectLocation);

  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user || null;
  updateAuthUI();
  db.auth.onAuthStateChange((_event, nextSession) => {
    currentUser = nextSession?.user || null;
    updateAuthUI();
  });

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
