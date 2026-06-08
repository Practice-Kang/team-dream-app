import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Attendee } from "@/shared/domain";

import { useSessionStore } from "./session";

type MatchLike = { teamA: { players: Attendee[] }; teamB: { players: Attendee[] } };

describe("session store upcoming matches", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("prepares upcoming matches from players not assigned to the current courts", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(16));
    session.assignInitialCourts();

    expect(session.courts.filter((court) => court.match)).toHaveLength(2);
    expect(session.upcomingMatches).toHaveLength(2);
    expect(session.waitingQueue).toHaveLength(0);
  });

  it("assigns the first upcoming match to the court that finishes first", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(16));
    session.assignInitialCourts();

    const firstUpcomingIds = playersOf(session.upcomingMatches[0]);
    session.startCourt(1);
    session.finishCourt(1);

    expect(session.courts[0].status).toBe("assigned");
    expect(playersOf(session.courts[0].match)).toEqual(firstUpcomingIds);
    expect(session.upcomingMatches).toHaveLength(2);
  });

  it("mixes the remaining upcoming groups with finished players in the common 16-player 2-court case", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(16));
    session.assignInitialCourts();

    const finishedGroupKey = groupKey(session.courts[0].match);
    const oldRemainingUpcomingKey = groupKey(session.upcomingMatches[1]);

    session.startCourt(1);
    session.finishCourt(1);

    const nextGroupKeys = session.upcomingMatches.map((match) => groupKey(match));
    expect(nextGroupKeys).not.toContain(finishedGroupKey);
    expect(nextGroupKeys).not.toContain(oldRemainingUpcomingKey);
  });

  it("mixes the remaining upcoming groups with finished players in the common 24-player 3-court case", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(3);
    session.setAttendees(makeAttendees(24));
    session.assignInitialCourts();

    const staleGroupKeys = new Set([
      groupKey(session.courts[0].match),
      groupKey(session.upcomingMatches[1]),
      groupKey(session.upcomingMatches[2]),
    ]);

    session.startCourt(1);
    session.finishCourt(1);

    session.upcomingMatches.forEach((match) => {
      expect(staleGroupKeys.has(groupKey(match))).toBe(false);
    });
  });
});

function playersOf(match: MatchLike | null): string[] {
  if (!match) return [];
  return [...match.teamA.players, ...match.teamB.players].map((player) => player.id);
}

function groupKey(match: MatchLike | null): string {
  return playersOf(match).sort().join("|");
}

function makeAttendees(count: number): Attendee[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `member-${index + 1}`,
    no: index + 1,
    name: `회원${index + 1}`,
    joinedAt: "2026. 1. 1",
    level: "",
    skillScore: 50 + (index % 5),
    gender: index % 2 === 0 ? "남" : "여",
    isStaff: false,
    isExempt: false,
    selectedAt: "2026-06-08T00:00:00.000Z",
    playCount: 0,
    waitCount: 0,
    playFrequencyPreference: "normal",
    queueStatus: "normal",
  }));
}
