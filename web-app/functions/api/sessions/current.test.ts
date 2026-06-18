import { describe, expect, it } from "vitest";

import { createAdminSessionCookie, type AuthEnv } from "../auth/_shared";
import { onRequestPut } from "./current";
import type { SessionState } from "../../../src/shared/domain";
import { CURRENT_SESSION_ID, MATCHING_POLICY_VERSION } from "../../../src/shared/sessionSource";

const adminEnv: AuthEnv = {
  TEAM_DREAM_ADMIN_ID: "admin",
  TEAM_DREAM_ADMIN_PASSWORD: "admin",
  TEAM_DREAM_AUTH_SECRET: "test-secret",
};

describe("current session API", () => {
  it("rejects a stale session version with the latest snapshot", async () => {
    const existingState = makeSessionState({ courtCount: 3 });
    const db = new FakeD1Database([makeRow(existingState, 4)]);
    const response = await putSession(db, makeSessionState({ courtCount: 2 }), 3);

    expect(response.status).toBe(409);
    const body = (await response.json()) as { session: SessionState; version: number };
    expect(body.version).toBe(4);
    expect(body.session.courtCount).toBe(3);
    expect(db.runStatements).toHaveLength(0);
  });

  it("updates an active session with an atomic version guard", async () => {
    const db = new FakeD1Database([makeRow(makeSessionState({ courtCount: 3 }), 4)], [1]);
    const response = await putSession(db, makeSessionState({ courtCount: 2 }), 4);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { session: SessionState; version: number };
    expect(body.version).toBe(5);
    expect(body.session.courtCount).toBe(2);
    expect(db.runStatements[0]?.sql).toContain("UPDATE sessions SET");
    expect(db.runStatements[0]?.sql).toContain("WHERE id = ? AND version = ?");
    expect(db.runStatements[0]?.bindings.at(-1)).toBe(4);
  });

  it("returns a conflict if another writer wins after the initial read", async () => {
    const db = new FakeD1Database(
      [makeRow(makeSessionState({ courtCount: 3 }), 4), makeRow(makeSessionState({ courtCount: 5 }), 5)],
      [0],
    );
    const response = await putSession(db, makeSessionState({ courtCount: 2 }), 4);

    expect(response.status).toBe(409);
    const body = (await response.json()) as { session: SessionState; version: number };
    expect(body.version).toBe(5);
    expect(body.session.courtCount).toBe(5);
  });

  it("does not overwrite a session created by another first writer", async () => {
    const db = new FakeD1Database([null, makeRow(makeSessionState({ courtCount: 4 }), 1)], [0]);
    const response = await putSession(db, makeSessionState({ courtCount: 2 }), null);

    expect(response.status).toBe(409);
    const body = (await response.json()) as { session: SessionState; version: number };
    expect(body.version).toBe(1);
    expect(body.session.courtCount).toBe(4);
    expect(db.runStatements[0]?.sql).toContain("ON CONFLICT(id) DO NOTHING");
  });
});

async function putSession(db: FakeD1Database, state: SessionState, version: number | null): Promise<Response> {
  const cookie = await createAdminSessionCookie(adminEnv);
  const request = {
    headers: {
      get: (name: string) => (name.toLowerCase() === "cookie" ? cookie.split(";")[0] : null),
    },
    json: async () => ({
      state,
      version,
    }),
  } as Request;

  return onRequestPut({
    env: {
      ...adminEnv,
      DB: db as unknown as D1Database,
    },
    request,
  } as unknown as EventContext<unknown, string, Record<string, unknown>>);
}

function makeSessionState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: CURRENT_SESSION_ID,
    matchingPolicyVersion: MATCHING_POLICY_VERSION,
    title: "오늘 경기",
    courtCount: 3,
    attendees: [],
    attendeesLoading: false,
    attendeesError: null,
    attendeesFetchedAt: null,
    attendanceDate: null,
    sourceMembersCount: 0,
    unmatchedAttendanceNames: [],
    companionPairs: [],
    courts: [],
    upcomingMatches: [],
    waitingQueue: [],
    completedMatches: [],
    matchSequence: 0,
    rounds: [],
    currentRoundIndex: 0,
    updatedAt: null,
    undoStack: [],
    ...overrides,
  };
}

function makeRow(state: SessionState, version: number) {
  return {
    id: CURRENT_SESSION_ID,
    payload: JSON.stringify(state),
    version,
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: `2026-06-10T00:00:0${version}.000Z`,
    expires_at: 99_999_999_999,
  };
}

class FakeD1Database {
  readonly runStatements: Array<{ sql: string; bindings: unknown[] }> = [];

  constructor(
    private readonly firstRows: Array<ReturnType<typeof makeRow> | null>,
    private readonly changes: number[] = [],
  ) {}

  prepare(sql: string) {
    return new FakeD1Statement(this, sql);
  }

  nextFirstRow() {
    return this.firstRows.shift() ?? null;
  }

  nextChanges() {
    return this.changes.shift() ?? 1;
  }
}

class FakeD1Statement {
  private bindings: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    readonly sql: string,
  ) {}

  bind(...bindings: unknown[]) {
    this.bindings = bindings;
    return this;
  }

  async first<T>() {
    return this.db.nextFirstRow() as T | null;
  }

  async run() {
    this.db.runStatements.push({
      sql: this.sql,
      bindings: this.bindings,
    });

    return {
      meta: {
        changes: this.db.nextChanges(),
      },
    };
  }
}
