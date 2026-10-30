/** Round-robin fixture and standings logic. No browser or React dependencies. */

export const MAX_TEAMS = 5;
export const MAX_MATCHES = 50;
export const MIN_TEAMS = 2;

export type Fixture = {
  id: number;
  round: number;
  home: number;
  away: number;
};

export type MatchResult = {
  homeScore: string;
  awayScore: string;
  completed: boolean;
};

export type Standing = {
  team: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  rank: number;
};

export const TEAM_COLORS = [
  { solid: "#ee6352", bg: "#fff0ed", text: "#a73831", ring: "#ffd4cc" },
  { solid: "#548eda", bg: "#edf4ff", text: "#285a99", ring: "#cde0ff" },
  { solid: "#c36ad0", bg: "#fbedf9", text: "#90408f", ring: "#f1d2f4" },
  { solid: "#f4c94d", bg: "#fff9df", text: "#846013", ring: "#f4e5ac" },
  { solid: "#83c878", bg: "#eaf8e8", text: "#336f3e", ring: "#d4efcf" },
] as const;

/** Original match 1-10 sequence; verified: each pair exactly once. */
const FIVE_TEAM_A: ReadonlyArray<readonly [number, number]> = [
  [1, 2], [3, 4], [1, 5], [2, 3], [4, 5],
  [1, 3], [2, 4], [3, 5], [1, 4], [2, 5],
];

/** Original match 11-20 sequence; the last/first match of adjoining rounds do not overlap. */
const FIVE_TEAM_B: ReadonlyArray<readonly [number, number]> = [
  [3, 4], [1, 2], [4, 5], [2, 3], [1, 5],
  [2, 4], [1, 3], [2, 5], [1, 4], [3, 5],
];

const OTHER_ROUNDS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  2: [[1, 2]],
  3: [[1, 2], [1, 3], [2, 3]],
  4: [[1, 2], [3, 4], [1, 3], [2, 4], [1, 4], [2, 3]],
};

export function countPairs(teamCount: number): number {
  return (teamCount * (teamCount - 1)) / 2;
}

export function maxRounds(teamCount: number): number {
  return Math.floor(MAX_MATCHES / countPairs(teamCount));
}

export function createFixtures(teamCount: number, roundCount: number): Fixture[] {
  const count = Math.trunc(teamCount);
  if (!Number.isFinite(count) || count < MIN_TEAMS || count > MAX_TEAMS) {
    throw new Error("Team count must be between 2 and 5.");
  }
  const rounds = Math.trunc(roundCount);
  if (!Number.isFinite(rounds) || rounds < 1 || rounds > maxRounds(count)) {
    throw new Error("Round count must fit within 50 matches.");
  }

  const fixtures: Fixture[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    const pattern = count === 5
      ? (round % 2 === 1 ? FIVE_TEAM_A : FIVE_TEAM_B)
      : OTHER_ROUNDS[count];
    for (const [home, away] of pattern) {
      fixtures.push({ id: fixtures.length + 1, round, home, away });
    }
  }
  return fixtures;
}

export function emptyMatch(): MatchResult {
  return { homeScore: "", awayScore: "", completed: false };
}

export function parseScore(score: unknown): number | null {
  if (typeof score !== "string" || !/^\d{1,2}$/.test(score)) return null;
  const numeric = Number(score);
  return numeric >= 0 && numeric <= 99 ? numeric : null;
}

export function hasValidScore(result: MatchResult | undefined): boolean {
  return !!result && parseScore(result.homeScore) !== null && parseScore(result.awayScore) !== null;
}

export function isCounted(result: MatchResult | undefined): boolean {
  return !!result?.completed && hasValidScore(result);
}

