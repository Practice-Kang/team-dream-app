import { MEMBERS_API_PATH, TODAY_ATTENDEES_API_PATH } from "@/shared/memberSource";
import type { MembersResponse, TodayAttendeesResponse } from "@/shared/memberSource";

export async function fetchMembers(): Promise<MembersResponse> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
  const response = await fetch(`${apiBaseUrl}${MEMBERS_API_PATH}`, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("회원명단을 불러오지 못했습니다.");
  }

  const data = (await response.json()) as MembersResponse;

  if (!Array.isArray(data.members)) {
    throw new Error("회원명단 응답 형식이 올바르지 않습니다.");
  }

  return data;
}

export async function fetchTodayAttendees(): Promise<TodayAttendeesResponse> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
  const response = await fetch(`${apiBaseUrl}${TODAY_ATTENDEES_API_PATH}`, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("오늘 참석자를 불러오지 못했습니다.");
  }

  const data = (await response.json()) as TodayAttendeesResponse;

  if (!Array.isArray(data.attendees)) {
    throw new Error("오늘 참석자 응답 형식이 올바르지 않습니다.");
  }

  return data;
}
