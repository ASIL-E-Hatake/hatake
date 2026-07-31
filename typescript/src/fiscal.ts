import { ymd } from "./dates.js";

// 会計年度・四半期・半期。開始月 startMonth（既定 4）で調整。Dart/Java 版と同一。

const monthIndex = (month: number, startMonth: number): number =>
  (month - startMonth + 12) % 12;

export function fiscalYear(date: string | Date, startMonth = 4): number {
  const { y, m } = ymd(date);
  return m >= startMonth ? y : y - 1;
}

export function fiscalQuarter(date: string | Date, startMonth = 4): number {
  return Math.floor(monthIndex(ymd(date).m, startMonth) / 3) + 1;
}

export function fiscalHalf(date: string | Date, startMonth = 4): number {
  return Math.floor(monthIndex(ymd(date).m, startMonth) / 6) + 1;
}
