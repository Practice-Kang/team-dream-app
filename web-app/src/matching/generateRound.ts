import { effectiveGamesPlayed } from "@/shared/domain";
import type { Attendee, CompanionPair, Gender, Match, PlayerRoundStats, Round, Team } from "@/shared/domain";
import { createsForbiddenThreeToOneMixedRemainder, isForbiddenThreeToOnePlayers } from "@/shared/matchPolicy";

export interface GenerateRoundOptions {
  attendees: Attendee[];
  courtCount: number;
  stats?: Record<string, PlayerRoundStats>;
  seed?: string;
  preserveOrder?: boolean;
  companionPairs?: CompanionPair[];
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

type RoundGroups = { groups: Attendee[][]; waiting: Attendee[] };

type PlayerLocation =
  | {
      kind: "group";
      groupIndex: number;
    }
  | {
      kind: "waiting";
      index: number;
    };

export function generateRound(options: GenerateRoundOptions): Round {
  const courtCount = Math.max(0, Math.floor(options.courtCount));
  const activeAttendees = options.attendees.filter((attendee) => !attendee.isDisabled);
  const companionPairs = activeCompanionPairs(options.companionPairs ?? [], activeAttendees);
  const gamesPerRound = Math.min(courtCount, Math.floor(activeAttendees.length / 4));

  const rankedAttendees = activeAttendees
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
  const ordered = groupCompanionsInOrder(rankedAttendees, companionPairs);

  const { groups, waiting } = repairCompanionGroups(buildGenderAwareGroups(ordered, gamesPerRound), companionPairs);
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

function activeCompanionPairs(pairs: CompanionPair[], attendees: Attendee[]): CompanionPair[] {
  const attendeeIds = new Set(attendees.map((attendee) => attendee.id));
  const usedPlayerIds = new Set<string>();

  return pairs.filter((pair) => {
    if (pair.playerAId === pair.playerBId) return false;
    if (!attendeeIds.has(pair.playerAId) || !attendeeIds.has(pair.playerBId)) return false;
    if (usedPlayerIds.has(pair.playerAId) || usedPlayerIds.has(pair.playerBId)) return false;

    usedPlayerIds.add(pair.playerAId);
    usedPlayerIds.add(pair.playerBId);
    return true;
  });
}

function groupCompanionsInOrder(ordered: Attendee[], pairs: CompanionPair[]): Attendee[] {
  if (pairs.length === 0) return ordered;

  const attendeesById = new Map(ordered.map((attendee) => [attendee.id, attendee]));
  const pairByPlayerId = companionPairByPlayerId(pairs);
  const seenIds = new Set<string>();
  const companionAwareOrder: Attendee[] = [];

  ordered.forEach((attendee) => {
    if (seenIds.has(attendee.id)) return;

    const pair = pairByPlayerId.get(attendee.id);
    const partner = pair ? attendeesById.get(otherCompanionId(pair, attendee.id)) : null;

    companionAwareOrder.push(attendee);
    seenIds.add(attendee.id);

    if (partner && !seenIds.has(partner.id)) {
      companionAwareOrder.push(partner);
      seenIds.add(partner.id);
    }
  });

  return companionAwareOrder;
}

function repairCompanionGroups(roundGroups: RoundGroups, pairs: CompanionPair[]): RoundGroups {
  if (pairs.length === 0) return roundGroups;

  const groups = roundGroups.groups.map((group) => [...group]);
  const waiting = [...roundGroups.waiting];
  const pairByPlayerId = companionPairByPlayerId(pairs);

  pairs.forEach((pair) => {
    const playerALocation = findPlayerLocation(groups, waiting, pair.playerAId);
    const playerBLocation = findPlayerLocation(groups, waiting, pair.playerBId);
    if (!playerALocation || !playerBLocation) return;

    if (
      playerALocation.kind === "group" &&
      playerBLocation.kind === "group" &&
      playerALocation.groupIndex === playerBLocation.groupIndex
    ) {
      return;
    }

    if (playerALocation.kind === "group" && playerBLocation.kind === "waiting") {
      tryMoveWaitingCompanionIntoGroup(
        groups,
        waiting,
        playerALocation.groupIndex,
        playerBLocation.index,
        pair.playerAId,
        pairByPlayerId,
      );
      return;
    }

    if (playerALocation.kind === "waiting" && playerBLocation.kind === "group") {
      tryMoveWaitingCompanionIntoGroup(
        groups,
        waiting,
        playerBLocation.groupIndex,
        playerALocation.index,
        pair.playerBId,
        pairByPlayerId,
      );
      return;
    }

    if (playerALocation.kind === "group" && playerBLocation.kind === "group") {
      trySwapCompanionIntoGroup(
        groups,
        playerALocation.groupIndex,
        playerBLocation.groupIndex,
        pair.playerAId,
        pair.playerBId,
        pairByPlayerId,
      ) ||
        trySwapCompanionIntoGroup(
          groups,
          playerBLocation.groupIndex,
          playerALocation.groupIndex,
          pair.playerBId,
          pair.playerAId,
          pairByPlayerId,
        );
    }
  });

  return { groups, waiting };
}

function tryMoveWaitingCompanionIntoGroup(
  groups: Attendee[][],
  waiting: Attendee[],
  groupIndex: number,
  waitingIndex: number,
  fixedPlayerId: string,
  pairByPlayerId: Map<string, CompanionPair>,
): boolean {
  const group = groups[groupIndex];
  const waitingPlayer = waiting[waitingIndex];
  if (!group || !waitingPlayer) return false;

  for (let playerIndex = 0; playerIndex < group.length; playerIndex += 1) {
    const candidate = group[playerIndex];
    if (candidate.id === fixedPlayerId || !canMovePlayerFromGroup(candidate, group, pairByPlayerId)) continue;

    const nextGroup = group.map((player, index) => (index === playerIndex ? waitingPlayer : player));
    if (!isValidAutoMatchGroup(nextGroup)) continue;

    groups[groupIndex] = nextGroup;
    waiting[waitingIndex] = candidate;
    return true;
  }

  return false;
}

function trySwapCompanionIntoGroup(
  groups: Attendee[][],
  targetGroupIndex: number,
  sourceGroupIndex: number,
  fixedPlayerId: string,
  movingPlayerId: string,
  pairByPlayerId: Map<string, CompanionPair>,
): boolean {
  const targetGroup = groups[targetGroupIndex];
  const sourceGroup = groups[sourceGroupIndex];
  const movingPlayerIndex = sourceGroup?.findIndex((player) => player.id === movingPlayerId) ?? -1;
  if (!targetGroup || !sourceGroup || movingPlayerIndex < 0) return false;

  const movingPlayer = sourceGroup[movingPlayerIndex];

  for (let candidateIndex = 0; candidateIndex < targetGroup.length; candidateIndex += 1) {
    const candidate = targetGroup[candidateIndex];
    if (candidate.id === fixedPlayerId || !canMovePlayerFromGroup(candidate, targetGroup, pairByPlayerId)) continue;

    const nextTargetGroup = targetGroup.map((player, index) => (index === candidateIndex ? movingPlayer : player));
    const nextSourceGroup = sourceGroup.map((player, index) => (index === movingPlayerIndex ? candidate : player));
    if (!isValidAutoMatchGroup(nextTargetGroup) || !isValidAutoMatchGroup(nextSourceGroup)) continue;

    groups[targetGroupIndex] = nextTargetGroup;
    groups[sourceGroupIndex] = nextSourceGroup;
    return true;
  }

  return false;
}

function canMovePlayerFromGroup(
  player: Attendee,
  group: Attendee[],
  pairByPlayerId: Map<string, CompanionPair>,
): boolean {
  const pair = pairByPlayerId.get(player.id);
  if (!pair) return true;

  return !group.some((candidate) => candidate.id === otherCompanionId(pair, player.id));
}

function findPlayerLocation(groups: Attendee[][], waiting: Attendee[], playerId: string): PlayerLocation | null {
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const playerIndex = groups[groupIndex].findIndex((player) => player.id === playerId);
    if (playerIndex >= 0) {
      return {
        kind: "group",
        groupIndex,
      };
    }
  }

  const waitingIndex = waiting.findIndex((player) => player.id === playerId);
  return waitingIndex >= 0 ? { kind: "waiting", index: waitingIndex } : null;
}

function companionPairByPlayerId(pairs: CompanionPair[]): Map<string, CompanionPair> {
  const pairByPlayerId = new Map<string, CompanionPair>();

  pairs.forEach((pair) => {
    pairByPlayerId.set(pair.playerAId, pair);
    pairByPlayerId.set(pair.playerBId, pair);
  });

  return pairByPlayerId;
}

function otherCompanionId(pair: CompanionPair, playerId: string): string {
  return pair.playerAId === playerId ? pair.playerBId : pair.playerAId;
}

function isValidAutoMatchGroup(group: Attendee[]): boolean {
  return group.length === 4 && !isForbiddenThreeToOnePlayers(group);
}

function buildGenderAwareGroups(ordered: Attendee[], gamesPerRound: number): RoundGroups {
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

  return [...players]
    .sort((a, b) => {
      const skillDiff = scoreOf(b.attendee) - scoreOf(a.attendee);
      if (skillDiff !== 0) return skillDiff;

      return a.rank - b.rank;
    })
    .reduce<RankedAttendee[][]>((groups, player, index) => {
      const groupIndex = Math.floor(index / 4);
      groups[groupIndex] = [...(groups[groupIndex] ?? []), player];
      return groups;
    }, []);
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
