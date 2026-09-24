// **値を1つの文字にする、唯一の場所**（Dart の `cell_text.dart` と同じもの）。
//
// これが3版に揃っていなかったのが、そもそもの問題でした。0.9.2 で入れた
// 「コードではなく選択肢の名前を出す」は **Dart にしか入っておらず**、TS と Java の
// CSV は `shipped` のまま落ちていました。CSV は「3版で同じ文字列になること」を
// conformance で約束しているので、片側だけ直すと約束が静かに破れます。
//
// 見せ方の順番は Dart と1文字も変えないこと:
//
//   1. `format` が書いてあれば、それに従う（人が明示したものが最優先）
//   2. 選択肢に在る値なら、その**名前**（`shipped` → 出荷済）
//   3. どちらでもなければ、値をそのまま

import { type ColumnDefinition } from "./definition.js";
import { type FormatterRegistry } from "./formatter.js";

/** 選択肢を持つもの（入力項目・検索条件）のうち、名前を引くのに要る所だけ。 */
export interface OptionsOwnerLike {
  field: string;
  options?: { value: unknown; label: string }[];
}

/** 値を文字にするもの（列・入力項目）のうち、見せ方に要る所だけ。 */
export interface DisplayedLike {
  field: string;
  format?: string | null;
  config?: Record<string, unknown>;
}

/**
 * [field] の [value] を、渡された選択肢のラベルにする。引けなければ undefined。
 *
 * 型をまたいで比べる（YAML の `10` と REST の `"10"` が同じものを指すことがある）。
 */
export function optionLabelIn(
  owners: OptionsOwnerLike[],
  field: string,
  value: unknown,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  for (const owner of owners) {
    if (owner.field !== field) continue;
    for (const option of owner.options ?? []) {
      if (option.value === value || `${option.value}` === `${value}`) {
        return option.label;
      }
    }
  }
  return undefined;
}

/** 見せ方も選択肢も無いときの、素の文字。並びと入れ子は空にする。 */
export function textOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return "";
  if (typeof value === "object") return "";
  return String(value);
}

/** [at] の [value] を、画面に出す1つの文字にする。 */
export function cellText(
  formatters: FormatterRegistry,
  owners: OptionsOwnerLike[],
  at: DisplayedLike,
  value: unknown,
): string {
  if (at.format) return formatters.format(at.format, value, at.config ?? {});
  return optionLabelIn(owners, at.field, value) ?? textOf(value);
}

/** 列も [DisplayedLike] を満たす（型の上での確認用）。 */
export type ColumnAsDisplayed = ColumnDefinition & DisplayedLike;
