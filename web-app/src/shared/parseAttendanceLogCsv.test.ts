import { describe, expect, it } from "vitest";

import { checkedMemberNamesForDate, parseAttendanceLogCsv } from "./parseAttendanceLogCsv";

describe("parseAttendanceLogCsv", () => {
  it("parses checked member names for a specific attendance date", () => {
    const csv = [
      '"출석일","회원명","참석","입력자","메모","입력시각","",""',
      '"2026. 6. 2","박수란","O","","","2026. 6. 2 오후 7:00:00","",""',
      '"2026. 6. 2","권혁준","O","","","2026. 6. 2 오후 7:01:00","",""',
      '"2026. 6. 2","박수란","O","","중복","2026. 6. 2 오후 7:02:00","",""',
      '"2026. 6. 1","유경선","O","","","2026. 6. 1 오후 7:00:00","",""',
      '"2026. 6. 2","이근식","X","","","2026. 6. 2 오후 7:03:00","",""',
    ].join("\n");

    const records = parseAttendanceLogCsv(csv);

    expect(checkedMemberNamesForDate(records, "2026-06-02")).toEqual(["박수란", "권혁준"]);
  });
});
