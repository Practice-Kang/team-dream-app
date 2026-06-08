import { describe, expect, it } from "vitest";

import { parseMembersCsv } from "./parseMembersCsv";

describe("parseMembersCsv", () => {
  it("parses the member sheet schema and ignores trailing blank columns", () => {
    const csv = [
      '"No","가입일","회원명","급수(지역)","점수(백분위)","성별","운영진(Y/N)","면제(Y/N)","비고","",""',
      '"1","2023. 4. 27","박수빈","D","83","남","Y","N","","",""',
      '"2","2023. 7. 21","권영준","D","","여","N","Y","","",""',
    ].join("\n");

    const members = parseMembersCsv(csv);

    expect(members).toEqual([
      {
        id: "member-1",
        no: 1,
        name: "박수빈",
        joinedAt: "2023. 4. 27",
        level: "D",
        skillScore: 83,
        gender: "남",
        isStaff: true,
        isExempt: false,
      },
      {
        id: "member-2",
        no: 2,
        name: "권영준",
        joinedAt: "2023. 7. 21",
        level: "D",
        skillScore: null,
        gender: "여",
        isStaff: false,
        isExempt: true,
      },
    ]);
  });
});
