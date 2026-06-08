export type Gender = "남" | "여";
export type PlayFrequencyPreference = "high" | "normal" | "low";
export type QueueStatus = "normal" | "priority" | "hold";
export type CourtStatus = "empty" | "assigned" | "inProgress";

export const PLAY_FREQUENCY_WEIGHTS: Record<PlayFrequencyPreference, number> = {
  high: 1.2,
  normal: 1,
  low: 0.8,
};

export const PLAY_FREQUENCY_LABELS: Record<PlayFrequencyPreference, string> = {
  high: "높음",
  normal: "일반",
  low: "낮음",
};

export interface Member {
  id: string;
  no: number | null;
  name: string;
  joinedAt: string;
  level: string;
  skillScore: number | null;
  gender: Gender;
  isStaff: boolean;
  isExempt: boolean;
}

export interface Attendee extends Member {
  selectedAt: string;
  playCount: number;
  waitCount: number;
  playFrequencyPreference: PlayFrequencyPreference;
  queueStatus: QueueStatus;
}

export interface Team {
  players: Attendee[];
}

export interface Match {
  id: string;
  courtNumber: number;
  teamA: Team;
  teamB: Team;
}

export interface QueuedMatch {
  id: string;
  teamA: Team;
  teamB: Team;
}

export interface CourtState {
  courtNumber: number;
  status: CourtStatus;
  match: Match | null;
  assignedAt: string | null;
  startedAt: string | null;
}

export interface CompletedMatch {
  match: Match;
  completedAt: string;
}

export interface Round {
  id: string;
  matches: Match[];
  waiting: Attendee[];
  generatedAt: string;
}

export interface PlayerRoundStats {
  gamesPlayed: number;
  waits: number;
  playedPreviousRound: boolean;
}

export interface SessionState {
  id: string | null;
  title: string;
  courtCount: number;
  attendees: Attendee[];
  attendeesLoading: boolean;
  attendeesError: string | null;
  attendeesFetchedAt: string | null;
  attendanceDate: string | null;
  sourceMembersCount: number;
  unmatchedAttendanceNames: string[];
  courts: CourtState[];
  upcomingMatches: QueuedMatch[];
  waitingQueue: Attendee[];
  completedMatches: CompletedMatch[];
  matchSequence: number;
  rounds: Round[];
  currentRoundIndex: number;
  updatedAt: string | null;
}

export function effectiveGamesPlayed(attendee: Pick<Attendee, "playCount" | "playFrequencyPreference">): number {
  return attendee.playCount / PLAY_FREQUENCY_WEIGHTS[attendee.playFrequencyPreference];
}
