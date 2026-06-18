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

  it("applies play frequency preference even when preserving queue order", () => {
    const attendees = makeGenderedAttendees(5, "남", 1).map((attendee) => ({
      ...attendee,
      playCount: 1,
      playFrequencyPreference: "normal" as PlayFrequencyPreference,
    }));
    attendees[0].playCount = 2;
    attendees[0].playFrequencyPreference = "low";
    attendees[4].playCount = 1;
    attendees[4].playFrequencyPreference = "high";

    const round = generateRound({
      attendees,
      courtCount: 1,
      preserveOrder: true,
    });

    const playingIds = new Set(round.matches.flatMap((match) => [...match.teamA.players, ...match.teamB.players]).map((player) => player.id));

    expect(playingIds.has(attendees[4].id)).toBe(true);
    expect(round.waiting.map((player) => player.id)).toContain(attendees[0].id);
  });

  it("prefers men's and women's doubles before mixed games", () => {
    const attendees = [...makeGenderedAttendees(8, "남", 1), ...makeGenderedAttendees(8, "여", 9)];

    const round = generateRound({
      attendees,
      courtCount: 4,
      seed: "gender-doubles",
    });

    expect(round.matches).toHaveLength(4);
    expect(round.matches.every((match) => new Set(playersOf(match).map((player) => player.gender)).size === 1)).toBe(
      true,
    );
  });

  it("does not create mixed games for the common 13 men and 11 women, 3 court case", () => {
    const attendees = [...makeGenderedAttendees(13, "남", 1), ...makeGenderedAttendees(11, "여", 14)];

    const round = generateRound({
      attendees,
      courtCount: 3,
      seed: "common-13-11",
    });

    expect(round.matches).toHaveLength(3);
    expect(round.matches.every((match) => new Set(playersOf(match).map((player) => player.gender)).size === 1)).toBe(
      true,
    );
  });

  it("does not create a 3-to-1 mixed match for a stranded gender group", () => {
    const attendees = [...makeGenderedAttendees(12, "남", 1), ...makeGenderedAttendees(1, "여", 13)];

    const round = generateRound({
      attendees,
      courtCount: 3,
      seed: "stranded-gender",
    });

    const genderCounts = round.matches.map((match) => countMatchGenders(match));

    expect(round.matches).toHaveLength(3);
    expect(genderCounts.every((counts) => counts.남 === 4 && counts.여 === 0)).toBe(true);
    expect(round.waiting).toHaveLength(1);
    expect(round.waiting[0].gender).toBe("여");
  });

  it("leaves everyone waiting when the only possible match is 3-to-1 mixed", () => {
    const attendees = [...makeGenderedAttendees(3, "남", 1), ...makeGenderedAttendees(1, "여", 4)];

    const round = generateRound({
      attendees,
      courtCount: 1,
      seed: "forbidden-3-1",
    });

    expect(round.matches).toHaveLength(0);
    expect(round.waiting).toHaveLength(4);
  });

  it("uses fewer courts instead of creating a 3-to-1 mixed match", () => {
    const attendees = [...makeGenderedAttendees(7, "남", 1), ...makeGenderedAttendees(5, "여", 8)];

    const round = generateRound({
      attendees,
      courtCount: 3,
      seed: "avoid-3-1-with-fewer-courts",
    });

    expect(round.matches).toHaveLength(2);
    expect(round.matches.some((match) => isThreeToOneMatch(match))).toBe(false);
    expect(round.waiting).toHaveLength(4);
  });

  it("keeps mixed-match teams gender-balanced without treating male and female scores as the same scale", () => {
    const attendees = [
      makeAttendee(1, "남", 100),
      makeAttendee(2, "남", 40),
      makeAttendee(3, "여", 100),
      makeAttendee(4, "여", 40),
    ];

    const round = generateRound({
      attendees,
      courtCount: 1,
      seed: "mixed-balance",
    });

    const [match] = round.matches;

    expect(match.teamA.players.map((player) => player.gender).sort()).toEqual(["남", "여"]);
    expect(match.teamB.players.map((player) => player.gender).sort()).toEqual(["남", "여"]);
  });

  it("balances total team score when mixed-match gender splits are equivalent", () => {
    const attendees = [
      makeNamedAttendee(1, "백동주", "남", 90),
      makeNamedAttendee(2, "박수란", "여", 90),
      makeNamedAttendee(3, "박영은", "여", 80),
      makeNamedAttendee(4, "정가람", "남", 80),
    ];

    const round = generateRound({
      attendees,
      courtCount: 1,
      seed: "mixed-total-balance",
      preserveOrder: true,
    });

    const [match] = round.matches;
    const teamScores = [totalScore(match.teamA.players), totalScore(match.teamB.players)].sort((a, b) => a - b);
    const teamNames = [namesOf(match.teamA.players), namesOf(match.teamB.players)].sort((a, b) =>
      a.localeCompare(b, "ko"),
    );

    expect(teamScores).toEqual([170, 170]);
    expect(teamNames).toEqual(["박수란+정가람", "박영은+백동주"]);
  });

  it("clusters same-gender games by skill band before balancing teams", () => {
    const attendees = [
      makeAttendee(1, "남", 100),
      makeAttendee(2, "남", 95),
      makeAttendee(3, "남", 90),
      makeAttendee(4, "남", 85),
      makeAttendee(5, "남", 40),
      makeAttendee(6, "남", 35),
      makeAttendee(7, "남", 30),
      makeAttendee(8, "남", 25),
    ];

    const round = generateRound({
      attendees,
      courtCount: 2,
      preserveOrder: true,
    });

    const skillSpreads = round.matches.map((match) => {
      const scores = playersOf(match).map((player) => player.skillScore ?? 50);
      return Math.max(...scores) - Math.min(...scores);
    });

    expect(skillSpreads).toEqual([15, 15]);
    expect(round.matches.some((match) => playersOf(match).some((player) => player.skillScore === 100) && playersOf(match).some((player) => player.skillScore === 25))).toBe(false);
  });

  it("breaks same-gender groups when an interleaved waiting queue is preserved", () => {
    const oldGroupA = [3, 5, 7, 9].map((no) => makeAttendee(no, "남", 50));
    const oldGroupB = [10, 12, 14, 16].map((no) => makeAttendee(no, "남", 50));
    const attendees = [
      oldGroupA[0],
      oldGroupB[0],
      oldGroupA[1],
      oldGroupB[1],
      oldGroupA[2],
      oldGroupB[2],
      oldGroupA[3],
      oldGroupB[3],
    ];

    const round = generateRound({
      attendees,
      courtCount: 2,
      preserveOrder: true,
    });

    const groupKeys = round.matches.map(groupKey);

    expect(groupKeys).not.toContain(oldGroupA.map((player) => player.id).sort().join("|"));
    expect(groupKeys).not.toContain(oldGroupB.map((player) => player.id).sort().join("|"));
  });

  it("keeps a companion pair in the same match when possible", () => {
    const attendees = makeGenderedAttendees(8, "남", 1);

    const round = generateRound({
      attendees,
      courtCount: 2,
      preserveOrder: true,
      companionPairs: [
        {
          id: "pair-1",
          playerAId: attendees[0].id,
          playerBId: attendees[2].id,
          createdAt: "2026-06-10T00:00:00.000Z",
        },
      ],
    });
    const hasCompanionMatch = round.matches.some((match) => {
      const playerIds = playersOf(match).map((player) => player.id);
      return playerIds.includes(attendees[0].id) && playerIds.includes(attendees[2].id);
    });

    expect(hasCompanionMatch).toBe(true);
  });

  it("does not keep a companion pair by creating a forbidden 3-to-1 match", () => {
    const attendees = [...makeGenderedAttendees(4, "남", 1), ...makeGenderedAttendees(4, "여", 5)];

    const round = generateRound({
      attendees,
      courtCount: 2,
      preserveOrder: true,
      companionPairs: [
        {
          id: "pair-1",
          playerAId: attendees[0].id,
          playerBId: attendees[4].id,
          createdAt: "2026-06-10T00:00:00.000Z",
        },
      ],
    });

    expect(round.matches.some((match) => isThreeToOneMatch(match))).toBe(false);
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
  }));
}

