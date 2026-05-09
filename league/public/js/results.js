const API_BASE = '/api';

// ── Auth guard ──
const token = localStorage.getItem('token') || sessionStorage.getItem('token');
const user  = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');

if (!token || !user) window.location.href = 'login.html';

// ── Nav init ──
function initUser() {
  const username = user?.username || 'Player';
  document.getElementById('avatar-name').textContent   = username;
  document.getElementById('avatar-circle').textContent = username.charAt(0).toUpperCase();
}

function toggleAvatarDropdown() {
  document.getElementById('avatar-dropdown').classList.toggle('open');
}

function toggleNotifPanel() {}

document.addEventListener('click', (e) => {
  const avatar = document.getElementById('avatar-btn');
  const dd     = document.getElementById('avatar-dropdown');
  if (!avatar.contains(e.target)) dd.classList.remove('open');
});

function handleSignOut() {
  localStorage.clear();
  sessionStorage.clear();
  window.location.href = 'login.html';
}

// ════════════════════════════════
// STATE
// ════════════════════════════════
let allResults      = [];
let filteredResults = [];
let currentLeagueId = null;
let userLeagues     = [];
let currentFilter   = 'all';
let selectedIds     = new Set();
let isOwner         = false;

// ════════════════════════════════
// LOAD LEAGUES  →  GET /api/leagues/mine
// ════════════════════════════════
async function loadUserLeagues() {
  try {
    const res = await fetch(`${API_BASE}/leagues/mine`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error();

    const data  = await res.json();
    userLeagues = data.leagues || [];

    // Only show leagues where user is owner
    const ownedLeagues = userLeagues.filter(l => l.role === 'owner');
    populateLeagueSelector(ownedLeagues);

    const params    = new URLSearchParams(window.location.search);
    const urlLeague = params.get('league');

    if (urlLeague && ownedLeagues.find(l => String(l.id) === urlLeague)) {
      currentLeagueId = parseInt(urlLeague);
      document.getElementById('league-selector').value = urlLeague;
    } else if (ownedLeagues.length > 0) {
      currentLeagueId = ownedLeagues[0].id;
    }

    if (currentLeagueId) {
      isOwner = true;
      showOwnerUI();
      loadResults(currentLeagueId);
    } else {
      showNotOwner();
    }

  } catch (err) {
    console.error('Leagues load error:', err);
    showNotOwner();
  }
}

function populateLeagueSelector(leagues) {
  const sel = document.getElementById('league-selector');
  sel.innerHTML = '';

  if (!leagues.length) {
    sel.innerHTML = '<option value="">No leagues owned</option>';
    return;
  }

  leagues.forEach(l => {
    const opt       = document.createElement('option');
    opt.value       = l.id;
    opt.textContent = `${l.name} — ${l.season}`;
    sel.appendChild(opt);
  });
}

function handleLeagueChange() {
  const val = document.getElementById('league-selector').value;
  if (!val) return;
  currentLeagueId = parseInt(val);
  selectedIds.clear();
  updateBulkBar();
  loadResults(currentLeagueId);
  window.history.replaceState({}, '', `results.html?league=${currentLeagueId}`);
}

// ════════════════════════════════
// LOAD RESULTS  →  GET /api/leagues/:id/results
// ════════════════════════════════
async function loadResults(leagueId) {
  showSkeletons();

  try {
    const res = await fetch(`${API_BASE}/leagues/${leagueId}/results`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load results');

    const data  = await res.json();
    allResults  = data.results || [];

    const league = userLeagues.find(l => l.id === leagueId);
    if (league) {
      document.getElementById('page-sub').textContent =
        `${league.name} · ${allResults.length} total results`;
    }

    updateSummary(allResults);
    applyFilter();

  } catch (err) {
    console.error('Results load error:', err);
    showError();
  }
}

// ════════════════════════════════
// SUMMARY STRIP
// ════════════════════════════════
function updateSummary(results) {
  const pending  = results.filter(r => r.status === 'pending').length;
  const approved = results.filter(r => r.status === 'approved').length;

  document.getElementById('count-pending').textContent  = pending;
  document.getElementById('count-approved').textContent = approved;
  document.getElementById('count-total').textContent    = results.length;

  // Update notif badge
  const badge = document.getElementById('notif-badge');
  if (pending > 0) {
    badge.textContent = pending > 9 ? '9+' : pending;
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }
}

// ════════════════════════════════
// FILTER
// ════════════════════════════════
function filterStatus(status, el) {
  currentFilter = status;
  selectedIds.clear();
  updateBulkBar();

  document.querySelectorAll('.chip').forEach(c => {
    c.classList.remove('active', 'active-warn');
    c.style.background = '';
    c.style.borderColor = '';
    c.style.color = '';
  });

  el.classList.add('active');
  if (status === 'pending') {
    el.style.background    = 'var(--warning-dim)';
    el.style.borderColor   = 'rgba(255,149,0,0.4)';
    el.style.color         = 'var(--warning)';
  }

  applyFilter();
}

function applyFilter() {
  filteredResults = currentFilter === 'all'
    ? allResults
    : allResults.filter(r => r.status === currentFilter);

  renderResults(filteredResults);
}

// ════════════════════════════════
// RENDER RESULTS
// ════════════════════════════════
function renderResults(results) {
  const list  = document.getElementById('results-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '';

  if (results.length === 0) {
    empty.classList.add('visible');
    const isPending = currentFilter === 'pending';
    document.getElementById('empty-title').textContent = isPending ? 'All Clear' : 'No Results';
    document.getElementById('empty-sub').textContent   = isPending
      ? 'No pending results. You\'re all caught up.'
      : `No ${currentFilter === 'all' ? '' : currentFilter} results found.`;

    const icon = document.getElementById('empty-state').querySelector('.empty-icon');
    icon.className = `empty-icon ${isPending ? 'done-icon' : 'pending-icon'}`;
    return;
  }

  empty.classList.remove('visible');

  results.forEach((result, i) => {
    const card = buildResultCard(result);
    card.style.animationDelay = `${i * 0.04}s`;
    list.appendChild(card);
  });
}

function buildResultCard(result) {
  const card = document.createElement('div');
  card.className = `result-card ${result.status}`;
  card.dataset.id = result.id;

  const isPending  = result.status === 'pending';
  const isApproved = result.status === 'approved';
  const isRejected = result.status === 'rejected';

  const submittedTime = result.submittedAt
    ? timeAgo(new Date(result.submittedAt))
    : 'Unknown';

  card.innerHTML = `
    <div class="result-card-body">
      <input
        type="checkbox"
        class="result-check"
        id="chk-${result.id}"
        ${!isPending ? 'disabled style="opacity:0.3"' : ''}
        onchange="toggleSelect(${result.id}, this.checked)"
      />

      <div class="result-team">
        <div class="result-team-name">${escHtml(result.homeTeam.teamName)}</div>
        <div class="result-team-player">@${escHtml(result.homeTeam.username)}</div>
      </div>

      <div class="result-score-wrap">
        <div class="result-score">${result.homeScore} – ${result.awayScore}</div>
        <div class="result-matchday">MD ${result.matchday}</div>
      </div>

      <div class="result-team right">
        <div class="result-team-name">${escHtml(result.awayTeam.teamName)}</div>
        <div class="result-team-player">@${escHtml(result.awayTeam.username)}</div>
      </div>
    </div>

    <div class="result-footer">
      <div class="result-meta">
        <div class="result-meta-item">
          <svg viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" stroke-width="1.1"/><path d="M5.5 3V5.5L7 6.8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
          ${submittedTime}
        </div>
        <div class="result-meta-item">
          Submitted by <strong style="color:var(--white);margin-left:3px;">@${escHtml(result.submittedBy || result.homeTeam.username)}</strong>
        </div>
        <span class="result-status-badge ${result.status}">${capitalize(result.status)}</span>
      </div>

      <div class="result-actions">
        ${isPending ? `
          <button class="btn-approve" onclick="handleAction(${result.id}, 'approve')">
            <svg viewBox="0 0 11 11" fill="none"><path d="M2 5.5L4.5 8L9 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Approve
          </button>
          <button class="btn-reject" onclick="handleAction(${result.id}, 'reject')">
            <svg viewBox="0 0 11 11" fill="none"><line x1="2" y1="2" x2="9" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="9" y1="2" x2="2" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            Reject
          </button>
        ` : `
          <span class="btn-already">${isApproved ? '✓ Confirmed' : '✕ Rejected'}</span>
        `}
      </div>
    </div>
  `;

  return card;
}

// ════════════════════════════════
// SELECT / BULK
// ════════════════════════════════
function toggleSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else         selectedIds.delete(id);
  updateBulkBar();
}

function updateBulkBar() {
  const bar   = document.getElementById('bulk-bar');
  const count = document.getElementById('selected-count');
  if (selectedIds.size > 0) {
    bar.classList.add('visible');
    count.textContent = selectedIds.size;
  } else {
    bar.classList.remove('visible');
  }
}

async function bulkAction(action) {
  if (selectedIds.size === 0) return;

  const ids = [...selectedIds];
  const promises = ids.map(id => handleAction(id, action, true));
  await Promise.all(promises);

  selectedIds.clear();
  updateBulkBar();
  loadResults(currentLeagueId);
  showToast(
    `${ids.length} result${ids.length > 1 ? 's' : ''} ${action === 'approve' ? 'approved' : 'rejected'}.`,
    action === 'approve' ? 'success' : 'warn'
  );
}

// ════════════════════════════════
// APPROVE / REJECT  →  POST /api/matches/:id/approve|reject
// ════════════════════════════════
async function handleAction(matchId, action, silent = false) {
  // Optimistic UI update
  const card = document.querySelector(`.result-card[data-id="${matchId}"]`);
  if (card && !silent) {
    card.style.opacity = '0.5';
    card.style.pointerEvents = 'none';
  }

  try {
    const res = await fetch(`${API_BASE}/matches/${matchId}/${action}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();

    if (!res.ok) {
      if (card) { card.style.opacity = '1'; card.style.pointerEvents = ''; }
      if (!silent) showToast(data.message || `Failed to ${action} result.`, 'error');
      return;
    }

    // Update local state
    const result = allResults.find(r => r.id === matchId);
    if (result) result.status = action === 'approve' ? 'approved' : 'rejected';

    if (!silent) {
      updateSummary(allResults);
      applyFilter();
      showToast(
        `Result ${action === 'approve' ? 'approved' : 'rejected'} — table ${action === 'approve' ? 'updated.' : 'unchanged.'}`,
        action === 'approve' ? 'success' : 'warn'
      );
    }

  } catch (err) {
    if (card) { card.style.opacity = '1'; card.style.pointerEvents = ''; }
    if (!silent) showToast('Network error. Try again.', 'error');
  }
}

// ════════════════════════════════
// TOAST
// ════════════════════════════════
let toastTimer = null;

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const dot   = document.getElementById('toast-dot');
  const text  = document.getElementById('toast-msg');

  dot.className  = `toast-dot ${type}`;
  text.textContent = msg;

  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ════════════════════════════════
// UI STATE HELPERS
// ════════════════════════════════
function showOwnerUI() {
  document.getElementById('owner-banner').classList.remove('hidden');
  document.getElementById('not-owner').classList.remove('visible');
  document.getElementById('summary-strip').style.display = '';
  document.getElementById('filters-bar').style.display   = '';
}

function showNotOwner() {
  document.getElementById('owner-banner').classList.add('hidden');
  document.getElementById('not-owner').classList.add('visible');
  document.getElementById('summary-strip').style.display = 'none';
  document.getElementById('filters-bar').style.display   = 'none';
  document.getElementById('results-list').innerHTML       = '';
}

function showSkeletons() {
  document.getElementById('results-list').innerHTML = `
    <div class="skeleton"></div>
    <div class="skeleton" style="opacity:.7"></div>
    <div class="skeleton" style="opacity:.45"></div>
  `;
  document.getElementById('empty-state').classList.remove('visible');
}

function showError() {
  document.getElementById('results-list').innerHTML =
    `<div style="text-align:center;padding:2rem;font-size:0.85rem;color:var(--white-dim);">Failed to load results. Please refresh.</div>`;
}

// ════════════════════════════════
// UTILS
// ════════════════════════════════
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date) / 1000);
  if (seconds < 60)   return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;');
}

// ── Init ──
initUser();
loadUserLeagues();