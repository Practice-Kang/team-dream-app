import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";

import { todayDateKey } from "./src/shared/dateKey";
import {
  ATTENDANCE_LOG_SHEET_CSV_URL,
  MEMBERS_API_PATH,
  MEMBERS_SHEET_CSV_URL,
  TODAY_ATTENDEES_API_PATH,
  buildTodayAttendeesResponse,
} from "./src/shared/memberSource";
import { parseAttendanceLogCsv } from "./src/shared/parseAttendanceLogCsv";
import { parseMembersCsv } from "./src/shared/parseMembersCsv";

type SheetApiEnv = Record<string, string | undefined>;

async function fetchCsv(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "text/csv",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: ${url}`);
  }

  return response.text();
}

async function fetchAppsScriptJson(env: SheetApiEnv, action: string, params: Record<string, string> = {}) {
  const apiUrl = env.TEAM_DREAM_SHEET_API_URL?.trim();
  if (!apiUrl) return null;

  const url = new URL(apiUrl);
  url.searchParams.set("action", action);

  const token = env.TEAM_DREAM_SHEET_API_TOKEN?.trim();
  if (token) url.searchParams.set("token", token);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Apps Script returned ${response.status}`);
  }

  const data = (await response.json()) as { ok?: boolean; message?: string };
  if (data.ok === false) {
    throw new Error(data.message || `Apps Script rejected ${action}`);
  }

  return data;
}

function sheetApiDevPlugin(env: SheetApiEnv): Plugin {
  return {
    name: "team-dream-sheet-api-dev",
    config(_, { mode }) {
      Object.assign(env, loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), ""));
    },
    configureServer(server) {
      server.middlewares.use(MEMBERS_API_PATH, async (request, response) => {
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ message: "Method Not Allowed" }));
          return;
        }

        try {
          const appsScriptResponse = await fetchAppsScriptJson(env, "members");
          if (appsScriptResponse) {
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify(appsScriptResponse));
            return;
          }

          const csv = await fetchCsv(MEMBERS_SHEET_CSV_URL);
          const members = parseMembersCsv(csv);

          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(
            JSON.stringify({
              members,
              count: members.length,
              fetchedAt: new Date().toISOString(),
            }),
          );
        } catch {
          response.statusCode = 502;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ message: "회원명단을 불러오지 못했습니다." }));
        }
      });

      server.middlewares.use(TODAY_ATTENDEES_API_PATH, async (request, response) => {
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ message: "Method Not Allowed" }));
          return;
        }

        try {
          const requestUrl = new URL(request.url || TODAY_ATTENDEES_API_PATH, "http://localhost");
          const attendanceDate = requestUrl.searchParams.get("date") || todayDateKey();
          const appsScriptResponse = await fetchAppsScriptJson(env, "today-attendees", { date: attendanceDate });
          if (appsScriptResponse) {
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify(appsScriptResponse));
            return;
          }

          const [membersCsv, attendanceCsv] = await Promise.all([
            fetchCsv(MEMBERS_SHEET_CSV_URL),
            fetchCsv(ATTENDANCE_LOG_SHEET_CSV_URL),
          ]);
          const members = parseMembersCsv(membersCsv);
          const attendanceRecords = parseAttendanceLogCsv(attendanceCsv);

          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify(buildTodayAttendeesResponse(members, attendanceRecords, attendanceDate)));
        } catch {
          response.statusCode = 502;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ message: "오늘 참석자를 불러오지 못했습니다." }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [sheetApiDevPlugin({}), vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
