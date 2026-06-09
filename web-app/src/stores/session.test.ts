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

  it("adds a guest as a normal-frequency attendee before the first assignment", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(1);
    session.setAttendees(makeAttendees(3, "여"));

    const guest = session.addGuestAttendee({
      name: "  게스트A  ",
      gender: "여",
      skillScore: 88.4,
    });

    expect(guest?.isGuest).toBe(true);
    expect(guest?.name).toBe("게스트A");
    expect(guest?.skillScore).toBe(88);
    expect(guest?.playFrequencyPreference).toBe("normal");
    expect(session.guestCount).toBe(1);
    expect(session.waitingQueue).toHaveLength(0);

    session.assignInitialCourts();

    expect(playersOf(session.courts[0].match)).toContain(guest?.id);
  });

  it("adds a guest to the waiting flow after matches are already planned", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(1);
    session.setAttendees(makeAttendees(7, "남"));
    session.assignInitialCourts();

    expect(session.upcomingMatches).toHaveLength(0);
    expect(session.waitingQueue).toHaveLength(3);

    const guest = session.addGuestAttendee({
      name: "게스트B",
      gender: "남",
      skillScore: 70,
    });

    expect(guest?.isGuest).toBe(true);
    expect(session.upcomingMatches).toHaveLength(1);
    expect(session.waitingQueue).toHaveLength(0);
    expect(playersOf(session.upcomingMatches[0])).toContain(guest?.id);
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

  it("can manually replace an assigned court player with a waiting player and undo it", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(16, "남"));
    session.assignInitialCourts();

    const originalPlayerId = session.courts[0].match?.teamA.players[0].id;
    const replacementPlayer = session.waitingQueue[0];
    const waitingBefore = session.waitingQueue.map((player) => player.id);

    const replaced = session.replaceEditableMatchPlayer(
      { type: "court", courtNumber: 1 },
      { team: "teamA", playerIndex: 0 },
      replacementPlayer.id,
    );

    expect(replaced).toBe(true);
    expect(playersOf(session.courts[0].match)).toContain(replacementPlayer.id);
    expect(playersOf(session.courts[0].match)).not.toContain(originalPlayerId);
    expect(session.waitingQueue[0].id).toBe(originalPlayerId);
    expect(playersOf(session.courts[0].match)).toHaveLength(4);

    session.undoLastChange();

    expect(session.courts[0].match?.teamA.players[0].id).toBe(originalPlayerId);
    expect(session.waitingQueue.map((player) => player.id)).toEqual(waitingBefore);
  });

  it("can manually replace a next match player with a waiting player", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(16, "남"));
    session.assignInitialCourts();

    const originalPlayerId = session.upcomingMatches[0].teamB.players[1].id;
    const replacementPlayer = session.waitingQueue[0];

    const replaced = session.replaceEditableMatchPlayer(
      { type: "upcoming", index: 0 },
      { team: "teamB", playerIndex: 1 },
      replacementPlayer.id,
    );

    expect(replaced).toBe(true);
    expect(playersOf(session.upcomingMatches[0])).toContain(replacementPlayer.id);
    expect(playersOf(session.upcomingMatches[0])).not.toContain(originalPlayerId);
    expect(session.waitingQueue[0].id).toBe(originalPlayerId);
    expect(playersOf(session.upcomingMatches[0])).toHaveLength(4);
  });

  it("rebalances only affected match teams after a manual replacement", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);
    const [courtLowA, courtHigh, courtLowB, courtLowC, upcomingLow, upcomingHigh, upcomingMidA, upcomingMidB] =
      makeNamedAttendees([
        ["김지혜", 70],
        ["정승희", 100],
        ["김세화", 70],
        ["김주희", 70],
        ["차희윤", 75],
        ["천원희", 100],
        ["강민지", 80],
        ["박송이", 90],
      ]);

    session.setCourtCount(1);
    session.setAttendees([
      courtLowA,
      courtHigh,
      courtLowB,
      courtLowC,
      upcomingLow,
      upcomingHigh,
      upcomingMidA,
      upcomingMidB,
    ]);
    session.courts = [
      {
        courtNumber: 1,
        status: "assigned",
        match: {
          id: "court-1",
          courtNumber: 1,
          teamA: { players: [courtLowA, courtHigh] },
          teamB: { players: [courtLowB, courtLowC] },
        },
        assignedAt: "2026-06-09T00:00:00.000Z",
        startedAt: null,
      },
    ];
    session.upcomingMatches = [
      {
        id: "next-1",
        teamA: { players: [upcomingLow, upcomingHigh] },
        teamB: { players: [upcomingMidA, upcomingMidB] },
      },
    ];
    session.waitingQueue = [];

    const replaced = session.replaceEditableMatchPlayer(
      { type: "court", courtNumber: 1 },
      { team: "teamA", playerIndex: 1 },
      upcomingLow.id,
    );

    expect(replaced).toBe(true);
    expect(groupKey(session.courts[0].match)).toBe(
      [courtLowA, upcomingLow, courtLowB, courtLowC].map((player) => player.id).sort().join("|"),
    );
    expect(groupKey(session.upcomingMatches[0])).toBe(
      [courtHigh, upcomingHigh, upcomingMidA, upcomingMidB].map((player) => player.id).sort().join("|"),
    );
    expect(teamScoreDiff(session.upcomingMatches[0])).toBe(10);
  });

  it("does not allow a player from an in-progress court to be used as a manual replacement", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees(makeAttendees(8, "남"));
    session.assignInitialCourts();
    session.startCourt(2);

    const originalPlayerId = session.courts[0].match?.teamA.players[0].id;
    const lockedPlayerId = session.courts[1].match?.teamA.players[0].id;
    const undoCount = session.undoStack.length;

    const replaced = session.replaceEditableMatchPlayer(
      { type: "court", courtNumber: 1 },
      { team: "teamA", playerIndex: 0 },
      lockedPlayerId ?? "",
    );

    expect(replaced).toBe(false);
    expect(session.courts[0].match?.teamA.players[0].id).toBe(originalPlayerId);
    expect(session.undoStack).toHaveLength(undoCount);
  });

  it("allows manual edits to create a 3-to-1 gender match while keeping four players", () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);

    session.setCourtCount(2);
    session.setAttendees([...makeGenderedAttendees(4, "남", 1), ...makeGenderedAttendees(4, "여", 5)]);
    session.assignInitialCourts();

    const maleCourt = session.courts.find((court) => hasOnlyGender(court.match, "남"));
    const femaleCourt = session.courts.find((court) => hasOnlyGender(court.match, "여"));
    const replacementPlayer = femaleCourt?.match?.teamA.players[0];

    expect(maleCourt?.match).toBeTruthy();
    expect(replacementPlayer).toBeTruthy();

    const replaced = session.replaceEditableMatchPlayer(
      { type: "court", courtNumber: maleCourt?.courtNumber ?? 1 },
      { team: "teamA", playerIndex: 0 },
      replacementPlayer?.id ?? "",
    );

    expect(replaced).toBe(true);
    expect(playersOf(maleCourt?.match ?? null)).toHaveLength(4);
    expect(isThreeToOneMatch(maleCourt?.match as MatchLike)).toBe(true);
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
    session.addGuestAttendee({
      name: "게스트C",
      gender: "여",
      skillScore: 80,
    });

    expect(session.hasAssignedCourt).toBe(true);
    expect(session.completedGameCount).toBe(1);
    expect(session.upcomingMatches.length).toBeGreaterThan(0);
    expect(session.guestCount).toBe(1);

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
    expect(session.guestCount).toBe(0);
  });
});

