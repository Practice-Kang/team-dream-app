import type { Attendee, Match, QueuedMatch, SessionState } from "./domain";

type MatchLike = Pick<Match | QueuedMatch, "teamA" | "teamB">;

export function isForbiddenThreeToOneGenderCount(maleCount: number, femaleCount: number): boolean {
  return (maleCount === 3 && femaleCount === 1) || (maleCount === 1 && femaleCount === 3);
}

export function createsForbiddenThreeToOneMixedRemainder(maleCount: number, femaleCount: number): boolean {
  const maleRemainder = maleCount % 4;
  const femaleRemainder = femaleCount % 4;

  return maleRemainder + femaleRemainder === 4 && isForbiddenThreeToOneGenderCount(maleRemainder, femaleRemainder);
}

export function isForbiddenThreeToOnePlayers(players: Array<Pick<Attendee, "gender">>): boolean {
  if (players.length !== 4) return false;

  const maleCount = players.filter((player) => player.gender === "남").length;
  const femaleCount = players.filter((player) => player.gender === "여").length;

  return isForbiddenThreeToOneGenderCount(maleCount, femaleCount);
}

export function playersFromMatch<T extends MatchLike>(match: T): Attendee[] {
  return [...match.teamA.players, ...match.teamB.players];
}

export function isForbiddenThreeToOneMatch(match: MatchLike): boolean {
  return isForbiddenThreeToOnePlayers(playersFromMatch(match));
}

export function hasForbiddenThreeToOnePendingMatch(state: Pick<SessionState, "courts" | "upcomingMatches">): boolean {
  return (
    state.upcomingMatches.some(isForbiddenThreeToOneMatch) ||
    state.courts.some(
      (court) => court.status !== "inProgress" && Boolean(court.match) && isForbiddenThreeToOneMatch(court.match!),
    )
  );
}

export function releaseForbiddenThreeToOnePendingMatches(state: SessionState): void {
  const releasedPlayers: Attendee[] = [];

  state.courts = state.courts.map((court) => {
    if (court.status === "inProgress" || !court.match || !isForbiddenThreeToOneMatch(court.match)) {
      return court;
    }

    releasedPlayers.push(...playersFromMatch(court.match));

    return {
      ...court,
      status: "empty",
      match: null,
      assignedAt: null,
      startedAt: null,
    };
  });

  const validUpcomingMatches: QueuedMatch[] = [];
  for (const match of state.upcomingMatches) {
    if (isForbiddenThreeToOneMatch(match)) {
      releasedPlayers.push(...playersFromMatch(match));
    } else {
      validUpcomingMatches.push(match);
    }
  }

  state.upcomingMatches = validUpcomingMatches;
  if (releasedPlayers.length > 0) {
    state.waitingQueue = [...releasedPlayers, ...state.waitingQueue];
  }
}
