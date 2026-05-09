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

function toggleMenu() {
  document.querySelector('.nav-links').classList.toggle('open');
}

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
let standings       = [];   // raw standings from API
let sortColumn      = 'points';
let sortDir         = 'desc';
let currentLeagueId = null;
let userLeagues     = [];
let leagueMeta      = null;

// ════════════════════════════════
// LOAD USER LEAGUES  →  GET /api/leagues/mine
// ════════════════════════════════
async function loadUserLeagues() {
  try {
    const res = await fetch(`${API_BASE}/leagues/mine`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error();

    const data  = await res.json();
    userLeagues = data.leagues || [];

    populateLeagueSelector(userLeagues);

    const params    = new URLSearchParams(window.location.search);
    const urlLeague = params.get('league');

    if (urlLeague && userLeagues.find(l => String(l.id) === urlLeague)) {
      currentLeagueId = parseInt(urlLeague);
      document.getElementById('league-selector').value = urlLeague;
    } else if (userLeagues.length > 0) {
      currentLeagueId = userLeagues[0].id;
    }

    if (currentLeagueId) {
      loadTable(currentLeagueId);
    } else {
      showEmpty();
    }

  } catch (err) {
    console.error('Leagues load error:', err);
    showEmpty();
  }
}

function populateLeagueSelector(leagues) {
  const sel = document.getElementById('league-selector');
  sel.innerHTML = '';

  if (leagues.length === 0) {
    sel.innerHTML = '<option value="">No leagues available</option>';
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
  loadTable(currentLeagueId);
  window.history.replaceState({}, '', `table.html?league=${currentLeagueId}`);
}

// ════════════════════════════════
// LOAD TABLE  →  GET /api/leagues/:id/table
// ════════════════════════════════
async function loadTable(leagueId) {
  showSkeletons();

  try {
    const res = await fetch(`${API_BASE}/leagues/${leagueId}/table`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load table');

    const data  = await res.json();
    standings   = data.standings  || [];
    leagueMeta  = data.league     || null;

    if (standings.length === 0) {
      showEmpty();
      return;
    }

    document.getElementById('empty-state').classList.remove('visible');

    const league = userLeagues.find(l => l.id === leagueId);
    if (league) {
      document.getElementById('page-sub').textContent =
        `${league.name} · ${standings.length} teams`;
    }

    updateSummaryCards(standings, leagueMeta);
    renderTable(standings);
    updateLastUpdated();

  } catch (err) {
    console.error('Table load error:', err);
    showEmpty();
  }
}

// ════════════════════════════════
// REFRESH
// ════════════════════════════════
async function refreshTable() {
  const btn  = document.getElementById('refresh-btn');
  const icon = document.getElementById('refresh-icon');
  btn.classList.add('spinning');
  await loadTable(currentLeagueId);
  btn.classList.remove('spinning');
}

// ════════════════════════════════
// SUMMARY CARDS
// ════════════════════════════════
function updateSummaryCards(rows, meta) {
  if (!rows.length) return;

  // Leader
  const leader = rows[0];
  document.getElementById('sum-leader').textContent    = leader.teamName;
  document.getElementById('sum-leader-pts').textContent = `${leader.points} pts`;

  // My position
  const mine = rows.find(r => r.userId === user.id);
  if (mine) {
    document.getElementById('sum-mypos').textContent = `${mine.position}${ordinal(mine.position)}`;
    document.getElementById('sum-mypts').textContent = `${mine.points} pts`;
  } else {
    document.getElementById('sum-mypos').textContent = '—';
    document.getElementById('sum-mypts').textContent = 'Not in league';
  }

  // Top scorer (by goals for)
  const topScorer = [...rows].sort((a, b) => b.goalsFor - a.goalsFor)[0];
  document.getElementById('sum-topscorer').textContent       = topScorer.teamName;
  document.getElementById('sum-topscorer-goals').textContent = `${topScorer.goalsFor} scored`;

  // Matches played / remaining
  const totalPlayed    = rows.reduce((s, r) => s + r.played, 0) / 2; // each match counted twice
  const totalRemaining = meta?.totalMatches ? meta.totalMatches - totalPlayed : '—';
  document.getElementById('sum-played').textContent    = Math.round(totalPlayed);
  document.getElementById('sum-remaining').textContent = `${totalRemaining} remaining`;
}

function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return s[(v-20)%10] || s[v] || s[0];
}

// ════════════════════════════════
// RENDER TABLE
// ════════════════════════════════
function renderTable(rows) {
  const tbody    = document.getElementById('table-body');
  const maxPts   = rows[0]?.points || 0;
  const qualZone = leagueMeta?.playoffSpots || 4;

  tbody.innerHTML = '';

  rows.forEach((row, idx) => {
    const isMe      = row.userId === user.id;
    const zone      = idx === 0 ? 'zone-champion' : idx < qualZone ? 'zone-qualify' : '';
    const myClass   = isMe ? ' my-team' : '';

    const tr = document.createElement('div');
    tr.className = `table-row ${zone}${myClass}`;
    tr.style.animationDelay = `${idx * 0.04}s`;

    // Position change indicator
    const change = row.previousPosition
      ? row.previousPosition - row.position
      : 0;
    const changeHTML = change > 0
      ? `<span class="pos-change up"><svg viewBox="0 0 8 8" fill="none"><path d="M4 1L7 5H1L4 1Z" fill="currentColor"/></svg></span>`
      : change < 0
        ? `<span class="pos-change down"><svg viewBox="0 0 8 8" fill="none"><path d="M4 7L1 3H7L4 7Z" fill="currentColor"/></svg></span>`
        : '';

    // Badge color
    const badgeCls = idx === 0 ? 'badge-gold' : isMe ? 'badge-blue' : 'badge-gray';

    // GD formatting
    const gdVal = row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference;
    const gdCls = row.goalDifference > 0 ? 'positive' : row.goalDifference < 0 ? 'negative' : '';

    // Form badges (last 5)
    const form     = row.form || [];
    const formHTML = [0,1,2,3,4].map(i => {
      const f = form[i];
      return f
        ? `<div class="form-dot ${f}">${f}</div>`
        : `<div class="form-dot empty">·</div>`;
    }).join('');

    tr.innerHTML = `
      <div class="td-pos ${idx < 3 ? `pos-${idx+1}` : ''}">${row.position}${changeHTML}</div>
      <div class="td-team">
        <div class="team-badge ${badgeCls}">${row.teamName.charAt(0)}</div>
        <div class="team-info">
          <div class="team-name-text ${isMe ? 'my-name' : ''}">${row.teamName}${isMe ? ' ★' : ''}</div>
          <div class="team-player">${row.username}</div>
        </div>
      </div>
      <div class="td-stat muted col-hide">${row.played}</div>
      <div class="td-stat col-hide">${row.won}</div>
      <div class="td-stat muted col-hide">${row.drawn}</div>
      <div class="td-stat muted col-hide">${row.lost}</div>
      <div class="td-stat muted col-hide">${row.goalsFor}</div>
      <div class="td-stat muted">${row.goalsAgainst}</div>
      <div class="td-stat ${gdCls}">${gdVal}</div>
      <div class="td-form">${formHTML}</div>
      <div class="td-pts ${idx === 0 ? 'leader' : ''}">${row.points}</div>
    `;

    tbody.appendChild(tr);
  });
}

// ════════════════════════════════
// SORTING
// ════════════════════════════════
function sortBy(col) {
  if (sortColumn === col) {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
  } else {
    sortColumn = col;
    sortDir    = col === 'position' ? 'asc' : 'desc';
  }

  const sorted = [...standings].sort((a, b) => {
    let av = a[col] ?? 0;
    let bv = b[col] ?? 0;
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  // Update sort icon on pts column
  const icon = document.getElementById('pts-sort-icon');
  if (col === 'points' && icon) {
    icon.innerHTML = sortDir === 'desc'
      ? '<path d="M4.5 7L1.5 3H7.5L4.5 7Z" fill="currentColor"/>'
      : '<path d="M4.5 2L7.5 6H1.5L4.5 2Z" fill="currentColor"/>';
  }

  renderTable(sorted);
}

// ════════════════════════════════
// HELPERS
// ════════════════════════════════
function showSkeletons() {
  document.getElementById('table-body').innerHTML = `
    <div class="skeleton-row"></div>
    <div class="skeleton-row" style="opacity:.75"></div>
    <div class="skeleton-row" style="opacity:.55"></div>
    <div class="skeleton-row" style="opacity:.35"></div>
    <div class="skeleton-row" style="opacity:.2"></div>
  `;
  document.getElementById('empty-state').classList.remove('visible');
  document.getElementById('last-updated').textContent = '';
}

function showEmpty() {
  document.getElementById('table-body').innerHTML = '';
  document.getElementById('empty-state').classList.add('visible');
  document.getElementById('page-sub').textContent = 'No data available';
}

function updateLastUpdated() {
  const now = new Date();
  document.getElementById('last-updated').textContent =
    `Last updated: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// ── Init ──
initUser();
loadUserLeagues();