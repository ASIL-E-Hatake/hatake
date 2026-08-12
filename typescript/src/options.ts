// 選択肢の連動（カスケード）。親項目の値で子項目の選択肢を絞る。
//
// 都道府県 → 市区町村、大分類 → 中分類。ここにあるのは**定義に書いた静的な絞り込み**
// だけで、選択肢が DB にあるものは `optionsSource`（Repository から引く）の担当。
//
// Dart 版と同じ結果になるよう実装をそろえる（conformance の charset / options 参照）。

import { looseEquals } from "./conditionEvaluator.js";
import type { FieldDefinition, OptionItem } from "./definition.js";

/**
 * この項目がいま出すべき選択肢。
 *
 * `optionsFrom` が無ければ全部。あれば、`when` が親項目の現在値と同じものだけ
 * （`when` を書いていない選択肢は常に出る）。親が未入力なら `when` 付きは出ない。
 */
export function visibleOptions(
  field: FieldDefinition,
  record: Record<string, unknown>,
): OptionItem[] {
  const parent = field.optionsFrom;
  if (parent === undefined) return field.options;
  const parentValue = record[parent];
  return field.options.filter(
    (option) =>
      option.when === undefined ||
      (parentValue !== undefined &&
        parentValue !== null &&
        looseEquals(option.when, parentValue)),
  );
}

/**
 * 親が変わって子の値が選べないものになったか。
 * true のとき、フォームは子の値を捨てる（「大阪府なのに渋谷区」を保存させない）。
 */
export function optionValueIsStale(
  field: FieldDefinition,
  record: Record<string, unknown>,
): boolean {
  if (field.optionsFrom === undefined) return false;
  const current = record[field.field];
  if (current === undefined || current === null || current === "") return false;
  return !visibleOptions(field, record).some((option) =>
    looseEquals(option.value, current),
  );
}
