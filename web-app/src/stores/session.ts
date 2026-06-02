import { defineStore } from "pinia";

import { generateRound } from "@/matching/generateRound";
import type { Attendee, CourtState, PlayFrequencyPreference, QueueStatus, SessionState } from "@/shared/domain";
import { createSampleAttendees } from "@/shared/sampleData";

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

export const useSessionStore = defineStore("session", {
  state: (): SessionState => ({
    id: null,
    title: "오늘 경기",
    courtCount: 3,
    attendees: createSampleAttendees(),
    courts: emptyCourts(3),
    waitingQueue: [],
    completedMatches: [],
    matchSequence: 0,
    rounds: [],
    currentRoundIndex: 0,
    updatedAt: null,
  }),
  getters: {
    selectedCount: (state) => state.attendees.length,
    playingCount: (state) =>
      state.courts.reduce((count, court) => count + (court.match ? matchPlayers(court.match).length : 0), 0),
    waitingCount: (state) => state.waitingQueue.length,
    completedGameCount: (state) => state.completedMatches.length,
    hasInProgressCourt: (state) => state.courts.some((court) => court.status === "inProgress"),
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
    sharePath: (state) => (state.id ? `/board/${state.id}` : null),
  },
  actions: {
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
    },
    setAttendees(attendees: Attendee[]) {
      this.attendees = attendees;
    },
    setFrequencyPreference(attendeeId: string, preference: PlayFrequencyPreference) {
      const attendee = this.attendees.find((candidate) => candidate.id === attendeeId);
      if (!attendee) return;

      attendee.playFrequencyPreference = preference;
      this.updatedAt = new Date().toISOString();
    },
    setQueueStatus(attendeeId: string, status: QueueStatus) {
      const attendee = this.attendees.find((candidate) => candidate.id === attendeeId);
      if (!attendee) return;

      attendee.queueStatus = attendee.queueStatus === status ? "normal" : status;
      this.updatedAt = new Date().toISOString();
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
    },
    startCourt(courtNumber: number) {
      const court = this.courts.find((candidate) => candidate.courtNumber === courtNumber);
      if (!court || court.status !== "assigned") return;

      court.status = "inProgress";
      court.startedAt = new Date().toISOString();
      this.updatedAt = court.startedAt;
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
