import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchTodayAttendees } from "@/services/members";
import type { Attendee } from "@/shared/domain";

import { useSessionStore } from "./session";

vi.mock("@/services/members", () => ({
  fetchTodayAttendees: vi.fn(),
}));

type MatchLike = { teamA: { players: Attendee[] }; teamB: { players: Attendee[] } };
const fetchTodayAttendeesMock = vi.mocked(fetchTodayAttendees);

describe("session store upcoming matches", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fetchTodayAttendeesMock.mockReset();
  });

  it("prepares upcoming matches from players not assigned to the current courts", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(16, "남"));
    session.assignInitialCourts();

    expect(session.courts.filter((court) => court.match)).toHaveLength(2);
    expect(session.upcomingMatches).toHaveLength(2);
    expect(session.waitingQueue).toHaveLength(0);
  });

  it("assigns the first upcoming match to the court that finishes first", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(16, "남"));
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
    session.setAttendees(makeAttendees(16, "남"));
    session.assignInitialCourts();

    const finishedGroupKey = groupKey(session.courts[0].match);
    const oldRemainingUpcomingKey = groupKey(session.upcomingMatches[1]);

    session.startCourt(1);
    session.finishCourt(1);

    const nextGroupKeys = session.upcomingMatches.map((match) => groupKey(match));
    expect(nextGroupKeys).not.toContain(finishedGroupKey);
    expect(nextGroupKeys).not.toContain(oldRemainingUpcomingKey);
  });

  it("rebuilds same-gender queued matches from interleaved player groups", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);
    const oldGroupA = [3, 9, 5, 7].map((no) => makeAttendees(16, "남")[no - 1]);
    const oldGroupB = [10, 16, 12, 14].map((no) => ({
      ...makeAttendees(16, "남")[no - 1],
      playCount: 1,
    }));

    const interleaved = [oldGroupA[0], oldGroupB[0], oldGroupA[1], oldGroupB[1], oldGroupA[2], oldGroupB[2], oldGroupA[3], oldGroupB[3]];

    session.rebuildUpcomingMatchesFromGroups([interleaved]);

    const nextGroupKeys = session.upcomingMatches.map((match) => groupKey(match));

    expect(nextGroupKeys).not.toContain(oldGroupA.map((player) => player.id).sort().join("|"));
    expect(nextGroupKeys).not.toContain(oldGroupB.map((player) => player.id).sort().join("|"));
  });

  it("mixes the remaining upcoming groups with finished players in the common 24-player 3-court case", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(3);
    session.setAttendees(makeAttendees(24, "남"));
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

  it("can reset an active session by reloading today's attendance records", async () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(16));
    session.assignInitialCourts();
    session.startCourt(1);
    session.finishCourt(1);

    expect(session.hasAssignedCourt).toBe(true);
    expect(session.completedGameCount).toBe(1);
    expect(session.upcomingMatches.length).toBeGreaterThan(0);

    fetchTodayAttendeesMock.mockResolvedValue({
      attendees: makeAttendees(4),
      attendanceDate: "2026-06-08",
      attendanceCount: 4,
      membersCount: 4,
      unmatchedNames: [],
      fetchedAt: "2026-06-08T10:00:00.000Z",
    });

    await session.loadTodayAttendees({ resetSession: true });

    expect(session.selectedCount).toBe(4);
    expect(session.hasAssignedCourt).toBe(false);
    expect(session.completedGameCount).toBe(0);
    expect(session.upcomingMatches).toHaveLength(0);
    expect(session.waitingQueue).toHaveLength(0);
  });
});

function playersOf(match: MatchLike | null): string[] {
  if (!match) return [];
  return [...match.teamA.players, ...match.teamB.players].map((player) => player.id);
}

function groupKey(match: MatchLike | null): string {
  return playersOf(match).sort().join("|");
}

function makeAttendees(count: number, gender?: "남" | "여"): Attendee[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `member-${index + 1}`,
    no: index + 1,
    name: `회원${index + 1}`,
    joinedAt: "2026. 1. 1",
    level: "",
    skillScore: 50 + (index % 5),
    gender: gender ?? (index % 2 === 0 ? "남" : "여"),
    isStaff: false,
    isExempt: false,
    selectedAt: "2026-06-08T00:00:00.000Z",
    playCount: 0,
    waitCount: 0,
    playFrequencyPreference: "normal",
    queueStatus: "normal",
  }));
}
