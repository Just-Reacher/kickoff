const db = require('../config/db');

/**
 * requireLeagueOwner
 * Checks that req.user is the owner of the league in req.params.leagueId.
 * Must come after protect middleware.
 */
const requireLeagueOwner = async (req, res, next) => {
  try {
    const leagueId = req.params.leagueId || req.params.id;

    if (!leagueId) {
      return res.status(400).json({ message: 'League ID is required.' });
    }

    const result = await db.query(
      'SELECT owner_id FROM leagues WHERE id = $1',
      [leagueId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'League not found.' });
    }

    if (result.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ message: 'Only the league owner can do this.' });
    }

    next();

  } catch (err) {
    next(err);
  }
};

/**
 * requireLeagueMember
 * Checks that req.user is a member of the league in req.params.leagueId.
 * Attaches req.member = the league_members row for this user.
 * Must come after protect middleware.
 */
const requireLeagueMember = async (req, res, next) => {
  try {
    const leagueId = req.params.leagueId || req.params.id;

    if (!leagueId) {
      return res.status(400).json({ message: 'League ID is required.' });
    }

    const result = await db.query(
      `SELECT lm.*, l.owner_id, l.status AS league_status
       FROM league_members lm
       JOIN leagues l ON l.id = lm.league_id
       WHERE lm.league_id = $1 AND lm.user_id = $2`,
      [leagueId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ message: 'You are not a member of this league.' });
    }

    req.member = result.rows[0];
    next();

  } catch (err) {
    next(err);
  }
};

/**
 * requireActiveLeague
 * Checks that the league is in 'active' or 'playoffs' status.
 * Use after requireLeagueMember so req.member is already set.
 */
const requireActiveLeague = (req, res, next) => {
  const status = req.member?.league_status;

  if (!status) {
    return res.status(400).json({ message: 'League status could not be determined.' });
  }

  if (status === 'waiting') {
    return res.status(400).json({ message: 'The league has not started yet.' });
  }

  if (status === 'completed') {
    return res.status(400).json({ message: 'This league has already ended.' });
  }

  next();
};

module.exports = { requireLeagueOwner, requireLeagueMember, requireActiveLeague };