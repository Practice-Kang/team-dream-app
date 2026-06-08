import { todayDateKey } from "../../src/shared/dateKey";
import {
  ATTENDANCE_LOG_SHEET_CSV_URL,
  MEMBERS_SHEET_CSV_URL,
  buildTodayAttendeesResponse,
} from "../../src/shared/memberSource";
import { parseAttendanceLogCsv } from "../../src/shared/parseAttendanceLogCsv";
import { parseMembersCsv } from "../../src/shared/parseMembersCsv";

interface Env {
  MEMBERS_SHEET_CSV_URL?: string;
  ATTENDANCE_LOG_SHEET_CSV_URL?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const attendanceDate = url.searchParams.get("date") || todayDateKey();

  const [membersResponse, attendanceResponse] = await Promise.all([
    fetch(env.MEMBERS_SHEET_CSV_URL || MEMBERS_SHEET_CSV_URL, {
      headers: { accept: "text/csv" },
    }),
    fetch(env.ATTENDANCE_LOG_SHEET_CSV_URL || ATTENDANCE_LOG_SHEET_CSV_URL, {
      headers: { accept: "text/csv" },
    }),
  ]);

  if (!membersResponse.ok || !attendanceResponse.ok) {
    return Response.json(
      {
        message: "오늘 참석자를 불러오지 못했습니다.",
      },
      { status: 502 },
    );
  }

  const [membersCsv, attendanceCsv] = await Promise.all([membersResponse.text(), attendanceResponse.text()]);
  const members = parseMembersCsv(membersCsv);
  const attendanceRecords = parseAttendanceLogCsv(attendanceCsv);

  return Response.json(buildTodayAttendeesResponse(members, attendanceRecords, attendanceDate));
};
