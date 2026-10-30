// Run via npm run test:schedule (requires globally available TypeScript compiler).
const assert = require('node:assert/strict');
const {
  createFixtures, countPairs, maxRounds, checkFixtureFairness,
  calculateStandings, isCounted, parseScore,
} = require('../.league-test-build/league.js');

for (let teamCount = 2; teamCount <= 5; teamCount++) {
  const full = createFixtures(teamCount, maxRounds(teamCount));
  assert.ok(full.length <= 50);
  assert.equal(full.length, maxRounds(teamCount) * countPairs(teamCount));
  for (let round = 1; round <= maxRounds(teamCount); round++) {
    const prefix = full.slice(0, round * countPairs(teamCount));
    const fairness = checkFixtureFairness(teamCount, prefix);
    assert.equal(fairness.balancedTeamGames, true, `Uneven games for ${teamCount} teams after round ${round}`);
    assert.equal(fairness.balancedPairings, true, `Uneven pairings for ${teamCount} teams after round ${round}`);
    assert.ok(fairness.perTeam.every((v) => v === round * (teamCount - 1)));
  }
  if (teamCount === 5) {
    assert.equal(full.length, 50);
    assert.equal(checkFixtureFairness(teamCount, full).backToBack, 0);
    for (let k = 5; k <= 50; k += 5) {
      const counts = Array.from({ length: 5 }, () => 0);
      full.slice(0, k).forEach((f) => { counts[f.home-1]++; counts[f.away-1]++ });
      assert.equal(new Set(counts).size, 1, `Uneven 5-match checkpoint at match ${k}`);
    }
  }
}

// First 30 fixtures must remain identical to the supplied PDF schedule (with corrected match 20).
const original30 = [
  '1-2','3-4','1-5','2-3','4-5','1-3','2-4','3-5','1-4','2-5',
  '3-4','1-2','4-5','2-3','1-5','2-4','1-3','2-5','1-4','3-5',
  '1-2','3-4','1-5','2-3','4-5','1-3','2-4','3-5','1-4','2-5',
];
assert.deepEqual(createFixtures(5, 5).slice(0, 30).map(f => `${f.home}-${f.away}`), original30);
const allDraws = Object.fromEntries(createFixtures(5, 5).map(f => [f.id, {
  homeScore: '0', awayScore: '0', completed: true
}]));
const drawnStandings = calculateStandings(5, createFixtures(5, 5), allDraws);
assert.ok(drawnStandings.every(t => t.played === 20 && t.draws === 20 && t.points === 20 && t.goalDifference === 0));

const fixtures = createFixtures(5, 1);
const results = {
  1: { homeScore: '2', awayScore: '1', completed: true }, // 1 beats 2
  2: { homeScore: '0', awayScore: '0', completed: true }, // 3 draws 4
  3: { homeScore: '8', awayScore: '0', completed: false }, // excluded
  4: { homeScore: '', awayScore: '1', completed: true }, // excluded
};
const standings = calculateStandings(5, fixtures, results);
assert.equal(standings.find(x => x.team === 1).points, 3);
assert.equal(standings.find(x => x.team === 2).points, 0);
assert.equal(standings.find(x => x.team === 3).points, 1);
assert.equal(standings.find(x => x.team === 4).points, 1);
assert.equal(standings.reduce((s, x) => s + x.played, 0), 4);
assert.equal(parseScore(''), null);
assert.equal(parseScore('1.5'), null);
assert.equal(parseScore('100'), null);
assert.equal(parseScore('0'), 0);
assert.equal(isCounted({ homeScore:'0',awayScore:'0',completed:true }), true);
console.log('PASS: 2-5 teams, all complete round checkpoints, 5-team 50-match rest guarantee, scoring rules, tie rules');
