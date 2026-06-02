import type { Member } from "./domain";

type CsvRow = Record<string, string>;

const HEADER_NAME = "회원명";
const HEADER_LEVEL = "급수(지역)";
const HEADER_LEVEL_LEGACY = "급수";
const HEADER_SCORE = "점수(백분위)";
const HEADER_SCORE_LEGACY = "점수";

export function parseMembersCsv(csv: string): Member[] {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim());

  return rows
    .slice(1)
    .map((values, index) => toRow(headers, values, index))
    .filter((row) => row[HEADER_NAME])
    .map((row) => toMember(row));
}

function toMember(row: CsvRow): Member {
  const name = row[HEADER_NAME].trim();
  const no = parseInteger(row.No);
  const gender = row["성별"] === "여" ? "여" : "남";

  return {
    id: name,
    no,
    name,
    joinedAt: row["가입일"] || "",
    level: row[HEADER_LEVEL] || row[HEADER_LEVEL_LEGACY] || "",
    skillScore: parseSkillScore(row[HEADER_SCORE] || row[HEADER_SCORE_LEGACY]),
    gender,
    isStaff: normalizeYn(row["운영진(Y/N)"]),
    isExempt: normalizeYn(row["면제(Y/N)"]),
  };
}

function toRow(headers: string[], values: string[], rowIndex: number): CsvRow {
  const row: CsvRow = {};

  headers.forEach((header, index) => {
    if (!header) return;
    row[header] = values[index]?.trim() ?? "";
  });

  if (!row.No) row.No = String(rowIndex + 1);
  return row;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((currentRow) => currentRow.some((cell) => cell.trim()));
}

function parseInteger(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseSkillScore(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;

  return Math.round(parsed);
}

function normalizeYn(value: string | undefined): boolean {
  return String(value || "").trim().toUpperCase() === "Y";
}
