const API_BASE = '/api';

// ── Password visibility toggle ──
const pwToggle = document.getElementById('pw-toggle');
const pwInput  = document.getElementById('password');
const eyeIcon  = document.getElementById('eye-icon');

const eyeOpen = `
  <path d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8Z" stroke="currentColor" stroke-width="1.3"/>
  <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
`;

const eyeClosed = `
  <path d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
`;

let pwVisible = false;

pwToggle.addEventListener('click', () => {
  pwVisible = !pwVisible;
  pwInput.type = pwVisible ? 'text' : 'password';
  eyeIcon.innerHTML = pwVisible ? eyeClosed : eyeOpen;
});

// ── Validation helpers ──
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showFieldError(inputId, errorId, show) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (show) {
    input.classList.add('has-error');
    error.style.display = 'block';
  } else {
    input.classList.remove('has-error');
    error.style.display = 'none';
  }
}

function clearErrors() {
  document.querySelectorAll('input').forEach(el => el.classList.remove('has-error'));
  document.querySelectorAll('.field-error').forEach(el => el.style.display = 'none');
  hideGlobalError();
}

function showGlobalError(msg) {
  const el = document.getElementById('global-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideGlobalError() {
  const el = document.getElementById('global-error');
  el.style.display = 'none';
}

// ── Loading state ──
function setLoading(loading) {
  const btn     = document.getElementById('btn-submit');
  const spinner = document.getElementById('spinner');
  const label   = document.getElementById('btn-label');

  btn.disabled          = loading;
  spinner.style.display = loading ? 'block' : 'none';
  label.textContent     = loading ? 'Signing in...' : 'Sign In';
}

// ── Main login handler ──
async function handleLogin() {
  clearErrors();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const remember = document.getElementById('remember').checked;

  let valid = true;

  if (!isValidEmail(email)) {
    showFieldError('email', 'err-email', true);
    valid = false;
  }

  if (!password) {
    showFieldError('password', 'err-password', true);
    valid = false;
  }

  if (!valid) return;

  setLoading(true);

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      showGlobalError(data.message || 'Invalid email or password. Please try again.');
      return;
    }

    // Store session
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem('token', data.token);
    storage.setItem('user', JSON.stringify(data.user));

    // Route based on role
    if (data.user.role === 'owner') {
      window.location.href = 'dashboard.html';
    } else {
      window.location.href = 'my-team.html';
    }

  } catch (err) {
    showGlobalError('Network error. Check your connection and try again.');
  } finally {
    setLoading(false);
  }
}

// ── Enter key support ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin();
});

// ── Clear error on input ──
['email', 'password'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    document.getElementById(id).classList.remove('has-error');
    const errMap = { email: 'err-email', password: 'err-password' };
    document.getElementById(errMap[id]).style.display = 'none';
    hideGlobalError();
  });
});

// ── Auto redirect if already logged in ──
(function checkAuth() {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const user  = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');
  if (token && user) {
    window.location.href = user.role === 'owner' ? 'dashboard.html' : 'my-team.html';
  }
})();