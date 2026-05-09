const db = require('../config/db');

/**
 * Round definitions — ordered from first round to final.
 * We pick the correct starting round based on number of qualifiers.
 */
const ROUND_DEFINITIONS = [
  { key: 'round-of-16', name: 'Round of 16', order: 1, teams: 16 },
  { key: 'quarterfinal', name: 'Quarter Finals', order: 2, teams: 8 },
  { key: 'semifinal',    name: 'Semi Finals',    order: 3, teams: 4 },
  { key: 'final',        name: 'Final',          order: 4, teams: 2 },
];

/**
 * getRoundsForTeamCount
 * Returns the subset of rounds needed based on how many teams qualified.
 * e.g. 4 teams → [semifinal, final]
 *      8 teams → [quarterfinal, semifinal, final]
 */
const getRoundsForTeamCount = (count) => {
  // Find the first round that fits this count
  const startIdx = ROUND_DEFINITIONS.findIndex((r) => r.teams <= count);
  if (startIdx === -1) return [ROUND_DEFINITIONS[ROUND_DEFINITIONS.length - 1]];
  return ROUND_DEFINITIONS.slice(startIdx);
};

/**
 * generateKnockoutBracket
 * Creates knockout_rounds and knockout_matches rows for a league.
 * Seeded by standings — 1st vs last, 2nd vs second-last etc.
 *
 * @param {object} client     — pg transaction client
 * @param {string} leagueId
 * @param {Array}  qualifiers — array of { member_id, position } sorted by position ASC
 */
const generateKnockoutBracket = async (client, leagueId, qualifiers) => {
  const count  = qualifiers.length;
  const rounds = getRoundsForTeamCount(count);

  // Seed the first round — 1 vs N, 2 vs N-1, etc.
  const seeded = [];
  for (let i = 0; i < Math.floor(count / 2); i++) {
    seeded.push({
      home: qualifiers[i],
      away: qualifiers[count - 1 - i],
    });
  }

  // ── Insert rounds ──
  for (const roundDef of rounds) {
    await client.query(
      `INSERT INTO knockout_rounds (league_id, round_key, round_name, round_order, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (league_id, round_key) DO NOTHING`,
      [
        leagueId,
        roundDef.key,
        roundDef.name,
        roundDef.order,
        roundDef.key === rounds[0].key ? 'active' : 'upcoming',
      ]
    );
  }

  // ── Insert first round matches with seeded teams ──
  const firstRoundResult = await client.query(
    `SELECT id FROM knockout_rounds WHERE league_id = $1 AND round_key = $2`,
    [leagueId, rounds[0].key]
  );

  const firstRoundId = firstRoundResult.rows[0].id;

  for (let i = 0; i < seeded.length; i++) {
    await client.query(
      `INSERT INTO knockout_matches
         (round_id, league_id, match_number, home_member_id, away_member_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        firstRoundId,
        leagueId,
        i + 1,
        seeded[i].home.member_id,
        seeded[i].away.member_id,
      ]
    );
  }

  // ── Insert placeholder matches for subsequent rounds (no teams yet) ──
  for (let r = 1; r < rounds.length; r++) {
    const roundResult = await client.query(
      `SELECT id FROM knockout_rounds WHERE league_id = $1 AND round_key = $2`,
      [leagueId, rounds[r].key]
    );

    const roundId     = roundResult.rows[0].id;
    const matchCount  = Math.pow(2, rounds.length - 1 - r);   // halves each round

    for (let m = 0; m < matchCount; m++) {
      await client.query(
        `INSERT INTO knockout_matches (round_id, league_id, match_number)
         VALUES ($1, $2, $3)`,
        [roundId, leagueId, m + 1]
      );
    }
  }
};

/**
 * advanceWinners
 * After all matches in a round are approved, populates
 * the next round's matches with the winners.
 * If the final is complete, marks the league as completed.
 *
 * @param {object} client
 * @param {string} leagueId
 * @param {string} completedRoundId
 */
const advanceWinners = async (client, leagueId, completedRoundId) => {

  // ── Get the completed round ──
  const roundResult = await client.query(
    `SELECT * FROM knockout_rounds WHERE id = $1`,
    [completedRoundId]
  );

  const currentRound = roundResult.rows[0];

  // ── Mark current round as completed ──
  await client.query(
    `UPDATE knockout_rounds SET status = 'completed' WHERE id = $1`,
    [completedRoundId]
  );

  // ── Get all winners from this round ──
  const winnersResult = await client.query(
    `SELECT winner_member_id, match_number
     FROM knockout_matches
     WHERE round_id = $1
     ORDER BY match_number ASC`,
    [completedRoundId]
  );

  const winners = winnersResult.rows.map((r) => r.winner_member_id);

  // ── If this was the final — declare champion ──
  if (currentRound.round_key === 'final') {
    await client.query(
      `UPDATE leagues SET status = 'completed', winner_id = $1, completed_at = NOW()
       WHERE id = $2`,
      [winners[0], leagueId]
    );
    return;
  }

  // ── Find next round ──
  const nextRoundResult = await client.query(
    `SELECT id FROM knockout_rounds
     WHERE league_id = $1 AND round_order = $2`,
    [leagueId, currentRound.round_order + 1]
  );

  if (nextRoundResult.rows.length === 0) return;

  const nextRoundId = nextRoundResult.rows[0].id;

  // ── Activate next round ──
  await client.query(
    `UPDATE knockout_rounds SET status = 'active' WHERE id = $1`,
    [nextRoundId]
  );

  // ── Assign winners to next round matches in order ──
  // Match 1 winner → next match 1 home
  // Match 2 winner → next match 1 away
  // Match 3 winner → next match 2 home, etc.
  for (let i = 0; i < winners.length; i += 2) {
    const matchNumber = Math.floor(i / 2) + 1;
    await client.query(
      `UPDATE knockout_matches
       SET home_member_id = $1, away_member_id = $2
       WHERE round_id = $3 AND match_number = $4`,
      [winners[i], winners[i + 1] || null, nextRoundId, matchNumber]
    );
  }
};

module.exports = { generateKnockoutBracket, advanceWinners, getRoundsForTeamCount };