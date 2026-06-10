import { defineStore } from "pinia";

import { buildBalancedTeams, generateRound } from "@/matching/generateRound";
import { fetchTodayAttendees } from "@/services/members";
import { fetchCurrentSession, saveCurrentSession, SessionConflictError } from "@/services/sessions";
import type {
  Attendee,
  CompanionPair,
  CourtState,
  EditableMatchTarget,
  GuestAttendeeInput,
  Match,
  MatchSlot,
  PlayFrequencyPreference,
  QueuedMatch,
  SessionState,
} from "@/shared/domain";
import { CURRENT_SESSION_ID, MATCHING_POLICY_VERSION, type RemoteSessionSnapshot } from "@/shared/sessionSource";
import { createSessionSnapshot, sanitizeSessionState } from "@/stores/sessionPersistence";

type SyncStatus = "idle" | "loading" | "saving" | "error";
const MAX_UNDO_STACK_SIZE = 10;

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

function matchPlayers(match: Pick<Match | QueuedMatch, "teamA" | "teamB">): Attendee[] {
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
    companionPairs: [],
    courts: emptyCourts(3),
    upcomingMatches: [],
    waitingQueue: [],
    completedMatches: [],
    matchSequence: 0,
    rounds: [],
    currentRoundIndex: 0,
    updatedAt: null,
    undoStack: [],
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
    activeAttendeeCount: (state) => state.attendees.filter((attendee) => isActiveAttendee(attendee)).length,
    disabledCount: (state) => state.attendees.filter((attendee) => attendee.isDisabled).length,
    playingCount: (state) =>
      state.courts.reduce((count, court) => count + (court.match ? matchPlayers(court.match).length : 0), 0),
    upcomingPlayerCount: (state) =>
      state.upcomingMatches.reduce((count, match) => count + matchPlayers(match).length, 0),
    waitingCount: (state) =>
      state.waitingQueue.length +
      state.upcomingMatches.reduce((count, match) => count + matchPlayers(match).length, 0),
    completedGameCount: (state) => state.completedMatches.length,
    guestCount: (state) => state.attendees.filter((attendee) => attendee.isGuest).length,
    companionPairCount: (state) => state.companionPairs.length,
    canUndo: (state) => state.undoStack.length > 0,
    lastUndoLabel: (state) => state.undoStack.at(-1)?.label ?? null,
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
      const undoEntry = options.resetSession && hasMeaningfulSession(this) ? createUndoEntry(this, "출석기록 새로고침 전") : null;

      try {
        const response = await fetchTodayAttendees();
        this.id = CURRENT_SESSION_ID;
        this.matchingPolicyVersion = MATCHING_POLICY_VERSION;
        this.attendees = response.attendees;
        this.attendeesFetchedAt = response.fetchedAt;
        this.attendanceDate = response.attendanceDate;
        this.sourceMembersCount = response.membersCount;
        this.unmatchedAttendanceNames = response.unmatchedNames;
        this.companionPairs = [];
        this.courts = emptyCourts(this.courtCount);
        this.upcomingMatches = [];
        this.waitingQueue = [];
        this.completedMatches = [];
        this.rounds = [];
        this.currentRoundIndex = 0;
        this.matchSequence = 0;
        this.updatedAt = response.fetchedAt;
        this.undoStack = undoEntry ? appendUndoEntry(this.undoStack, undoEntry) : [];
        await this.persistRemoteSession();
      } catch (error) {
        this.attendeesError = error instanceof Error ? error.message : "오늘 참석자를 불러오지 못했습니다.";
      } finally {
        this.attendeesLoading = false;
      }
    },
    setCourtCount(count: number) {
      const nextCount = Math.max(1, Math.floor(count));
      if (nextCount === this.courtCount) return;

      this.pushUndo("코트 수 변경 전");
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
      this.pushUndo("참석자 변경 전");
      this.attendees = attendees;
      this.companionPairs = validCompanionPairsForAttendees(this.companionPairs, attendees);
      this.updatedAt = new Date().toISOString();
      void this.persistRemoteSession();
    },
    addGuestAttendee(input: GuestAttendeeInput) {
      const guest = createGuestAttendee(input);
      if (!guest) return null;

      this.pushUndo("게스트 추가 전");
      this.id = CURRENT_SESSION_ID;
      this.matchingPolicyVersion = MATCHING_POLICY_VERSION;
      this.attendees.push(guest);

      if (hasBuiltMatchPlan(this)) {
        this.waitingQueue.push(guest);
        if (this.upcomingMatches.length === 0 && this.waitingQueue.length >= 4) {
          this.rebuildUpcomingMatchesFromGroups([this.waitingQueue]);
        }
      }

      this.updatedAt = guest.selectedAt;
      void this.persistRemoteSession();
      return guest;
    },
    setGuestSkillScore(attendeeId: string, skillScore: number) {
      const attendee = this.attendees.find((candidate) => candidate.id === attendeeId);
      if (!attendee?.isGuest || !Number.isFinite(skillScore)) return false;

      const nextSkillScore = normalizeSkillScore(skillScore);
      if (attendee.skillScore === nextSkillScore) return true;

      this.pushUndo("게스트 점수 변경 전");
      updateGuestSkillScoreEverywhere(this, attendeeId, nextSkillScore);
      rebalanceEditableMatchesContainingPlayer(this, attendeeId);
      this.updatedAt = new Date().toISOString();
      void this.persistRemoteSession();
      return true;
    },
    setAttendeeDisabled(attendeeId: string, disabled: boolean) {
      const attendee = this.attendees.find((candidate) => candidate.id === attendeeId);
      if (!attendee || Boolean(attendee.isDisabled) === disabled) return true;
      if (disabled && isPlayerInInProgressCourt(this, attendeeId)) return false;

      const futurePlayers = uniqueActivePlayers(
        [...this.upcomingMatches.flatMap((match) => matchPlayers(match)), ...this.waitingQueue].filter(
          (player) => player.id !== attendeeId,
        ),
      );
      const currentLocation = disabled ? findEditablePlayerLocation(this, attendeeId) : null;
      const assignedCourt = disabled ? findAssignedCourtWithPlayer(this, attendeeId) : null;
      const replacement = assignedCourt ? futurePlayers.shift() : null;

      if (assignedCourt && !replacement) return false;

      const changedAt = new Date().toISOString();
      this.pushUndo(disabled ? "참석자 쉬기 전" : "참석자 복귀 전");
      updateAttendeeDisabledEverywhere(this, attendeeId, disabled, disabled ? changedAt : null);

      if (disabled) {
        if (assignedCourt?.match && replacement) {
          replacePlayerByIdInMatch(assignedCourt.match, attendeeId, replacement);
          rebalanceMatchTeams(assignedCourt.match);
          this.rebuildUpcomingMatchesFromGroups([futurePlayers], { preserveOrder: true });
        } else if (currentLocation?.kind === "waiting") {
          this.waitingQueue = this.waitingQueue.filter((player) => player.id !== attendeeId);
          if (this.upcomingMatches.length === 0 && this.waitingQueue.length >= 4) {
            this.rebuildUpcomingMatchesFromGroups([this.waitingQueue]);
          }
        } else if (currentLocation?.kind === "match") {
          this.rebuildUpcomingMatchesFromGroups([futurePlayers], { preserveOrder: true });
        }
      } else if (hasBuiltMatchPlan(this) && !findEditablePlayerLocation(this, attendeeId)) {
        this.waitingQueue.push(attendee);
        if (this.upcomingMatches.length === 0 && this.waitingQueue.length >= 4) {
          this.rebuildUpcomingMatchesFromGroups([this.waitingQueue]);
        }
      }

      this.updatedAt = changedAt;
      void this.persistRemoteSession();
      return true;
    },
    addCompanionPair(playerAId: string, playerBId: string) {
      const pair = createCompanionPair(this, playerAId, playerBId);
      if (!pair) return false;

      this.pushUndo("우선동반 추가 전");
      this.companionPairs.push(pair);
      this.rebuildFutureMatchesForCompanionPairs();
      this.updatedAt = pair.createdAt;
      void this.persistRemoteSession();
      return true;
    },
    removeCompanionPair(pairId: string) {
      const pairIndex = this.companionPairs.findIndex((pair) => pair.id === pairId);
      if (pairIndex < 0) return false;

      this.pushUndo("우선동반 삭제 전");
      this.companionPairs.splice(pairIndex, 1);
      this.rebuildFutureMatchesForCompanionPairs();
      this.updatedAt = new Date().toISOString();
      void this.persistRemoteSession();
      return true;
    },
    setFrequencyPreference(attendeeId: string, preference: PlayFrequencyPreference) {
      const attendee = this.attendees.find((candidate) => candidate.id === attendeeId);
      if (!attendee || attendee.playFrequencyPreference === preference) return;

      this.pushUndo("빈도 변경 전");
      attendee.playFrequencyPreference = preference;
      this.updatedAt = new Date().toISOString();
      void this.persistRemoteSession();
    },
    generateNextRound() {
      this.assignInitialCourts();
    },
    assignInitialCourts() {
      if (this.hasInProgressCourt) return;

      this.pushUndo(
        this.hasAssignedCourt || this.upcomingMatches.length > 0 || this.waitingQueue.length > 0
          ? "코트 재배정 전"
          : "첫 코트 배정 전",
      );
      const round = generateRound({
        attendees: this.attendees.filter((attendee) => isActiveAttendee(attendee)),
        courtCount: this.courtCount,
        seed: `${this.rounds.length + 1}`,
        companionPairs: this.companionPairs,
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
      if (this.upcomingMatches.length === 0 && this.waitingQueue.length < 4) return;

      this.pushUndo(`${courtNumber}코트 배정 전`);
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

      this.pushUndo(`${courtNumber}코트 시작 전`);
      court.status = "inProgress";
      court.startedAt = new Date().toISOString();
      this.updatedAt = court.startedAt;
      void this.persistRemoteSession();
    },
    finishCourt(courtNumber: number) {
      const court = this.courts.find((candidate) => candidate.courtNumber === courtNumber);
      if (!court?.match || court.status !== "inProgress") return;

      this.pushUndo(`${courtNumber}코트 종료 전`);
      const completedAt = new Date().toISOString();
      const finishedPlayers = matchPlayers(court.match);

      finishedPlayers.forEach((player) => {
        player.playCount += 1;
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
    undoLastChange() {
      const undoEntry = this.undoStack.at(-1);
      if (!undoEntry) return;

      const restored = sanitizeSessionState({
        ...undoEntry.state,
        matchingPolicyVersion: MATCHING_POLICY_VERSION,
        undoStack: this.undoStack.slice(0, -1),
        updatedAt: new Date().toISOString(),
      });
      Object.assign(this, restored);
      void this.persistRemoteSession();
    },
    replaceEditableMatchPlayer(target: EditableMatchTarget, slot: MatchSlot, replacementId: string) {
      const targetMatch = editableMatchForTarget(this, target);
      const currentPlayer = targetMatch?.[slot.team]?.players[slot.playerIndex];
      if (!targetMatch || !currentPlayer) return false;
      if (currentPlayer.id === replacementId) return true;

      const replacementLocation = findEditablePlayerLocation(this, replacementId);
      if (!replacementLocation || replacementLocation.kind === "locked" || replacementLocation.player.isDisabled) return false;

      this.pushUndo("경기 수정 전");
      targetMatch[slot.team].players[slot.playerIndex] = replacementLocation.player;

      if (replacementLocation.kind === "match") {
        replacementLocation.match[replacementLocation.slot.team].players[replacementLocation.slot.playerIndex] =
          currentPlayer;
        rebalanceMatchTeams(replacementLocation.match);
      } else {
        this.waitingQueue.splice(replacementLocation.index, 1, currentPlayer);
      }

      rebalanceMatchTeams(targetMatch);
      this.updatedAt = new Date().toISOString();
      void this.persistRemoteSession();
      return true;
    },
    pushUndo(label: string) {
      this.undoStack = appendUndoEntry(this.undoStack, createUndoEntry(this, label));
    },
    rebuildUpcomingMatchesFromGroups(groups: Attendee[][], options: { preserveOrder?: boolean } = {}) {
      const rawIdlePlayers = options.preserveOrder === false ? groups.flat() : interleavePlayerGroups(groups);
      const idlePlayers = uniqueActivePlayers(rawIdlePlayers);
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
        companionPairs: this.companionPairs,
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
    rebuildFutureMatchesForCompanionPairs() {
      if (this.upcomingMatches.length === 0 && this.waitingQueue.length === 0) return;

      this.rebuildUpcomingMatchesFromGroups(
        [
          ...this.upcomingMatches.map((match) => matchPlayers(match)),
          this.waitingQueue,
        ],
        { preserveOrder: true },
      );
    },
  },
});

function createUndoEntry(state: SessionState, label: string) {
  return {
    label,
    createdAt: new Date().toISOString(),
    state: createSessionSnapshot(state),
  };
}

function appendUndoEntry<T>(stack: T[], entry: T): T[] {
  return [...stack, entry].slice(-MAX_UNDO_STACK_SIZE);
}

function isActiveAttendee(attendee: Attendee): boolean {
  return !attendee.isDisabled;
}

function uniqueActivePlayers(players: Attendee[]): Attendee[] {
  const seenIds = new Set<string>();
  const uniquePlayers: Attendee[] = [];

  players.forEach((player) => {
    if (!isActiveAttendee(player) || seenIds.has(player.id)) return;
    seenIds.add(player.id);
    uniquePlayers.push(player);
  });

  return uniquePlayers;
}

function hasMeaningfulSession(state: SessionState): boolean {
  return (
    state.attendees.length > 0 ||
    state.courts.some((court) => court.match) ||
    state.upcomingMatches.length > 0 ||
    state.waitingQueue.length > 0 ||
    state.completedMatches.length > 0 ||
    state.companionPairs.length > 0
  );
}

function hasBuiltMatchPlan(state: SessionState): boolean {
  return (
    state.courts.some((court) => court.match) ||
    state.upcomingMatches.length > 0 ||
    state.waitingQueue.length > 0 ||
    state.completedMatches.length > 0
  );
}

function createCompanionPair(state: SessionState, playerAId: string, playerBId: string): CompanionPair | null {
  if (!playerAId || !playerBId || playerAId === playerBId) return null;

  const playerA = state.attendees.find((attendee) => attendee.id === playerAId);
  const playerB = state.attendees.find((attendee) => attendee.id === playerBId);
  if (!playerA || !playerB) return null;
  if (isPlayerInCompanionPairs(state.companionPairs, playerAId) || isPlayerInCompanionPairs(state.companionPairs, playerBId)) {
    return null;
  }

  return {
    id: normalizedCompanionPairId(playerAId, playerBId),
    playerAId,
    playerBId,
    createdAt: new Date().toISOString(),
  };
}

function validCompanionPairsForAttendees(pairs: CompanionPair[], attendees: Attendee[]): CompanionPair[] {
  const attendeeIds = new Set(attendees.map((attendee) => attendee.id));
  const usedPlayerIds = new Set<string>();

  return pairs.filter((pair) => {
    if (pair.playerAId === pair.playerBId) return false;
    if (!attendeeIds.has(pair.playerAId) || !attendeeIds.has(pair.playerBId)) return false;
    if (usedPlayerIds.has(pair.playerAId) || usedPlayerIds.has(pair.playerBId)) return false;

    usedPlayerIds.add(pair.playerAId);
    usedPlayerIds.add(pair.playerBId);
    return true;
  });
}

function isPlayerInCompanionPairs(pairs: CompanionPair[], playerId: string): boolean {
  return pairs.some((pair) => pair.playerAId === playerId || pair.playerBId === playerId);
}

function normalizedCompanionPairId(playerAId: string, playerBId: string): string {
  return `companion-${[playerAId, playerBId].sort().join("-")}`;
}

function createGuestAttendee(input: GuestAttendeeInput): Attendee | null {
  const name = input.name.trim();
  if (!name || !Number.isFinite(input.skillScore)) return null;

  const selectedAt = new Date().toISOString();
  const skillScore = normalizeSkillScore(input.skillScore);

  return {
    id: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    no: null,
    name,
    joinedAt: "",
    level: "게스트",
    skillScore,
    gender: input.gender,
    isStaff: false,
    isExempt: false,
    isGuest: true,
    selectedAt,
    playCount: 0,
    waitCount: 0,
    playFrequencyPreference: "normal",
    isDisabled: false,
    disabledAt: null,
  };
}

function normalizeSkillScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function updateAttendeeDisabledEverywhere(
  state: SessionState,
  attendeeId: string,
  isDisabled: boolean,
  disabledAt: string | null,
): void {
  const updatePlayers = (players: Attendee[]) => {
    players.forEach((player) => {
      if (player.id === attendeeId) {
        player.isDisabled = isDisabled;
        player.disabledAt = disabledAt;
      }
    });
  };

  updatePlayers(state.attendees);
  updatePlayers(state.waitingQueue);

  state.courts.forEach((court) => {
    if (court.match) updatePlayers(matchPlayers(court.match));
  });

  state.upcomingMatches.forEach((match) => updatePlayers(matchPlayers(match)));
  state.completedMatches.forEach((completedMatch) => updatePlayers(matchPlayers(completedMatch.match)));
  state.rounds.forEach((round) => {
    round.matches.forEach((match) => updatePlayers(matchPlayers(match)));
    updatePlayers(round.waiting);
  });
}

function updateGuestSkillScoreEverywhere(state: SessionState, attendeeId: string, skillScore: number): void {
  const updatePlayers = (players: Attendee[]) => {
    players.forEach((player) => {
      if (player.id === attendeeId && player.isGuest) {
        player.skillScore = skillScore;
      }
    });
  };

  updatePlayers(state.attendees);
  updatePlayers(state.waitingQueue);

  state.courts.forEach((court) => {
    if (court.match) updatePlayers(matchPlayers(court.match));
  });

  state.upcomingMatches.forEach((match) => updatePlayers(matchPlayers(match)));
  state.completedMatches.forEach((completedMatch) => updatePlayers(matchPlayers(completedMatch.match)));
  state.rounds.forEach((round) => {
    round.matches.forEach((match) => updatePlayers(matchPlayers(match)));
    updatePlayers(round.waiting);
  });
}

function rebalanceEditableMatchesContainingPlayer(state: SessionState, attendeeId: string): void {
  state.courts.forEach((court) => {
    if (court.status === "assigned" && court.match && matchPlayers(court.match).some((player) => player.id === attendeeId)) {
      rebalanceMatchTeams(court.match);
    }
  });

  state.upcomingMatches.forEach((match) => {
    if (matchPlayers(match).some((player) => player.id === attendeeId)) {
      rebalanceMatchTeams(match);
    }
  });
}

function isPlayerInInProgressCourt(state: SessionState, playerId: string): boolean {
  return state.courts.some(
    (court) =>
      court.status === "inProgress" &&
      court.match &&
      matchPlayers(court.match).some((player) => player.id === playerId),
  );
}

function findAssignedCourtWithPlayer(state: SessionState, playerId: string): CourtState | null {
  return (
    state.courts.find(
      (court) =>
        court.status === "assigned" &&
        court.match &&
        matchPlayers(court.match).some((player) => player.id === playerId),
    ) ?? null
  );
}

function replacePlayerByIdInMatch(match: Match | QueuedMatch, playerId: string, replacement: Attendee): boolean {
  const location = findPlayerInMatch(match, playerId);
  if (!location) return false;

  location.match[location.slot.team].players[location.slot.playerIndex] = replacement;
  return true;
}

function editableMatchForTarget(state: SessionState, target: EditableMatchTarget): Match | QueuedMatch | null {
  if (target.type === "upcoming") {
    return state.upcomingMatches[target.index] ?? null;
  }

  const court = state.courts.find((candidate) => candidate.courtNumber === target.courtNumber);
  if (!court || court.status !== "assigned") return null;

  return court.match;
}

type EditablePlayerLocation =
  | {
      kind: "match";
      match: Match | QueuedMatch;
      slot: MatchSlot;
      player: Attendee;
    }
  | {
      kind: "waiting";
      index: number;
      player: Attendee;
    }
  | {
      kind: "locked";
      player: Attendee;
    };

function findEditablePlayerLocation(state: SessionState, playerId: string): EditablePlayerLocation | null {
  for (const court of state.courts) {
    if (!court.match) continue;

    const location = findPlayerInMatch(court.match, playerId);
    if (!location) continue;

    return court.status === "inProgress"
      ? {
          kind: "locked",
          player: location.player,
        }
      : location;
  }

  for (const match of state.upcomingMatches) {
    const location = findPlayerInMatch(match, playerId);
    if (location) return location;
  }

  const waitingIndex = state.waitingQueue.findIndex((player) => player.id === playerId);
  if (waitingIndex >= 0) {
    return {
      kind: "waiting",
      index: waitingIndex,
      player: state.waitingQueue[waitingIndex],
    };
  }

  return null;
}

function findPlayerInMatch(match: Match | QueuedMatch, playerId: string): Extract<EditablePlayerLocation, { kind: "match" }> | null {
  for (const team of ["teamA", "teamB"] as const) {
    const playerIndex = match[team].players.findIndex((player) => player.id === playerId);
    if (playerIndex >= 0) {
      return {
        kind: "match",
        match,
        slot: {
          team,
          playerIndex,
        },
        player: match[team].players[playerIndex],
      };
    }
  }

  return null;
}

function rebalanceMatchTeams(match: Match | QueuedMatch): void {
  const players = matchPlayers(match);
  if (players.length !== 4) return;

  const [teamA, teamB] = buildBalancedTeams(players);
  match.teamA = teamA;
  match.teamB = teamB;
}
