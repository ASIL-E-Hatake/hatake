/**
 * 検索欄の既定値（`filter.defaultValue`）を、**その日の値**に解く（0.9.23）。
 *
 * 決めるのはここだけで、画面（Flutter / Vue / React）は検索欄の初期値に、一覧は最初の
 * 読み込みの条件に、ここが返したものを使う。Dart 版は `hatake_core` の `filterDefaults`。
 * 同じ答えになることは `spec/conformance/filter_defaults.json` が見ている。
 *
 * **形の合わない書き方は出さない**（知らない語・範囲の語を範囲でない条件に書いた、など）。
 * 変な条件で黙って読むより、既定値が無いほうが安全。書き間違いは `validate` の
 * `filter-default-unusable` が言う。
 */

/** 1日を指す相対の語。 */
export const SINGLE_DATE_WORDS = [
  "$today",
  "$startOfMonth",
  "$endOfMonth",
  "$startOfYear",
  "$endOfYear",
] as const;

/** 範囲（`between`）にだけ書ける語。`[はじめ, おわり]` になる。 */
export const RANGE_DATE_WORDS = ["$thisMonth", "$thisYear"] as const;

const two = (n: number): string => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): string => `${y}-${two(m)}-${two(d)}`;
/** その月の日数（`m` は 1〜12）。 */
const daysIn = (y: number, m: number): number => new Date(y, m, 0).getDate();

/** 語か（`$` で始まる字）。 */
const isWord = (v: unknown): v is string => typeof v === "string" && v.startsWith("$");

type Resolved = { ok: true; value: unknown } | { ok: false };

/** 1つの値を解く（範囲の語はここでは解けない）。 */
function single(value: unknown, today: Date): Resolved {
  if (!isWord(value)) return { ok: true, value };
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  switch (value) {
    case "$today":
      return { ok: true, value: iso(y, m, today.getDate()) };
    case "$startOfMonth":
      return { ok: true, value: iso(y, m, 1) };
    case "$endOfMonth":
      return { ok: true, value: iso(y, m, daysIn(y, m)) };
    case "$startOfYear":
      return { ok: true, value: iso(y, 1, 1) };
    case "$endOfYear":
      return { ok: true, value: iso(y, 12, 31) };
    default:
      return { ok: false };
  }
}

/** 範囲の語を `[はじめ, おわり]` に解く。 */
function range(value: string, today: Date): [string, string] | undefined {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  if (value === "$thisMonth") return [iso(y, m, 1), iso(y, m, daysIn(y, m))];
  if (value === "$thisYear") return [iso(y, 1, 1), iso(y, 12, 31)];
  return undefined;
}

/** 1つの絞り込みの既定値を解く。出さないなら undefined。 */
function resolve(
  filter: { readonly operator: string; readonly defaultValue?: unknown },
  today: Date,
): unknown {
  const value = filter.defaultValue;
  if (value === undefined || value === null) return undefined;

  if (filter.operator === "between") {
    if (typeof value === "string") return range(value, today);
    if (!Array.isArray(value) || value.length !== 2) return undefined;
    const pair: unknown[] = [];
    for (const one of value) {
      if (one === null || one === undefined) {
        pair.push(null);
        continue;
      }
      const got = single(one, today);
      if (!got.ok) return undefined;
      pair.push(got.value);
    }
    return pair[0] === null && pair[1] === null ? undefined : pair;
  }

  if (Array.isArray(value)) {
    if (filter.operator !== "in") return undefined;
    const list: unknown[] = [];
    for (const one of value) {
      const got = single(one, today);
      if (!got.ok) return undefined;
      list.push(got.value);
    }
    return list;
  }

  const got = single(value, today);
  return got.ok ? got.value : undefined;
}

/**
 * 検索欄の既定値を、[today] の日で解いたもの（項目名 → 値。絞り込みの順）。
 * `between` は `[from, to]`（片方は null でよい）。既定値の無い絞り込みは入らない。
 */
export function filterDefaults(
  search:
    | { readonly filters: readonly { readonly field: string; readonly operator: string; readonly defaultValue?: unknown }[] }
    | undefined,
  today: Date = new Date(),
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const filter of search?.filters ?? []) {
    const value = resolve(filter, today);
    if (value !== undefined) out[filter.field] = value;
  }
  return out;
}

/**
 * 既定値の書き方の間違い（`validate` の `filter-default-unusable` が使う）。
 * 無ければ undefined、在れば人に見せる理由。
 */
export function filterDefaultProblem(filter: {
  readonly operator: string;
  readonly defaultValue?: unknown;
}): string | undefined {
  const value = filter.defaultValue;
  if (value === undefined || value === null) return undefined;
  const known = new Set<string>([...SINGLE_DATE_WORDS, ...RANGE_DATE_WORDS]);
  const words = (Array.isArray(value) ? value : [value]).filter(isWord);
  const unknown = words.find((one) => !known.has(one));
  if (unknown !== undefined) {
    return `知らない語 "${unknown}" です（書けるのは ${[...SINGLE_DATE_WORDS, ...RANGE_DATE_WORDS].join(" / ")}）`;
  }
  const isRangeWord = (one: unknown): boolean =>
    typeof one === "string" && (RANGE_DATE_WORDS as readonly string[]).includes(one);
  if (filter.operator === "between") {
    if (typeof value === "string") {
      return isRangeWord(value)
        ? undefined
        : "範囲（between）の既定値は [from, to] か、範囲の語（$thisMonth / $thisYear）で書きます";
    }
    if (!Array.isArray(value) || value.length !== 2) {
      return "範囲（between）の既定値は [from, to] の2つで書きます";
    }
    if (value.some(isRangeWord)) {
      return "範囲の語（$thisMonth / $thisYear）は [from, to] の中には書けません（それだけで範囲になります）";
    }
    return undefined;
  }
  if (isRangeWord(value)) {
    return `範囲の語 "${String(value)}" は範囲（between）の絞り込みにだけ書けます`;
  }
  if (Array.isArray(value) && filter.operator !== "in") {
    return "並び（[…]）は範囲（between）か in の絞り込みにだけ書けます";
  }
  return undefined;
}
