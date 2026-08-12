// 選択肢の連動（カスケード）。親の値で子の選択肢を絞る。
//
// 都道府県 → 市区町村、大分類 → 中分類。入力項目（form）と検索条件（search.filters）
// の両方で同じ判定を使う＝見るのは OptionsOwner の形だけ。ここにあるのは**定義に
// 書いた静的な絞り込み**で、選択肢が DB にあるものは `optionsSource`（Repository
// から引く）の担当。
//
// Dart 版と同じ結果になるよう実装をそろえる（conformance の option_filter 参照）。

import { looseEquals } from "./conditionEvaluator.js";
import type { OptionItem, OptionsSource } from "./definition.js";

/**
 * 選択肢を持つもの（入力項目 FieldDefinition と検索条件 FilterDefinition）。
 * 入力用・検索用に同じ判定を2つ持たない（必ずズレるので）。
 */
export interface OptionsOwner {
  field: string;
  options: OptionItem[];
  optionsFrom?: string;
  optionsSource?: OptionsSource;
}

/**
 * これがいま出すべき選択肢。
 *
 * `optionsFrom` が無ければ全部。あれば、`when` が親の現在値と同じものだけ
 * （`when` を書いていない選択肢は常に出る）。親が未入力なら `when` 付きは出ない。
 *
 * `values` は「いまの値の集まり」＝入力ならレコード、検索なら検索欄に入っている値。
 */
export function visibleOptions(
  field: OptionsOwner,
  values: Record<string, unknown>,
): OptionItem[] {
  const parent = field.optionsFrom;
  if (parent === undefined) return field.options;
  const parentValue = values[parent];
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
  field: OptionsOwner,
  values: Record<string, unknown>,
): boolean {
  if (field.optionsFrom === undefined) return false;
  const current = values[field.field];
  if (current === undefined || current === null || current === "") return false;
  return !visibleOptions(field, values).some((option) =>
    looseEquals(option.value, current),
  );
}
