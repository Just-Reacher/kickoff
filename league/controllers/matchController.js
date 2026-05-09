const db                       = require('../config/db');
const { createError }          = require('../middleware/errorHandler');
const { recalculateStandings } = require('../services/tableService');

// ════════════════════════════════
// POST /api/matches/:matchId/result
// A player submits the score for their match
// ════════════════════════════════
const submitResult = async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { matchId }   = req.params;
    const { homeScore, awayScore } = req.body;

    // ── Validate scores ──
    if (homeScore === undefined || homeScore === null ||
        awayScore === undefined || awayScore === null) {
      throw createError(400, 'Home score and away score are required.');
    }

    const home = parseInt(homeScore);
    const away = parseInt(awayScore);

    if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
      throw createError(400, 'Scores must be non-negative numbers.');
    }

    // ── Fetch the fixture ──
    const fixtureResult = await client.query(
      `SELECT f.*, l.owner_id, l.status AS league_status
       FROM fixtures f
       JOIN leagues l ON l.id = f.league_id
       WHERE f.id = $1`,
      [matchId]
    );

    if (fixtureResult.rows.length === 0) {
      throw createError(404, 'Match not found.');
    }

    const fixture = fixtureResult.rows[0];

    // ── League must be active ──
    if (fixture.league_status === 'waiting') {
      throw createError(400, 'This league has not started yet.');
    }

    if (fixture.league_status === 'completed') {
      throw createError(400, 'This league has already ended.');
    }

    // ── Match must be upcoming (not already submitted or approved) ──
    if (fixture.status === 'pending') {
      throw createError(409, 'A result has already been submitted for this match. Awaiting owner approval.');
    }

    if (fixture.status === 'approved') {
      throw createError(409, 'This match result has already been approved.');
    }

    // ── Only players in this match can submit ──
    const memberResult = await client.query(
      `SELECT id FROM league_members
       WHERE league_id = $1 AND user_id = $2`,
      [fixture.league_id, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      throw createError(403, 'You are not a member of this league.');
    }

    const myMemberId = memberResult.rows[0].id;
    const isInMatch  =
      myMemberId === fixture.home_member_id ||
      myMemberId === fixture.away_member_id;

    // League owner can also submit on behalf if needed
    const isOwner = fixture.owner_id === req.user.id;

    if (!isInMatch && !isOwner) {
      throw createError(403, 'You can only submit results for your own matches.');
    }

    // ── Update fixture to pending ──
    await client.query(
      `UPDATE fixtures
       SET status       = 'pending',
           home_score   = $1,
           away_score   = $2,
           submitted_by = $3,
           submitted_at = NOW()
       WHERE id = $4`,
      [home, away, req.user.id, matchId]
    );

    await client.query('COMMIT');

    res.status(200).json({
      message: 'Result submitted. Awaiting league owner approval.',
      matchId,
      homeScore: home,
      awayScore: away,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ════════════════════════════════
// POST /api/matches/:matchId/approve
// Owner approves a pending result — triggers table recalculation
// ════════════════════════════════
const approveResult = async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { matchId } = req.params;

    // ── Fetch fixture ──
    const fixtureResult = await client.query(
      `SELECT f.*, l.owner_id, l.status AS league_status, l.max_teams, l.playoff_spots
       FROM fixtures f
       JOIN leagues l ON l.id = f.league_id
       WHERE f.id = $1`,
      [matchId]
    );

    if (fixtureResult.rows.length === 0) {
      throw createError(404, 'Match not found.');
    }

    const fixture = fixtureResult.rows[0];

    // ── Only the league owner can approve ──
    if (fixture.owner_id !== req.user.id) {
      throw createError(403, 'Only the league owner can approve results.');
    }

    // ── Must be pending ──
    if (fixture.status !== 'pending') {
      throw createError(400, `Cannot approve a match with status "${fixture.status}".`);
    }

    // ── Approve the fixture ──
    await client.query(
      `UPDATE fixtures
       SET status = 'approved', approved_at = NOW()
       WHERE id = $1`,
      [matchId]
    );

    // ── Recalculate standings ──
    await recalculateStandings(client, fixture.league_id);

    // ── Check if all fixtures are done — if so check for league completion ──
    const remainingResult = await client.query(
      `SELECT COUNT(*) FROM fixtures
       WHERE league_id = $1 AND status = 'upcoming'`,
      [fixture.league_id]
    );

    const remaining = parseInt(remainingResult.rows[0].count);

    // If no more upcoming fixtures — mark league as ready for playoffs/completion
    if (remaining === 0) {
      const pendingCount = await client.query(
        `SELECT COUNT(*) FROM fixtures
         WHERE league_id = $1 AND status = 'pending'`,
        [fixture.league_id]
      );

      if (parseInt(pendingCount.rows[0].count) === 0) {
        // All played and approved — move to playoffs stage
        await client.query(
          `UPDATE leagues SET status = 'playoffs' WHERE id = $1 AND status = 'active'`,
          [fixture.league_id]
        );
      }
    }

    await client.query('COMMIT');

    res.status(200).json({
      message:  'Result approved. Standings updated.',
      matchId,
      leagueId: fixture.league_id,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ════════════════════════════════
// POST /api/matches/:matchId/reject
// Owner rejects a pending result — match goes back to upcoming
// ════════════════════════════════
const rejectResult = async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { matchId } = req.params;

    // ── Fetch fixture ──
    const fixtureResult = await client.query(
      `SELECT f.*, l.owner_id
       FROM fixtures f
       JOIN leagues l ON l.id = f.league_id
       WHERE f.id = $1`,
      [matchId]
    );

    if (fixtureResult.rows.length === 0) {
      throw createError(404, 'Match not found.');
    }

    const fixture = fixtureResult.rows[0];

    // ── Only the league owner can reject ──
    if (fixture.owner_id !== req.user.id) {
      throw createError(403, 'Only the league owner can reject results.');
    }

    // ── Must be pending ──
    if (fixture.status !== 'pending') {
      throw createError(400, `Cannot reject a match with status "${fixture.status}".`);
    }

    // ── Reset fixture back to upcoming — clear scores ──
    await client.query(
      `UPDATE fixtures
       SET status       = 'rejected',
           home_score   = NULL,
           away_score   = NULL,
           submitted_by = NULL,
           submitted_at = NULL
       WHERE id = $1`,
      [matchId]
    );

    await client.query('COMMIT');

    res.status(200).json({
      message: 'Result rejected. The players must resubmit.',
      matchId,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { submitResult, approveResult, rejectResult };