function makeGenderedAttendees(count: number, gender: "남" | "여", startNo: number): Attendee[] {
  return Array.from({ length: count }, (_, index) => makeAttendee(startNo + index, gender, 50 + (index % 5)));
}

function makeAttendee(no: number, gender: "남" | "여", skillScore: number): Attendee {
  return {
    id: `member-${no}`,
    no,
    name: `회원${no}`,
    joinedAt: "2026. 1. 1",
    level: "",
    skillScore,
    gender,
    isStaff: false,
    isExempt: false,
    selectedAt: "2026-06-02T00:00:00.000Z",
    playCount: 0,
    waitCount: 0,
    playFrequencyPreference: "normal",
  };
}

function makeNamedAttendee(no: number, name: string, gender: "남" | "여", skillScore: number): Attendee {
  return {
    ...makeAttendee(no, gender, skillScore),
    name,
  };
}

function playersOf(match: { teamA: { players: Attendee[] }; teamB: { players: Attendee[] } }): Attendee[] {
  return [...match.teamA.players, ...match.teamB.players];
}

function groupKey(match: { teamA: { players: Attendee[] }; teamB: { players: Attendee[] } }): string {
  return playersOf(match)
    .map((player) => player.id)
    .sort()
    .join("|");
}

function countMatchGenders(match: { teamA: { players: Attendee[] }; teamB: { players: Attendee[] } }) {
  return playersOf(match).reduce(
    (counts, player) => ({
      ...counts,
      [player.gender]: counts[player.gender] + 1,
    }),
    { 남: 0, 여: 0 },
  );
}

function isThreeToOneMatch(match: { teamA: { players: Attendee[] }; teamB: { players: Attendee[] } }): boolean {
  const counts = countMatchGenders(match);
  return (counts.남 === 3 && counts.여 === 1) || (counts.남 === 1 && counts.여 === 3);
}

function totalScore(players: Attendee[]): number {
  return players.reduce((sum, player) => sum + (player.skillScore ?? 50), 0);
}

function namesOf(players: Attendee[]): string {
  return players
    .map((player) => player.name)
    .sort((a, b) => a.localeCompare(b, "ko"))
    .join("+");
}
