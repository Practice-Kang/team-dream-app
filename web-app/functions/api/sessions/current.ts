import { verifyAdminRequest, type AuthEnv } from "../auth/_shared";
import { todayDateKey } from "../../../src/shared/dateKey";
import type { SessionState } from "../../../src/shared/domain";
import { CURRENT_SESSION_ID, MATCHING_POLICY_VERSION } from "../../../src/shared/sessionSource";

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

  if (body.state.matchingPolicyVersion !== MATCHING_POLICY_VERSION) {
    return Response.json(
      {
        message: "새 매칭 정책이 배포되었습니다. 운영자 화면을 새로고침한 뒤 다시 시도해주세요.",
      },
      { status: 412 },
    );
  }

  if (hasInvalidActiveMatchSize(body.state)) {
    return Response.json({ message: "시작 전 경기와 다음 경기는 반드시 4명이어야 합니다." }, { status: 422 });
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
    matchingPolicyVersion: MATCHING_POLICY_VERSION,
    attendeesLoading: false,
    attendeesError: null,
    updatedAt,
  };

  const saved = existingActiveTodaySession
    ? await updateActiveTodaySession(env.DB, state, updatedAt, version, requestVersion)
    : await saveNewOrInactiveSession(env.DB, state, updatedAt, version, existing);

  if (!saved) {
    const latest = await readCurrentSessionRow(env.DB);
    if (latest && !isExpired(latest) && isTodaySession(latest)) {
      return Response.json(toResponseBody(latest), { status: 409 });
    }

    return Response.json({ message: "공유 경기판이 먼저 변경되었습니다. 다시 시도해주세요." }, { status: 409 });
  }

  return Response.json({
    session: state,
    version,
    updatedAt,
  });
};

async function updateActiveTodaySession(
  db: D1Database,
  state: SessionState,
  updatedAt: string,
  version: number,
  requestVersion: number | null,
): Promise<boolean> {
  if (requestVersion === null) return false;

  const result = await db
    .prepare(
      `
        UPDATE sessions SET
          payload = ?,
          current_round_index = ?,
          updated_at = ?,
          expires_at = ?,
          version = ?
        WHERE id = ? AND version = ?
      `,
    )
    .bind(
      JSON.stringify(state),
      state.currentRoundIndex,
      updatedAt,
      sessionExpiresAt(),
      version,
      CURRENT_SESSION_ID,
      requestVersion,
    )
    .run();

  return (result.meta?.changes ?? 0) === 1;
}

async function saveNewOrInactiveSession(
  db: D1Database,
  state: SessionState,
  updatedAt: string,
  version: number,
  existing: SessionRow | null,
): Promise<boolean> {
  if (existing) {
    return replaceInactiveSession(db, state, updatedAt, version, existing.version);
  }

  const result = await db
    .prepare(
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
        ON CONFLICT(id) DO NOTHING
      `,
    )
    .bind(
      CURRENT_SESSION_ID,
      "admin-auth",
      JSON.stringify(state),
      state.currentRoundIndex,
      updatedAt,
      updatedAt,
      sessionExpiresAt(),
      version,
    )
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

async function replaceInactiveSession(
  db: D1Database,
  state: SessionState,
  updatedAt: string,
  version: number,
  existingVersion: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `
        UPDATE sessions SET
          write_token_hash = ?,
          payload = ?,
          current_round_index = ?,
          created_at = ?,
          updated_at = ?,
          expires_at = ?,
          version = ?
        WHERE id = ? AND version = ?
      `,
    )
    .bind(
      "admin-auth",
      JSON.stringify(state),
      state.currentRoundIndex,
      updatedAt,
      updatedAt,
      sessionExpiresAt(),
      version,
      CURRENT_SESSION_ID,
      existingVersion,
    )
    .run();

  return (result.meta?.changes ?? 0) === 1;
}

async function readCurrentSessionRow(db: D1Database): Promise<SessionRow | null> {
  return (
    (await db
      .prepare("SELECT id, payload, version, created_at, updated_at, expires_at FROM sessions WHERE id = ?")
      .bind(CURRENT_SESSION_ID)
      .first<SessionRow>()) ?? null
  );
}

function sessionExpiresAt(now = Date.now()): number {
  return Math.floor(now / 1000) + SESSION_TTL_SECONDS;
}

function toResponseBody(row: SessionRow) {
  const session = {
    ...(JSON.parse(row.payload) as SessionState),
    id: row.id,
  };

  return {
    session,
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
    Array.isArray(state.upcomingMatches) &&
    Array.isArray(state.waitingQueue) &&
    Array.isArray(state.completedMatches)
  );
}

interface MatchShape {
  teamA?: {
    players?: unknown[];
  };
  teamB?: {
    players?: unknown[];
  };
}

function hasInvalidActiveMatchSize(state: SessionState): boolean {
  return (
    state.courts.some((court) => Boolean(court.match) && countMatchPlayers(court.match) !== 4) ||
    state.upcomingMatches.some((match) => countMatchPlayers(match) !== 4)
  );
}

function countMatchPlayers(match: MatchShape | null): number {
  if (!match) return 0;

  const teamAPlayers = Array.isArray(match.teamA?.players) ? match.teamA.players : [];
  const teamBPlayers = Array.isArray(match.teamB?.players) ? match.teamB.players : [];

  return teamAPlayers.length + teamBPlayers.length;
}
