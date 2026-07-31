import { ymd } from "./dates.js";

export interface Tenure {
  years: number;
  months: number;
}

function totalMonths(from: string | Date, to: string | Date): number {
  const a = ymd(from);
  const b = ymd(to);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return months;
}

/** from → to の満年・月（勤続年数など）。Dart/Java 版と同一。 */
export function tenure(from: string | Date, to: string | Date): Tenure {
  const t = totalMonths(from, to);
  return { years: Math.trunc(t / 12), months: t % 12 };
}

/** asOf 時点の満年齢。 */
export function ageAt(birth: string | Date, asOf: string | Date): number {
  return tenure(birth, asOf).years;
}
