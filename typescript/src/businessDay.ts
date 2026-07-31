import { isoOf, toUtc, ymd } from "./dates.js";

// 営業日ユーティリティ。土日＋注入された祝日集合を「休み」とみなす。
// 祝日カレンダーは外部データなので引数で渡す（yyyy-MM-dd 文字列）。

function asSet(holidays: Iterable<string>): Set<string> {
  return holidays instanceof Set ? holidays : new Set(holidays);
}

function isHoliday(dt: Date, holidays: Set<string>): boolean {
  const day = dt.getUTCDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6 || holidays.has(isoOf(dt));
}

export function isBusinessDay(
  date: string | Date,
  holidays: Iterable<string> = [],
): boolean {
  return !isHoliday(toUtc(ymd(date)), asSet(holidays));
}

export function nextBusinessDay(
  date: string | Date,
  holidays: Iterable<string> = [],
): string {
  const set = asSet(holidays);
  const dt = toUtc(ymd(date));
  do {
    dt.setUTCDate(dt.getUTCDate() + 1);
  } while (isHoliday(dt, set));
  return isoOf(dt);
}

export function prevBusinessDay(
  date: string | Date,
  holidays: Iterable<string> = [],
): string {
  const set = asSet(holidays);
  const dt = toUtc(ymd(date));
  do {
    dt.setUTCDate(dt.getUTCDate() - 1);
  } while (isHoliday(dt, set));
  return isoOf(dt);
}
