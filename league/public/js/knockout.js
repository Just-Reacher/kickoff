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
let currentLeagueId  = null;
let userLeagues      = [];
let knockoutData     = null;
let activeStage      = null; // 'quarterfinal' | 'semifinal' | 'final'

// Round display names
const ROUND_LABELS = {
  'round-of-16':  'Round of 16',
  'quarterfinal': 'Quarter Finals',
  'semifinal':    'Semi Finals',
  'final':        'Final',
};

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
      loadKnockout(currentLeagueId);
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

  if (!leagues.length) {
    sel.innerHTML = '<option value="">No leagues</option>';
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
  loadKnockout(currentLeagueId);
  window.history.replaceState({}, '', `knockout.html?league=${currentLeagueId}`);
}

// ════════════════════════════════
// LOAD KNOCKOUT  →  GET /api/leagues/:id/knockout
// ════════════════════════════════
async function loadKnockout(leagueId) {
  showSkeleton();

  try {
    const res = await fetch(`${API_BASE}/knockout/${leagueId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 404 || res.status === 422) {
      // Knockout not started yet
      hideSkeleton();
      showNotStarted();
      return;
    }

    if (!res.ok) throw new Error('Failed to load knockout');

    const data   = await res.json();
    knockoutData = data;

    const league = userLeagues.find(l => l.id === leagueId);
    if (league) {
      document.getElementById('page-sub').textContent =
        `${league.name} · ${data.stage || 'Knockout Stage'}`;
    }

    hideSkeleton();
    hideNotStarted();
    hideEmpty();

    buildStageTabs(data.rounds);
    renderBracket(data.rounds, data.winner);

  } catch (err) {
    console.error('Knockout load error:', err);
    hideSkeleton();
    showEmpty();
  }
}

// ════════════════════════════════
// STAGE TABS
// ════════════════════════════════
function buildStageTabs(rounds) {
  const tabsEl = document.getElementById('stage-tabs');
  tabsEl.style.display = 'flex';
  tabsEl.innerHTML = '';

  // "All" tab
  const allBtn = document.createElement('button');
  allBtn.className   = 'stage-tab active';
  allBtn.textContent = 'Full Bracket';
  allBtn.onclick     = () => {
    setActiveTab(null, allBtn);
    renderBracket(rounds, knockoutData?.winner);
  };
  tabsEl.appendChild(allBtn);

  rounds.forEach(round => {
    const btn       = document.createElement('button');
    const allDone   = round.matches.every(m => m.status === 'played' || m.status === 'approved');
    btn.className   = `stage-tab${allDone ? ' done' : ''}`;
    btn.textContent = ROUND_LABELS[round.roundKey] || round.roundName;
    btn.onclick     = () => {
      setActiveTab(round.roundKey, btn);
      renderSingleRound(round, rounds, knockoutData?.winner);
    };
    tabsEl.appendChild(btn);
  });
}

function setActiveTab(key, el) {
  activeStage = key;
  document.querySelectorAll('.stage-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

// ════════════════════════════════
// RENDER FULL BRACKET
// ════════════════════════════════
function renderBracket(rounds, winner) {
  const outer = document.getElementById('bracket-outer');
  outer.innerHTML = '';

  const bracket = document.createElement('div');
  bracket.className = 'bracket';

  // Determine current active round (first round with unplayed matches)
  const currentRoundKey = rounds.find(r =>
    r.matches.some(m => m.status === 'upcoming' || m.status === 'pending')
  )?.roundKey;

  rounds.forEach((round, ri) => {
    // Round column
    const col = document.createElement('div');
    col.className = 'round-col';

    const allDone   = round.matches.every(m => m.status === 'played' || m.status === 'approved');
    const isCurrent = round.roundKey === currentRoundKey;
    const lblClass  = allDone ? 'done' : isCurrent ? 'current' : '';

    col.innerHTML = `<div class="round-label ${lblClass}">${ROUND_LABELS[round.roundKey] || round.roundName}</div>`;

    const matchesDiv = document.createElement('div');
    matchesDiv.className = 'matches-col';

    round.matches.forEach((match, mi) => {
      const card = buildMatchCard(match, round.roundKey, currentRoundKey);
      card.style.animationDelay = `${(ri * round.matches.length + mi) * 0.05}s`;
      matchesDiv.appendChild(card);
    });

    col.appendChild(matchesDiv);
    bracket.appendChild(col);

    // Connector between rounds (not after last round)
    if (ri < rounds.length - 1) {
      bracket.appendChild(buildConnector(round.matches.length));
    }
  });

  // Trophy / Final column
  bracket.appendChild(buildFinalCol(winner, rounds));

  outer.appendChild(bracket);
}

// ════════════════════════════════
// RENDER SINGLE ROUND VIEW
// ════════════════════════════════
function renderSingleRound(round, allRounds, winner) {
  const outer = document.getElementById('bracket-outer');
  outer.innerHTML = '';

  const isFinal       = round.roundKey === 'final';
  const currentRoundKey = allRounds.find(r =>
    r.matches.some(m => m.status === 'upcoming' || m.status === 'pending')
  )?.roundKey;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'max-width:500px;margin:0 auto;display:flex;flex-direction:column;gap:1rem;padding:1rem 0;animation:fadeUp 0.3s ease both;';

  round.matches.forEach(match => {
    wrap.appendChild(buildMatchCard(match, round.roundKey, currentRoundKey, true));
  });

  if (isFinal && winner) {
    wrap.appendChild(buildFinalCol(winner, allRounds));
  }

  outer.appendChild(wrap);
}

// ════════════════════════════════
// BUILD MATCH CARD
// ════════════════════════════════
function buildMatchCard(match, roundKey, currentRoundKey, expanded = false) {
  const card = document.createElement('div');

  const isMyMatch   = match.homeTeam?.userId === user.id || match.awayTeam?.userId === user.id;
  const isCurrent   = roundKey === currentRoundKey;
  const isDone      = match.status === 'played' || match.status === 'approved';

  let classes = 'match-card';
  if (isMyMatch)  classes += ' my-match';
  if (isCurrent && !isDone) classes += ' current-round';
  card.className = classes;

  const homeWin  = isDone && match.homeScore > match.awayScore;
  const awayWin  = isDone && match.awayScore > match.homeScore;
  const homeTBD  = !match.homeTeam;
  const awayTBD  = !match.awayTeam;

  const statusLabel = isDone ? 'done' : match.status === 'pending' ? 'pending' : 'upcoming';
  const statusText  = isDone ? 'Confirmed' : match.status === 'pending' ? 'Pending' : 'Upcoming';

  card.innerHTML = `
    ${buildTeamRow(match.homeTeam, match.homeScore, homeWin, awayWin, homeTBD, true)}
    ${buildTeamRow(match.awayTeam, match.awayScore, awayWin, homeWin, awayTBD, false)}
    <div class="match-footer">
      <span class="match-status-label ${statusLabel}">${statusText}</span>
      <span class="match-round-tag">${ROUND_LABELS[roundKey] || roundKey}</span>
    </div>
  `;

  return card;
}

function buildTeamRow(team, score, isWinner, isLoser, isTBD, isHome) {
  if (isTBD || !team) {
    return `
      <div class="match-team tbd">
        <div class="match-team-left">
          <div class="match-badge">?</div>
          <span class="match-team-name tbd-name">${isHome ? 'Home TBD' : 'Away TBD'}</span>
        </div>
        <span class="match-score">—</span>
      </div>
    `;
  }

  const isMe      = team.userId === user.id;
  const badgeCls  = isMe ? 'me' : isWinner ? 'gold' : '';
  const rowCls    = isWinner ? 'winner' : isLoser ? 'loser' : '';
  const scoreCls  = isWinner ? 'winner-score' : '';
  const scoreDisp = score !== null && score !== undefined ? score : '—';

  return `
    <div class="match-team ${rowCls}">
      <div class="match-team-left">
        <div class="match-badge ${badgeCls}">${team.teamName?.charAt(0) || '?'}</div>
        <span class="match-team-name">${team.teamName || team.username}${isMe ? ' ★' : ''}</span>
      </div>
      <span class="match-score ${scoreCls}">${scoreDisp}</span>
    </div>
  `;
}

// ════════════════════════════════
// BUILD CONNECTOR
// ════════════════════════════════
function buildConnector(matchCount) {
  const col = document.createElement('div');
  col.className = 'connector-col';

  // One connector per pair of matches
  const connectorCount = Math.ceil(matchCount / 2);

  for (let i = 0; i < connectorCount; i++) {
    const c = document.createElement('div');
    c.className = 'connector';
    c.innerHTML = `
      <div class="connector-line-h"></div>
      <div class="connector-line-v"></div>
      <div class="connector-line-h"></div>
    `;
    col.appendChild(c);
  }

  return col;
}

// ════════════════════════════════
// BUILD FINAL / TROPHY COLUMN
// ════════════════════════════════
function buildFinalCol(winner, rounds) {
  const col = document.createElement('div');
  col.className = 'final-col';

  col.innerHTML = `
    <div class="final-label">🏆 Champion</div>
    <div class="trophy-card">
      <div class="trophy-glow"></div>
      <div class="trophy-icon">🏆</div>
      <div class="trophy-title">League Champion</div>
      ${winner
        ? `<div class="trophy-winner">${winner.teamName}</div>
           <div class="trophy-pending" style="color:var(--gold);margin-top:4px;">@${winner.username}</div>`
        : `<div class="trophy-pending">To be decided</div>`
      }
    </div>
  `;

  return col;
}

// ════════════════════════════════
// STATE HELPERS
// ════════════════════════════════
function showSkeleton() {
  document.getElementById('bracket-skeleton').style.display = 'flex';
  document.getElementById('bracket-outer').appendChild(document.getElementById('bracket-skeleton'));
  hideNotStarted();
  hideEmpty();
}

function hideSkeleton() {
  const s = document.getElementById('bracket-skeleton');
  if (s) s.style.display = 'none';
}

function showNotStarted() {
  document.getElementById('not-started').classList.add('visible');
  document.getElementById('stage-tabs').style.display = 'none';
  document.getElementById('page-sub').textContent = 'League phase still in progress';
}

function hideNotStarted() {
  document.getElementById('not-started').classList.remove('visible');
}

function showEmpty() {
  document.getElementById('empty-state').classList.add('visible');
  document.getElementById('page-sub').textContent = 'No data available';
}

function hideEmpty() {
  document.getElementById('empty-state').classList.remove('visible');
}

// ── Init ──
initUser();
loadUserLeagues();