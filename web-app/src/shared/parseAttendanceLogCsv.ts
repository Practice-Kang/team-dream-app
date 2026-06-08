import { parseCsvRows } from "./csv";
import { toDateKey } from "./dateKey";

type CsvRow = Record<string, string>;

const HEADER_DATE = "출석일";
const HEADER_MEMBER_NAME = "회원명";
const HEADER_ATTENDANCE = "참석";
const HEADER_MANAGER = "입력자";
const HEADER_MEMO = "메모";
const HEADER_RECORDED_AT = "입력시각";

export interface AttendanceRecord {
  dateKey: string;
  memberName: string;
  attendance: string;
  manager: string;
  memo: string;
  recordedAt: string;
}

export function parseAttendanceLogCsv(csv: string): AttendanceRecord[] {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim());

  return rows
    .slice(1)
    .map((values) => toRow(headers, values))
    .map((row) => toAttendanceRecord(row))
    .filter((record): record is AttendanceRecord => Boolean(record));
}

export function checkedMemberNamesForDate(records: AttendanceRecord[], dateKey: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  records.forEach((record) => {
    if (record.dateKey !== dateKey) return;
    if (record.attendance !== "O") return;
    if (seen.has(record.memberName)) return;

    seen.add(record.memberName);
    names.push(record.memberName);
  });

  return names;
}

function toAttendanceRecord(row: CsvRow): AttendanceRecord | null {
  const dateKey = toDateKey(row[HEADER_DATE]);
  const memberName = row[HEADER_MEMBER_NAME]?.trim();
  const attendance = row[HEADER_ATTENDANCE]?.trim().toUpperCase();

  if (!dateKey || !memberName) return null;

  return {
    dateKey,
    memberName,
    attendance,
    manager: row[HEADER_MANAGER] || "",
    memo: row[HEADER_MEMO] || "",
    recordedAt: row[HEADER_RECORDED_AT] || "",
  };
}

function toRow(headers: string[], values: string[]): CsvRow {
  const row: CsvRow = {};

  headers.forEach((header, index) => {
    if (!header) return;
    row[header] = values[index]?.trim() ?? "";
  });

  return row;
}
