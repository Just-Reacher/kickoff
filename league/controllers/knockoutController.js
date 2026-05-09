const db                                          = require('../config/db');
const { createError }                             = require('../middleware/errorHandler');
const { generateKnockoutBracket, advanceWinners } = require('../services/knockoutService');

// ════════════════════════════════
// GET /api/knockout/:leagueId
// Returns the full bracket for a league
// ════════════════════════════════
const getKnockout = async (req, res, next) => {
  try {
    const { leagueId } = req.params;

    // ── Check league exists and is in knockout stage ──
    const leagueResult = await db.query(
      `SELECT id, name, season, status, winner_id FROM leagues WHERE id = $1`,
      [leagueId]
    );

    if (leagueResult.rows.length === 0) {
      throw createError(404, 'League not found.');
    }

    const league = leagueResult.rows[0];

    if (league.status === 'waiting' || league.status === 'active') {
      return res.status(422).json({
        message: 'Knockout stage has not started yet.',
        leagueStatus: league.status,
      });
    }

    // ── Get all rounds ──
    const roundsResult = await db.query(
      `SELECT * FROM knockout_rounds WHERE league_id = $1 ORDER BY round_order ASC`,
      [leagueId]
    );

    if (roundsResult.rows.length === 0) {
      return res.status(422).json({
        message: 'Knockout bracket has not been generated yet.',
        leagueStatus: league.status,
      });
    }

    // ── Get all matches via view ──
    const matchesResult = await db.query(
      `SELECT * FROM v_knockout WHERE league_id = $1 ORDER BY round_order, match_number`,
      [leagueId]
    );

    // ── Shape into rounds with nested matches ──
    const rounds = roundsResult.rows.map((round) => {
      const matches = matchesResult.rows
        .filter((m) => m.round_id === round.id)
        .map((m) => ({
          id:          m.id,
          matchNumber: m.match_number,
          status:      m.status,
          homeScore:   m.home_score,
          awayScore:   m.away_score,
          submittedAt: m.submitted_at,
          approvedAt:  m.approved_at,
          homeTeam: m.home_member_id ? {
            memberId: m.home_member_id,
            userId:   m.home_user_id,
            username: m.home_username,
            teamName: m.home_team_name,
          } : null,
          awayTeam: m.away_member_id ? {
            memberId: m.away_member_id,
            userId:   m.away_user_id,
            username: m.away_username,
            teamName: m.away_team_name,
          } : null,
          winner: m.winner_member_id ? {
            memberId: m.winner_member_id,
            username: m.winner_username,
            teamName: m.winner_team_name,
          } : null,
        }));

      return {
        id:         round.id,
        roundKey:   round.round_key,
        roundName:  round.round_name,
        roundOrder: round.round_order,
        status:     round.status,
        matches,
      };
    });

    // ── Winner (if league completed) ──
    let winner = null;
    if (league.winner_id) {
      const winnerResult = await db.query(
        `SELECT u.username, lm.team_name
         FROM users u
         JOIN league_members lm ON lm.user_id = u.id AND lm.league_id = $1
         WHERE u.id = $2`,
        [leagueId, league.winner_id]
      );
      if (winnerResult.rows.length > 0) {
        winner = {
          username: winnerResult.rows[0].username,
          teamName: winnerResult.rows[0].team_name,
        };
      }
    }

    res.status(200).json({
      leagueId,
      stage:  league.status,
      rounds,
      winner,
    });

  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════
// POST /api/knockout/:leagueId/generate
// Owner manually triggers bracket generation
// Called after league phase ends
// ════════════════════════════════
const generateKnockout = async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { leagueId } = req.params;

    // ── Fetch league ──
    const leagueResult = await client.query(
      'SELECT * FROM leagues WHERE id = $1',
      [leagueId]
    );

    const league = leagueResult.rows[0];

    if (!league) throw createError(404, 'League not found.');

    if (league.status !== 'playoffs' && league.status !== 'active') {
      throw createError(400, 'League must be in active or playoffs status to generate knockout.');
    }

    // ── Check bracket not already generated ──
    const existingRounds = await client.query(
      'SELECT id FROM knockout_rounds WHERE league_id = $1',
      [leagueId]
    );

    if (existingRounds.rows.length > 0) {
      throw createError(409, 'Knockout bracket has already been generated.');
    }

    // ── Get top N qualifiers by standing ──
    const qualifiersResult = await client.query(
      `SELECT s.member_id, s.position
       FROM standings s
       WHERE s.league_id = $1
       ORDER BY s.position ASC
       LIMIT $2`,
      [leagueId, league.playoff_spots]
    );

    const qualifiers = qualifiersResult.rows;

    if (qualifiers.length < 2) {
      throw createError(400, 'Not enough teams have qualified for the knockout stage.');
    }

    // ── Generate bracket ──
    await generateKnockoutBracket(client, leagueId, qualifiers);

    // ── Update league status to playoffs ──
    await client.query(
      `UPDATE leagues SET status = 'playoffs' WHERE id = $1`,
      [leagueId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message:    'Knockout bracket generated successfully.',
      leagueId,
      qualifiers: qualifiers.length,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ════════════════════════════════
// POST /api/knockout/:leagueId/matches/:matchId/result
// Player submits knockout match score
// ════════════════════════════════
const submitKnockoutResult = async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { leagueId, matchId } = req.params;
    const { homeScore, awayScore } = req.body;

    // ── Validate scores ──
    const home = parseInt(homeScore);
    const away = parseInt(awayScore);

    if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
      throw createError(400, 'Scores must be non-negative numbers.');
    }

    // Knockout matches cannot end in a draw
    if (home === away) {
      throw createError(400, 'Knockout matches cannot end in a draw. A winner must be determined.');
    }

    // ── Fetch match ──
    const matchResult = await client.query(
      `SELECT km.*, kr.round_key
       FROM knockout_matches km
       JOIN knockout_rounds  kr ON kr.id = km.round_id
       WHERE km.id = $1 AND km.league_id = $2`,
      [matchId, leagueId]
    );

    if (matchResult.rows.length === 0) {
      throw createError(404, 'Knockout match not found.');
    }

    const match = matchResult.rows[0];

    if (match.status === 'pending') {
      throw createError(409, 'A result has already been submitted. Awaiting approval.');
    }

    if (match.status === 'approved') {
      throw createError(409, 'This match has already been approved.');
    }

    // ── Verify submitter is in this match ──
    const memberResult = await client.query(
      'SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2',
      [leagueId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      throw createError(403, 'You are not a member of this league.');
    }

    const myMemberId = memberResult.rows[0].id;
    const isInMatch  = myMemberId === match.home_member_id || myMemberId === match.away_member_id;

    if (!isInMatch) {
      throw createError(403, 'You can only submit results for your own matches.');
    }

    // ── Update match ──
    await client.query(
      `UPDATE knockout_matches
       SET status = 'pending', home_score = $1, away_score = $2,
           submitted_by = $3, submitted_at = NOW()
       WHERE id = $4`,
      [home, away, req.user.id, matchId]
    );

    await client.query('COMMIT');

    res.status(200).json({
      message: 'Knockout result submitted. Awaiting owner approval.',
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
// POST /api/knockout/:leagueId/matches/:matchId/approve
// Owner approves knockout result — advances winner to next round
// ════════════════════════════════
const approveKnockoutResult = async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { leagueId, matchId } = req.params;

    // ── Fetch match ──
    const matchResult = await client.query(
      `SELECT km.*, kr.id AS round_id, kr.round_key, kr.round_order
       FROM knockout_matches km
       JOIN knockout_rounds  kr ON kr.id = km.round_id
       WHERE km.id = $1 AND km.league_id = $2`,
      [matchId, leagueId]
    );

    if (matchResult.rows.length === 0) {
      throw createError(404, 'Knockout match not found.');
    }

    const match = matchResult.rows[0];

    if (match.status !== 'pending') {
      throw createError(400, `Cannot approve a match with status "${match.status}".`);
    }

    // ── Determine winner ──
    const winnerId = match.home_score > match.away_score
      ? match.home_member_id
      : match.away_member_id;

    // ── Approve match and set winner ──
    await client.query(
      `UPDATE knockout_matches
       SET status = 'approved', winner_member_id = $1, approved_at = NOW()
       WHERE id = $2`,
      [winnerId, matchId]
    );

    // ── Check if all matches in this round are now approved ──
    const remainingResult = await client.query(
      `SELECT COUNT(*) FROM knockout_matches
       WHERE round_id = $1 AND status != 'approved'`,
      [match.round_id]
    );

    const remaining = parseInt(remainingResult.rows[0].count);

    // ── If round is complete — advance winners to next round ──
    if (remaining === 0) {
      await advanceWinners(client, leagueId, match.round_id);
    }

    await client.query('COMMIT');

    res.status(200).json({
      message:  'Knockout result approved.',
      matchId,
      winnerId,
      leagueId,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ════════════════════════════════
// POST /api/knockout/:leagueId/matches/:matchId/reject
// Owner rejects knockout result — match goes back to upcoming
// ════════════════════════════════
const rejectKnockoutResult = async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { leagueId, matchId } = req.params;

    const matchResult = await client.query(
      `SELECT km.* FROM knockout_matches km
       WHERE km.id = $1 AND km.league_id = $2`,
      [matchId, leagueId]
    );

    if (matchResult.rows.length === 0) {
      throw createError(404, 'Knockout match not found.');
    }

    const match = matchResult.rows[0];

    if (match.status !== 'pending') {
      throw createError(400, `Cannot reject a match with status "${match.status}".`);
    }

    // Reset to upcoming — clear scores
    await client.query(
      `UPDATE knockout_matches
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
      message: 'Knockout result rejected. Players must resubmit.',
      matchId,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getKnockout,
  generateKnockout,
  submitKnockoutResult,
  approveKnockoutResult,
  rejectKnockoutResult,
};