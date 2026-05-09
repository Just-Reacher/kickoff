const API_BASE = '/api';

// ── Auth guard ──
const token = localStorage.getItem('token') || sessionStorage.getItem('token');
const user  = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');

if (!token || !user) window.location.href = 'login.html';

// ── Nav user init ──
function initUser() {
  const username = user?.username || 'Player';
  document.getElementById('avatar-name').textContent   = username;
  document.getElementById('avatar-circle').textContent = username.charAt(0).toUpperCase();
  document.getElementById('owner-team-display').textContent = user?.username || 'Your Team';
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
// STEP NAVIGATION
// ════════════════════════════════
let currentStep   = 1;
let selectedFormat = 'single';
let createdLeague  = null;
let pollInterval   = null;

function selectFormat(fmt) {
  selectedFormat = fmt;
  document.getElementById('fmt-single').classList.toggle('selected', fmt === 'single');
  document.getElementById('fmt-double').classList.toggle('selected', fmt === 'double');
  clearFieldError('format');
}

function goToStep1() {
  currentStep = 1;
  document.getElementById('step-1').classList.add('active');
  document.getElementById('step-2').classList.remove('active');
  document.getElementById('dot-1').className = 'step-circle active';
  document.getElementById('lbl-1').className = 'step-label active';
  document.getElementById('dot-2').className = 'step-circle';
  document.getElementById('lbl-2').className = 'step-label';
  document.getElementById('conn-1').classList.remove('done');
  hideGlobalError();
}

function goToStep2() {
  if (!validateStep1()) return;

  // Populate review
  document.getElementById('rv-name').textContent       = document.getElementById('league-name').value.trim();
  document.getElementById('rv-season').textContent     = document.getElementById('season').value.trim();
  document.getElementById('rv-teams').textContent      = document.getElementById('max-teams').value + ' Teams';
  document.getElementById('rv-format').textContent     = selectedFormat === 'single' ? 'Single Round-Robin' : 'Double Round-Robin';
  document.getElementById('rv-owner-team').textContent = user?.username || 'Your Team';

  currentStep = 2;
  document.getElementById('step-1').classList.remove('active');
  document.getElementById('step-2').classList.add('active');
  document.getElementById('dot-1').className = 'step-circle done';
  document.getElementById('dot-1').innerHTML = `<svg viewBox="0 0 10 10" fill="none"><path d="M2 5L4 7L8 3" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  document.getElementById('lbl-1').className = 'step-label';
  document.getElementById('dot-2').className = 'step-circle active';
  document.getElementById('lbl-2').className = 'step-label active';
  document.getElementById('conn-1').classList.add('done');
  hideGlobalError();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ════════════════════════════════
// VALIDATION
// ════════════════════════════════
function validateStep1() {
  let valid = true;

  const name    = document.getElementById('league-name').value.trim();
  const season  = document.getElementById('season').value.trim();
  const maxTeams = document.getElementById('max-teams').value;

  if (!name) {
    showFieldError('league-name', 'err-league-name', true);
    valid = false;
  } else {
    clearFieldError('league-name');
  }

  if (!season) {
    showFieldError('season', 'err-season', true);
    valid = false;
  } else {
    clearFieldError('season');
  }

  if (!maxTeams) {
    showFieldError('max-teams', 'err-max-teams', true);
    valid = false;
  } else {
    clearFieldError('max-teams');
  }

  if (!selectedFormat) {
    document.getElementById('err-format').style.display = 'block';
    valid = false;
  } else {
    document.getElementById('err-format').style.display = 'none';
  }

  return valid;
}

function showFieldError(inputId, errId, show) {
  const el = document.getElementById(inputId);
  const er = document.getElementById(errId);
  if (el) el.classList.toggle('has-error', show);
  if (er) er.style.display = show ? 'block' : 'none';
}

function clearFieldError(id) {
  const input = document.getElementById(id);
  const err   = document.getElementById('err-' + id);
  if (input) input.classList.remove('has-error');
  if (err)   err.style.display = 'none';
}

function showGlobalError(msg) {
  const el = document.getElementById('global-error');
  el.textContent   = msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideGlobalError() {
  document.getElementById('global-error').style.display = 'none';
}

// Clear errors on input
['league-name', 'season'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => clearFieldError(id));
});

document.getElementById('max-teams').addEventListener('change', () => clearFieldError('max-teams'));

// ════════════════════════════════
// CREATE LEAGUE  →  POST /api/leagues
// ════════════════════════════════
async function handleCreateLeague() {
  hideGlobalError();

  const btn     = document.getElementById('btn-create');
  const spinner = document.getElementById('create-spinner');
  const label   = document.getElementById('create-label');

  btn.disabled          = true;
  spinner.style.display = 'block';
  label.textContent     = 'Creating...';

  const payload = {
    name:        document.getElementById('league-name').value.trim(),
    season:      document.getElementById('season').value.trim(),
    maxTeams:    parseInt(document.getElementById('max-teams').value),
    format:      selectedFormat,
    description: document.getElementById('description').value.trim(),
  };

  try {
    const res  = await fetch(`${API_BASE}/leagues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      showGlobalError(data.message || 'Failed to create league. Please try again.');
      return;
    }

    createdLeague = data.league;
    showSuccessView(createdLeague);

  } catch (err) {
    showGlobalError('Network error. Check your connection and try again.');
  } finally {
    btn.disabled          = false;
    spinner.style.display = 'none';
    label.textContent     = 'Create League & Get Code';
  }
}

