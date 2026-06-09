import { effectiveGamesPlayed } from "@/shared/domain";
import type { Attendee, Gender, Match, PlayerRoundStats, Round, Team } from "@/shared/domain";
import { createsForbiddenThreeToOneMixedRemainder, isForbiddenThreeToOnePlayers } from "@/shared/matchPolicy";

export interface GenerateRoundOptions {
  attendees: Attendee[];
  courtCount: number;
  stats?: Record<string, PlayerRoundStats>;
  seed?: string;
  preserveOrder?: boolean;
}

interface RankedAttendee {
  attendee: Attendee;
  rank: number;
}

interface GenderUsePlan {
  maleCount: number;
  femaleCount: number;
  gameCount: number;
  score: number;
  rankPenalty: number;
}

export function generateRound(options: GenerateRoundOptions): Round {
  const courtCount = Math.max(0, Math.floor(options.courtCount));
  const gamesPerRound = Math.min(courtCount, Math.floor(options.attendees.length / 4));

  const ordered = [...options.attendees]
    .map((attendee, index) => ({ attendee, index }))
    .sort((a, b) => {
        const selectionScoreDiff = playerSelectionScore(b.attendee, options.stats) - playerSelectionScore(a.attendee, options.stats);
        if (selectionScoreDiff !== 0) return selectionScoreDiff;

        if (options.preserveOrder) {
          return a.index - b.index;
        }

        const seededDiff = seededRank(a.attendee.id, options.seed) - seededRank(b.attendee.id, options.seed);
        if (seededDiff !== 0) return seededDiff;

        return a.attendee.name.localeCompare(b.attendee.name, "ko");
      })
    .map(({ attendee }) => attendee);

  const { groups, waiting } = buildGenderAwareGroups(ordered, gamesPerRound);
  const matches: Match[] = [];

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const [teamA, teamB] = buildBalancedTeams(group);

    matches.push({
      id: `${Date.now()}-${options.seed || "round"}-${index + 1}`,
      courtNumber: index + 1,
      teamA,
      teamB,
    });
  }

  return {
    id: `${Date.now()}-${options.seed || "round"}`,
    matches,
    waiting,
    generatedAt: new Date().toISOString(),
  };
}

function buildGenderAwareGroups(ordered: Attendee[], gamesPerRound: number): { groups: Attendee[][]; waiting: Attendee[] } {
  if (gamesPerRound <= 0) {
    return { groups: [], waiting: ordered };
  }

  const ranked = ordered.map((attendee, rank) => ({ attendee, rank }));
  const males = ranked.filter((player) => player.attendee.gender === "남");
  const females = ranked.filter((player) => player.attendee.gender === "여");
  const plan = chooseGenderUsePlan(males, females, gamesPerRound);
  if (!plan) {
    return { groups: [], waiting: ordered };
  }

  const selectedMales = males.slice(0, plan.maleCount);
  const selectedFemales = females.slice(0, plan.femaleCount);
  const selectedIds = new Set([...selectedMales, ...selectedFemales].map((player) => player.attendee.id));
  const waiting = ordered.filter((attendee) => !selectedIds.has(attendee.id));

  return {
    groups: buildGroupsFromSelectedPlayers(selectedMales, selectedFemales),
    waiting,
  };
}

function chooseGenderUsePlan(males: RankedAttendee[], females: RankedAttendee[], gamesPerRound: number): GenderUsePlan | null {
  let bestPlan: GenderUsePlan | null = null;

  for (let gameCount = gamesPerRound; gameCount >= 1; gameCount -= 1) {
    const playersNeeded = gameCount * 4;
    const minMaleCount = Math.max(0, playersNeeded - females.length);
    const maxMaleCount = Math.min(males.length, playersNeeded);

    for (let maleCount = minMaleCount; maleCount <= maxMaleCount; maleCount += 1) {
      const femaleCount = playersNeeded - maleCount;
      if (femaleCount < 0 || femaleCount > females.length) continue;
      if (createsForbiddenThreeToOneMixedRemainder(maleCount, femaleCount)) continue;

      const sameGenderGames = Math.floor(maleCount / 4) + Math.floor(femaleCount / 4);
      const mixedGames = gameCount - sameGenderGames;
      const rankPenalty = sumRanks(males, maleCount) + sumRanks(females, femaleCount);
      const strandedPenalty =
        strandedSmallGenderPenalty(males.length, maleCount) + strandedSmallGenderPenalty(females.length, femaleCount);
      const score = gameCount * 10000 + sameGenderGames * 1000 - mixedGames * 100 - strandedPenalty - rankPenalty * 0.01;
      const plan = { maleCount, femaleCount, gameCount, score, rankPenalty };

      if (!bestPlan || isBetterGenderUsePlan(plan, bestPlan)) {
        bestPlan = plan;
      }
    }
  }

  return bestPlan;
}

function isBetterGenderUsePlan(candidate: GenderUsePlan, current: GenderUsePlan): boolean {
  const scoreDiff = candidate.score - current.score;
  if (Math.abs(scoreDiff) > 0.0001) return scoreDiff > 0;

  if (candidate.rankPenalty !== current.rankPenalty) {
    return candidate.rankPenalty < current.rankPenalty;
  }

  return Math.abs(candidate.maleCount - candidate.femaleCount) < Math.abs(current.maleCount - current.femaleCount);
}

function sumRanks(players: RankedAttendee[], count: number): number {
  return players.slice(0, count).reduce((sum, player) => sum + player.rank, 0);
}

