const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');
const { createError } = require('../middleware/errorHandler');

const SALT_ROUNDS = 12;

// ── Helpers ──

const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const sanitizeUser = (user) => ({
  id:        user.id,
  firstName: user.first_name,
  lastName:  user.last_name,
  username:  user.username,
  email:     user.email,
  createdAt: user.created_at,
});

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidUsername = (username) =>
  /^[a-zA-Z0-9_]{3,20}$/.test(username);

// ════════════════════════════════
// POST /api/auth/register
// ════════════════════════════════
const register = async (req, res, next) => {
  try {
    const { firstName, lastName, username, email, password } = req.body;

    // ── Validation ──
    if (!firstName || !lastName || !username || !email || !password) {
      throw createError(400, 'All fields are required.');
    }

    if (firstName.trim().length < 1 || firstName.trim().length > 50) {
      throw createError(400, 'First name must be between 1 and 50 characters.');
    }

    if (lastName.trim().length < 1 || lastName.trim().length > 50) {
      throw createError(400, 'Last name must be between 1 and 50 characters.');
    }

    if (!isValidUsername(username)) {
      throw createError(400, 'Username must be 3–20 characters. Letters, numbers and underscores only.');
    }

    if (!isValidEmail(email)) {
      throw createError(400, 'Please provide a valid email address.');
    }

    if (password.length < 8) {
      throw createError(400, 'Password must be at least 8 characters.');
    }

    // ── Check duplicates ──
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase().trim(), username.trim()]
    );

    if (existing.rows.length > 0) {
      // Check which field conflicts
      const conflict = await db.query(
        'SELECT email, username FROM users WHERE email = $1 OR username = $2',
        [email.toLowerCase().trim(), username.trim()]
      );
      const row = conflict.rows[0];
      if (row.email === email.toLowerCase().trim()) {
        throw createError(409, 'An account with this email already exists.');
      }
      throw createError(409, 'This username is already taken.');
    }

    // ── Hash password ──
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // ── Insert user ──
    const result = await db.query(
      `INSERT INTO users (first_name, last_name, username, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        firstName.trim(),
        lastName.trim(),
        username.trim(),
        email.toLowerCase().trim(),
        passwordHash,
      ]
    );

    const user  = result.rows[0];
    const token = signToken(user.id);

    res.status(201).json({
      token,
      user: sanitizeUser(user),
    });

  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════
// POST /api/auth/login
// ════════════════════════════════
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw createError(400, 'Email and password are required.');
    }

    // ── Find user ──
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      // Generic message — don't reveal whether email exists
      throw createError(401, 'Invalid email or password.');
    }

    const user = result.rows[0];

    // ── Compare password ──
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      throw createError(401, 'Invalid email or password.');
    }

    const token = signToken(user.id);

    res.status(200).json({
      token,
      user: sanitizeUser(user),
    });

  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════
// GET /api/auth/me
// ════════════════════════════════
const getMe = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      throw createError(404, 'User not found.');
    }

    res.status(200).json({
      user: sanitizeUser(result.rows[0]),
    });

  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getMe };