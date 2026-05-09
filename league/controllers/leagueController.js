const db                 = require('../config/db');
const { createError }    = require('../middleware/errorHandler');
const generateInviteCode = require('../utils/generateInviteCode');
const generateFixtures   = require('../utils/generateFixtures');
const { sortStandings }  = require('../utils/calculatePoints');

// ════════════════════════════════
// POST /api/leagues
// Create a new league — user becomes owner
// ════════════════════════════════
const createLeague = async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { name, season, format, maxTeams, description, playoffSpots } = req.body;

    // ── Validation ──
    if (!name || !season || !format || !maxTeams) {
      throw createError(400, 'Name, season, format and maxTeams are required.');
    }

    if (!['single', 'double'].includes(format)) {
      throw createError(400, 'Format must be single or double.');
    }

    const max = parseInt(maxTeams);
    if (isNaN(max) || max < 2 || max > 32) {
      throw createError(400, 'Max teams must be between 2 and 32.');
    }

    const spots = parseInt(playoffSpots) || 4;

    // ── Generate invite code ──
    const inviteCode = await generateInviteCode();

    // ── Insert league ──
    const leagueResult = await client.query(
      `INSERT INTO leagues
         (owner_id, name, season, description, format, max_teams, playoff_spots, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.id, name.trim(), season.trim(), description?.trim() || null,
       format, max, spots, inviteCode]
    );

    const league = leagueResult.rows[0];

    // ── Owner joins their own league automatically ──
    // Their team name defaults to their username — they can't change it pre-start
    await client.query(
      `INSERT INTO league_members (league_id, user_id, team_name, role)
       VALUES ($1, $2, $3, 'owner')`,
      [league.id, req.user.id, req.user.username]
    );

    // ── Seed standings row for owner ──
    const memberResult = await client.query(
      'SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2',
      [league.id, req.user.id]
    );

    await client.query(
      'INSERT INTO standings (league_id, member_id) VALUES ($1, $2)',
      [league.id, memberResult.rows[0].id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'League created successfully.',
      league: {
        id:           league.id,
        name:         league.name,
        season:       league.season,
        format:       league.format,
        maxTeams:     league.max_teams,
        playoffSpots: league.playoff_spots,
        inviteCode:   league.invite_code,
        status:       league.status,
        createdAt:    league.created_at,
      },
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ════════════════════════════════
// GET /api/leagues/mine
// All leagues the current user belongs to
// ════════════════════════════════
const getMyLeagues = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT
         l.id, l.name, l.season, l.format, l.max_teams, l.playoff_spots,
         l.status, l.invite_code, l.code_active, l.created_at,
         lm.role, lm.team_name, lm.joined_at,
         -- member count
         (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS member_count,
         -- my standing
         s.position, s.points, s.played, s.won, s.drawn, s.lost,
         s.goals_for, s.goals_against, s.goal_difference, s.form,
         -- pending approvals (owner only)
         CASE WHEN lm.role = 'owner' THEN
           (SELECT COUNT(*) FROM fixtures
            WHERE league_id = l.id AND status = 'pending')
         ELSE 0 END AS pending_approvals
       FROM league_members lm
       JOIN leagues l ON l.id = lm.league_id
       LEFT JOIN standings s ON s.league_id = l.id AND s.member_id = lm.id
       WHERE lm.user_id = $1
       ORDER BY lm.joined_at DESC`,
      [req.user.id]
    );

    const leagues = result.rows.map((row) => ({
      id:               row.id,
      name:             row.name,
      season:           row.season,
      format:           row.format,
      maxTeams:         row.max_teams,
      playoffSpots:     row.playoff_spots,
      status:           row.status,
      inviteCode:       row.role === 'owner' ? row.invite_code : undefined,
      codeActive:       row.role === 'owner' ? row.code_active : undefined,
      role:             row.role,
      teamName:         row.team_name,
      joinedAt:         row.joined_at,
      memberCount:      parseInt(row.member_count),
      pendingApprovals: parseInt(row.pending_approvals),
      standing: row.position ? {
        position:       row.position,
        points:         row.points,
        played:         row.played,
        won:            row.won,
        drawn:          row.drawn,
        lost:           row.lost,
        goalsFor:       row.goals_for,
        goalsAgainst:   row.goals_against,
        goalDifference: row.goal_difference,
        form:           row.form ? row.form.split('') : [],
      } : null,
    }));

    res.status(200).json({ leagues });

  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════
