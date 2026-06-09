import { defineStore } from "pinia";

import { generateRound } from "@/matching/generateRound";
import { fetchTodayAttendees } from "@/services/members";
import { fetchCurrentSession, saveCurrentSession, SessionConflictError } from "@/services/sessions";
import type {
  Attendee,
  CourtState,
  Match,
  PlayFrequencyPreference,
  QueuedMatch,
  QueueStatus,
  SessionState,
} from "@/shared/domain";
import { CURRENT_SESSION_ID, MATCHING_POLICY_VERSION, type RemoteSessionSnapshot } from "@/shared/sessionSource";
import { sanitizeSessionState } from "@/stores/sessionPersistence";

type SyncStatus = "idle" | "loading" | "saving" | "error";

interface SessionStoreState extends SessionState {
  remoteVersion: number | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncedAt: string | null;
  lastPolledAt: string | null;
}

function emptyCourts(count: number): CourtState[] {
  return Array.from({ length: count }, (_, index) => ({
    courtNumber: index + 1,
    status: "empty",
    match: null,
    assignedAt: null,
    startedAt: null,
  }));
}

function matchPlayers(match: Pick<Match, "teamA" | "teamB">): Attendee[] {
  return [...match.teamA.players, ...match.teamB.players];
}

function interleavePlayerGroups(groups: Attendee[][]): Attendee[] {
  const nonEmptyGroups = groups.filter((group) => group.length > 0);
  const players: Attendee[] = [];
  let index = 0;

  while (nonEmptyGroups.some((group) => index < group.length)) {
    nonEmptyGroups.forEach((group) => {
      const player = group[index];
      if (player) players.push(player);
    });
    index += 1;
  }

  return players;
}

function defaultSessionState(): SessionState {
  return {
    id: null,
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
    courts: emptyCourts(3),
    upcomingMatches: [],
    waitingQueue: [],
    completedMatches: [],
    matchSequence: 0,
    rounds: [],
    currentRoundIndex: 0,
    updatedAt: null,
  };
}

function defaultStoreState(): SessionStoreState {
  return {
    ...defaultSessionState(),
    remoteVersion: null,
    syncStatus: "idle",
    syncError: null,
    lastSyncedAt: null,
    lastPolledAt: null,
  };
}

