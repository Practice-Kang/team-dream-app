import { parseMembersCsv } from "../../src/shared/parseMembersCsv";
import { MEMBERS_SHEET_CSV_URL } from "../../src/shared/memberSource";

interface Env {
  MEMBERS_SHEET_CSV_URL?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const url = env.MEMBERS_SHEET_CSV_URL || MEMBERS_SHEET_CSV_URL;
  const response = await fetch(url, {
    headers: {
      accept: "text/csv",
    },
  });

  if (!response.ok) {
    return Response.json(
      {
        message: "회원명단을 불러오지 못했습니다.",
      },
      { status: 502 },
    );
  }

  const csv = await response.text();
  const members = parseMembersCsv(csv);

  return Response.json({
    members,
    count: members.length,
    fetchedAt: new Date().toISOString(),
  });
};
