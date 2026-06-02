import { describe, expect, it } from "vitest";

import type { Attendee, PlayFrequencyPreference } from "@/shared/domain";

import { generateRound } from "./generateRound";

describe("generateRound", () => {
  it("respects court and attendee capacity", () => {
    const attendees = makeAttendees(10);

    const round = generateRound({
      attendees,
      courtCount: 3,
      seed: "capacity",
    });

    expect(round.matches).toHaveLength(2);
    expect(round.matches.flatMap((match) => [...match.teamA.players, ...match.teamB.players])).toHaveLength(8);
    expect(round.waiting).toHaveLength(2);
  });

  it("does not create matches when fewer than four attendees are selected", () => {
    const round = generateRound({
      attendees: makeAttendees(3),
      courtCount: 2,
      seed: "short",
    });

    expect(round.matches).toHaveLength(0);
    expect(round.waiting).toHaveLength(3);
  });

  it("uses play frequency preference when choosing waiting players", () => {
    const attendees = makeAttendees(5).map((attendee) => ({
      ...attendee,
      playCount: 1,
      playFrequencyPreference: "normal" as PlayFrequencyPreference,
    }));
    attendees[0].playFrequencyPreference = "low";
    attendees[1].playFrequencyPreference = "high";

    const round = generateRound({
      attendees,
      courtCount: 1,
      seed: "frequency",
    });

    const playingIds = new Set(round.matches.flatMap((match) => [...match.teamA.players, ...match.teamB.players]).map((player) => player.id));

    expect(playingIds.has(attendees[1].id)).toBe(true);
    expect(round.waiting.map((player) => player.id)).toContain(attendees[0].id);
  });
});

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
    selectedAt: "2026-06-02T00:00:00.000Z",
    playCount: 0,
    waitCount: 0,
    playFrequencyPreference: "normal",
    queueStatus: "normal",
  }));
}