// ════════════════════════════════
// SUCCESS VIEW
// ════════════════════════════════
function showSuccessView(league) {
  // hide step bar and form steps
  document.getElementById('step-bar').style.display = 'none';
  document.getElementById('step-1').classList.remove('active');
  document.getElementById('step-2').classList.remove('active');

  // show success
  const sv = document.getElementById('success-view');
  sv.classList.add('visible');

  // populate invite code
  document.getElementById('invite-code-display').textContent = league.inviteCode;
  document.getElementById('meta-max').textContent            = league.maxTeams;
  document.getElementById('meta-format').textContent         = league.format === 'single' ? 'Single RR' : 'Double RR';
  document.getElementById('members-count-label').textContent = `1 / ${league.maxTeams}`;
  document.getElementById('progress-text').textContent       = `1 / ${league.maxTeams}`;

  renderMembers([{ username: user.username, role: 'owner', joinedAt: 'Just now' }], league.maxTeams);
  updateProgress(1, league.maxTeams);

  // Start polling for new members every 8 seconds
  startMemberPolling(league.id, league.maxTeams);
}

// ════════════════════════════════
// MEMBER POLLING  →  GET /api/leagues/:id/members
// ════════════════════════════════
function startMemberPolling(leagueId, maxTeams) {
  // immediate first fetch
  fetchMembers(leagueId, maxTeams);

  pollInterval = setInterval(() => {
    fetchMembers(leagueId, maxTeams);
  }, 8000);
}

async function fetchMembers(leagueId, maxTeams) {
  try {
    const res  = await fetch(`${API_BASE}/leagues/${leagueId}/members`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) return;

    const data    = await res.json();
    const members = data.members || [];

    renderMembers(members, maxTeams);
    updateProgress(members.length, maxTeams);

    document.getElementById('members-count-label').textContent = `${members.length} / ${maxTeams}`;
    document.getElementById('meta-joined').textContent         = members.length;

    // Enable start button if at least 2 members joined
    const startBtn = document.getElementById('btn-start');
    if (members.length >= 2) {
      startBtn.disabled = false;
      document.getElementById('start-sub').textContent =
        members.length === maxTeams
          ? 'All slots filled! The invite code has expired. Start the league when ready.'
          : `${members.length} of ${maxTeams} players joined. You can start now or wait for more.`;
    }

    // Stop polling when full
    if (members.length >= maxTeams) {
      clearInterval(pollInterval);
    }

  } catch (err) {
    // Silent fail — polling will retry
  }
}

function renderMembers(members, maxTeams) {
  const list = document.getElementById('members-list');
  list.innerHTML = '';

  members.forEach(m => {
    const row = document.createElement('div');
    row.className = 'member-row';
    const initial  = (m.username || '?').charAt(0).toUpperCase();
    const isOwner  = m.role === 'owner';
    row.innerHTML = `
      <div class="member-avatar ${isOwner ? 'gold-bg' : ''}">${initial}</div>
      <span class="member-name">${m.username}${isOwner ? ' (You)' : ''}</span>
      <span class="member-tag ${isOwner ? 'owner' : 'joined'}">${isOwner ? 'Owner' : 'Joined'}</span>
    `;
    list.appendChild(row);
  });

  // Empty slots
  const empty = maxTeams - members.length;
  for (let i = 0; i < empty; i++) {
    const slot = document.createElement('div');
    slot.className = 'member-empty-slot';
    slot.innerHTML = `
      <div class="slot-circle">
        <svg viewBox="0 0 12 12" fill="none"><line x1="6" y1="2" x2="6" y2="10" stroke="white" stroke-width="1.2" stroke-linecap="round"/><line x1="2" y1="6" x2="10" y2="6" stroke="white" stroke-width="1.2" stroke-linecap="round"/></svg>
      </div>
      <span class="slot-text">Waiting for player...</span>
    `;
    list.appendChild(slot);
  }
}

function updateProgress(joined, max) {
  const pct = Math.min((joined / max) * 100, 100);
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-text').textContent = `${joined} / ${max}`;
}

// ════════════════════════════════
// COPY INVITE CODE
// ════════════════════════════════
async function copyCode() {
  const code = document.getElementById('invite-code-display').textContent;
  const btn  = document.getElementById('copy-btn');

  try {
    await navigator.clipboard.writeText(code);
    btn.innerHTML = `
      <svg viewBox="0 0 13 13" fill="none"><path d="M2 6L5 9L11 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Copied!
    `;
    setTimeout(() => {
      btn.innerHTML = `
        <svg viewBox="0 0 13 13" fill="none"><rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M1 9V2C1 1.4 1.4 1 2 1H9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        Copy
      `;
    }, 2000);
  } catch {
    btn.textContent = 'Failed';
  }
}

// ════════════════════════════════
// START LEAGUE  →  POST /api/leagues/:id/start
// ════════════════════════════════
async function handleStartLeague() {
  const btn     = document.getElementById('btn-start');
  const spinner = document.getElementById('start-spinner');
  const label   = document.getElementById('start-label');

  btn.disabled          = true;
  spinner.style.display = 'block';
  label.textContent     = 'Generating fixtures...';

  try {
    const res  = await fetch(`${API_BASE}/leagues/${createdLeague.id}/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();

    if (!res.ok) {
      showGlobalError(data.message || 'Could not start league. Please try again.');
      btn.disabled          = false;
      spinner.style.display = 'none';
      label.textContent     = 'Start League & Generate Fixtures';
      return;
    }

    // Stop polling
    if (pollInterval) clearInterval(pollInterval);

    // Redirect to fixtures page
    window.location.href = `fixtures.html?league=${createdLeague.id}`;

  } catch (err) {
    showGlobalError('Network error. Check your connection and try again.');
    btn.disabled          = false;
    spinner.style.display = 'none';
    label.textContent     = 'Start League & Generate Fixtures';
  }
}

// ── Init ──
initUser();