// SPOYLT Landing Page — Client logic (demo + ready for Supabase/Stripe)

const CATEGORIES = [
  { id: 'housing', label: 'Housing Crisis', icon: '🏠', color: 'sky' },
  { id: 'gas', label: 'High Gas Prices', icon: '⛽', color: 'amber' },
  { id: 'fire', label: 'Protection from Fires', icon: '🔥', color: 'orange' },
  { id: 'potholes', label: 'Street Potholes', icon: '🕳️', color: 'slate' },
  { id: 'police', label: 'Police Protection', icon: '👮', color: 'blue' },
  { id: 'animal', label: 'Animal Services', icon: '🐾', color: 'emerald' },
  { id: 'food', label: 'Food Banks Funding', icon: '🥫', color: 'rose' },
];

const SEED_PROPOSITIONS = [
  {
    id: 'seed-1',
    category: 'housing',
    title: 'Cap annual rent increases at 3% for existing tenants',
    suggestion: 'Skyrocketing rents are forcing families out of our neighborhoods. A hard 3% annual cap on rent increases for current tenants would provide stability while still allowing landlords a reasonable return.',
    likes: 247,
    supports: 189,
    comments: 42,
    location: 'Sacramento, CA',
    author: 'Local Resident',
    email: 'resident.demo@spoylt.local',
    createdAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'seed-2',
    category: 'potholes',
    title: 'Emergency pothole repair fund for major arterials',
    suggestion: 'Potholes on Florin Road and Stockton Blvd are damaging cars daily. We need a dedicated emergency fund and 48-hour response SLA for priority corridors.',
    likes: 312,
    supports: 278,
    comments: 56,
    location: 'Sacramento, CA',
    author: 'Commute Warrior',
    email: 'commute.demo@spoylt.local',
    createdAt: Date.now() - 86400000 * 5,
  },
  {
    id: 'seed-3',
    category: 'fire',
    title: 'Expand defensible space grants for wildfire-prone homes',
    suggestion: 'Many homeowners cannot afford the vegetation clearance required. Expand the grant program and pair it with free chipper days in high-risk zones.',
    likes: 198,
    supports: 165,
    comments: 31,
    location: 'Sacramento, CA',
    author: 'Foothill Neighbor',
    email: 'foothill.demo@spoylt.local',
    createdAt: Date.now() - 86400000 * 1,
  },
  {
    id: 'seed-4',
    category: 'gas',
    title: 'Temporary suspension of local fuel tax during price spikes',
    suggestion: 'When average gas exceeds $5/gallon for 30 consecutive days, automatically suspend the local fuel tax until prices stabilize. Protect working families.',
    likes: 421,
    supports: 390,
    comments: 87,
    location: 'Sacramento, CA',
    author: 'Working Parent',
    email: 'parent.demo@spoylt.local',
    createdAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'seed-5',
    category: 'food',
    title: 'Increase city matching funds for food bank operations',
    suggestion: 'Demand at local food banks has doubled. The city should match private donations dollar-for-dollar up to $2M annually to keep shelves stocked.',
    likes: 156,
    supports: 142,
    comments: 28,
    location: 'Sacramento, CA',
    author: 'Volunteer',
    email: 'volunteer.demo@spoylt.local',
    createdAt: Date.now() - 86400000 * 4,
  },
];

// State
let selectedCategory = null;
let userLocation = { city: 'your area', region: '', country: '', lat: null, lng: null };
let propositions = [];

// DOM helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showToast(msg, duration = 3200) {
  const toast = $('#toast');
  toast.textContent = msg;
  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  setTimeout(() => {
    toast.classList.add('translate-y-24', 'opacity-0');
    toast.classList.remove('translate-y-0', 'opacity-100');
  }, duration);
}

