import type { Attendee, CourtState, QueuedMatch, SessionState } from "@/shared/domain";
import { todayDateKey } from "@/shared/dateKey";

const SESSION_STORAGE_KEY = "team-dream.session.v1";
const SESSION_STORAGE_VERSION = 1;
const MAX_PERSISTED_SESSION_AGE_MS = 18 * 60 * 60 * 1000;

interface PersistedSessionPayload {
  version: typeof SESSION_STORAGE_VERSION;
  savedAt: string;
  state: SessionState;
}

export function loadSessionStateFromStorage(fallback: SessionState): SessionState {
  const storage = getLocalStorage();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return fallback;

    const restored = restoreSessionState(JSON.parse(raw), Date.now());
    return restored ?? fallback;
  } catch {
    storage.removeItem(SESSION_STORAGE_KEY);
    return fallback;
  }
}

export function saveSessionStateToStorage(state: SessionState): void {
  const storage = getLocalStorage();
  if (!storage) return;

  const payload = createPersistedSessionPayload(state);
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
}

export function restoreSessionState(payload: unknown, now: number): SessionState | null {
  if (!isPersistedSessionPayload(payload)) return null;

  const savedAt = Date.parse(payload.savedAt);
  if (!Number.isFinite(savedAt) || now - savedAt > MAX_PERSISTED_SESSION_AGE_MS) return null;

  const state = sanitizeSessionState(payload.state);
  if (state.attendanceDate && state.attendanceDate !== todayDateKey(new Date(now))) return null;

  relinkAttendeeReferences(state);

  return state;
}

export function createPersistedSessionPayload(state: SessionState, savedAt = new Date().toISOString()): PersistedSessionPayload {
  return {
    version: SESSION_STORAGE_VERSION,
    savedAt,
    state: sanitizeSessionState(state),
  };
}

export function sanitizeSessionState(state: SessionState): SessionState {
  const { upcomingMatches, waitingQueue } = normalizeUpcomingAndWaiting(state.upcomingMatches, state.waitingQueue);

  return {
    id: state.id,
    matchingPolicyVersion: typeof state.matchingPolicyVersion === "number" ? state.matchingPolicyVersion : 0,
    title: state.title,
    courtCount: state.courtCount,
    attendees: Array.isArray(state.attendees) ? state.attendees : [],
    attendeesLoading: false,
    attendeesError: null,
    attendeesFetchedAt: state.attendeesFetchedAt,
    attendanceDate: state.attendanceDate,
    sourceMembersCount: state.sourceMembersCount,
    courts: normalizeCourts(state.courts, state.courtCount),
    upcomingMatches,
    waitingQueue,
    completedMatches: Array.isArray(state.completedMatches) ? state.completedMatches : [],
    matchSequence: state.matchSequence,
    rounds: Array.isArray(state.rounds) ? state.rounds : [],
    currentRoundIndex: state.currentRoundIndex,
    updatedAt: state.updatedAt,
    unmatchedAttendanceNames: Array.isArray(state.unmatchedAttendanceNames) ? state.unmatchedAttendanceNames : [],
  };
}

function normalizeCourts(courts: CourtState[], courtCount: number): CourtState[] {
  const normalized = Array.isArray(courts) ? courts.slice(0, courtCount) : [];

  while (normalized.length < courtCount) {
    normalized.push({
      courtNumber: normalized.length + 1,
      status: "empty",
      match: null,
      assignedAt: null,
      startedAt: null,
    });
  }

  return normalized.map((court, index) => ({
    ...court,
    courtNumber: index + 1,
    status: court.match ? court.status : "empty",
  }));
}

function normalizeQueuedMatches(matches: QueuedMatch[] | undefined): QueuedMatch[] {
  return Array.isArray(matches)
    ? matches.filter((match) => Array.isArray(match.teamA?.players) && Array.isArray(match.teamB?.players))
    : [];
}

function normalizeUpcomingAndWaiting(
  matches: QueuedMatch[] | undefined,
  waitingPlayers: Attendee[] | undefined,
): Pick<SessionState, "upcomingMatches" | "waitingQueue"> {
  const normalizedMatches = normalizeQueuedMatches(matches);
  const [firstMatch, ...extraMatches] = normalizedMatches;
  const waitingQueue = [
    ...extraMatches.flatMap((match) => [...match.teamA.players, ...match.teamB.players]),
    ...(Array.isArray(waitingPlayers) ? waitingPlayers : []),
  ];

  return {
    upcomingMatches: firstMatch ? [firstMatch] : [],
    waitingQueue,
  };
}

function relinkAttendeeReferences(state: SessionState): void {
  const attendeesById = new Map(state.attendees.map((attendee) => [attendee.id, attendee]));

  state.upcomingMatches.forEach((match) => {
    match.teamA.players = match.teamA.players.map((player) => attendeeReference(player, attendeesById));
    match.teamB.players = match.teamB.players.map((player) => attendeeReference(player, attendeesById));
  });

  state.waitingQueue = state.waitingQueue.map((player) => attendeeReference(player, attendeesById));

  state.courts.forEach((court) => {
    if (!court.match) return;

    court.match.teamA.players = court.match.teamA.players.map((player) => attendeeReference(player, attendeesById));
    court.match.teamB.players = court.match.teamB.players.map((player) => attendeeReference(player, attendeesById));
  });
}

function attendeeReference(player: Attendee, attendeesById: Map<string, Attendee>): Attendee {
  return attendeesById.get(player.id) ?? player;
}

function isPersistedSessionPayload(value: unknown): value is PersistedSessionPayload {
  if (!value || typeof value !== "object") return false;

  const payload = value as Partial<PersistedSessionPayload>;
  const state = payload.state as Partial<SessionState> | undefined;

  return (
    payload.version === SESSION_STORAGE_VERSION &&
    typeof payload.savedAt === "string" &&
    Boolean(state) &&
    Array.isArray(state?.attendees) &&
    Array.isArray(state?.courts)
  );
}

function getLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
