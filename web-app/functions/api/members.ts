import { parseMembersCsv } from "../../src/shared/parseMembersCsv";
import { MEMBERS_SHEET_CSV_URL } from "../../src/shared/memberSource";
import type { MembersResponse } from "../../src/shared/memberSource";

interface Env {
  TEAM_DREAM_SHEET_API_URL?: string;
  TEAM_DREAM_SHEET_API_TOKEN?: string;
  MEMBERS_SHEET_CSV_URL?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const membersFromAppsScript = await fetchMembersFromAppsScript(env);
    if (membersFromAppsScript) return Response.json(membersFromAppsScript);

    return Response.json(await fetchMembersFromCsv(env));
  } catch (error) {
    return Response.json(
      {
        message: "회원명단을 불러오지 못했습니다.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
};

async function fetchMembersFromAppsScript(env: Env): Promise<MembersResponse | null> {
  const apiUrl = env.TEAM_DREAM_SHEET_API_URL?.trim();
  if (!apiUrl) return null;

  const url = new URL(apiUrl);
  url.searchParams.set("action", "members");
  appendToken(url, env);

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Apps Script returned ${response.status}`);
  }

  const data = (await response.json()) as MembersResponse & { ok?: boolean; message?: string };
  if (data.ok === false) {
    throw new Error(data.message || "Apps Script rejected the members request.");
  }

  if (!Array.isArray(data.members)) {
    throw new Error("Apps Script members response shape is invalid.");
  }

  return data;
}

async function fetchMembersFromCsv(env: Env): Promise<MembersResponse> {
  const url = env.MEMBERS_SHEET_CSV_URL || MEMBERS_SHEET_CSV_URL;
  const response = await fetch(url, {
    headers: {
      accept: "text/csv",
    },
  });

  if (!response.ok) {
    throw new Error(`Google Sheets CSV returned ${response.status}`);
  }

  const csv = await response.text();
  const members = parseMembersCsv(csv);

  return {
    members,
    count: members.length,
    fetchedAt: new Date().toISOString(),
  };
}

function appendToken(url: URL, env: Env): void {
  const token = env.TEAM_DREAM_SHEET_API_TOKEN?.trim();
  if (token) url.searchParams.set("token", token);
}