// Geolocation
async function detectLocation() {
  const label = $('#location-label');
  const heroLoc = $('#hero-location');
  const formLoc = $('#form-location');

  label.textContent = 'Locating…';

  if (!navigator.geolocation) {
    label.textContent = 'Location unavailable';
    heroLoc.textContent = '📍 Location services not available in this browser';
    return;
  }

  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      });
    });

    userLocation.lat = pos.coords.latitude;
    userLocation.lng = pos.coords.longitude;

    // Reverse geocode via free OpenStreetMap Nominatim
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.lat}&lon=${userLocation.lng}&zoom=10`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    const addr = data.address || {};
    userLocation.city = addr.city || addr.town || addr.village || addr.county || 'Your area';
    userLocation.region = addr.state || '';
    userLocation.country = addr.country_code?.toUpperCase() || '';

    const display = [userLocation.city, userLocation.region].filter(Boolean).join(', ');
    label.textContent = display;
    heroLoc.textContent = `📍 Showing issues near ${display}`;
    formLoc.textContent = display;

    // Update seed locations for demo consistency
    propositions.forEach((p) => {
      if (p.id.startsWith('seed-')) p.location = display;
    });
    renderBoard();
  } catch (err) {
    console.warn('Geolocation error:', err);
    label.textContent = 'Location denied';
    heroLoc.textContent = '📍 Enable location for local propositions (demo uses Sacramento)';
    userLocation.city = 'Sacramento';
    userLocation.region = 'CA';
    formLoc.textContent = 'Sacramento, CA';
  }
}

// Categories UI
function renderCategories() {
  const grid = $('#category-grid');
  const chips = $('#category-chips');

  grid.innerHTML = CATEGORIES.map(
    (c) => `
    <button data-cat="${c.id}" class="category-card glass rounded-xl p-5 text-left card-hover group">
      <div class="text-3xl mb-3">${c.icon}</div>
      <h3 class="font-semibold text-slate-100 group-hover:text-sky-300 transition">${c.label}</h3>
      <p class="text-xs text-slate-500 mt-1">Start a Spoylt →</p>
    </button>
  `
  ).join('');

  chips.innerHTML = CATEGORIES.map(
    (c) => `
    <button type="button" data-cat="${c.id}" class="category-chip border border-slate-600 text-slate-300 text-sm px-3 py-1.5 rounded-full">
      ${c.icon} ${c.label}
    </button>
  `
  ).join('');

  // Click handlers
  $$('.category-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedCategory = btn.dataset.cat;
      document.getElementById('start').scrollIntoView({ behavior: 'smooth' });
      highlightChip(selectedCategory);
    });
  });

  $$('.category-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedCategory = btn.dataset.cat;
      highlightChip(selectedCategory);
    });
  });
}

function highlightChip(id) {
  $$('.category-chip').forEach((b) => {
    b.classList.toggle('active', b.dataset.cat === id);
  });
}

// Board
function loadPropositions() {
  const stored = localStorage.getItem('spoylt_props');
  if (stored) {
    try {
      propositions = JSON.parse(stored);
    } catch {
      propositions = [...SEED_PROPOSITIONS];
    }
  } else {
    propositions = [...SEED_PROPOSITIONS];
  }
  // Always ensure seeds exist for demo freshness
  const ids = new Set(propositions.map((p) => p.id));
  SEED_PROPOSITIONS.forEach((s) => {
    if (!ids.has(s.id)) propositions.push(s);
  });
  savePropositions();
}

function savePropositions() {
  localStorage.setItem('spoylt_props', JSON.stringify(propositions));
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function renderBoard() {
  const board = $('#community-board');
  const count = $('#board-count');
  count.textContent = propositions.length;

  const sorted = [...propositions].sort((a, b) => b.createdAt - a.createdAt);

  board.innerHTML = sorted
    .map((p) => {
      const cat = CATEGORIES.find((c) => c.id === p.category) || { icon: '📌', label: 'General' };
      return `
      <article class="glass rounded-xl p-5 card-hover" data-id="${p.id}">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-2">
            <span class="text-lg">${cat.icon}</span>
            <span class="text-xs font-medium text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">${cat.label}</span>
          </div>
          <span class="text-xs text-slate-500">${timeAgo(p.createdAt)}</span>
        </div>
        <h3 class="font-semibold text-lg mb-2 leading-snug">${escapeHtml(p.title)}</h3>
        <p class="text-sm text-slate-400 mb-4 line-clamp-3">${escapeHtml(p.suggestion)}</p>
        <div class="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span>📍 ${escapeHtml(p.location || 'Local')}</span>
          <span>by ${escapeHtml(p.author || 'Citizen')}</span>
        </div>
        <div class="flex items-center gap-3 mt-4 pt-4 border-t border-slate-700/60">
          <button class="like-btn flex items-center gap-1.5 text-sm text-slate-400 hover:text-sky-400 transition" data-id="${p.id}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"/></svg>
            <span class="like-count">${p.likes}</span>
          </button>
          <button class="support-btn flex items-center gap-1.5 text-sm text-slate-400 hover:text-emerald-400 transition" data-id="${p.id}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span class="support-count">${p.supports}</span> Support
          </button>
          <button class="comment-btn flex items-center gap-1.5 text-sm text-slate-400 hover:text-amber-400 transition" data-id="${p.id}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            <span>${p.comments}</span>
          </button>
        </div>
      </article>
    `;
    })
    .join('');

  // Bind interaction buttons
  $$('.like-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = propositions.find((x) => x.id === btn.dataset.id);
      if (p) {
        p.likes += 1;
        savePropositions();
        btn.querySelector('.like-count').textContent = p.likes;
        showToast('Liked! Your support is counted.');
      }
    });
  });
  $$('.support-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = propositions.find((x) => x.id === btn.dataset.id);
      if (p) {
        p.supports += 1;
        savePropositions();
        btn.querySelector('.support-count').textContent = p.supports;
        showToast('You supported this proposition.');
      }
    });
  });
  $$('.comment-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const email = ($('#author-email')?.value || '').trim();
      const draft = window.prompt('Add a comment (scanned by Community Firewall):');
      if (draft == null) return;
      const fw = window.SpoyltFirewall.inspect({
        email: email || 'anonymous@blocked.invalid',
        displayName: 'Commenter',
        comment: draft,
      });
      if (!fw.allowed) {
        if (fw.blockEmail && email) {
          propositions = window.SpoyltFirewall.purgeByEmail(propositions, email);
          savePropositions();
          renderBoard();
          renderFirewallPanel();
        }
        showToast(window.SpoyltFirewall.publicMessage(fw));
        return;
      }
      const p = propositions.find((x) => x.id === btn.dataset.id);
      if (p) {
        p.comments += 1;
        savePropositions();
        renderBoard();
        showToast('Comment posted.');
      }
    });
  });
}

function renderFirewallPanel() {
  const fw = window.SpoyltFirewall;
  if (!fw) return;
  const blocks = fw.loadBlocks();
  const log = fw.loadLog();
  const countEl = $('#fw-block-count');
  const logEl = $('#fw-log-count');
  const listEl = $('#fw-block-list');
  if (countEl) countEl.textContent = String(blocks.length);
  if (logEl) logEl.textContent = String(log.length);
  if (!listEl) return;
  if (!blocks.length) {
    listEl.innerHTML = '<li class="text-slate-600">No blocks yet. Firewall is armed.</li>';
    return;
  }
  listEl.innerHTML = blocks
    .map((b) => {
      const when = new Date(b.blockedAt).toLocaleString();
      return `<li class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-slate-800 pb-2">
        <span class="text-rose-300 font-mono text-xs">${escapeHtml(b.email)}</span>
        <span class="text-xs">${escapeHtml((b.reasons || []).join(', '))} · ${escapeHtml(when)} · permanent</span>
      </li>`;
    })
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Form submit
function setupForm() {
  const form = $('#spoylt-form');
  const textarea = $('#suggestion');
  const charCount = $('#char-count');

  textarea.addEventListener('input', () => {
    charCount.textContent = textarea.value.length;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#title').value.trim();
    const suggestion = textarea.value.trim();
    const email = ($('#author-email')?.value || '').trim();

    if (!selectedCategory) {
      showToast('Please select a category first.');
      return;
    }
    if (!email || !title || !suggestion) {
      showToast('Email, title, and suggestion are required.');
      return;
    }

    const fw = window.SpoyltFirewall.inspect({
      email,
      displayName: email.split('@')[0],
      title,
      body: suggestion,
    });
    if (!fw.allowed) {
      if (fw.blockEmail) {
        propositions = window.SpoyltFirewall.purgeByEmail(propositions, email);
        savePropositions();
        renderBoard();
      }
      renderFirewallPanel();
      showToast(window.SpoyltFirewall.publicMessage(fw));
      return;
    }

    // Free tier limit check (demo: count in localStorage)
    const monthKey = `spoylt_count_${new Date().getFullYear()}_${new Date().getMonth()}`;
    let count = parseInt(localStorage.getItem(monthKey) || '0', 10);
    if (count >= 5) {
      showToast('Free limit reached (5/month). Upgrade to Unlimited for $10/mo.');
      document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const newProp = {
      id: 'user-' + Date.now(),
      category: selectedCategory,
      title,
      suggestion,
      likes: 0,
      supports: 1, // auto-support your own
      comments: 0,
      location: [userLocation.city, userLocation.region].filter(Boolean).join(', ') || 'Local',
      author: 'You',
      email,
      createdAt: Date.now(),
    };

    propositions.unshift(newProp);
    savePropositions();
    count += 1;
    localStorage.setItem(monthKey, String(count));

    form.reset();
    selectedCategory = null;
    highlightChip(null);
    charCount.textContent = '0';
    renderBoard();
    document.getElementById('board').scrollIntoView({ behavior: 'smooth' });
    showToast('🎉 Your Spoylt is live on the Community Board!');
  });
}

// Stripe placeholders (ready for real integration)
function setupStripeButtons() {
  $('#stripe-unlimited')?.addEventListener('click', () => {
    showToast('Redirecting to Stripe Checkout… (connect your Stripe price ID)');
    // In production:
    // window.location = '/api/create-checkout-session?price=price_unlimited';
  });
  $('#stripe-official')?.addEventListener('click', () => {
    showToast('Redirecting to Stripe Checkout for Officials…');
  });
  $('#official-cta')?.addEventListener('click', () => {
    document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
  });
}

// Geo button
$('#geo-btn')?.addEventListener('click', detectLocation);

// Init
document.addEventListener('DOMContentLoaded', () => {
  renderCategories();
  loadPropositions();
  renderBoard();
  setupForm();
  setupStripeButtons();
  renderFirewallPanel();
  detectLocation();
});
