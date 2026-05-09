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
let allFixtures     = [];   // raw data from API
let filteredFixtures = [];  // after filters applied
let currentLeagueId = null;
let currentMatchday = 'all';
let currentStatus   = 'all';
let currentSearch   = '';
let activeMatchId   = null; // for result modal
let userLeagues     = [];

// ════════════════════════════════
// LOAD USER LEAGUES  →  GET /api/leagues/mine
// ════════════════════════════════
async function loadUserLeagues() {
  try {
    const res  = await fetch(`${API_BASE}/leagues/mine`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load leagues');

    const data   = await res.json();
    userLeagues  = data.leagues || [];

    populateLeagueSelector(userLeagues);

    // Check if a league id was passed in URL
    const params  = new URLSearchParams(window.location.search);
    const urlLeague = params.get('league');

    if (urlLeague && userLeagues.find(l => String(l.id) === urlLeague)) {
      currentLeagueId = parseInt(urlLeague);
      document.getElementById('league-selector').value = urlLeague;
    } else if (userLeagues.length > 0) {
      currentLeagueId = userLeagues[0].id;
    }

    if (currentLeagueId) {
      loadFixtures(currentLeagueId);
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
    sel.innerHTML = '<option value="">No active leagues</option>';
    return;
  }

  leagues.forEach(league => {
    const opt   = document.createElement('option');
    opt.value   = league.id;
    opt.textContent = `${league.name} — ${league.season}`;
    sel.appendChild(opt);
  });
}

function handleLeagueChange() {
  const val = document.getElementById('league-selector').value;
  if (!val) return;
  currentLeagueId = parseInt(val);

  // Reset filters
  currentMatchday = 'all';
  currentStatus   = 'all';
  currentSearch   = '';
  document.getElementById('team-search').value = '';

  loadFixtures(currentLeagueId);
  window.history.replaceState({}, '', `fixtures.html?league=${currentLeagueId}`);
}

// ════════════════════════════════
// LOAD FIXTURES  →  GET /api/leagues/:id/fixtures
// ════════════════════════════════
async function loadFixtures(leagueId) {
  showSkeletons();

  try {
    const res  = await fetch(`${API_BASE}/leagues/${leagueId}/fixtures`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load fixtures');

    const data    = await res.json();
    allFixtures   = data.fixtures || [];

    const league  = userLeagues.find(l => l.id === leagueId);
    if (league) {
      document.getElementById('page-sub').textContent =
        `${league.name} · ${allFixtures.length} matches`;
    }

    buildMatchdayChips(allFixtures);
    applyFilters();

  } catch (err) {
    console.error('Fixtures load error:', err);
    showEmpty();
  }
}

// ════════════════════════════════
// BUILD MATCHDAY CHIPS
// ════════════════════════════════
function buildMatchdayChips(fixtures) {
  const matchdays = [...new Set(fixtures.map(f => f.matchday))].sort((a, b) => a - b);
  const container = document.getElementById('matchday-chips');

  container.innerHTML = `<button class="chip active" onclick="filterMatchday('all', this)">All</button>`;

  matchdays.forEach(md => {
    const btn = document.createElement('button');
    btn.className   = 'chip';
    btn.textContent = `MD ${md}`;
    btn.onclick     = function () { filterMatchday(md, this); };
    container.appendChild(btn);
  });
}

// ════════════════════════════════
// FILTERS
// ════════════════════════════════
function filterMatchday(matchday, el) {
  currentMatchday = matchday;
  document.querySelectorAll('#matchday-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  applyFilters();
}

function filterStatus(status, el) {
  currentStatus = status;
  document.querySelectorAll('.filter-chips .chip').forEach(c => {
    if (['chip-all','chip-upcoming','chip-pending','chip-played'].includes(c.id)) {
      c.classList.remove('active');
    }
  });
  el.classList.add('active');
  applyFilters();
}

function filterByTeam(val) {
  currentSearch = val.toLowerCase().trim();
  applyFilters();
}

function applyFilters() {
  let results = [...allFixtures];

  if (currentMatchday !== 'all') {
    results = results.filter(f => f.matchday === currentMatchday);
  }

  if (currentStatus !== 'all') {
    results = results.filter(f => f.status === currentStatus);
  }

  if (currentSearch) {
    results = results.filter(f =>
      f.homeTeam.name.toLowerCase().includes(currentSearch) ||
      f.awayTeam.name.toLowerCase().includes(currentSearch)
    );
  }

  filteredFixtures = results;
  renderFixtures(filteredFixtures);
}

// ════════════════════════════════
// RENDER FIXTURES
// ════════════════════════════════
function renderFixtures(fixtures) {
  const container = document.getElementById('fixtures-container');
  const emptyEl   = document.getElementById('empty-fixtures');
  container.innerHTML = '';

  if (fixtures.length === 0) {
    emptyEl.classList.add('visible');
    return;
  }

  emptyEl.classList.remove('visible');

  // Group by matchday
  const groups = {};
  fixtures.forEach(f => {
    if (!groups[f.matchday]) groups[f.matchday] = [];
    groups[f.matchday].push(f);
  });

  Object.keys(groups).sort((a, b) => a - b).forEach((md, idx) => {
    const group    = groups[md];
    const played   = group.filter(f => f.status === 'played' || f.status === 'approved').length;
    const total    = group.length;

    const section  = document.createElement('div');
    section.className = 'matchday-group';
    section.style.animationDelay = `${idx * 0.06}s`;

    section.innerHTML = `
      <div class="matchday-header">
        <div class="matchday-title">
          <span class="matchday-num">${md}</span>
          Matchday ${md}
        </div>
        <span class="matchday-meta">${played} / ${total} played</span>
      </div>
    `;

    group.forEach(fixture => {
      section.appendChild(buildFixtureRow(fixture));
    });

    container.appendChild(section);
  });
}

function buildFixtureRow(fixture) {
  const row       = document.createElement('div');
  const isMyMatch = fixture.homeTeam.userId === user.id || fixture.awayTeam.userId === user.id;
  const isOwner   = userLeagues.find(l => l.id === currentLeagueId)?.role === 'owner';

  row.className = `fixture-row${isMyMatch ? ' my-match' : ''}`;

  const homeBadge = getBadgeClass(fixture.homeTeam, user.id);
  const awayBadge = getBadgeClass(fixture.awayTeam, user.id);

  // Score / VS display
  let centerHTML = '';
  if (fixture.status === 'played' || fixture.status === 'approved') {
    const homeWin  = fixture.homeScore > fixture.awayScore;
    const awayWin  = fixture.awayScore > fixture.homeScore;
    const myResult = isMyMatch
      ? (fixture.homeTeam.userId === user.id
          ? (homeWin ? 'win' : awayWin ? 'loss' : 'draw')
          : (awayWin ? 'win' : homeWin ? 'loss' : 'draw'))
      : null;

    centerHTML = `
      <div class="score-display">${fixture.homeScore} – ${fixture.awayScore}</div>
      <div class="fixture-status ${fixture.status === 'approved' ? 'approved' : 'played'}">
        ${fixture.status === 'approved' ? 'Confirmed' : 'Played'}
      </div>
      ${myResult ? `<div class="result-dots"><div class="result-dot ${myResult}"></div></div>` : ''}
    `;
  } else if (fixture.status === 'pending') {
    centerHTML = `
      <div class="score-display pending">${fixture.homeScore} – ${fixture.awayScore}</div>
      <div class="fixture-status pending">Pending</div>
    `;
  } else {
    centerHTML = `
      <div class="score-display pending">VS</div>
      <div class="fixture-status upcoming">Upcoming</div>
    `;
  }

  // Action button
  let actionHTML = '';
  if (fixture.status === 'upcoming' && isMyMatch) {
    actionHTML = `
      <div class="fixture-action">
        <button class="btn-submit-result" onclick="openResultModal(${fixture.id}, '${escHtml(fixture.homeTeam.name)}', '${escHtml(fixture.awayTeam.name)}')">
          Submit Result
        </button>
      </div>
    `;
  } else if (fixture.status === 'pending' && isOwner) {
    actionHTML = `
      <div class="fixture-action">
        <span class="btn-pending-review">Awaiting Approval</span>
      </div>
    `;
  }

  row.innerHTML = `
    <div class="fixture-team home">
      <div class="team-badge ${homeBadge}">${fixture.homeTeam.name.charAt(0)}</div>
      <div class="team-name">
        ${fixture.homeTeam.name}
        ${isMyMatch && fixture.homeTeam.userId === user.id ? '<small>Your team</small>' : ''}
      </div>
    </div>
    <div class="fixture-center">${centerHTML}</div>
    <div class="fixture-team away">
      <div class="team-name" style="text-align:right;">
        ${fixture.awayTeam.name}
        ${isMyMatch && fixture.awayTeam.userId === user.id ? '<small>Your team</small>' : ''}
      </div>
      <div class="team-badge ${awayBadge}">${fixture.awayTeam.name.charAt(0)}</div>
    </div>
    ${actionHTML}
  `;

  return row;
}

function getBadgeClass(team, userId) {
  if (team.userId === userId) return 'blue-badge';
  if (team.isOwner)           return 'gold-badge';
  return 'gray-badge';
}

function escHtml(str) {
  return str.replace(/'/g, "\\'");
}

// ════════════════════════════════
// SUBMIT RESULT MODAL
// ════════════════════════════════
function openResultModal(matchId, homeName, awayName) {
  activeMatchId = matchId;
  document.getElementById('modal-home-name').textContent  = homeName;
  document.getElementById('modal-away-name').textContent  = awayName;
  document.getElementById('modal-match-label').textContent = `${homeName} vs ${awayName}`;
  document.getElementById('home-score').value             = '';
  document.getElementById('away-score').value             = '';
  document.getElementById('modal-error').style.display    = 'none';
  document.getElementById('home-score').classList.remove('has-error');
  document.getElementById('away-score').classList.remove('has-error');
  document.getElementById('result-modal').classList.add('open');
  setTimeout(() => document.getElementById('home-score').focus(), 200);
}

function closeResultModal() {
  document.getElementById('result-modal').classList.remove('open');
  activeMatchId = null;
}

function handleModalOverlayClick(e) {
  if (e.target === document.getElementById('result-modal')) closeResultModal();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeResultModal();
});

// ════════════════════════════════
// SUBMIT RESULT  →  POST /api/matches/:id/result
// ════════════════════════════════
async function handleSubmitResult() {
  const homeScore = document.getElementById('home-score').value;
  const awayScore = document.getElementById('away-score').value;
  const errEl     = document.getElementById('modal-error');
  const btn       = document.getElementById('modal-submit-btn');
  const spinner   = document.getElementById('modal-spinner');
  const label     = document.getElementById('modal-submit-label');

  // Validate
  errEl.style.display = 'none';
  document.getElementById('home-score').classList.remove('has-error');
  document.getElementById('away-score').classList.remove('has-error');

  if (homeScore === '' || isNaN(homeScore) || parseInt(homeScore) < 0) {
    document.getElementById('home-score').classList.add('has-error');
    errEl.textContent   = 'Please enter a valid home score.';
    errEl.style.display = 'block';
    return;
  }

  if (awayScore === '' || isNaN(awayScore) || parseInt(awayScore) < 0) {
    document.getElementById('away-score').classList.add('has-error');
    errEl.textContent   = 'Please enter a valid away score.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled          = true;
  spinner.style.display = 'block';
  label.textContent     = 'Submitting...';

  try {
    const res  = await fetch(`${API_BASE}/matches/${activeMatchId}/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        homeScore: parseInt(homeScore),
        awayScore: parseInt(awayScore)
      })
    });

    const data = await res.json();

    if (!res.ok) {
      errEl.textContent   = data.message || 'Failed to submit result. Please try again.';
      errEl.style.display = 'block';
      return;
    }

    // Update local state — mark fixture as pending
    const fixture = allFixtures.find(f => f.id === activeMatchId);
    if (fixture) {
      fixture.status    = 'pending';
      fixture.homeScore = parseInt(homeScore);
      fixture.awayScore = parseInt(awayScore);
    }

    closeResultModal();
    applyFilters();

  } catch (err) {
    errEl.textContent   = 'Network error. Check your connection and try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled          = false;
    spinner.style.display = 'none';
    label.textContent     = 'Submit Result';
  }
}

// ════════════════════════════════
// SKELETON / EMPTY HELPERS
// ════════════════════════════════
function showSkeletons() {
  const container = document.getElementById('fixtures-container');
  container.innerHTML = `
    <div class="skeleton"></div>
    <div class="skeleton" style="opacity:0.7;margin-top:0.5rem"></div>
    <div class="skeleton" style="opacity:0.4;margin-top:0.5rem"></div>
    <div class="skeleton" style="opacity:0.2;margin-top:0.5rem"></div>
  `;
  document.getElementById('empty-fixtures').classList.remove('visible');
}

function showEmpty() {
  document.getElementById('fixtures-container').innerHTML = '';
  document.getElementById('empty-fixtures').classList.add('visible');
  document.getElementById('page-sub').textContent = 'No fixtures available';
}

// ── Init ──
initUser();
loadUserLeagues();