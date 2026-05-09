const jwt  = require('jsonwebtoken');
const db   = require('../config/db');

/**
 * protect
 * Verifies the JWT from the Authorization header.
 * Attaches req.user = { id, username, email } on success.
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided. Please log in.' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Session expired. Please log in again.' });
      }
      return res.status(401).json({ message: 'Invalid token. Please log in.' });
    }

    // Verify user still exists in DB
    const result = await db.query(
      'SELECT id, username, email FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Account no longer exists.' });
    }

    req.user = result.rows[0];
    next();

  } catch (err) {
    next(err);
  }
};

module.exports = { protect };