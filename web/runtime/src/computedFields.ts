import { ComputedRegistry } from "@hatake-fw/api";
import type { FieldDefinition } from "@hatake-fw/api/internal";

import type { DataRecord } from "./repository.js";

/**
 * `computed:` と書いた項目を埋めた写しを返す。
 *
 * **元の record は触らない。** 計算した値はサーバへ送るものではなく「いま見せるもの」
 * なので、混ぜると保存のときに計算結果まで書き戻すことになる（合計を更新したつもりが、
 * 明細と食い違ったまま固定される）。
 *
 * 順番どおりに1回ずつ当てる。**計算の計算は追いかけない**（`a` が `b` を見て `b` が
 * `a` を見る、を許すと止まらなくなる）。定義が入れ子の計算を書いているかは
 * `hatake validate` が押す前に言う（`computed-cycle`）。
 */
export function withComputed(
  fields: readonly FieldDefinition[],
  record: DataRecord,
  computeds: ComputedRegistry = new ComputedRegistry(),
): DataRecord {
  let out: DataRecord | null = null;
  for (const one of fields) {
    if (one.computed === undefined) continue;
    const value = computeds.compute(one.computed, record);
    if (value === undefined) continue;
    out ??= { ...record };
    out[one.field] = value;
  }
  return out ?? record;
}
