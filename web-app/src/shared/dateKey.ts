const KOREA_TIME_ZONE = "Asia/Seoul";

export function todayDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function toDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return toValidDateKey(value);

  const normalized = value.trim();
  if (!normalized) return null;

  const dateTimeKey = toKoreaDateKeyFromSpreadsheetDateTime(normalized);
  if (dateTimeKey) return dateTimeKey;

  const numericParts = normalized.match(/\d+/g);
  if (!numericParts || numericParts.length < 3) return null;

  const [yearText, monthText, dayText] = numericParts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toValidDateKey(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toKoreaDateKeyFromSpreadsheetDateTime(value: string): string | null {
  const match = value.match(
    /^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\.?\s+(오전|오후)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const meridiem = match[4];
  let hour = Number(match[5]);
  const minute = Number(match[6]);
  const second = Number(match[7] || 0);

  if (meridiem === "오후" && hour < 12) hour += 12;
  if (meridiem === "오전" && hour === 12) hour = 0;

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return todayDateKey(date);
}