export function calculateStandings(
  teamCount: number,
  fixtures: readonly Fixture[],
  results: Record<number, MatchResult>,
): Standing[] {
  const standings: Standing[] = Array.from({ length: teamCount }, (_, i) => ({
    team: i + 1, played: 0, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, rank: 0,
  }));

  for (const fixture of fixtures) {
    const result = results[fixture.id];
    if (!isCounted(result)) continue;
    const homeScore = parseScore(result.homeScore)!;
    const awayScore = parseScore(result.awayScore)!;
    const home = standings[fixture.home - 1];
    const away = standings[fixture.away - 1];

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.wins += 1; home.points += 3; away.losses += 1;
    } else if (homeScore < awayScore) {
      away.wins += 1; away.points += 3; home.losses += 1;
    } else {
      home.draws += 1; away.draws += 1; home.points += 1; away.points += 1;
    }
  }

  for (const row of standings) row.goalDifference = row.goalsFor - row.goalsAgainst;

  const baseCompare = (a: Standing, b: Standing) =>
    b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor;

  // For an exact tie on points/GD/GF, use a mini-table of head-to-head results.
  // If that too is equal, retain a deterministic team-number order.
  standings.sort((a, b) => baseCompare(a, b) || a.team - b.team);
  const sorted: Standing[] = [];
  for (let i = 0; i < standings.length;) {
    let j = i + 1;
    while (j < standings.length && baseCompare(standings[i], standings[j]) === 0) j++;
    const group = standings.slice(i, j);
    if (group.length > 1) {
      const tiedTeams = new Set(group.map((row) => row.team));
      const headToHead = new Map<number, { points: number; gd: number; gf: number }>();
      group.forEach((row) => headToHead.set(row.team, { points: 0, gd: 0, gf: 0 }));
      for (const fixture of fixtures) {
        if (!tiedTeams.has(fixture.home) || !tiedTeams.has(fixture.away)) continue;
        const result = results[fixture.id];
        if (!isCounted(result)) continue;
        const homeScore = parseScore(result.homeScore)!;
        const awayScore = parseScore(result.awayScore)!;
        const home = headToHead.get(fixture.home)!;
        const away = headToHead.get(fixture.away)!;
        home.gf += homeScore; away.gf += awayScore;
        home.gd += homeScore - awayScore;
        away.gd += awayScore - homeScore;
        if (homeScore > awayScore) home.points += 3;
        else if (homeScore < awayScore) away.points += 3;
        else { home.points += 1; away.points += 1; }
      }
      group.sort((a, b) => {
        const hA = headToHead.get(a.team)!;
        const hB = headToHead.get(b.team)!;
        return hB.points - hA.points || hB.gd - hA.gd || hB.gf - hA.gf || a.team - b.team;
      });
    }
    sorted.push(...group);
    i = j;
  }
  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function checkFixtureFairness(teamCount: number, fixtures: readonly Fixture[]) {
  const perTeam = Array.from({ length: teamCount }, () => 0);
  const perPair = new Map<string, number>();
  let backToBack = 0;
  fixtures.forEach((fixture, index) => {
    perTeam[fixture.home - 1] += 1;
    perTeam[fixture.away - 1] += 1;
    const key = [fixture.home, fixture.away].sort((a, b) => a - b).join("-");
    perPair.set(key, (perPair.get(key) || 0) + 1);
    if (index > 0) {
      const prev = fixtures[index - 1];
      if ([prev.home, prev.away].includes(fixture.home) ||
          [prev.home, prev.away].includes(fixture.away)) backToBack += 1;
    }
  });
  return {
    balancedTeamGames: new Set(perTeam).size <= 1,
    balancedPairings: perPair.size === countPairs(teamCount) && new Set(perPair.values()).size === 1,
    backToBack,
    perTeam,
    perPair,
  };
}

export function completedScoreCount(fixtures: readonly Fixture[], results: Record<number, MatchResult>) {
  return fixtures.filter((f) => isCounted(results[f.id])).length;
}

export function completedMatchCount(fixtures: readonly Fixture[], results: Record<number, MatchResult>) {
  return fixtures.filter((f) => results[f.id]?.completed === true).length;
}
