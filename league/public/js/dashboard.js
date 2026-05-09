const API_BASE = 'http://localhost:5000/api';

// ── Auth guard ──
const token = localStorage.getItem('token') || sessionStorage.getItem('token');
const user  = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');

if (!token || !user) {
  window.location.href = 'login.html';
}

// ── Populate user info in nav ──
function initUser() {
  const username = user?.username || 'Player';
  const initial  = username.charAt(0).toUpperCase();

  document.getElementById('avatar-name').textContent    = username;
  document.getElementById('avatar-circle').textContent  = initial;
  document.getElementById('header-username').textContent = user?.firstName || username;
}

// ── Dropdown toggles ──
function toggleAvatarDropdown() {
  const dd    = document.getElementById('avatar-dropdown');
  const notif = document.getElementById('notif-panel');
  notif.classList.remove('open');
  dd.classList.toggle('open');
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  const dd    = document.getElementById('avatar-dropdown');
  dd.classList.remove('open');
  panel.classList.toggle('open');
}

document.addEventListener('click', (e) => {
  const avatar = document.getElementById('avatar-btn');
  const dd     = document.getElementById('avatar-dropdown');
  const notifB = document.getElementById('notif-btn');
  const notifP = document.getElementById('notif-panel');

  if (!avatar.contains(e.target)) dd.classList.remove('open');
  if (!notifB.contains(e.target) && !notifP.contains(e.target)) notifP.classList.remove('open');
});

// ── Sign out ──
function handleSignOut() {
  localStorage.clear();
  sessionStorage.clear();
  window.location.href = 'index.html';
}

// ════════════════════════════════
// RENDER FUNCTIONS
// ════════════════════════════════

function renderLeagues(leagues) {
  const list       = document.getElementById('leagues-list');
  const emptyState = document.getElementById('empty-state');
  const countEl    = document.getElementById('league-count');

  list.innerHTML = '';

  if (!leagues || leagues.length === 0) {
    emptyState.classList.add('visible');
    countEl.textContent = '0 Leagues';
    return;
  }

  emptyState.classList.remove('visible');
  countEl.textContent = `${leagues.length} League${leagues.length !== 1 ? 's' : ''}`;

  leagues.forEach((league, i) => {
    const card = document.createElement('div');
    card.className = `league-card ${league.role}${league.pendingApprovals > 0 ? ' has-pending' : ''}`;
    card.style.animationDelay = `${i * 0.07}s`;

    const needsSetup = league.status === 'waiting' && league.role === 'owner';
    const stageCls   = needsSetup ? 'pending-setup' : 'active';
    const stageLabel = {
      waiting:   needsSetup ? 'Awaiting Setup' : 'Waiting',
      active:    'League Phase',
      playoffs:  'Playoffs',
      completed: 'Completed',
    }[league.status] || league.status;

    const standing = league.standing;

    const positionHTML = standing
      ? `<div class="position-badge">
           <div class="position-num ${standing.position <= 3 ? 'top' : ''}">${standing.position}</div>
           <div class="position-label">Position</div>
         </div>`
      : `<div class="position-badge">
           <div class="position-num" style="font-size:1rem;color:var(--white-dim)">—</div>
           <div class="position-label">${league.status === 'waiting' ? 'Not started' : 'Unranked'}</div>
         </div>`;

    const actionBtn = needsSetup
      ? `<a href="setup.html?id=${league.id}" class="btn-setup">
           <svg viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" stroke-width="1.2"/><line x1="5.5" y1="3" x2="5.5" y2="6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="5.5" cy="8" r="0.7" fill="currentColor"/></svg>
           Setup
         </a>`
      : `<a href="fixtures.html?league=${league.id}" class="btn-enter">
           Enter
           <svg viewBox="0 0 11 11" fill="none"><path d="M2 5.5H9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6 3L9 5.5L6 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
         </a>`;

    const pendingAlertHTML = league.pendingApprovals > 0
      ? `<div class="pending-alert">
           <svg viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><line x1="6" y1="3.5" x2="6" y2="6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="6" cy="8.5" r="0.7" fill="currentColor"/></svg>
           ${league.pendingApprovals} result${league.pendingApprovals > 1 ? 's' : ''} awaiting your approval
         </div>`
      : '';

    card.innerHTML = `
      <div class="card-left">
        <div class="card-top">
          <span class="card-league-name">${league.name}</span>
          <span class="role-badge ${league.role}">${league.role === 'owner' ? 'Owner' : 'Player'}</span>
          <span class="stage-badge ${stageCls}">${stageLabel}</span>
        </div>
        <div class="card-meta">
          <div class="meta-item">
            <svg viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M4 6C4 4.9 4.9 4 6 4C7.1 4 8 4.9 8 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="4" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/></svg>
            <strong>${league.memberCount}</strong> Teams
          </div>
          <div class="meta-item">
            <svg viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.2"/></svg>
            <strong>${standing?.played ?? 0}</strong> Played
          </div>
          <div class="meta-item">
            <svg viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M6 3.5V6L8 7.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            Season <strong>${league.season}</strong>
          </div>
        </div>
        ${pendingAlertHTML}
      </div>
      <div class="card-right">
        ${positionHTML}
        ${actionBtn}
      </div>
    `;

    list.appendChild(card);
  });
}

