import type { Attendee, Member } from "./domain";
import type { AttendanceRecord } from "./parseAttendanceLogCsv";
import { checkedMemberNamesForDate } from "./parseAttendanceLogCsv";

export const MEMBERS_API_PATH = "/api/members";
export const TODAY_ATTENDEES_API_PATH = "/api/today-attendees";
export const MEMBERS_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1IWyUCa6DJCJ2ET-DTNQLoEkHw9tcx42w3CWCR196dMQ/gviz/tq?tqx=out:csv&gid=1337736140";
export const ATTENDANCE_LOG_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1IWyUCa6DJCJ2ET-DTNQLoEkHw9tcx42w3CWCR196dMQ/gviz/tq?tqx=out:csv&sheet=%EC%B6%9C%EC%84%9D%EA%B8%B0%EB%A1%9D";

export interface MembersResponse {
  members: Member[];
  count: number;
  fetchedAt: string;
}

export interface TodayAttendeesResponse {
  attendees: Attendee[];
  attendanceDate: string;
  attendanceCount: number;
  membersCount: number;
  unmatchedNames: string[];
  fetchedAt: string;
}

export function membersToAttendees(members: Member[], selectedAt = new Date().toISOString()): Attendee[] {
  return members.map((member) => ({
    ...member,
    selectedAt,
    playCount: 0,
    waitCount: 0,
    playFrequencyPreference: "normal",
    queueStatus: "normal",
  }));
}

export function buildTodayAttendeesResponse(
  members: Member[],
  attendanceRecords: AttendanceRecord[],
  attendanceDate: string,
  fetchedAt = new Date().toISOString(),
): TodayAttendeesResponse {
  const membersByName = new Map(members.map((member) => [member.name, member]));
  const checkedNames = checkedMemberNamesForDate(attendanceRecords, attendanceDate);
  const attendees: Attendee[] = [];
  const unmatchedNames: string[] = [];

  checkedNames.forEach((name) => {
    const member = membersByName.get(name);
    if (!member) {
      unmatchedNames.push(name);
      return;
    }

    attendees.push(membersToAttendees([member], fetchedAt)[0]);
  });

  return {
    attendees,
    attendanceDate,
    attendanceCount: attendees.length,
    membersCount: members.length,
    unmatchedNames,
    fetchedAt,
  };
}
