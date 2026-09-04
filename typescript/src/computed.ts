// 計算項目（computed）をレコードから導出する。Dart / Java 版と同結果。
//
// モードは2つ。
//
//   { op: product, fields: [qty, price] }        同じレコードの項目を畳む
//   { op: sum, field: lines, of: amount }        **明細（subTable）の行**を畳む
//
// 行を畳む側は、集約の語彙（count / sum / avg / min / max）と実装を
// [builtinAggregates] からそのまま借りる＝**同じ集約を2つ持たない**（ダッシュボードの
// カードと `compare` の検証と、同じ数が出る）。`join` だけは数ではなく文字を作る
// （行を並べて1行にする）ので、集約ではなくここで実装する。
//
// 行を畳む側は `where` で**畳む前に行を絞れる**（条件の言葉は visibleWhen と同じもの
// ＝条件の書き方を2つ持たない。判定するのは行1件）。
//
// `field` を使う側の前提: 行が**親のレコードと一緒に来ている**こと。`source` を持つ
// subTable はページ送りで別に持つので、ここには行が無い（`hatake validate` が言う）。

import { builtinAggregates, rowsMatching, rowsSorted, rowsTop } from "./aggregate.js";
import { MessageResolver } from "./messageResolver.js";

export type ComputedFn = (
  computed: Record<string, unknown>,
  record: Record<string, unknown>,
) => unknown;

function toNum(v: unknown): number | null {
  if (typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "" || Number.isNaN(Number(t))) return null;
    return Number(t);
  }
  return null;
}

const str = (v: unknown): string => (v == null ? "" : String(v));

const fieldsOf = (c: Record<string, unknown>): string[] =>
  Array.isArray(c.fields) ? c.fields.map(String) : [];

/** 行を畳むモードか（`field` に subTable の項目名が書いてある）。 */
const foldsRows = (c: Record<string, unknown>): boolean =>
  typeof c.field === "string" && c.field !== "";

/**
 * `field` が指す明細の行。**畳む前に** `where` で絞り、`sort` で並べる。
 *
 * 条件は行1件に対して評価する（`{ mode: create }` は行では分からないので渡さない）。
 * 上位だけ採る（`limit`）のは**並べたあと**なので、ここではまだ採らない（`join` は
 * 「隠れた行が何件あるか」を言うために、採る前の数も要る）。
 */
function rowsOf(
  c: Record<string, unknown>,
  record: Record<string, unknown>,
): Record<string, unknown>[] {
  const raw = record[String(c.field)];
  const rows = Array.isArray(raw)
    ? raw.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null && !Array.isArray(row),
      )
    : [];
  return rowsSorted(rowsMatching(rows, c.where), c.sort);
}

/**
 * `field` が指す明細の行を、`op` の集約で畳む。
 *
 * 畳めないとき（行が無い・集約が知らない名前）は **null**。0 を返さないのは、
 * 「行が無い」と「合計が 0」を画面で見分けられなくなるため。
 */
function fold(
  op: string,
  c: Record<string, unknown>,
  record: Record<string, unknown>,
): number | null {
  const aggregate = builtinAggregates[op];
  if (aggregate === undefined) return null;
  const of = typeof c.of === "string" ? c.of : undefined;
  // `limit` は数を畳むときにも効く（「金額の大きい順に3件の合計」）。
  return aggregate(rowsTop(rowsOf(c, record), c.limit), of);
}

/**
 * 組込み計算オペレーション。名前は各言語版で共通。
 *
 * `messages` を受け取るのは `join` だけ（上位だけ並べたときに「ほか N 件」と言う）。
 * 枠組みが書く文は1か所（MessageResolver）に置く＝差し替えとロケール切替の口を
 * 2つ持たない。バリデータ（builtinValidators）と同じ形。
 */
export const builtinComputeds = (
  messages?: MessageResolver,
): Record<string, ComputedFn> => {
  const m = messages ?? new MessageResolver();
  return {
  concat: (c, r) => {
    const sep = c.separator != null ? String(c.separator) : "";
    return fieldsOf(c)
      .map((f) => str(r[f]))
      .join(sep);
  },
  // sum だけが両方のモードを持つ（`小計 = 明細の金額` と `合計 = 小計 + 税` の両方が
  // 「足す」なので、op の名前を分けると読む人が迷う）。
  sum: (c, r) =>
    foldsRows(c)
      ? fold("sum", c, r)
      : fieldsOf(c).reduce((acc, f) => acc + (toNum(r[f]) ?? 0), 0),
  subtract: (c, r) => {
    const fields = fieldsOf(c);
    if (fields.length === 0) return 0;
    return fields
      .slice(1)
      .reduce((acc, f) => acc - (toNum(r[f]) ?? 0), toNum(r[fields[0]]) ?? 0);
  },
  product: (c, r) => fieldsOf(c).reduce((acc, f) => acc * (toNum(r[f]) ?? 1), 1),
  // 行を畳むだけの op（同じレコードの項目に対しては意味が無いので、`field` が
  // 無ければ null）。名前と結果は集約の語彙そのまま。
  count: (c, r) => (foldsRows(c) ? fold("count", c, r) : null),
  avg: (c, r) => (foldsRows(c) ? fold("avg", c, r) : null),
  min: (c, r) => (foldsRows(c) ? fold("min", c, r) : null),
  max: (c, r) => (foldsRows(c) ? fold("max", c, r) : null),
  // 行を**並べて1行にする**。数ではなく文字が出るので、集約（数を1つにする）とは
  // 別物＝実装もここにある。区切りの既定は ", "（`concat` の既定が空なのは姓と名を
  // 詰めるためで、行を並べるときに詰めると読めない）。空の値は飛ばす。
  join: (c, r) => {
    if (!foldsRows(c)) return null;
    const of = typeof c.of === "string" ? c.of : undefined;
    if (of === undefined) return null;
    const sep = c.separator != null ? String(c.separator) : ", ";
    const rows = rowsOf(c, r);
    const shown = rowsTop(rows, c.limit);
    const values = shown.map((row) => str(row[of])).filter((s) => s !== "");
    // 上位だけ並べたときは**黙って切らない**。3件だけ出して終わると、読む人は
    // 「明細は3行」と読む。何件隠れているかを添える（文言は定義で変えられる。
    // `overflow: ""` と書けば何も足さない＝黙って切ると決めたことが読める）。
    const hidden = rows.length - shown.length;
    if (hidden <= 0 || values.length === 0) return values.join(sep);
    const template =
      c.overflow != null ? String(c.overflow) : m.resolve("computed.more");
    if (template === "") return values.join(sep);
    return [...values, template.replace(/\{count\}/g, String(hidden))].join(sep);
  },
  };
};

/** 計算オペレーションを名前で解決する。register で拡張可能。 */
export class ComputedRegistry {
  private readonly ops: Record<string, ComputedFn>;

  constructor(custom?: Record<string, ComputedFn>, messages?: MessageResolver) {
    this.ops = { ...builtinComputeds(messages), ...custom };
  }

  compute(
    computed: Record<string, unknown> | null | undefined,
    record: Record<string, unknown>,
  ): unknown {
    if (computed == null) return undefined;
    const op = computed.op;
    if (typeof op !== "string") return undefined;
    return this.ops[op]?.(computed, record);
  }

  register(op: string, fn: ComputedFn): void {
    this.ops[op] = fn;
  }

  has(op: string): boolean {
    return op in this.ops;
  }
}