function renderActivity(items) {
  const list    = document.getElementById('activity-list');
  const countEl = document.getElementById('results-count');

  if (!items || items.length === 0) {
    list.innerHTML = `<div style="padding:1.5rem;text-align:center;font-size:0.82rem;color:var(--white-dim);font-weight:300;">No results yet.</div>`;
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${items.length} results`;
  list.innerHTML = '';

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'activity-item';

    // Determine result from current user's perspective
    const isHome   = item.homeUserId === user.id;
    const isAway   = item.awayUserId === user.id;
    let   result   = '';

    if (isHome || isAway) {
      const myScore  = isHome ? item.homeScore : item.awayScore;
      const oppScore = isHome ? item.awayScore : item.homeScore;
      result = myScore > oppScore ? 'win' : myScore < oppScore ? 'loss' : 'draw';
    }

    el.innerHTML = `
      <div class="activity-match">
        <span class="activity-team">${item.homeTeam}</span>
        <span class="activity-score">${item.homeScore} – ${item.awayScore}</span>
        <span class="activity-team right">${item.awayTeam}</span>
        ${result ? `<div class="result-dot ${result}" title="${result}"></div>` : ''}
      </div>
      <div class="activity-meta">
        <span class="activity-league-tag">${item.leagueName}</span>
        <span class="activity-time">${timeAgo(item.approvedAt)}</span>
      </div>
    `;

    list.appendChild(el);
  });
}

function renderApprovals(items) {
  const card  = document.getElementById('approvals-card');
  const list  = document.getElementById('approvals-list');
  const label = document.getElementById('pending-count-label');

  if (!items || items.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  label.textContent  = `${items.length} result${items.length > 1 ? 's' : ''}`;
  list.innerHTML     = '';

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'approval-item';
    el.innerHTML = `
      <div class="approval-match">
        ${item.homeTeam} vs ${item.awayTeam}
        <div style="font-size:0.72rem;color:var(--white-dim);margin-top:2px;">${item.leagueName}</div>
      </div>
      <div class="approval-score">${item.homeScore} – ${item.awayScore}</div>
      <div class="approval-actions">
        <button class="btn-approve" onclick="approveResult('${item.id}')" title="Approve">
          <svg viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="btn-reject" onclick="rejectResult('${item.id}')" title="Reject">
          <svg viewBox="0 0 12 12" fill="none"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    `;
    list.appendChild(el);
  });
}

function renderNotifications(items) {
  const list  = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');

  if (!items || items.length === 0) {
    badge.classList.remove('visible');
    list.innerHTML = `<div class="notif-empty">You're all caught up.</div>`;
    return;
  }

  badge.textContent = items.length > 9 ? '9+' : items.length;
  badge.classList.add('visible');
  list.innerHTML = '';

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'notif-entry';
    el.innerHTML = `
      <div class="notif-entry-title">${item.title}</div>
      <div class="notif-entry-sub">${item.sub}</div>
    `;
    list.appendChild(el);
  });
}

function updateStats(leagues, matches, owned, pending) {
  document.getElementById('stat-leagues').textContent = leagues;
  document.getElementById('stat-matches').textContent = matches;
  document.getElementById('stat-owned').textContent   = owned;
  document.getElementById('stat-pending').textContent = pending;
}

