// 計算項目（computed）をレコードから導出する。Dart / Java 版と同結果。
//
// モードは2つ。
//
//   { op: product, fields: [qty, price] }        同じレコードの項目を畳む
//   { op: sum, field: lines, of: amount }        **明細（subTable）の行**を畳む
//
// 行を畳む側は、集約の語彙（count / sum / avg / min / max）と実装を
// [builtinAggregates] からそのまま借りる＝**同じ集約を2つ持たない**（ダッシュボードの
// カードと `compare` の検証と、同じ数が出る）。
//
// `field` を使う側の前提: 行が**親のレコードと一緒に来ている**こと。`source` を持つ
// subTable はページ送りで別に持つので、ここには行が無い（`hatake validate` が言う）。

import { builtinAggregates } from "./aggregate.js";

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
  const raw = record[String(c.field)];
  const rows = Array.isArray(raw)
    ? raw.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null && !Array.isArray(row),
      )
    : [];
  const of = typeof c.of === "string" ? c.of : undefined;
  return aggregate(rows, of);
}

export const builtinComputeds: Record<string, ComputedFn> = {
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
};

/** 計算オペレーションを名前で解決する。register で拡張可能。 */
export class ComputedRegistry {
  private readonly ops: Record<string, ComputedFn>;

  constructor(custom?: Record<string, ComputedFn>) {
    this.ops = { ...builtinComputeds, ...custom };
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
