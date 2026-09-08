// 定義の制約から「それらしい値」を作る。
//
// 業務の値は定義に無い（客先の語彙は書かれていない）が、**制約は定義に書いてある**
// ので、境界のデータは機械が作れる。作った値を使うのは2か所:
//
//   ・`hatake run --draft` … 画面側のシナリオの下書き
//   ・`hatake fixtures`     … サーバ側の試験データ
//
// **同じ所で作る**のが要（別々に作ると、画面とサーバが違う境界で試される＝どちらかが
// 必ず緩い。緩い側は「通ったのに本番で弾かれる」を作る）。
//
// 形が決まっている項目（`pattern`）は**値を作らない**（`TODO_<項目>` を置く）。正規表現を
// 満たす文字列を機械が作ると、業務としてあり得ない会員番号ができる。

import {
  FieldTypes,
  ValidatorTypes,
  type FieldDefinition,
  type ValidatorDefinition,
} from "./definition.js";

/** その項目の検証規則を型で引く（無ければ undefined）。 */
export const ruleOf = (
  field: FieldDefinition,
  type: string,
): ValidatorDefinition | undefined =>
  field.validators.find((one) => one.type === type);

/** 規則の値が数なら返す（`maxLength: "8"` のような書き方は数として扱わない）。 */
export const numParam = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

/** 形が決まっている項目に置く目印（人が埋める）。 */
export const todoValue = (field: FieldDefinition): string =>
  `TODO_${field.field}`;

/** その項目の「それらしい値」。形が決まっているものは作らない。 */
export function plausible(field: FieldDefinition): unknown {
  if (ruleOf(field, ValidatorTypes.pattern) !== undefined) {
    return todoValue(field);
  }
  switch (field.type) {
    case FieldTypes.number: {
      const min = numParam(ruleOf(field, ValidatorTypes.min)?.params.value);
      const max = numParam(ruleOf(field, ValidatorTypes.max)?.params.value);
      if (min !== undefined) return min;
      if (max !== undefined) return Math.min(1, max);
      return 1;
    }
    case FieldTypes.checkbox:
      // 印は**立てない**のが基本形（`取消` のような印を既定で立てると、合計が 0 の
      // 下書きが出て「計算が壊れている」ように見える）。立てた形は別の件で作る。
      return false;
    case FieldTypes.date:
      return "2026-01-05";
    case FieldTypes.dateTime:
      return "2026-01-05T09:00";
    case FieldTypes.time:
      return "09:00";
    case FieldTypes.select:
    case FieldTypes.radio:
      return field.options[0]?.value ?? todoValue(field);
    case FieldTypes.multiSelect: {
      const first = field.options[0]?.value;
      return first === undefined ? [todoValue(field)] : [first];
    }
    case FieldTypes.subTable:
      return [row(field)];
    default: {
      if (ruleOf(field, ValidatorTypes.email) !== undefined) {
        return "test@example.com";
      }
      if (ruleOf(field, ValidatorTypes.postalCode) !== undefined) {
        return "1234567";
      }
      const minLength = numParam(
        ruleOf(field, ValidatorTypes.minLength)?.params.value,
      );
      const maxLength = numParam(
        ruleOf(field, ValidatorTypes.maxLength)?.params.value,
      );
      if (minLength !== undefined) return "X".repeat(minLength);
      if (maxLength !== undefined && maxLength < 3) return "X".repeat(maxLength);
      return "テスト";
    }
  }
}

/** 明細の1行（行の項目を同じ規則で埋める。行の中の計算は当てない＝道具が出す）。 */
export function row(field: FieldDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const one of field.rowFields) {
    if (one.computed !== undefined) continue;
    out[one.field] = plausible(one);
  }
  return out;
}