// ════════════════════════════════
// APPROVE / REJECT
// ════════════════════════════════

async function approveResult(resultId) {
  try {
    const res = await fetch(`${API_BASE}/matches/${resultId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Approve failed');
    loadDashboard();
  } catch (e) {
    console.error('Approve error:', e);
  }
}

async function rejectResult(resultId) {
  try {
    const res = await fetch(`${API_BASE}/matches/${resultId}/reject`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Reject failed');
    loadDashboard();
  } catch (e) {
    console.error('Reject error:', e);
  }
}

// ════════════════════════════════
// JOIN MODAL
// ════════════════════════════════

function openJoinModal() {
  document.getElementById('join-modal').classList.add('open');
  document.getElementById('join-code').value = '';
  document.getElementById('join-team-name').value = '';
  document.getElementById('join-error').style.display = 'none';
  document.getElementById('join-code').classList.remove('has-error');
  setTimeout(() => document.getElementById('join-code').focus(), 200);
}

function closeJoinModal() {
  document.getElementById('join-modal').classList.remove('open');
}

function handleModalOverlayClick(e) {
  if (e.target === document.getElementById('join-modal')) closeJoinModal();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeJoinModal();
});

document.getElementById('join-code').addEventListener('input', function () {
  let val = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (val.length > 2) val = 'KO-' + val.replace(/^KO/, '');
  this.value = val;
  this.classList.remove('has-error');
  document.getElementById('join-error').style.display = 'none';
});

async function handleJoinLeague() {
  const code     = document.getElementById('join-code').value.trim().toUpperCase();
  const teamName = document.getElementById('join-team-name').value.trim();
  const btn      = document.getElementById('join-submit');
  const spinner  = document.getElementById('join-spinner');
  const label    = document.getElementById('join-label');
  const errEl    = document.getElementById('join-error');

  errEl.style.display = 'none';

  if (!code || code.length < 4) {
    document.getElementById('join-code').classList.add('has-error');
    errEl.textContent   = 'Please enter a valid invite code.';
    errEl.style.display = 'block';
    return;
  }

  if (!teamName) {
    errEl.textContent   = 'Please enter your team name.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled          = true;
  spinner.style.display = 'block';
  label.textContent     = 'Joining...';

  try {
    const res  = await fetch(`${API_BASE}/leagues/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ code, teamName })
    });

    const data = await res.json();

    if (!res.ok) {
      document.getElementById('join-code').classList.add('has-error');
      errEl.textContent   = data.message || 'Invalid or expired invite code.';
      errEl.style.display = 'block';
      return;
    }

    closeJoinModal();
    window.location.href = `fixtures.html?league=${data.leagueId}`;

  } catch (err) {
    errEl.textContent   = 'Network error. Please try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled          = false;
    spinner.style.display = 'none';
    label.textContent     = 'Join League';
  }
}

// ════════════════════════════════
// LOAD DASHBOARD  →  GET /api/dashboard
// ════════════════════════════════

async function loadDashboard() {
  try {
    const res = await fetch(`${API_BASE}/dashboard`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = 'login.html';
      return;
    }

    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const data = await res.json();

    renderLeagues(data.leagues            || []);
    renderActivity(data.recentResults     || []);
    renderApprovals(data.pendingApprovals || []);
    renderNotifications(data.notifications || []);

    updateStats(
      data.leagues?.length          ?? 0,
      data.totalMatches             ?? 0,
      data.ownedLeagues             ?? 0,
      data.pendingApprovals?.length ?? 0
    );

  } catch (err) {
    console.error('Dashboard load error:', err);
    document.getElementById('leagues-list').innerHTML = `
      <div style="padding:2rem;text-align:center;font-size:0.85rem;
                  color:var(--white-dim);font-weight:300;
                  border:1px dashed rgba(255,255,255,0.1);border-radius:8px;">
        Failed to load dashboard. Please refresh the page.
      </div>`;
  }
}

// ════════════════════════════════
// UTILS
// ════════════════════════════════

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (seconds < 60)    return 'Just now';
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ── Init ──
initUser();
loadDashboard();