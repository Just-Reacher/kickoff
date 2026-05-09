const db                                          = require('../config/db');
const { calculatePoints, sortStandings, appendForm } = require('../utils/calculatePoints');

/**
 * recalculateStandings
 * Rebuilds the full standings table for a league from scratch
 * by aggregating all approved fixtures.
 * Called inside a transaction after every result approval.
 *
 * @param {object} client  — pg transaction client
 * @param {string} leagueId
 */
const recalculateStandings = async (client, leagueId) => {

  // ── 1. Get all members ──
  const membersResult = await client.query(
    `SELECT id, team_name FROM league_members WHERE league_id = $1`,
    [leagueId]
  );

  const members = membersResult.rows;

  // ── 2. Get all approved fixtures ──
  const fixturesResult = await client.query(
    `SELECT home_member_id, away_member_id, home_score, away_score, approved_at
     FROM fixtures
     WHERE league_id = $1 AND status = 'approved'
     ORDER BY approved_at ASC`,
    [leagueId]
  );

  const approved = fixturesResult.rows;

  // ── 3. Build stats map — keyed by member_id ──
  const stats = {};

  members.forEach((m) => {
    stats[m.id] = {
      member_id:       m.id,
      team_name:       m.team_name,
      played:          0,
      won:             0,
      drawn:           0,
      lost:            0,
      goals_for:       0,
      goals_against:   0,
      goal_difference: 0,
      points:          0,
      form:            '',
    };
  });

  // ── 4. Process each approved fixture ──
  approved.forEach((fix) => {
    const home = stats[fix.home_member_id];
    const away = stats[fix.away_member_id];

    if (!home || !away) return; // safety check

    const homeCalc = calculatePoints(fix.home_score, fix.away_score);
    const awayCalc = calculatePoints(fix.away_score, fix.home_score);

    // Home team
    home.played        += 1;
    home.won           += homeCalc.result === 'W' ? 1 : 0;
    home.drawn         += homeCalc.result === 'D' ? 1 : 0;
    home.lost          += homeCalc.result === 'L' ? 1 : 0;
    home.goals_for     += fix.home_score;
    home.goals_against += fix.away_score;
    home.points        += homeCalc.points;
    home.form           = appendForm(home.form, homeCalc.result);

    // Away team
    away.played        += 1;
    away.won           += awayCalc.result === 'W' ? 1 : 0;
    away.drawn         += awayCalc.result === 'D' ? 1 : 0;
    away.lost          += awayCalc.result === 'L' ? 1 : 0;
    away.goals_for     += fix.away_score;
    away.goals_against += fix.home_score;
    away.points        += awayCalc.points;
    away.form           = appendForm(away.form, awayCalc.result);
  });

  // ── 5. Calculate GD and sort ──
  const statsArray = Object.values(stats).map((s) => ({
    ...s,
    goal_difference: s.goals_for - s.goals_against,
  }));

  const sorted = sortStandings(statsArray);

  // ── 6. Get current positions to store as previous_position ──
  const currentPositions = await client.query(
    'SELECT member_id, position FROM standings WHERE league_id = $1',
    [leagueId]
  );

  const prevPositionMap = {};
  currentPositions.rows.forEach((row) => {
    prevPositionMap[row.member_id] = row.position;
  });

  // ── 7. Upsert standings rows ──
  for (const row of sorted) {
    await client.query(
      `INSERT INTO standings
         (league_id, member_id, position, previous_position,
          played, won, drawn, lost,
          goals_for, goals_against, goal_difference, points, form)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (league_id, member_id)
       DO UPDATE SET
         position          = EXCLUDED.position,
         previous_position = EXCLUDED.previous_position,
         played            = EXCLUDED.played,
         won               = EXCLUDED.won,
         drawn             = EXCLUDED.drawn,
         lost              = EXCLUDED.lost,
         goals_for         = EXCLUDED.goals_for,
         goals_against     = EXCLUDED.goals_against,
         goal_difference   = EXCLUDED.goal_difference,
         points            = EXCLUDED.points,
         form              = EXCLUDED.form,
         updated_at        = NOW()`,
      [
        leagueId,
        row.member_id,
        row.position,
        prevPositionMap[row.member_id] || null,
        row.played,
        row.won,
        row.drawn,
        row.lost,
        row.goals_for,
        row.goals_against,
        row.goal_difference,
        row.points,
        row.form,
      ]
    );
  }
};

module.exports = { recalculateStandings };