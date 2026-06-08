import { defineStore } from "pinia";

import { generateRound } from "@/matching/generateRound";
import { fetchTodayAttendees } from "@/services/members";
import { fetchCurrentSession, saveCurrentSession, SessionConflictError } from "@/services/sessions";
import type { Attendee, CourtState, PlayFrequencyPreference, QueueStatus, SessionState } from "@/shared/domain";
import { CURRENT_SESSION_ID, type RemoteSessionSnapshot } from "@/shared/sessionSource";
import { loadSessionStateFromStorage, sanitizeSessionState } from "@/stores/sessionPersistence";

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

function matchPlayers(match: NonNullable<CourtState["match"]>): Attendee[] {
  return [...match.teamA.players, ...match.teamB.players];
}

function defaultSessionState(): SessionState {
  return {
    id: null,
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
    ...loadSessionStateFromStorage(defaultSessionState()),
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
    waitingCount: (state) => state.waitingQueue.length,
    completedGameCount: (state) => state.completedMatches.length,
    hasInProgressCourt: (state) => state.courts.some((court) => court.status === "inProgress"),
    hasAssignedCourt: (state) => state.courts.some((court) => court.match),
    currentRound: (state) => {
      const matches = state.courts.flatMap((court) => (court.match ? [court.match] : []));
      if (matches.length === 0 && state.waitingQueue.length === 0) return null;

      return {
        id: "live-courts",
        matches,
        waiting: state.waitingQueue,
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
        const snapshot = await saveCurrentSession(sanitizeSessionState(this), this.remoteVersion);
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
    async loadTodayAttendees() {
      if (this.hasAssignedCourt || this.completedMatches.length > 0) return;

      this.attendeesLoading = true;
      this.attendeesError = null;

      try {
        const response = await fetchTodayAttendees();
        this.id = CURRENT_SESSION_ID;
        this.attendees = response.attendees;
        this.attendeesFetchedAt = response.fetchedAt;
        this.attendanceDate = response.attendanceDate;
        this.sourceMembersCount = response.membersCount;
        this.unmatchedAttendanceNames = response.unmatchedNames;
        this.courts = emptyCourts(this.courtCount);
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
      this.rounds.push(round);
      this.currentRoundIndex = this.rounds.length - 1;
      this.matchSequence += round.matches.length;
      this.updatedAt = assignedAt;
      void this.persistRemoteSession();
    },
    assignSingleCourt(courtNumber: number) {
      const court = this.courts.find((candidate) => candidate.courtNumber === courtNumber);
      if (!court || court.status === "inProgress") return;

      if (court.match && court.status === "assigned") {
        this.waitingQueue = [...this.waitingQueue, ...matchPlayers(court.match)];
      }

      const round = generateRound({
        attendees: this.waitingQueue,
        courtCount: 1,
        seed: `${courtNumber}-${this.completedMatches.length + 1}`,
      });
      const match = round.matches[0] ?? null;
      const assignedAt = new Date().toISOString();

      if (!match) {
        court.status = "empty";
        court.match = null;
        court.assignedAt = null;
        court.startedAt = null;
        this.updatedAt = assignedAt;
        void this.persistRemoteSession();
        return;
      }

      court.status = "assigned";
      court.match = {
        ...match,
        courtNumber,
      };
      court.assignedAt = assignedAt;
      court.startedAt = null;
      this.waitingQueue = round.waiting;
      this.matchSequence += 1;
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
      this.waitingQueue = [...this.waitingQueue, ...finishedPlayers];

      court.status = "empty";
      court.match = null;
      court.assignedAt = null;
      court.startedAt = null;
      this.updatedAt = completedAt;

      this.assignSingleCourt(courtNumber);
    },
  },
});