export const useSessionStore = defineStore("session", {
  state: (): SessionStoreState => defaultStoreState(),
  getters: {
    selectedCount: (state) => state.attendees.length,
    playingCount: (state) =>
      state.courts.reduce((count, court) => count + (court.match ? matchPlayers(court.match).length : 0), 0),
    upcomingPlayerCount: (state) =>
      state.upcomingMatches.reduce((count, match) => count + matchPlayers(match).length, 0),
    waitingCount: (state) =>
      state.waitingQueue.length +
      state.upcomingMatches.reduce((count, match) => count + matchPlayers(match).length, 0),
    completedGameCount: (state) => state.completedMatches.length,
    hasInProgressCourt: (state) => state.courts.some((court) => court.status === "inProgress"),
    hasAssignedCourt: (state) => state.courts.some((court) => court.match),
    currentRound: (state) => {
      const matches = state.courts.flatMap((court) => (court.match ? [court.match] : []));
      const waiting = [...state.upcomingMatches.flatMap((match) => matchPlayers(match)), ...state.waitingQueue];
      if (matches.length === 0 && waiting.length === 0) return null;

      return {
        id: "live-courts",
        matches,
        waiting,
        generatedAt: state.updatedAt ?? "",
      };
    },
    sharePath: (state) => `/board/${state.id || CURRENT_SESSION_ID}`,
  },
  actions: {
    async loadRemoteSession(options: { silent?: boolean } = {}) {
      if (!options.silent) {
        this.syncStatus = "loading";
        this.syncError = null;
      }

      try {
        const snapshot = await fetchCurrentSession();
        this.lastPolledAt = new Date().toISOString();

        if (!snapshot) {
          if (!options.silent) this.syncStatus = "idle";
          return false;
        }

        if (snapshot.version !== this.remoteVersion) {
          this.applyRemoteSession(snapshot);
        }

        this.syncStatus = "idle";
        this.syncError = null;
        return true;
      } catch (error) {
        this.syncStatus = "error";
        this.syncError = error instanceof Error ? error.message : "공유 경기판을 불러오지 못했습니다.";
        return false;
      }
    },
    applyRemoteSession(snapshot: RemoteSessionSnapshot) {
      const state = sanitizeSessionState(snapshot.state);
      state.matchingPolicyVersion = MATCHING_POLICY_VERSION;

      Object.assign(this, state, {
        remoteVersion: snapshot.version,
        syncStatus: "idle" as SyncStatus,
        syncError: null,
        lastSyncedAt: snapshot.updatedAt,
        lastPolledAt: new Date().toISOString(),
      });
    },
    async persistRemoteSession() {
      this.syncStatus = "saving";
      this.syncError = null;

      try {
        const state = {
          ...sanitizeSessionState(this),
          matchingPolicyVersion: MATCHING_POLICY_VERSION,
        };
        const snapshot = await saveCurrentSession(state, this.remoteVersion);
        this.applyRemoteSession(snapshot);
      } catch (error) {
        if (error instanceof SessionConflictError) {
          this.applyRemoteSession(error.snapshot);
          this.syncError = "공유 경기판이 먼저 변경되어 최신 상태로 다시 맞췄습니다.";
          return;
        }

        this.syncStatus = "error";
        this.syncError = error instanceof Error ? error.message : "공유 경기판을 저장하지 못했습니다.";
      }
    },
    async loadTodayAttendees(options: { resetSession?: boolean } = {}) {
      if (!options.resetSession && (this.hasAssignedCourt || this.completedMatches.length > 0)) return;

      this.attendeesLoading = true;
      this.attendeesError = null;

      try {
        const response = await fetchTodayAttendees();
        this.id = CURRENT_SESSION_ID;
        this.matchingPolicyVersion = MATCHING_POLICY_VERSION;
        this.attendees = response.attendees;
        this.attendeesFetchedAt = response.fetchedAt;
        this.attendanceDate = response.attendanceDate;
        this.sourceMembersCount = response.membersCount;
        this.unmatchedAttendanceNames = response.unmatchedNames;
        this.courts = emptyCourts(this.courtCount);
        this.upcomingMatches = [];
        this.waitingQueue = [];
        this.completedMatches = [];
        this.rounds = [];
        this.currentRoundIndex = 0;
        this.matchSequence = 0;
        this.updatedAt = response.fetchedAt;
        await this.persistRemoteSession();
      } catch (error) {
        this.attendeesError = error instanceof Error ? error.message : "오늘 참석자를 불러오지 못했습니다.";
      } finally {
        this.attendeesLoading = false;
      }
    },
    setCourtCount(count: number) {
      const nextCount = Math.max(1, Math.floor(count));
      const currentCourts = this.courts.slice(0, nextCount);

      while (currentCourts.length < nextCount) {
        currentCourts.push({
          courtNumber: currentCourts.length + 1,
          status: "empty",
          match: null,
          assignedAt: null,
          startedAt: null,
        });
      }

      this.courtCount = nextCount;
      this.courts = currentCourts.map((court, index) => ({
        ...court,
        courtNumber: index + 1,
      }));
      this.updatedAt = new Date().toISOString();
      void this.persistRemoteSession();
    },
    setAttendees(attendees: Attendee[]) {
      this.attendees = attendees;
      this.updatedAt = new Date().toISOString();
      void this.persistRemoteSession();
    },
    setFrequencyPreference(attendeeId: string, preference: PlayFrequencyPreference) {
      const attendee = this.attendees.find((candidate) => candidate.id === attendeeId);
      if (!attendee) return;

      attendee.playFrequencyPreference = preference;
      this.updatedAt = new Date().toISOString();
      void this.persistRemoteSession();
    },
    setQueueStatus(attendeeId: string, status: QueueStatus) {
      const attendee = this.attendees.find((candidate) => candidate.id === attendeeId);
      if (!attendee) return;

      attendee.queueStatus = attendee.queueStatus === status ? "normal" : status;
      this.updatedAt = new Date().toISOString();
      this.rebuildUpcomingMatchesFromGroups([
        ...this.upcomingMatches.map((match) => matchPlayers(match)),
        this.waitingQueue,
      ]);
      void this.persistRemoteSession();
    },
    generateNextRound() {
      this.assignInitialCourts();
    },
    assignInitialCourts() {
      if (this.hasInProgressCourt) return;

      const round = generateRound({
        attendees: this.attendees,
        courtCount: this.courtCount,
        seed: `${this.rounds.length + 1}`,
      });
      const assignedAt = new Date().toISOString();

      this.id = CURRENT_SESSION_ID;
      this.matchingPolicyVersion = MATCHING_POLICY_VERSION;
      this.courts = emptyCourts(this.courtCount).map((court) => {
        const match = round.matches.find((candidate) => candidate.courtNumber === court.courtNumber) ?? null;

        return {
          ...court,
          status: match ? "assigned" : "empty",
          match,
          assignedAt: match ? assignedAt : null,
        };
      });
      this.waitingQueue = round.waiting;
      this.upcomingMatches = [];
      this.rebuildUpcomingMatchesFromGroups([this.waitingQueue], { preserveOrder: false });
      this.rounds.push(round);
      this.currentRoundIndex = this.rounds.length - 1;
      this.matchSequence += round.matches.length + this.upcomingMatches.length;
      this.updatedAt = assignedAt;
      void this.persistRemoteSession();
    },
    assignSingleCourt(courtNumber: number) {
      const court = this.courts.find((candidate) => candidate.courtNumber === courtNumber);
      if (!court || court.status !== "empty") return;

      if (this.upcomingMatches.length === 0) {
        this.rebuildUpcomingMatchesFromGroups([this.waitingQueue]);
      }

      const assignedAt = new Date().toISOString();
      const assigned = this.assignNextQueuedMatchToCourt(court, assignedAt);
      if (!assigned) {
        court.status = "empty";
        court.match = null;
        court.assignedAt = null;
        court.startedAt = null;
      }

      this.rebuildUpcomingMatchesFromGroups([
        ...this.upcomingMatches.map((match) => matchPlayers(match)),
        this.waitingQueue,
      ]);
      this.updatedAt = assignedAt;
      void this.persistRemoteSession();
    },
    startCourt(courtNumber: number) {
      const court = this.courts.find((candidate) => candidate.courtNumber === courtNumber);
      if (!court || court.status !== "assigned") return;

      court.status = "inProgress";
      court.startedAt = new Date().toISOString();
      this.updatedAt = court.startedAt;
      void this.persistRemoteSession();
    },
    finishCourt(courtNumber: number) {
      const court = this.courts.find((candidate) => candidate.courtNumber === courtNumber);
      if (!court?.match || court.status !== "inProgress") return;

      const completedAt = new Date().toISOString();
      const finishedPlayers = matchPlayers(court.match);

      finishedPlayers.forEach((player) => {
        player.playCount += 1;
        player.queueStatus = "normal";
      });

      this.completedMatches.push({
        match: court.match,
        completedAt,
      });

      court.status = "empty";
      court.match = null;
      court.assignedAt = null;
      court.startedAt = null;

      const assigned = this.assignNextQueuedMatchToCourt(court, completedAt);
      const idlePlayers = interleavePlayerGroups([
        ...this.upcomingMatches.map((match) => matchPlayers(match)),
        this.waitingQueue,
        finishedPlayers,
      ]);
      this.rebuildUpcomingMatchesFromGroups([idlePlayers]);

      if (!assigned) {
        this.assignNextQueuedMatchToCourt(court, completedAt);
        this.rebuildUpcomingMatchesFromGroups([
          ...this.upcomingMatches.map((match) => matchPlayers(match)),
          this.waitingQueue,
        ]);
      }

      this.updatedAt = completedAt;
      void this.persistRemoteSession();
    },
    rebuildUpcomingMatchesFromGroups(groups: Attendee[][], options: { preserveOrder?: boolean } = {}) {
      const idlePlayers = options.preserveOrder === false ? groups.flat() : interleavePlayerGroups(groups);
      const gameCount = Math.floor(idlePlayers.length / 4);
      this.upcomingMatches = [];

      if (gameCount <= 0) {
        this.waitingQueue = idlePlayers;
        return;
      }

      const round = generateRound({
        attendees: idlePlayers,
        courtCount: Math.min(1, gameCount),
        seed: `upcoming-${this.completedMatches.length}-${this.matchSequence}`,
        preserveOrder: options.preserveOrder !== false,
      });

      const queuedMatches = round.matches.map((match): QueuedMatch => ({
        id: `queued-${match.id}`,
        teamA: match.teamA,
        teamB: match.teamB,
      }));

      this.upcomingMatches = queuedMatches;
      this.waitingQueue = round.waiting;
    },
    assignNextQueuedMatchToCourt(court: CourtState, assignedAt: string) {
      const queuedMatch = this.upcomingMatches.shift();
      if (!queuedMatch) return false;

      court.status = "assigned";
      court.match = {
        ...queuedMatch,
        courtNumber: court.courtNumber,
      };
      court.assignedAt = assignedAt;
      court.startedAt = null;
      this.matchSequence += 1;
      return true;
    },
  },
});
