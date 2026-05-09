/**
 * calculatePoints
 * Returns points, result char and goal values for a single match side.
 *
 * @param {number} goalsFor
 * @param {number} goalsAgainst
 * @returns {{ points: number, result: 'W'|'D'|'L', goalsFor: number, goalsAgainst: number }}
 */
const calculatePoints = (goalsFor, goalsAgainst) => {
  if (goalsFor > goalsAgainst) return { points: 3, result: 'W', goalsFor, goalsAgainst };
  if (goalsFor < goalsAgainst) return { points: 0, result: 'L', goalsFor, goalsAgainst };
  return { points: 1, result: 'D', goalsFor, goalsAgainst };
};

/**
 * sortStandings
 * Sorts an array of standing objects by:
 *   1. Points (desc)
 *   2. Goal difference (desc)
 *   3. Goals for (desc)
 *   4. Team name (asc) — alphabetical as final tiebreaker
 *
 * @param {Array} standings
 * @returns {Array} sorted standings with position assigned
 */
const sortStandings = (standings) => {
  const sorted = [...standings].sort((a, b) => {
    // 1. Points
    if (b.points !== a.points) return b.points - a.points;
    // 2. Goal difference
    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
    // 3. Goals for
    if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
    // 4. Alphabetical team name
    return (a.team_name || '').localeCompare(b.team_name || '');
  });

  // Assign positions
  return sorted.map((row, idx) => ({ ...row, position: idx + 1 }));
};

/**
 * appendForm
 * Appends a result character to a form string, keeping only the last 5.
 *
 * @param {string} currentForm  e.g. 'WWDL'
 * @param {string} result       'W' | 'D' | 'L'
 * @returns {string}            e.g. 'WWDLW' (max 5 chars)
 */
const appendForm = (currentForm = '', result) => {
  return (currentForm + result).slice(-5);
};

module.exports = { calculatePoints, sortStandings, appendForm };