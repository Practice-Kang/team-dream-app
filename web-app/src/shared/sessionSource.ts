import type { SessionState } from "./domain";

export const CURRENT_SESSION_ID = "current";
export const CURRENT_SESSION_API_PATH = "/api/sessions/current";
export const MATCHING_POLICY_VERSION = 5;
export const SESSION_POLL_INTERVAL_MS = 5_000;

export interface RemoteSessionSnapshot {
  state: SessionState;
  version: number;
  updatedAt: string;
}
