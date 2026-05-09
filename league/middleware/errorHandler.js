/**
 * Global error handler.
 * Must be registered last in server.js with app.use(errorHandler).
 */
const errorHandler = (err, req, res, next) => {
  // Log full error in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('❌  Error:', err.message);
    console.error(err.stack);
  }

  // PostgreSQL unique violation (code 23505)
  if (err.code === '23505') {
    const detail = err.detail || '';

    if (detail.includes('email')) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    if (detail.includes('username')) {
      return res.status(409).json({ message: 'This username is already taken.' });
    }
    if (detail.includes('team_name')) {
      return res.status(409).json({ message: 'This team name is already taken in this league.' });
    }
    if (detail.includes('invite_code')) {
      return res.status(409).json({ message: 'Invite code collision. Please try again.' });
    }

    return res.status(409).json({ message: 'Duplicate entry.' });
  }

  // PostgreSQL foreign key violation (code 23503)
  if (err.code === '23503') {
    return res.status(400).json({ message: 'Referenced record does not exist.' });
  }

  // PostgreSQL check constraint violation (code 23514)
  if (err.code === '23514') {
    return res.status(400).json({ message: 'Invalid value provided.' });
  }

  // PostgreSQL not null violation (code 23502)
  if (err.code === '23502') {
    return res.status(400).json({ message: `Missing required field: ${err.column || 'unknown'}.` });
  }

  // Custom app errors thrown with a status property
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }

  // Default to 500
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode).json({
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again.'
      : err.message || 'Internal server error',
  });
};

/**
 * createError
 * Helper to throw errors with a status code.
 * Usage: throw createError(404, 'League not found')
 */
const createError = (status, message) => {
  const err    = new Error(message);
  err.status   = status;
  return err;
};

module.exports = errorHandler;
module.exports.createError = createError;