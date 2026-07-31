import { ymd, type Ymd } from "./dates.js";

/** 元号（和暦）の定義。改元日 (y/m/d) で区切る。Dart / Java 版と同一テーブル。 */
export interface Era {
  name: string;
  abbr: string;
  y: number;
  m: number;
  d: number;
}

/** 組込みの元号テーブル（新しい順）。wareki フォーマッタと eraOf が共有する。 */
export const ERAS: Era[] = [
  { name: "令和", abbr: "R", y: 2019, m: 5, d: 1 },
  { name: "平成", abbr: "H", y: 1989, m: 1, d: 8 },
  { name: "昭和", abbr: "S", y: 1926, m: 12, d: 25 },
  { name: "大正", abbr: "T", y: 1912, m: 7, d: 30 },
  { name: "明治", abbr: "M", y: 1868, m: 10, d: 23 },
];

/** eraOf の結果。元号名・略記・和暦年（元年 = 1）。 */
export interface EraDate {
  name: string;
  abbr: string;
  year: number;
}

function cmp(a: Ymd, e: Era): number {
  return a.y - e.y || a.m - e.m || a.d - e.d;
}

/** ymd から元号を算出する（明治より前は null）。 */
export function eraOfYmd(p: Ymd): EraDate | null {
  const era = ERAS.find((e) => cmp(p, e) >= 0);
  if (!era) return null;
  return { name: era.name, abbr: era.abbr, year: p.y - era.y + 1 };
}

/** 日付の元号を算出する（明治より前は null）。Dart / Java 版と同名・同出力。 */
export function eraOf(date: string | Date): EraDate | null {
  return eraOfYmd(ymd(date));
}
