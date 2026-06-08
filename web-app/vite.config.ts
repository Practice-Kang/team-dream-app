import { fileURLToPath, URL } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";

import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";

import { todayDateKey } from "./src/shared/dateKey";
import type { SessionState } from "./src/shared/domain";
import {
  ATTENDANCE_LOG_SHEET_CSV_URL,
  MEMBERS_API_PATH,
  MEMBERS_SHEET_CSV_URL,
  TODAY_ATTENDEES_API_PATH,
  buildTodayAttendeesResponse,
} from "./src/shared/memberSource";
import { CURRENT_SESSION_API_PATH, CURRENT_SESSION_ID } from "./src/shared/sessionSource";
import { parseAttendanceLogCsv } from "./src/shared/parseAttendanceLogCsv";
import { parseMembersCsv } from "./src/shared/parseMembersCsv";

type SheetApiEnv = Record<string, string | undefined>;

const DEV_ADMIN_COOKIE_NAME = "team_dream_dev_admin";
const DEV_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

interface DevSessionSnapshot {
  state: SessionState;
  version: number;
  updatedAt: string;
  expiresAt: number;
}

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
  let devSessionSnapshot: DevSessionSnapshot | null = null;

  return {
    name: "team-dream-sheet-api-dev",
    config(_, { mode }) {
      Object.assign(env, loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), ""));
    },
    configureServer(server) {
      server.middlewares.use("/api/auth/login", async (request, response) => {
        if (request.method !== "POST") {
          writeJson(response, 405, { message: "Method Not Allowed" });
          return;
        }

        if (!adminCredentialsConfigured(env)) {
          writeJson(response, 503, { message: "운영자 계정 환경변수가 설정되지 않았습니다." });
          return;
        }

        try {
          const body = JSON.parse(await readRequestBody(request)) as { id?: string; password?: string };
          const id = String(body.id || "").trim();
          const password = String(body.password || "");

          if (id !== env.TEAM_DREAM_ADMIN_ID?.trim() || password !== env.TEAM_DREAM_ADMIN_PASSWORD) {
            writeJson(response, 401, { message: "운영자 ID 또는 비밀번호가 올바르지 않습니다." });
            return;
          }

          response.setHeader(
            "Set-Cookie",
            `${DEV_ADMIN_COOKIE_NAME}=1; Path=/; SameSite=Lax; Max-Age=${12 * 60 * 60}`,
          );
          writeJson(response, 200, { authenticated: true, role: "admin" });
        } catch {
          writeJson(response, 400, { message: "로그인 요청 형식이 올바르지 않습니다." });
        }
      });

      server.middlewares.use("/api/auth/me", (request, response) => {
        const authenticated =
          adminCredentialsConfigured(env) &&
          String(request.headers.cookie || "")
            .split(";")
            .map((cookie) => cookie.trim())
            .includes(`${DEV_ADMIN_COOKIE_NAME}=1`);

        writeJson(response, 200, { authenticated, role: authenticated ? "admin" : "guest" });
      });

      server.middlewares.use("/api/auth/logout", (request, response) => {
        if (request.method !== "POST") {
          writeJson(response, 405, { message: "Method Not Allowed" });
          return;
        }

        response.setHeader("Set-Cookie", `${DEV_ADMIN_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0`);
        writeJson(response, 200, { authenticated: false, role: "guest" });
      });

      server.middlewares.use(CURRENT_SESSION_API_PATH, async (request, response) => {
        if (request.method === "GET") {
          if (!devSessionSnapshot || Date.now() > devSessionSnapshot.expiresAt) {
            writeJson(response, 404, { message: "Shared session not found." });
            return;
          }

          writeJson(response, 200, {
            session: devSessionSnapshot.state,
            version: devSessionSnapshot.version,
            updatedAt: devSessionSnapshot.updatedAt,
          });
          return;
        }

        if (request.method !== "PUT") {
          writeJson(response, 405, { message: "Method Not Allowed" });
          return;
        }

        if (!devAdminAuthenticated(request)) {
          writeJson(response, 401, { message: "Admin login is required." });
          return;
        }

        try {
          const body = JSON.parse(await readRequestBody(request)) as {
            state?: SessionState;
            version?: number | null;
          };
          const requestVersion = typeof body.version === "number" ? body.version : null;

          if (!isSessionState(body.state)) {
            writeJson(response, 400, { message: "Session state shape is invalid." });
            return;
          }

          if (devSessionSnapshot && Date.now() <= devSessionSnapshot.expiresAt && requestVersion !== devSessionSnapshot.version) {
            writeJson(response, 409, {
              session: devSessionSnapshot.state,
              version: devSessionSnapshot.version,
              updatedAt: devSessionSnapshot.updatedAt,
            });
            return;
          }

          const updatedAt = new Date().toISOString();
          const state: SessionState = {
            ...body.state,
            id: CURRENT_SESSION_ID,
            attendeesLoading: false,
            attendeesError: null,
            updatedAt,
          };
          devSessionSnapshot = {
            state,
            version: devSessionSnapshot ? devSessionSnapshot.version + 1 : 1,
            updatedAt,
            expiresAt: Date.now() + DEV_SESSION_TTL_MS,
          };

          writeJson(response, 200, {
            session: devSessionSnapshot.state,
            version: devSessionSnapshot.version,
            updatedAt: devSessionSnapshot.updatedAt,
          });
        } catch {
          writeJson(response, 400, { message: "Session request body is invalid." });
        }
      });

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

function adminCredentialsConfigured(env: SheetApiEnv): boolean {
  return Boolean(env.TEAM_DREAM_ADMIN_ID?.trim() && env.TEAM_DREAM_ADMIN_PASSWORD);
}

function devAdminAuthenticated(request: IncomingMessage): boolean {
  return String(request.headers.cookie || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .includes(`${DEV_ADMIN_COOKIE_NAME}=1`);
}

function isSessionState(value: unknown): value is SessionState {
  if (!value || typeof value !== "object") return false;

  const state = value as Partial<SessionState>;
  return (
    typeof state.title === "string" &&
    typeof state.courtCount === "number" &&
    Array.isArray(state.attendees) &&
    Array.isArray(state.courts) &&
    Array.isArray(state.waitingQueue) &&
    Array.isArray(state.completedMatches)
  );
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export default defineConfig({
  plugins: [sheetApiDevPlugin({}), vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
