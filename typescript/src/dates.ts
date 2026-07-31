// Internal date helpers (UTC-based to avoid timezone/DST drift; matches the
// Dart/Java editions which run on date-only values).

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

export function ymd(date: string | Date): Ymd {
  if (typeof date === "string") {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { y: +m[1], m: +m[2], d: +m[3] };
    const dd = new Date(date);
    if (!Number.isNaN(dd.getTime())) {
      return { y: dd.getUTCFullYear(), m: dd.getUTCMonth() + 1, d: dd.getUTCDate() };
    }
    throw new Error(`Invalid date: ${date}`);
  }
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

export function toUtc(p: Ymd): Date {
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

export function isoOf(dt: Date): string {
  const two = (n: number): string => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${two(dt.getUTCMonth() + 1)}-${two(dt.getUTCDate())}`;
}
