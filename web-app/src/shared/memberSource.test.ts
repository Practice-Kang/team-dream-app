import { describe, expect, it } from "vitest";

import type { Member } from "./domain";
import { buildTodayAttendeesResponse } from "./memberSource";
import type { AttendanceRecord } from "./parseAttendanceLogCsv";

describe("buildTodayAttendeesResponse", () => {
  it("joins today's attendance records with member details", () => {
    const members: Member[] = [
      makeMember("member-1", 1, "박수란", "여", "D"),
      makeMember("member-2", 2, "권혁준", "남", "D"),
    ];
    const records: AttendanceRecord[] = [
      makeRecord("2026-06-02", "박수란"),
      makeRecord("2026-06-02", "없는회원"),
      makeRecord("2026-06-01", "권혁준"),
    ];

    const response = buildTodayAttendeesResponse(members, records, "2026-06-02", "2026-06-02T10:00:00.000Z");

    expect(response.attendees).toHaveLength(1);
    expect(response.attendees[0]).toMatchObject({
      id: "member-1",
      name: "박수란",
      gender: "여",
      level: "D",
      playCount: 0,
      playFrequencyPreference: "normal",
    });
    expect(response.unmatchedNames).toEqual(["없는회원"]);
    expect(response.membersCount).toBe(2);
    expect(response.attendanceCount).toBe(1);
  });
});

function makeMember(id: string, no: number, name: string, gender: "남" | "여", level: string): Member {
  return {
    id,
    no,
    name,
    joinedAt: "2026. 1. 1",
    level,
    skillScore: null,
    gender,
    isStaff: false,
    isExempt: false,
  };
}

function makeRecord(dateKey: string, memberName: string): AttendanceRecord {
  return {
    dateKey,
    memberName,
    attendance: "O",
    manager: "",
    memo: "",
    recordedAt: "",
  };
}