function strandedSmallGenderPenalty(totalCount: number, selectedCount: number): number {
  if (totalCount > 0 && totalCount < 4 && selectedCount === 0) {
    return totalCount * 1200;
  }

  return 0;
}

function buildGroupsFromSelectedPlayers(selectedMales: RankedAttendee[], selectedFemales: RankedAttendee[]): Attendee[][] {
  const groups: RankedAttendee[][] = [];
  const maleSameGroupCount = Math.floor(selectedMales.length / 4);
  const femaleSameGroupCount = Math.floor(selectedFemales.length / 4);
  const maleSamePlayers = selectedMales.slice(0, maleSameGroupCount * 4);
  const femaleSamePlayers = selectedFemales.slice(0, femaleSameGroupCount * 4);

  groups.push(...dealSameGenderGroups(maleSamePlayers, maleSameGroupCount));
  groups.push(...dealSameGenderGroups(femaleSamePlayers, femaleSameGroupCount));

  const mixedGroup = [
    ...selectedMales.slice(maleSameGroupCount * 4),
    ...selectedFemales.slice(femaleSameGroupCount * 4),
  ].sort((a, b) => a.rank - b.rank);
  if (mixedGroup.length > 0 && !isForbiddenThreeToOnePlayers(mixedGroup.map((player) => player.attendee))) {
    groups.push(mixedGroup);
  }

  return groups
    .filter((group) => group.length === 4)
    .sort((a, b) => groupRank(a) - groupRank(b))
    .map((group) => group.map((player) => player.attendee));
}

function dealSameGenderGroups(players: RankedAttendee[], groupCount: number): RankedAttendee[][] {
  if (groupCount <= 0) return [];

  const groups: RankedAttendee[][] = Array.from({ length: groupCount }, () => []);

  players.forEach((player, index) => {
    groups[Math.floor(index / 2) % groupCount].push(player);
  });

  return groups;
}

function groupRank(group: RankedAttendee[]): number {
  return group.reduce((sum, player) => sum + player.rank, 0) / group.length;
}

function playerSelectionScore(attendee: Attendee, stats: Record<string, PlayerRoundStats> | undefined): number {
  const playerStats = stats?.[attendee.id];
  const frequencyAdjustedGamesPenalty = effectiveGamesPlayed(attendee) * 12;

  if (!playerStats) return -frequencyAdjustedGamesPenalty;

  return (
    playerStats.waits * 10 -
    frequencyAdjustedGamesPenalty -
    (playerStats.playedPreviousRound ? 20 : 0)
  );
}

export function buildBalancedTeams(players: Attendee[]): [Team, Team] {
  const candidates = [
    [
      [players[0], players[1]],
      [players[2], players[3]],
    ],
    [
      [players[0], players[2]],
      [players[1], players[3]],
    ],
    [
      [players[0], players[3]],
      [players[1], players[2]],
    ],
  ]
    .map(([teamA, teamB]) => ({
      teamA: teamA.filter(Boolean),
      teamB: teamB.filter(Boolean),
    }))
    .filter((candidate) => candidate.teamA.length === 2 && candidate.teamB.length === 2);

  const best = candidates.sort((a, b) => {
    const scoreDiff = teamSplitScore(a.teamA, a.teamB) - teamSplitScore(b.teamA, b.teamB);
    if (scoreDiff !== 0) return scoreDiff;

    return teamSplitKey(a.teamA, a.teamB).localeCompare(teamSplitKey(b.teamA, b.teamB), "ko");
  })[0];

  return [{ players: best?.teamA ?? [] }, { players: best?.teamB ?? [] }];
}

function scoreOf(attendee: Attendee): number {
  return attendee.skillScore ?? 50;
}

function teamSplitScore(teamA: Attendee[], teamB: Attendee[]): number {
  const genderCompositionPenalty =
    Math.abs(countGender(teamA, "남") - countGender(teamB, "남")) +
    Math.abs(countGender(teamA, "여") - countGender(teamB, "여"));

  return (
    genderCompositionPenalty * 100 +
    genderSkillDiff(teamA, teamB, "남") +
    genderSkillDiff(teamA, teamB, "여") +
    totalSkillDiff(teamA, teamB)
  );
}

function totalSkillDiff(teamA: Attendee[], teamB: Attendee[]): number {
  return Math.abs(totalScore(teamA) - totalScore(teamB));
}

function totalScore(players: Attendee[]): number {
  return players.reduce((sum, player) => sum + scoreOf(player), 0);
}

function genderSkillDiff(teamA: Attendee[], teamB: Attendee[], gender: Gender): number {
  const teamAScores = teamA.filter((player) => player.gender === gender).map(scoreOf);
  const teamBScores = teamB.filter((player) => player.gender === gender).map(scoreOf);

  if (teamAScores.length === 0 || teamBScores.length === 0) return 0;

  return Math.abs(average(teamAScores) - average(teamBScores));
}

function countGender(players: Attendee[], gender: Gender): number {
  return players.filter((player) => player.gender === gender).length;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function teamSplitKey(teamA: Attendee[], teamB: Attendee[]): string {
  return [teamA, teamB]
    .map((team) => team.map((player) => player.name).sort((a, b) => a.localeCompare(b, "ko")).join("+"))
    .sort((a, b) => a.localeCompare(b, "ko"))
    .join("|");
}

function seededRank(id: string, seed = ""): number {
  const text = `${seed}:${id}`;
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash;
}
