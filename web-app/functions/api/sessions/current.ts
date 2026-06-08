import { verifyAdminRequest, type AuthEnv } from "../auth/_shared";
import { todayDateKey } from "../../../src/shared/dateKey";
import type { SessionState } from "../../../src/shared/domain";
import { CURRENT_SESSION_ID } from "../../../src/shared/sessionSource";

const SESSION_TTL_SECONDS = 6 * 60 * 60;

interface SessionEnv extends AuthEnv {
  DB?: D1Database;
}

interface SessionRow {
  id: string;
  payload: string;
  version: number;
  created_at: string;
  updated_at: string;
  expires_at: number;
}

interface SaveSessionBody {
  state?: SessionState;
  version?: number | null;
}

export const onRequestGet: PagesFunction<SessionEnv> = async ({ env }) => {
  if (!env.DB) return missingDatabaseResponse();

  const row = await readCurrentSessionRow(env.DB);
  if (!row || isExpired(row) || !isTodaySession(row)) {
    return Response.json({ message: "Shared session not found." }, { status: 404 });
  }

  return Response.json(toResponseBody(row));
};

export const onRequestPut: PagesFunction<SessionEnv> = async ({ env, request }) => {
  if (!env.DB) return missingDatabaseResponse();

  const isAdmin = await verifyAdminRequest(request, env);
  if (!isAdmin) {
    return Response.json({ message: "Admin login is required." }, { status: 401 });
  }

  let body: SaveSessionBody;
  try {
    body = (await request.json()) as SaveSessionBody;
  } catch {
    return Response.json({ message: "Session request body is invalid." }, { status: 400 });
  }

  if (!isSessionState(body.state)) {
    return Response.json({ message: "Session state shape is invalid." }, { status: 400 });
  }

  const existing = await readCurrentSessionRow(env.DB);
  const existingActiveTodaySession = Boolean(existing && !isExpired(existing) && isTodaySession(existing));
  const requestVersion = typeof body.version === "number" ? body.version : null;

  if (existing && existingActiveTodaySession && requestVersion !== existing.version) {
    return Response.json(toResponseBody(existing), { status: 409 });
  }

  const now = new Date();
  const updatedAt = now.toISOString();
  const version = existing && existingActiveTodaySession ? existing.version + 1 : 1;
  const state: SessionState = {
    ...body.state,
    id: CURRENT_SESSION_ID,
    attendeesLoading: false,
    attendeesError: null,
    updatedAt,
  };

  await env.DB.prepare(
    `
      INSERT INTO sessions (
        id,
        write_token_hash,
        payload,
        current_round_index,
        created_at,
        updated_at,
        expires_at,
        version
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        current_round_index = excluded.current_round_index,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at,
        version = excluded.version
    `,
  )
    .bind(
      CURRENT_SESSION_ID,
      "admin-auth",
      JSON.stringify(state),
      state.currentRoundIndex,
      existingActiveTodaySession && existing ? existing.created_at : updatedAt,
      updatedAt,
      Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS,
      version,
    )
    .run();

  return Response.json({
    session: state,
    version,
    updatedAt,
  });
};

async function readCurrentSessionRow(db: D1Database): Promise<SessionRow | null> {
  return (
    (await db
      .prepare("SELECT id, payload, version, created_at, updated_at, expires_at FROM sessions WHERE id = ?")
      .bind(CURRENT_SESSION_ID)
      .first<SessionRow>()) ?? null
  );
}

function toResponseBody(row: SessionRow) {
  return {
    session: {
      ...(JSON.parse(row.payload) as SessionState),
      id: row.id,
    },
    version: row.version,
    updatedAt: row.updated_at,
  };
}

function missingDatabaseResponse(): Response {
  return Response.json(
    {
      message: "D1 database binding DB is not configured.",
    },
    { status: 503 },
  );
}

function isExpired(row: SessionRow, now = Date.now()): boolean {
  return row.expires_at <= Math.floor(now / 1000);
}

function isTodaySession(row: SessionRow): boolean {
  try {
    const state = JSON.parse(row.payload) as Partial<SessionState>;
    return !state.attendanceDate || state.attendanceDate === todayDateKey();
  } catch {
    return false;
  }
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
