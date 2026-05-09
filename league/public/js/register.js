const API_BASE = '/api';

// ── Password visibility toggle ──
const eyeOpen = `
  <path d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8Z" stroke="currentColor" stroke-width="1.3"/>
  <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
`;
const eyeClosed = `
  <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M6 4.2C6.6 3.5 7.3 3 8 3C12.5 3 15 8 15 8C14.4 9.1 13.6 10 12.7 10.7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M4.2 5.3C2.8 6.3 1 8 1 8C1 8 3.5 13 8 13C9.5 13 10.8 12.3 11.8 11.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
`;

const pwStates = {};

function togglePw(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon  = document.getElementById(iconId);
  pwStates[inputId] = !pwStates[inputId];
  input.type     = pwStates[inputId] ? 'text' : 'password';
  icon.innerHTML = pwStates[inputId] ? eyeClosed : eyeOpen;
}

// ── Password strength ──
function handlePasswordInput(value) {
  const strengthEl = document.getElementById('pw-strength');
  const segs       = [1,2,3,4].map(i => document.getElementById(`seg-${i}`));
  const label      = document.getElementById('strength-text');

  if (!value) {
    strengthEl.style.display = 'none';
    return;
  }

  strengthEl.style.display = 'block';

  let score = 0;
  if (value.length >= 8)                    score++;
  if (value.length >= 12)                   score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/[0-9]/.test(value))                  score++;
  if (/[^A-Za-z0-9]/.test(value))          score++;

  const level = score <= 1 ? 1 : score <= 2 ? 2 : score <= 3 ? 3 : 4;
  const map   = { 1: 'weak', 2: 'fair', 3: 'good', 4: 'strong' };
  const text  = { 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' };
  const color = { 1: '#ff4d4d', 2: '#ff9500', 3: '#ffd700', 4: '#00cc66' };

  segs.forEach((seg, i) => {
    seg.className = 'strength-seg';
    if (i < level) seg.classList.add(map[level]);
  });

  label.textContent = text[level];
  label.style.color = color[level];
}

// ── Validation helpers ──
function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidUsername(v) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(v);
}

function showErr(inputId, errId, show) {
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errId);
  if (!input || !err) return;
  if (show) {
    input.classList.add('has-error');
    input.classList.remove('has-success');
    err.style.display = 'block';
  } else {
    input.classList.remove('has-error');
    err.style.display = 'none';
  }
}

function markSuccess(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.classList.remove('has-error');
    input.classList.add('has-success');
  }
}

function clearAllErrors() {
  document.querySelectorAll('input').forEach(el => {
    el.classList.remove('has-error', 'has-success');
  });
  document.querySelectorAll('.field-error').forEach(el => {
    el.style.display = 'none';
  });
  hideGlobalError();
}

function showGlobalError(msg) {
  const el = document.getElementById('global-error');
  el.textContent  = msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideGlobalError() {
  document.getElementById('global-error').style.display = 'none';
}

// ── Loading state ──
function setLoading(on) {
  const btn     = document.getElementById('btn-submit');
  const spinner = document.getElementById('spinner');
  const label   = document.getElementById('btn-label');
  btn.disabled          = on;
  spinner.style.display = on ? 'block' : 'none';
  label.textContent     = on ? 'Creating Account...' : 'Create My Account';
}

// ── Live clear on input ──
const fieldMap = {
  'first-name':       'err-first-name',
  'last-name':        'err-last-name',
  'username':         'err-username',
  'email':            'err-email',
  'password':         'err-password',
  'confirm-password': 'err-confirm',
};

Object.entries(fieldMap).forEach(([inputId, errId]) => {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.addEventListener('input', () => {
    el.classList.remove('has-error');
    document.getElementById(errId).style.display = 'none';
    hideGlobalError();
  });
});

// ── Main handler ──
async function handleRegister() {
  clearAllErrors();

  const firstName = document.getElementById('first-name').value.trim();
  const lastName  = document.getElementById('last-name').value.trim();
  const username  = document.getElementById('username').value.trim();
  const email     = document.getElementById('email').value.trim();
  const password  = document.getElementById('password').value;
  const confirm   = document.getElementById('confirm-password').value;
  const terms     = document.getElementById('terms').checked;

  let valid = true;

  if (!firstName) {
    showErr('first-name', 'err-first-name', true);
    valid = false;
  } else {
    markSuccess('first-name');
  }

  if (!lastName) {
    showErr('last-name', 'err-last-name', true);
    valid = false;
  } else {
    markSuccess('last-name');
  }

  if (!isValidUsername(username)) {
    showErr('username', 'err-username', true);
    valid = false;
  } else {
    markSuccess('username');
  }

  if (!isValidEmail(email)) {
    showErr('email', 'err-email', true);
    valid = false;
  } else {
    markSuccess('email');
  }

  if (password.length < 8) {
    showErr('password', 'err-password', true);
    valid = false;
  } else {
    markSuccess('password');
  }

  if (confirm !== password || !confirm) {
    showErr('confirm-password', 'err-confirm', true);
    valid = false;
  } else {
    markSuccess('confirm-password');
  }

  if (!terms) {
    document.getElementById('err-terms').style.display = 'block';
    valid = false;
  }

  if (!valid) return;

  setLoading(true);

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, username, email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      showGlobalError(data.message || 'Registration failed. Please try again.');
      return;
    }

    // Store session
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    // Everyone goes to dashboard — from there they create or join a league
    window.location.href = 'dashboard.html';

  } catch (err) {
    showGlobalError('Network error. Check your connection and try again.');
  } finally {
    setLoading(false);
  }
}

// ── Enter key ──
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleRegister();
});

// ── Already logged in ──
(function checkAuth() {
  const token = localStorage.getItem('token');
  const user  = JSON.parse(localStorage.getItem('user') || 'null');
  if (token && user) window.location.href = 'dashboard.html';
})();