function playersOf(match: MatchLike | null): string[] {
  if (!match) return [];
  return [...match.teamA.players, ...match.teamB.players].map((player) => player.id);
}

function groupKey(match: MatchLike | null): string {
  return playersOf(match).sort().join("|");
}

function teamScoreDiff(match: MatchLike): number {
  return Math.abs(teamScore(match.teamA.players) - teamScore(match.teamB.players));
}

function teamScore(players: Attendee[]): number {
  return players.reduce((sum, player) => sum + (player.skillScore ?? 50), 0);
}

function isThreeToOneMatch(match: MatchLike): boolean {
  const players = [...match.teamA.players, ...match.teamB.players];
  const maleCount = players.filter((player) => player.gender === "남").length;
  const femaleCount = players.filter((player) => player.gender === "여").length;

  return (maleCount === 3 && femaleCount === 1) || (maleCount === 1 && femaleCount === 3);
}

function hasOnlyGender(match: MatchLike | null, gender: "남" | "여"): boolean {
  if (!match) return false;

  return [...match.teamA.players, ...match.teamB.players].every((player) => player.gender === gender);
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

function makeNamedAttendees(players: Array<[string, number]>): Attendee[] {
  return players.map(([name, skillScore], index) => ({
    ...makeAttendees(1, "여")[0],
    id: `named-${index + 1}`,
    no: index + 1,
    name,
    skillScore,
  }));
}
