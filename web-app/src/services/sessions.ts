import type { SessionState } from "@/shared/domain";
import {
  CURRENT_SESSION_API_PATH,
  type RemoteSessionSnapshot,
} from "@/shared/sessionSource";

interface RemoteSessionResponse {
  session: SessionState;
  version: number;
  updatedAt: string;
  message?: string;
}

interface SaveSessionRequest {
  state: SessionState;
  version: number | null;
}

export class SessionConflictError extends Error {
  constructor(readonly snapshot: RemoteSessionSnapshot) {
    super("Remote session changed before this save completed.");
  }
}

export async function fetchCurrentSession(): Promise<RemoteSessionSnapshot | null> {
  const response = await fetch(apiPath(), {
    cache: "no-store",
    credentials: "include",
    headers: {
      accept: "application/json",
    },
  });

  if (response.status === 404) return null;

  const data = (await response.json()) as Partial<RemoteSessionResponse>;

  if (!response.ok) {
    throw new Error(data.message || "Failed to load the shared session.");
  }

  return toSnapshot(data);
}

export async function saveCurrentSession(
  state: SessionState,
  version: number | null,
): Promise<RemoteSessionSnapshot> {
  const body: SaveSessionRequest = {
    state,
    version,
  };
  const response = await fetch(apiPath(), {
    method: "PUT",
    cache: "no-store",
    credentials: "include",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Partial<RemoteSessionResponse>;

  if (response.status === 409) {
    throw new SessionConflictError(toSnapshot(data));
  }

  if (!response.ok) {
    throw new Error(data.message || "Failed to save the shared session.");
  }

  return toSnapshot(data);
}

function apiPath(): string {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
  return `${apiBaseUrl}${CURRENT_SESSION_API_PATH}`;
}

function toSnapshot(data: Partial<RemoteSessionResponse>): RemoteSessionSnapshot {
  if (!data.session || typeof data.version !== "number" || typeof data.updatedAt !== "string") {
    throw new Error("Shared session response shape is invalid.");
  }

  return {
    state: data.session,
    version: data.version,
    updatedAt: data.updatedAt,
  };
}
