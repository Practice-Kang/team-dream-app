import { todayDateKey } from "../../src/shared/dateKey";
import {
  ATTENDANCE_LOG_SHEET_CSV_URL,
  MEMBERS_SHEET_CSV_URL,
  buildTodayAttendeesResponse,
} from "../../src/shared/memberSource";
import type { TodayAttendeesResponse } from "../../src/shared/memberSource";
import { parseAttendanceLogCsv } from "../../src/shared/parseAttendanceLogCsv";
import { parseMembersCsv } from "../../src/shared/parseMembersCsv";

interface Env {
  TEAM_DREAM_SHEET_API_URL?: string;
  TEAM_DREAM_SHEET_API_TOKEN?: string;
  MEMBERS_SHEET_CSV_URL?: string;
  ATTENDANCE_LOG_SHEET_CSV_URL?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const attendanceDate = url.searchParams.get("date") || todayDateKey();

  try {
    const attendeesFromAppsScript = await fetchTodayAttendeesFromAppsScript(env, attendanceDate);
    if (attendeesFromAppsScript) return Response.json(attendeesFromAppsScript);

    return Response.json(await fetchTodayAttendeesFromCsv(env, attendanceDate));
  } catch (error) {
    return Response.json(
      {
        message: "오늘 참석자를 불러오지 못했습니다.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
};

async function fetchTodayAttendeesFromAppsScript(
  env: Env,
  attendanceDate: string,
): Promise<TodayAttendeesResponse | null> {
  const apiUrl = env.TEAM_DREAM_SHEET_API_URL?.trim();
  if (!apiUrl) return null;

  const url = new URL(apiUrl);
  url.searchParams.set("action", "today-attendees");
  url.searchParams.set("date", attendanceDate);
  appendToken(url, env);

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Apps Script returned ${response.status}`);
  }

  const data = (await response.json()) as TodayAttendeesResponse & { ok?: boolean; message?: string };
  if (data.ok === false) {
    throw new Error(data.message || "Apps Script rejected the today-attendees request.");
  }

  if (!Array.isArray(data.attendees)) {
    throw new Error("Apps Script today-attendees response shape is invalid.");
  }

  return data;
}

async function fetchTodayAttendeesFromCsv(env: Env, attendanceDate: string): Promise<TodayAttendeesResponse> {
  const [membersResponse, attendanceResponse] = await Promise.all([
    fetch(env.MEMBERS_SHEET_CSV_URL || MEMBERS_SHEET_CSV_URL, {
      headers: { accept: "text/csv" },
    }),
    fetch(env.ATTENDANCE_LOG_SHEET_CSV_URL || ATTENDANCE_LOG_SHEET_CSV_URL, {
      headers: { accept: "text/csv" },
    }),
  ]);

  if (!membersResponse.ok || !attendanceResponse.ok) {
    throw new Error(
      `Google Sheets CSV returned members=${membersResponse.status}, attendance=${attendanceResponse.status}`,
    );
  }

  const [membersCsv, attendanceCsv] = await Promise.all([membersResponse.text(), attendanceResponse.text()]);
  const members = parseMembersCsv(membersCsv);
  const attendanceRecords = parseAttendanceLogCsv(attendanceCsv);

  return buildTodayAttendeesResponse(members, attendanceRecords, attendanceDate);
}

function appendToken(url: URL, env: Env): void {
  const token = env.TEAM_DREAM_SHEET_API_TOKEN?.trim();
  if (token) url.searchParams.set("token", token);
}
