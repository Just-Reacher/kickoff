const API_BASE = '/api';

// ── Auth guard ──
const token = localStorage.getItem('token') || sessionStorage.getItem('token');
const user  = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');

if (!token || !user) window.location.href = 'login.html';

// ── Nav init ──
function initUser() {
  const username = user?.username || 'Player';
  const initial  = username.charAt(0).toUpperCase();
  document.getElementById('avatar-name').textContent   = username;
  document.getElementById('avatar-circle').textContent = initial;
  document.getElementById('hero-avatar').textContent   = initial;
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
let currentLeagueId = null;
let userLeagues     = [];
let activeMatchId   = null;

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
      loadMyTeam(currentLeagueId);
    } else {
      showNoLeagues();
    }

  } catch (err) {
    console.error('Leagues load error:', err);
    showNoLeagues();
  }
}

function populateLeagueSelector(leagues) {
  const sel = document.getElementById('league-selector');
  sel.innerHTML = '';

  if (!leagues.length) {
    sel.innerHTML = '<option value="">No leagues</option>';
    return;
  }

  leagues.forEach(l => {
    const opt       = document.createElement('option');
    opt.value       = l.id;
    opt.textContent = `${l.name}`;
    sel.appendChild(opt);
  });
}

function handleLeagueChange() {
  const val = document.getElementById('league-selector').value;
  if (!val) return;
  currentLeagueId = parseInt(val);
  loadMyTeam(currentLeagueId);
  window.history.replaceState({}, '', `my-team.html?league=${currentLeagueId}`);
}

