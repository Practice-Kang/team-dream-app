import { parseMembersCsv } from "../../src/shared/parseMembersCsv";

interface Env {
  MEMBERS_SHEET_CSV_URL?: string;
}

const DEFAULT_MEMBERS_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1IWyUCa6DJCJ2ET-DTNQLoEkHw9tcx42w3CWCR196dMQ/gviz/tq?tqx=out:csv&sheet=%ED%9A%8C%EC%9B%90%EB%AA%85%EB%8B%A8";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const url = env.MEMBERS_SHEET_CSV_URL || DEFAULT_MEMBERS_SHEET_CSV_URL;
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