// GET /api/leagues/:leagueId/members
// All members in a league (for setup polling)
// ════════════════════════════════
const getLeagueMembers = async (req, res, next) => {
  try {
    const { leagueId } = req.params;

    const result = await db.query(
      `SELECT
         lm.id, lm.role, lm.team_name, lm.joined_at,
         u.username, u.first_name, u.last_name
       FROM league_members lm
       JOIN users u ON u.id = lm.user_id
       WHERE lm.league_id = $1
       ORDER BY lm.joined_at ASC`,
      [leagueId]
    );

    const leagueResult = await db.query(
      'SELECT max_teams, status, invite_code, code_active FROM leagues WHERE id = $1',
      [leagueId]
    );

    const league = leagueResult.rows[0];

    res.status(200).json({
      members: result.rows.map((m) => ({
        id:        m.id,
        username:  m.username,
        firstName: m.first_name,
        lastName:  m.last_name,
        teamName:  m.team_name,
        role:      m.role,
        joinedAt:  m.joined_at,
      })),
      maxTeams:   league.max_teams,
      status:     league.status,
      codeActive: league.code_active,
    });

  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════
// POST /api/leagues/join
// Join a league with an invite code
// ════════════════════════════════
const joinLeague = async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { code, teamName } = req.body;

    if (!code) throw createError(400, 'Invite code is required.');
    if (!teamName || teamName.trim().length < 1) {
      throw createError(400, 'Team name is required.');
    }

    // ── Find league by code ──
    const leagueResult = await client.query(
      `SELECT id, name, max_teams, status, code_active
       FROM leagues WHERE invite_code = $1`,
      [code.trim().toUpperCase()]
    );

    if (leagueResult.rows.length === 0) {
      throw createError(404, 'Invalid invite code. Please check and try again.');
    }

    const league = leagueResult.rows[0];

    // ── Validate league state ──
    if (!league.code_active) {
      throw createError(400, 'This invite code has expired. The league is full.');
    }

    if (league.status !== 'waiting') {
      throw createError(400, 'This league has already started. No new players can join.');
    }

    // ── Check user not already in league ──
    const alreadyMember = await client.query(
      'SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2',
      [league.id, req.user.id]
    );

    if (alreadyMember.rows.length > 0) {
      throw createError(409, 'You are already in this league.');
    }

    // ── Check team name not already taken ──
    const nameTaken = await client.query(
      'SELECT id FROM league_members WHERE league_id = $1 AND LOWER(team_name) = LOWER($2)',
      [league.id, teamName.trim()]
    );

    if (nameTaken.rows.length > 0) {
      throw createError(409, 'This team name is already taken in this league. Please choose another.');
    }

    // ── Check league not full ──
    const memberCount = await client.query(
      'SELECT COUNT(*) FROM league_members WHERE league_id = $1',
      [league.id]
    );

    const count = parseInt(memberCount.rows[0].count);

    if (count >= league.max_teams) {
      // Deactivate code
      await client.query(
        'UPDATE leagues SET code_active = FALSE WHERE id = $1',
        [league.id]
      );
      throw createError(400, 'This league is full.');
    }

    // ── Add member ──
    const memberResult = await client.query(
      `INSERT INTO league_members (league_id, user_id, team_name, role)
       VALUES ($1, $2, $3, 'player')
       RETURNING *`,
      [league.id, req.user.id, teamName.trim()]
    );

    const member = memberResult.rows[0];

    // ── Seed standings row ──
    await client.query(
      'INSERT INTO standings (league_id, member_id) VALUES ($1, $2)',
      [league.id, member.id]
    );

    // ── Deactivate code if now full ──
    if (count + 1 >= league.max_teams) {
      await client.query(
        'UPDATE leagues SET code_active = FALSE WHERE id = $1',
        [league.id]
      );
    }

    await client.query('COMMIT');

    res.status(200).json({
      message:  `Successfully joined ${league.name}!`,
      leagueId: league.id,
      teamName: member.team_name,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ════════════════════════════════
// POST /api/leagues/:leagueId/start
// Owner starts league — generates all fixtures and standings
// ════════════════════════════════
const startLeague = async (req, res, next) => {
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

    if (league.status !== 'waiting') {
      throw createError(400, 'League has already started or is completed.');
    }

    // ── Get all members ──
    const membersResult = await client.query(
      'SELECT id FROM league_members WHERE league_id = $1 ORDER BY joined_at ASC',
      [leagueId]
    );

    const members = membersResult.rows;

    if (members.length < 2) {
      throw createError(400, 'At least 2 players must join before the league can start.');
    }

    // ── Generate fixtures ──
    const memberIds = members.map((m) => m.id);
    const fixtures  = generateFixtures(memberIds, league.format);

    // ── Bulk insert fixtures ──
    for (const fixture of fixtures) {
      await client.query(
        `INSERT INTO fixtures (league_id, matchday, home_member_id, away_member_id)
         VALUES ($1, $2, $3, $4)`,
        [leagueId, fixture.matchday, fixture.homeMemberId, fixture.awayMemberId]
      );
    }

    // ── Update league status and deactivate invite code ──
    await client.query(
      `UPDATE leagues
       SET status = 'active', code_active = FALSE, started_at = NOW()
       WHERE id = $1`,
      [leagueId]
    );

    await client.query('COMMIT');

    res.status(200).json({
      message:      'League started! Fixtures have been generated.',
      leagueId,
      fixtureCount: fixtures.length,
      matchdays:    fixtures.reduce((max, f) => Math.max(max, f.matchday), 0),
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ════════════════════════════════
// GET /api/leagues/:leagueId/table
// Live standings with full stats
// ════════════════════════════════
const getLeagueTable = async (req, res, next) => {
  try {
    const { leagueId } = req.params;

    const result = await db.query(
      `SELECT * FROM v_standings WHERE league_id = $1`,
      [leagueId]
    );

    const leagueResult = await db.query(
      `SELECT name, season, format, max_teams, playoff_spots, status,
              (SELECT COUNT(*) FROM fixtures
               WHERE league_id = $1 AND (status = 'approved' OR status = 'pending'))
               AS total_matches
       FROM leagues WHERE id = $1`,
      [leagueId]
    );

    const league = leagueResult.rows[0];

    const standings = result.rows.map((row) => ({
      memberId:         row.member_id,
      userId:           row.user_id,
      username:         row.username,
      teamName:         row.team_name,
      role:             row.role,
      position:         row.position,
      previousPosition: row.previous_position,
      played:           row.played,
      won:              row.won,
      drawn:            row.drawn,
      lost:             row.lost,
      goalsFor:         row.goals_for,
      goalsAgainst:     row.goals_against,
      goalDifference:   row.goal_difference,
      points:           row.points,
      form:             row.form ? row.form.split('') : [],
    }));

    res.status(200).json({
      standings,
      league: {
        name:         league.name,
        season:       league.season,
        format:       league.format,
        maxTeams:     league.max_teams,
        playoffSpots: league.playoff_spots,
        status:       league.status,
        totalMatches: parseInt(league.total_matches),
      },
    });

  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════
// GET /api/leagues/:leagueId/fixtures
// Full fixture schedule grouped by matchday
// ════════════════════════════════
const getLeagueFixtures = async (req, res, next) => {
  try {
    const { leagueId } = req.params;

    const result = await db.query(
      `SELECT * FROM v_fixtures WHERE league_id = $1
       ORDER BY matchday, id`,
      [leagueId]
    );

    const fixtures = result.rows.map((row) => ({
      id:        row.id,
      matchday:  row.matchday,
      status:    row.status,
      homeScore: row.home_score,
      awayScore: row.away_score,
      submittedAt: row.submitted_at,
      approvedAt:  row.approved_at,
      homeTeam: {
        memberId: row.home_member_id,
        userId:   row.home_user_id,
        username: row.home_username,
        teamName: row.home_team_name,
      },
      awayTeam: {
        memberId: row.away_member_id,
        userId:   row.away_user_id,
        username: row.away_username,
        teamName: row.away_team_name,
      },
    }));

    res.status(200).json({ fixtures });

  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════
// GET /api/leagues/:leagueId/results
// All match results — for owner approval page
// ════════════════════════════════
const getLeagueResults = async (req, res, next) => {
  try {
    const { leagueId } = req.params;

    // Only get fixtures that have been submitted (not plain upcoming)
    const result = await db.query(
      `SELECT
         f.id, f.matchday, f.status, f.home_score, f.away_score,
         f.submitted_at, f.approved_at,
         su.username AS submitted_by,
         -- home
         f.home_member_id,
         hm.team_name AS home_team_name,
         hu.id        AS home_user_id,
         hu.username  AS home_username,
         -- away
         f.away_member_id,
         am.team_name AS away_team_name,
         au.id        AS away_user_id,
         au.username  AS away_username
       FROM fixtures f
       JOIN league_members hm ON hm.id = f.home_member_id
       JOIN users          hu ON hu.id = hm.user_id
       JOIN league_members am ON am.id = f.away_member_id
       JOIN users          au ON au.id = am.user_id
       LEFT JOIN users     su ON su.id = f.submitted_by
       WHERE f.league_id = $1
         AND f.status IN ('pending', 'approved', 'rejected')
       ORDER BY f.submitted_at DESC NULLS LAST`,
      [leagueId]
    );

    const results = result.rows.map((row) => ({
      id:          row.id,
      matchday:    row.matchday,
      status:      row.status,
      homeScore:   row.home_score,
      awayScore:   row.away_score,
      submittedAt: row.submitted_at,
      approvedAt:  row.approved_at,
      submittedBy: row.submitted_by,
      homeTeam: {
        memberId: row.home_member_id,
        teamName: row.home_team_name,
        userId:   row.home_user_id,
        username: row.home_username,
      },
      awayTeam: {
        memberId: row.away_member_id,
        teamName: row.away_team_name,
        userId:   row.away_user_id,
        username: row.away_username,
      },
    }));

    res.status(200).json({ results });

  } catch (err) {
    next(err);
  }
};

// ════════════════════════════════
// GET /api/leagues/:leagueId/my-team
// Personal view — fixtures, standing, form, qualification
// ════════════════════════════════
const getMyTeam = async (req, res, next) => {
  try {
    const { leagueId } = req.params;
    const userId = req.user.id;

    // ── My member row ──
    const memberResult = await db.query(
      `SELECT lm.*, l.name AS league_name, l.status AS league_status,
              l.playoff_spots, l.format, l.season
       FROM league_members lm
       JOIN leagues l ON l.id = lm.league_id
       WHERE lm.league_id = $1 AND lm.user_id = $2`,
      [leagueId, userId]
    );

    if (memberResult.rows.length === 0) {
      throw createError(403, 'You are not in this league.');
    }

    const member = memberResult.rows[0];

    // ── My standing ──
    const standingResult = await db.query(
      `SELECT * FROM v_standings WHERE league_id = $1 AND user_id = $2`,
      [leagueId, userId]
    );

    const standing = standingResult.rows[0] || null;

    // ── My fixtures (all — upcoming, pending, played) ──
    const fixturesResult = await db.query(
      `SELECT * FROM v_fixtures
       WHERE league_id = $1
         AND (home_user_id = $2 OR away_user_id = $2)
       ORDER BY matchday ASC`,
      [leagueId, userId]
    );

    const fixtures = fixturesResult.rows.map((row) => ({
      id:        row.id,
      matchday:  row.matchday,
      status:    row.status,
      homeScore: row.home_score,
      awayScore: row.away_score,
      submittedAt: row.submitted_at,
      homeTeam: {
        memberId: row.home_member_id,
        userId:   row.home_user_id,
        username: row.home_username,
        teamName: row.home_team_name,
      },
      awayTeam: {
        memberId: row.away_member_id,
        userId:   row.away_user_id,
        username: row.away_username,
        teamName: row.away_team_name,
      },
    }));

    // ── Qualification status ──
    let qualStatus  = 'in-progress';
    let pointsNeeded = 0;

    if (standing) {
      const allStandings = await db.query(
        'SELECT position, points FROM standings WHERE league_id = $1 ORDER BY position ASC',
        [leagueId]
      );

      const playoffCutoff = member.playoff_spots;
      const myPos         = standing.position;
      const totalTeams    = allStandings.rows.length;

      if (member.league_status === 'completed') {
        qualStatus = myPos === 1 ? 'champion' : myPos <= playoffCutoff ? 'qualified' : 'eliminated';
      } else {
        const cutoffRow = allStandings.rows[playoffCutoff - 1];
        pointsNeeded    = cutoffRow ? cutoffRow.points : 0;

        if (myPos === 1)                         qualStatus = 'champion';
        else if (myPos <= playoffCutoff)          qualStatus = 'on-track';
        else if (myPos > totalTeams - 2)          qualStatus = 'danger';
        else                                      qualStatus = 'in-progress';
      }
    }

    res.status(200).json({
      team: {
        memberId: member.id,
        teamName: member.team_name,
        role:     member.role,
        joinedAt: member.joined_at,
      },
      league: {
        id:           leagueId,
        name:         member.league_name,
        season:       member.season,
        format:       member.format,
        status:       member.league_status,
        playoffSpots: member.playoff_spots,
      },
      standing: standing ? {
        position:         standing.position,
        previousPosition: standing.previous_position,
        played:           standing.played,
        won:              standing.won,
        drawn:            standing.drawn,
        lost:             standing.lost,
        goalsFor:         standing.goals_for,
        goalsAgainst:     standing.goals_against,
        goalDifference:   standing.goal_difference,
        points:           standing.points,
        form:             standing.form ? standing.form.split('') : [],
      } : null,
      fixtures,
      qualification: [{
        leagueName:   member.league_name,
        status:       qualStatus,
        statusLabel:  qualStatus.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        position:     standing?.position || null,
        totalTeams:   standing ? (await db.query(
          'SELECT COUNT(*) FROM standings WHERE league_id = $1', [leagueId]
        )).rows[0].count : 0,
        points:       standing?.points || 0,
        goalDifference: standing?.goal_difference || 0,
        pointsNeeded,
      }],
    });

  } catch (err) {
    next(err);
  }
};

module.exports = {
  createLeague,
  getMyLeagues,
  getLeagueMembers,
  joinLeague,
  startLeague,
  getLeagueTable,
  getLeagueFixtures,
  getLeagueResults,
  getMyTeam,
};