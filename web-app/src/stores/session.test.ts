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

  it("prepares only the first upcoming match from players not assigned to the current courts", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(16, "남"));
    session.assignInitialCourts();

    expect(session.courts.filter((court) => court.match)).toHaveLength(2);
    expect(session.upcomingMatches).toHaveLength(1);
    expect(session.waitingQueue).toHaveLength(4);
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
    expect(session.upcomingMatches).toHaveLength(1);
    expect(session.waitingQueue).toHaveLength(4);
  });

  it("can undo an accidental court start", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(8, "남"));
    session.assignInitialCourts();
    session.startCourt(1);

    expect(session.courts[0].status).toBe("inProgress");
    expect(session.canUndo).toBe(true);

    session.undoLastChange();

    expect(session.courts[0].status).toBe("assigned");
    expect(session.courts[0].startedAt).toBeNull();
  });

  it("can undo an accidental court finish including play counts and queued matches", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(16, "남"));
    session.assignInitialCourts();
    session.startCourt(1);

    const beforeFinishCourtPlayers = playersOf(session.courts[0].match);
    const beforeFinishUpcoming = playersOf(session.upcomingMatches[0]);

    session.finishCourt(1);

    expect(session.completedGameCount).toBe(1);
    expect(playersOf(session.courts[0].match)).toEqual(beforeFinishUpcoming);

    session.undoLastChange();

    expect(session.completedGameCount).toBe(0);
    expect(session.courts[0].status).toBe("inProgress");
    expect(playersOf(session.courts[0].match)).toEqual(beforeFinishCourtPlayers);
    expect(playersOf(session.upcomingMatches[0])).toEqual(beforeFinishUpcoming);
    expect(session.courts[0].match?.teamA.players.every((player) => player.playCount === 0)).toBe(true);
    expect(session.courts[0].match?.teamB.players.every((player) => player.playCount === 0)).toBe(true);
  });

  it("rebuilds one upcoming match from waiting and finished players in the common 16-player 2-court case", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(16, "남"));
    session.assignInitialCourts();

    const finishedGroupKey = groupKey(session.courts[0].match);

    session.startCourt(1);
    session.finishCourt(1);

    const nextGroupKeys = session.upcomingMatches.map((match) => groupKey(match));
    expect(session.upcomingMatches).toHaveLength(1);
    expect(session.waitingQueue).toHaveLength(4);
    expect(nextGroupKeys).not.toContain(finishedGroupKey);
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

    expect(session.upcomingMatches).toHaveLength(1);
    expect(session.waitingQueue).toHaveLength(4);
    expect(nextGroupKeys).not.toContain(oldGroupB.map((player) => player.id).sort().join("|"));
  });

  it("does not rebuild a 3-to-1 upcoming match from uneven idle players", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);
    const idlePlayers = [...makeGenderedAttendees(10, "남", 1), ...makeGenderedAttendees(2, "여", 11)];

    session.rebuildUpcomingMatchesFromGroups([idlePlayers]);

    expect(session.upcomingMatches).toHaveLength(1);
    expect(isThreeToOneMatch(session.upcomingMatches[0])).toBe(false);
    expect(session.waitingQueue).toHaveLength(8);
  });

  it("keeps only one upcoming match in the common 24-player 3-court case", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(3);
    session.setAttendees(makeAttendees(24, "남"));
    session.assignInitialCourts();

    expect(session.upcomingMatches).toHaveLength(1);
    expect(session.waitingQueue).toHaveLength(8);

    const finishedGroupKey = groupKey(session.courts[0].match);

    session.startCourt(1);
    session.finishCourt(1);

    expect(session.upcomingMatches).toHaveLength(1);
    expect(session.waitingQueue).toHaveLength(8);
    expect(groupKey(session.upcomingMatches[0])).not.toBe(finishedGroupKey);
  });

  it("does not replace an assigned court with the upcoming match before play starts", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(3);
    session.setAttendees([...makeGenderedAttendees(13, "남", 1), ...makeGenderedAttendees(11, "여", 14)]);
    session.assignInitialCourts();

    const courtGroups = session.courts.map((court) => groupKey(court.match));
    const sequence = session.matchSequence;

    session.assignSingleCourt(1);

    expect(session.courts.map((court) => groupKey(court.match))).toEqual(courtGroups);
    expect(session.matchSequence).toBe(sequence);
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

function isThreeToOneMatch(match: MatchLike): boolean {
  const players = [...match.teamA.players, ...match.teamB.players];
  const maleCount = players.filter((player) => player.gender === "남").length;
  const femaleCount = players.filter((player) => player.gender === "여").length;

  return (maleCount === 3 && femaleCount === 1) || (maleCount === 1 && femaleCount === 3);
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

function makeGenderedAttendees(count: number, gender: "남" | "여", startNo: number): Attendee[] {
  return Array.from({ length: count }, (_, index) => ({
    ...makeAttendees(1, gender)[0],
    id: `member-${startNo + index}`,
    no: startNo + index,
    name: `회원${startNo + index}`,
    skillScore: 50 + (index % 5),
  }));
}
