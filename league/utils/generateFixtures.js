/**
 * generateFixtures
 * Generates a full round-robin fixture list using the
 * circle/rotation algorithm (Berger tables method).
 *
 * Single round-robin: each pair plays once (N-1 matchdays)
 * Double round-robin: home and away (2*(N-1) matchdays)
 *
 * Returns an array of fixture objects:
 * [{ matchday, homeMemberId, awayMemberId }]
 *
 * @param {string[]} memberIds  Array of league_member UUIDs
 * @param {string}   format     'single' | 'double'
 * @returns {Array}
 */
const generateFixtures = (memberIds, format = 'single') => {
  const teams = [...memberIds];

  // If odd number of teams add a bye (null)
  if (teams.length % 2 !== 0) teams.push(null);

  const n         = teams.length;
  const rounds    = n - 1;
  const perRound  = n / 2;
  const fixtures  = [];

  // Circle rotation — fix first team, rotate the rest
  const rotate = (arr) => {
    const fixed = arr[0];
    const rest  = arr.slice(1);
    return [fixed, rest[rest.length - 1], ...rest.slice(0, rest.length - 1)];
  };

  let current = [...teams];

  for (let round = 0; round < rounds; round++) {
    const matchday = round + 1;

    for (let match = 0; match < perRound; match++) {
      const home = current[match];
      const away = current[n - 1 - match];

      // Skip bye matches (null team)
      if (home !== null && away !== null) {
        fixtures.push({
          matchday,
          homeMemberId: home,
          awayMemberId: away,
        });
      }
    }

    current = rotate(current);
  }

  // Double round-robin — add reverse fixtures as second half of season
  if (format === 'double') {
    const firstHalf = [...fixtures];
    firstHalf.forEach((f) => {
      fixtures.push({
        matchday:     f.matchday + rounds,
        homeMemberId: f.awayMemberId,
        awayMemberId: f.homeMemberId,
      });
    });
  }

  return fixtures;
};

module.exports = generateFixtures;