// ダッシュボードの集約（aggregate）。行の集合を1つの数値に畳む。
// 組込み count / sum / avg / min / max。Dart / Java 版と同結果。
//
// 行を出すのは Repository の仕事で、ここは「返ってきた行をどう見せるか」だけ。

import { AggregateOps } from "./definition.js";
import { evaluateCondition } from "./conditionEvaluator.js";

export type AggregateFn = (
  rows: Record<string, unknown>[],
  field?: string,
) => number | null;

/**
 * 行を条件で絞る。`where` が無ければそのまま返す。
 *
 * 条件の言葉は `visibleWhen` と同じもの（**条件の書き方を2つ持たない**）。判定するのは
 * **行1件**なので `{ mode: … }` は常に false（行にフォームの状態は無い）。
 *
 * 畳む所（`computed` の行モード）と突き合わせる所（`compare` の `aggregate`）が
 * **同じ行を同じ規則で**絞るために、実装はここに1つだけ置く。
 */
export function rowsMatching(
  rows: Record<string, unknown>[],
  where: unknown,
): Record<string, unknown>[] {
  if (where == null || typeof where !== "object" || Array.isArray(where)) return rows;
  return rows.filter((row) =>
    evaluateCondition(where as Record<string, unknown>, row),
  );
}

/** 数値解釈は ComputedRegistry と同じ規則（真偽値は数値ではない）。 */
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

/** 集約が「数値」とみなす値の解釈。集計済みの行をそのまま扱うとき用に公開。 */
export const aggregateValue = (value: unknown): number | null => toNum(value);

/** rows の field のうち数値として読めた値だけ。field が無ければ空。 */
function numbers(
  rows: Record<string, unknown>[],
  field?: string,
): number[] {
  if (field == null) return [];
  const values: number[] = [];
  for (const row of rows) {
    const n = toNum(row[field]);
    if (n !== null) values.push(n);
  }
  return values;
}

/** 組込みの集約オペレーション。count 以外は field が必須（無ければ null）。 */
export const builtinAggregates: Record<string, AggregateFn> = {
  [AggregateOps.count]: (rows) => rows.length,
  [AggregateOps.sum]: (rows, field) =>
    field == null ? null : numbers(rows, field).reduce((a, b) => a + b, 0),
  [AggregateOps.avg]: (rows, field) => {
    if (field == null) return null;
    const values = numbers(rows, field);
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  },
  [AggregateOps.min]: (rows, field) => {
    if (field == null) return null;
    const values = numbers(rows, field);
    return values.length === 0 ? null : Math.min(...values);
  },
  [AggregateOps.max]: (rows, field) => {
    if (field == null) return null;
    const values = numbers(rows, field);
    return values.length === 0 ? null : Math.max(...values);
  },
};

/** ラベル別集計の1点。チャートの1本／1切れにあたる。 */
export interface AggregateBucket {
  label: string;
  /** 集約結果。定まらないときは null。 */
  value: number | null;
}

/** 集約オペレーションを名前で解決する。register で拡張可能。 */
export class AggregateRegistry {
  private readonly ops: Record<string, AggregateFn>;

  constructor(custom?: Record<string, AggregateFn>) {
    this.ops = { ...builtinAggregates, ...custom };
  }

  /** rows を op で畳む。op が未登録なら null。 */
  aggregate(
    op: string,
    rows: Record<string, unknown>[],
    field?: string,
  ): number | null {
    const fn = this.ops[op];
    return fn ? fn(rows, field) : null;
  }

  /**
   * labelField の値ごとに rows をまとめ、各グループを op で畳む。
   * 並びはラベルの初出順（言語をまたいで同じ順序にするため）。
   */
  aggregateBy(
    op: string,
    rows: Record<string, unknown>[],
    labelField: string,
    valueField?: string,
  ): AggregateBucket[] {
    // Map を使う: オブジェクトのキーは数字っぽいと順序が変わる。
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const raw = row[labelField];
      const label = raw == null ? "" : String(raw);
      const group = groups.get(label);
      if (group) {
        group.push(row);
      } else {
        groups.set(label, [row]);
      }
    }
    return [...groups.entries()].map(([label, group]) => ({
      label,
      value: this.aggregate(op, group, valueField),
    }));
  }

  register(op: string, fn: AggregateFn): void {
    this.ops[op] = fn;
  }

  has(op: string): boolean {
    return op in this.ops;
  }
}
