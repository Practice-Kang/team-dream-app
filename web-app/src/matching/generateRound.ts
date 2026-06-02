import { effectiveGamesPlayed } from "@/shared/domain";
import type { Attendee, Match, PlayerRoundStats, Round, Team } from "@/shared/domain";

export interface GenerateRoundOptions {
  attendees: Attendee[];
  courtCount: number;
  stats?: Record<string, PlayerRoundStats>;
  seed?: string;
}

export function generateRound(options: GenerateRoundOptions): Round {
  const courtCount = Math.max(0, Math.floor(options.courtCount));
  const gamesPerRound = Math.min(courtCount, Math.floor(options.attendees.length / 4));
  const playersPerRound = gamesPerRound * 4;

  const ordered = [...options.attendees].sort((a, b) => {
    const priorityDiff = playerPriority(b, options.stats) - playerPriority(a, options.stats);
    if (priorityDiff !== 0) return priorityDiff;

    const seededDiff = seededRank(a.id, options.seed) - seededRank(b.id, options.seed);
    if (seededDiff !== 0) return seededDiff;

    return a.name.localeCompare(b.name, "ko");
  });

  const playing = ordered.slice(0, playersPerRound);
  const waiting = ordered.slice(playersPerRound);
  const matches: Match[] = [];

  for (let index = 0; index < gamesPerRound; index += 1) {
    const group = playing.slice(index * 4, index * 4 + 4);
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

function playerPriority(attendee: Attendee, stats: Record<string, PlayerRoundStats> | undefined): number {
  const playerStats = stats?.[attendee.id];
  const queueStatusBonus = attendee.queueStatus === "priority" ? 100 : attendee.queueStatus === "hold" ? -1000 : 0;
  const frequencyAdjustedGamesPenalty = effectiveGamesPlayed(attendee) * 12;

  if (!playerStats) return queueStatusBonus - frequencyAdjustedGamesPenalty;

  return (
    queueStatusBonus +
    playerStats.waits * 10 -
    frequencyAdjustedGamesPenalty -
    (playerStats.playedPreviousRound ? 20 : 0)
  );
}

function buildBalancedTeams(players: Attendee[]): [Team, Team] {
  const ordered = [...players].sort((a, b) => {
    const scoreDiff = scoreOf(b) - scoreOf(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.localeCompare(b.name, "ko");
  });

  return [
    { players: [ordered[0], ordered[3]].filter(Boolean) },
    { players: [ordered[1], ordered[2]].filter(Boolean) },
  ];
}

function scoreOf(attendee: Attendee): number {
  return attendee.skillScore ?? 50;
}

function seededRank(id: string, seed = ""): number {
  const text = `${seed}:${id}`;
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash;
}
