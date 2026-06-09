export type Gender = "남" | "여";
export type PlayFrequencyPreference = "high" | "normal" | "low";
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
  isGuest?: boolean;
}

export interface Attendee extends Member {
  selectedAt: string;
  playCount: number;
  waitCount: number;
  playFrequencyPreference: PlayFrequencyPreference;
  isDisabled?: boolean;
  disabledAt?: string | null;
}

export interface GuestAttendeeInput {
  name: string;
  gender: Gender;
  skillScore: number;
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

export type MatchTeamKey = "teamA" | "teamB";

export interface MatchSlot {
  team: MatchTeamKey;
  playerIndex: number;
}

export type EditableMatchTarget =
  | {
      type: "court";
      courtNumber: number;
    }
  | {
      type: "upcoming";
      index: number;
    };

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

export type SessionSnapshot = Omit<SessionState, "undoStack">;

export interface SessionUndoEntry {
  label: string;
  createdAt: string;
  state: SessionSnapshot;
}

export interface SessionState {
  id: string | null;
  matchingPolicyVersion: number;
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
  undoStack: SessionUndoEntry[];
}

export function effectiveGamesPlayed(attendee: Pick<Attendee, "playCount" | "playFrequencyPreference">): number {
  return attendee.playCount / PLAY_FREQUENCY_WEIGHTS[attendee.playFrequencyPreference];
}
