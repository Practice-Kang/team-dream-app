import { describe, expect, it } from "vitest";

import type { Attendee, CourtState, QueuedMatch, SessionState } from "@/shared/domain";
import { MATCHING_POLICY_VERSION } from "@/shared/sessionSource";

import { createPersistedSessionPayload, restoreSessionState } from "./sessionPersistence";

describe("sessionPersistence", () => {
  it("restores assigned courts, upcoming matches, and the waiting queue after JSON serialization", () => {
    const state = makeSessionState();
    const payload = createPersistedSessionPayload(state, "2026-06-08T10:00:00.000Z");
    const serializedPayload = JSON.parse(JSON.stringify(payload));

    const restored = restoreSessionState(serializedPayload, Date.parse("2026-06-08T11:00:00.000Z"));

    expect(restored?.courts[0].status).toBe("assigned");
    expect(restored?.courts[0].match?.teamA.players.map((player) => player.name)).toEqual(["회원1", "회원2"]);
    expect(restored?.upcomingMatches[0].teamA.players.map((player) => player.name)).toEqual(["회원5", "회원6"]);
    expect(restored?.waitingQueue.map((player) => player.name)).toEqual(["회원9"]);
    expect(restored?.completedMatches).toHaveLength(1);
  });

  it("relinks restored court, upcoming, and queue players to the attendee list", () => {
    const state = makeSessionState();
    const payload = JSON.parse(JSON.stringify(createPersistedSessionPayload(state, "2026-06-08T10:00:00.000Z")));

    const restored = restoreSessionState(payload, Date.parse("2026-06-08T11:00:00.000Z"));

    expect(restored?.courts[0].match?.teamA.players[0]).toBe(restored?.attendees[0]);
    expect(restored?.courts[0].match?.teamB.players[1]).toBe(restored?.attendees[3]);
    expect(restored?.upcomingMatches[0].teamA.players[0]).toBe(restored?.attendees[4]);
    expect(restored?.waitingQueue[0]).toBe(restored?.attendees[8]);
  });

  it("keeps only the first queued upcoming match when restoring older multi-upcoming state", () => {
    const state = makeSessionState();
    const attendees = makeAttendees(13);
    const extraUpcomingMatch: QueuedMatch = {
      id: "queued-2",
      teamA: {
        players: [attendees[8], attendees[9]],
      },
      teamB: {
        players: [attendees[10], attendees[11]],
      },
    };
    const payload = JSON.parse(JSON.stringify(createPersistedSessionPayload(state, "2026-06-08T10:00:00.000Z")));
    payload.state.attendees = attendees;
    payload.state.upcomingMatches = [state.upcomingMatches[0], extraUpcomingMatch];
    payload.state.waitingQueue = [attendees[12]];

    const restored = restoreSessionState(payload, Date.parse("2026-06-08T11:00:00.000Z"));

    expect(restored?.upcomingMatches).toHaveLength(1);
    expect(restored?.upcomingMatches[0].id).toBe("queued-1");
    expect(restored?.waitingQueue.map((player) => player.name)).toEqual([
      "회원9",
      "회원10",
      "회원11",
      "회원12",
      "회원13",
    ]);
  });

  it("restores valid companion pairs for current attendees", () => {
    const state = makeSessionState();
    state.companionPairs = [
      {
        id: "pair-1",
        playerAId: state.attendees[0].id,
        playerBId: state.attendees[4].id,
        createdAt: "2026-06-08T10:00:00.000Z",
      },
    ];

    const payload = JSON.parse(JSON.stringify(createPersistedSessionPayload(state, "2026-06-08T10:00:00.000Z")));

    const restored = restoreSessionState(payload, Date.parse("2026-06-08T11:00:00.000Z"));

    expect(restored?.companionPairs).toEqual(state.companionPairs);
  });

  it("ignores stale saved sessions", () => {
    const state = makeSessionState();
    const payload = createPersistedSessionPayload(state, "2026-06-08T10:00:00.000Z");

    const restored = restoreSessionState(payload, Date.parse("2026-06-09T05:00:01.000Z"));

    expect(restored).toBeNull();
  });

  it("does not restore a previous attendance date even within the storage age limit", () => {
    const state = {
      ...makeSessionState(),
      attendanceDate: "2026-06-06",
    };
    const payload = createPersistedSessionPayload(state, "2026-06-06T14:30:00.000Z");

    const restored = restoreSessionState(payload, Date.parse("2026-06-07T01:00:00.000Z"));

    expect(restored).toBeNull();
  });
});

function makeSessionState(): SessionState {
  const attendees = makeAttendees(9);
  const match = {
    id: "match-1",
    courtNumber: 1,
    teamA: {
      players: [attendees[0], attendees[1]],
    },
    teamB: {
      players: [attendees[2], attendees[3]],
    },
  };
  const upcomingMatch: QueuedMatch = {
    id: "queued-1",
    teamA: {
      players: [attendees[4], attendees[5]],
    },
    teamB: {
      players: [attendees[6], attendees[7]],
    },
  };
  const court: CourtState = {
    courtNumber: 1,
    status: "assigned",
    match,
    assignedAt: "2026-06-08T10:05:00.000Z",
    startedAt: null,
  };

  return {
    id: null,
    matchingPolicyVersion: MATCHING_POLICY_VERSION,
    title: "오늘 경기",
    courtCount: 1,
    attendees,
    attendeesLoading: true,
    attendeesError: "temporary error",
    attendeesFetchedAt: "2026-06-08T10:00:00.000Z",
    attendanceDate: "2026-06-08",
    sourceMembersCount: 9,
    unmatchedAttendanceNames: [],
    companionPairs: [],
    courts: [court],
    upcomingMatches: [upcomingMatch],
    waitingQueue: [attendees[8]],
    completedMatches: [
      {
        match,
        completedAt: "2026-06-08T10:30:00.000Z",
      },
    ],
    matchSequence: 2,
    rounds: [],
    currentRoundIndex: 0,
    updatedAt: "2026-06-08T10:05:00.000Z",
    undoStack: [],
  };
}

function makeAttendees(count: number): Attendee[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `member-${index + 1}`,
    no: index + 1,
    name: `회원${index + 1}`,
    joinedAt: "2026. 1. 1",
    level: "D",
    skillScore: 50,
    gender: index % 2 === 0 ? "남" : "여",
    isStaff: false,
    isExempt: false,
    selectedAt: "2026-06-08T10:00:00.000Z",
    playCount: 0,
    waitCount: 0,
    playFrequencyPreference: "normal",
  }));
}