// ════════════════════════════════
// LOAD MY TEAM  →  GET /api/leagues/:id/my-team
// ════════════════════════════════
async function loadMyTeam(leagueId) {
  showSkeletons();

  try {
    const res = await fetch(`${API_BASE}/leagues/${leagueId}/my-team`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load team data');

    const data = await res.json();

    renderHero(data.team, data.standing, data.league);
    renderStats(data.standing);
    renderFixtures(data.fixtures, data.team);
    renderQualification(data.qualification);
    renderForm(data.standing?.form || []);

  } catch (err) {
    console.error('My team load error:', err);
    showError();
  }
}

// ════════════════════════════════
// RENDER HERO BAND
// ════════════════════════════════
function renderHero(team, standing, league) {
  if (!team) return;

  document.getElementById('hero-name').innerHTML =
    `${escHtml(team.teamName)} <span>/ ${escHtml(user.username)}</span>`;

  document.getElementById('meta-league').textContent   = league?.name || '—';
  document.getElementById('meta-position').textContent = standing
    ? `${standing.position}${ordinal(standing.position)} place`
    : 'Not ranked yet';
  document.getElementById('meta-stage').textContent    = league?.stage || 'League Phase';
}

// ════════════════════════════════
// RENDER STAT CARDS
// ════════════════════════════════
function renderStats(standing) {
  if (!standing) {
    ['st-played','st-won','st-drawn','st-lost','st-points'].forEach(id => {
      document.getElementById(id).textContent = '0';
    });
    document.getElementById('st-gd').textContent = 'GD 0';
    return;
  }

  document.getElementById('st-played').textContent  = standing.played  ?? 0;
  document.getElementById('st-won').textContent     = standing.won     ?? 0;
  document.getElementById('st-drawn').textContent   = standing.drawn   ?? 0;
  document.getElementById('st-lost').textContent    = standing.lost    ?? 0;
  document.getElementById('st-points').textContent  = standing.points  ?? 0;

  const gd  = standing.goalDifference ?? 0;
  const gdStr = gd > 0 ? `+${gd}` : `${gd}`;
  document.getElementById('st-gd').textContent = `GD ${gdStr}`;
}

// ════════════════════════════════
// RENDER FIXTURES
// ════════════════════════════════
function renderFixtures(fixtures, team) {
  const list = document.getElementById('fixtures-list');
  list.innerHTML = '';

  if (!fixtures || fixtures.length === 0) {
    list.innerHTML = `<div class="no-fixtures">No fixtures found for this league.</div>`;
    return;
  }

  fixtures.forEach((fix, i) => {
    const el = buildFixtureItem(fix, team);
    el.style.animationDelay = `${i * 0.05}s`;
    list.appendChild(el);
  });
}

function buildFixtureItem(fix, myTeam) {
  const el        = document.createElement('div');
  const isHome    = fix.homeTeam?.userId === user.id;
  const myScore   = isHome ? fix.homeScore : fix.awayScore;
  const oppScore  = isHome ? fix.awayScore : fix.homeScore;
  const opponent  = isHome ? fix.awayTeam : fix.homeTeam;
  const isDone    = fix.status === 'played' || fix.status === 'approved';

  // Determine result class
  let resultClass = fix.status === 'upcoming' ? 'upcoming' : fix.status === 'pending' ? 'pending' : '';
  if (isDone) {
    if (myScore > oppScore)      resultClass = 'win';
    else if (myScore < oppScore) resultClass = 'loss';
    else                         resultClass = 'draw';
  }

  el.className = `fixture-item ${resultClass}`;

  // Score display
  let centerHTML = '';
  if (isDone) {
    const scoreClass = myScore > oppScore ? 'win-score' : myScore < oppScore ? 'loss-score' : '';
    centerHTML = `
      <div class="fix-score ${scoreClass}">${fix.homeScore} – ${fix.awayScore}</div>
      <div class="fix-status done">${fix.status === 'approved' ? 'Confirmed' : 'Played'}</div>
    `;
  } else if (fix.status === 'pending') {
    centerHTML = `
      <div class="fix-score">${fix.homeScore} – ${fix.awayScore}</div>
      <div class="fix-status pending">Pending</div>
    `;
  } else {
    centerHTML = `
      <div class="fix-vs">VS</div>
      <div class="fix-date">MD ${fix.matchday}</div>
      <div class="fix-status upcoming">Upcoming</div>
      ${!isDone && fix.status === 'upcoming'
        ? `<button class="btn-submit-small" onclick="openModal(${fix.id}, '${escHtml(fix.homeTeam?.teamName)}', '${escHtml(fix.awayTeam?.teamName)}')">Submit</button>`
        : ''}
    `;
  }

  // Home team
  const homeIsMe  = fix.homeTeam?.userId === user.id;
  const awayIsMe  = fix.awayTeam?.userId === user.id;

  el.innerHTML = `
    <div class="fix-team home">
      <div class="fix-badge ${homeIsMe ? 'mine' : 'opp'}">${fix.homeTeam?.teamName?.charAt(0) || '?'}</div>
      <div class="fix-name ${homeIsMe ? 'my-name' : ''}">
        ${escHtml(fix.homeTeam?.teamName || 'TBD')}
        ${homeIsMe ? '<small>You</small>' : ''}
      </div>
    </div>
    <div class="fix-center">${centerHTML}</div>
    <div class="fix-team away">
      <div class="fix-name ${awayIsMe ? 'my-name' : ''}" style="text-align:right;">
        ${escHtml(fix.awayTeam?.teamName || 'TBD')}
        ${awayIsMe ? '<small>You</small>' : ''}
      </div>
      <div class="fix-badge ${awayIsMe ? 'mine' : 'opp'}">${fix.awayTeam?.teamName?.charAt(0) || '?'}</div>
    </div>
  `;

  return el;
}

// ════════════════════════════════
// RENDER QUALIFICATION
// ════════════════════════════════
function renderQualification(qual) {
  const list = document.getElementById('qual-list');
  list.innerHTML = '';

  if (!qual || qual.length === 0) {
    list.innerHTML = `<div style="padding:1.2rem;font-size:0.82rem;font-weight:300;color:var(--white-dim);">No qualification data yet.</div>`;
    return;
  }

  qual.forEach(q => {
    const row = document.createElement('div');
    row.className = 'qual-league-row';

    const { badgeClass, fillClass, progressPct } = getQualStatus(q);
    const gdStr = q.goalDifference >= 0 ? `+${q.goalDifference}` : `${q.goalDifference}`;

    row.innerHTML = `
      <div class="ql-top">
        <span class="ql-name">${escHtml(q.leagueName)}</span>
        <span class="qual-badge ${badgeClass}">${q.statusLabel}</span>
      </div>
      <div class="ql-progress-wrap">
        <div class="ql-progress-fill ${fillClass}" style="width:${progressPct}%"></div>
      </div>
      <div class="ql-meta">
        <span>${q.position ? `${q.position}${ordinal(q.position)} of ${q.totalTeams}` : '—'}</span>
        <span>${q.points ?? 0} pts · GD ${gdStr}</span>
      </div>
    `;

    list.appendChild(row);
  });
}

function getQualStatus(q) {
  switch (q.status) {
    case 'champion':    return { badgeClass: 'champion',    fillClass: 'gold',  progressPct: 100 };
    case 'qualified':   return { badgeClass: 'qualified',   fillClass: 'safe',  progressPct: 100 };
    case 'on-track':    return { badgeClass: 'on-track',    fillClass: 'safe',  progressPct: Math.min((q.points / q.pointsNeeded) * 100, 95) };
    case 'danger':      return { badgeClass: 'danger',      fillClass: 'risk',  progressPct: Math.min((q.points / q.pointsNeeded) * 100, 60) };
    case 'eliminated':  return { badgeClass: 'eliminated',  fillClass: 'out',   progressPct: 30 };
    case 'in-progress': return { badgeClass: 'in-progress', fillClass: 'risk',  progressPct: Math.min((q.points / (q.pointsNeeded || 1)) * 100, 80) };
    default:            return { badgeClass: 'in-progress', fillClass: 'risk',  progressPct: 50 };
  }
}

// ════════════════════════════════
// RENDER FORM
// ════════════════════════════════
function renderForm(form) {
  const dotsEl   = document.getElementById('form-dots');
  const summaryEl = document.getElementById('form-summary');
  dotsEl.innerHTML = '';

  // Last 5
  const last5 = form.slice(-5);
  const padded = [...Array(Math.max(0, 5 - last5.length)).fill(null), ...last5];

  padded.forEach(f => {
    const dot = document.createElement('div');
    dot.className = `form-dot-lg ${f || 'empty'}`;
    dot.textContent = f || '';
    dotsEl.appendChild(dot);
  });

  // Summary counts from all form
  const wins   = form.filter(f => f === 'W').length;
  const draws  = form.filter(f => f === 'D').length;
  const losses = form.filter(f => f === 'L').length;

  summaryEl.innerHTML = `
    <div class="form-sum-item">
      <div class="form-sum-val w">${wins}</div>
      <div class="form-sum-lbl">Won</div>
    </div>
    <div class="form-sum-item">
      <div class="form-sum-val d">${draws}</div>
      <div class="form-sum-lbl">Drawn</div>
    </div>
    <div class="form-sum-item">
      <div class="form-sum-val l">${losses}</div>
      <div class="form-sum-lbl">Lost</div>
    </div>
  `;
}

// ════════════════════════════════
// SUBMIT RESULT MODAL
// ════════════════════════════════
function openModal(matchId, homeName, awayName) {
  activeMatchId = matchId;
  document.getElementById('modal-home').textContent        = homeName;
  document.getElementById('modal-away').textContent        = awayName;
  document.getElementById('modal-match-label').textContent = `${homeName} vs ${awayName}`;
  document.getElementById('home-score').value              = '';
  document.getElementById('away-score').value              = '';
  document.getElementById('modal-error').style.display     = 'none';
  document.getElementById('home-score').classList.remove('has-error');
  document.getElementById('away-score').classList.remove('has-error');
  document.getElementById('result-modal').classList.add('open');
  setTimeout(() => document.getElementById('home-score').focus(), 200);
}

function closeModal() {
  document.getElementById('result-modal').classList.remove('open');
  activeMatchId = null;
}

function handleModalOverlayClick(e) {
  if (e.target === document.getElementById('result-modal')) closeModal();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ════════════════════════════════
// SUBMIT RESULT  →  POST /api/matches/:id/result
// ════════════════════════════════
async function handleSubmitResult() {
  const homeScore = document.getElementById('home-score').value;
  const awayScore = document.getElementById('away-score').value;
  const errEl     = document.getElementById('modal-error');
  const btn       = document.getElementById('modal-submit');
  const spinner   = document.getElementById('modal-spinner');
  const label     = document.getElementById('modal-label');

  errEl.style.display = 'none';
  document.getElementById('home-score').classList.remove('has-error');
  document.getElementById('away-score').classList.remove('has-error');

  if (homeScore === '' || isNaN(homeScore) || parseInt(homeScore) < 0) {
    document.getElementById('home-score').classList.add('has-error');
    errEl.textContent   = 'Enter a valid home score.';
    errEl.style.display = 'block';
    return;
  }

  if (awayScore === '' || isNaN(awayScore) || parseInt(awayScore) < 0) {
    document.getElementById('away-score').classList.add('has-error');
    errEl.textContent   = 'Enter a valid away score.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled          = true;
  spinner.style.display = 'block';
  label.textContent     = 'Submitting...';

  try {
    const res = await fetch(`${API_BASE}/matches/${activeMatchId}/result`, {
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
      errEl.textContent   = data.message || 'Failed to submit. Try again.';
      errEl.style.display = 'block';
      return;
    }

    closeModal();
    // Reload team data to reflect pending status
    loadMyTeam(currentLeagueId);

  } catch (err) {
    errEl.textContent   = 'Network error. Try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled          = false;
    spinner.style.display = 'none';
    label.textContent     = 'Submit Result';
  }
}

// ════════════════════════════════
// HELPERS
// ════════════════════════════════
function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return s[(v-20)%10] || s[v] || s[0];
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;');
}

function showSkeletons() {
  document.getElementById('fixtures-list').innerHTML = `
    <div class="skeleton" style="height:72px;margin-bottom:0.6rem;"></div>
    <div class="skeleton" style="height:72px;margin-bottom:0.6rem;opacity:.7"></div>
    <div class="skeleton" style="height:72px;margin-bottom:0.6rem;opacity:.45"></div>
  `;
  document.getElementById('qual-list').innerHTML =
    `<div class="skeleton" style="height:80px;margin:0.5rem 1rem;border-radius:6px;"></div>`;
}

function showNoLeagues() {
  document.getElementById('hero-name').textContent = user?.username || 'Player';
  document.getElementById('fixtures-list').innerHTML =
    `<div class="no-fixtures">You are not in any leagues yet. <a href="dashboard.html" style="color:var(--blue)">Go to dashboard →</a></div>`;
  document.getElementById('qual-list').innerHTML =
    `<div style="padding:1.2rem;font-size:0.82rem;color:var(--white-dim);">No leagues joined yet.</div>`;
}

function showError() {
  document.getElementById('fixtures-list').innerHTML =
    `<div class="no-fixtures">Failed to load data. Please refresh the page.</div>`;
}

// ── Init ──
initUser();
loadUserLeagues();