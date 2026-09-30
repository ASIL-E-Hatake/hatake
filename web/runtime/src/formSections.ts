import type { FieldDefinition, FormDefinition } from "@hatake-fw/api/internal";
import { evaluateCondition, isAllowed } from "@hatake-fw/api/internal";

import type { DataRecord } from "./repository.js";

/** 画面に出す区画1つ（題と、その人に見せる項目）。 */
export interface VisibleSection {
  readonly title?: string;
  readonly fields: readonly FieldDefinition[];
}

/**
 * 入力・詳細の画面に**出す区画と項目**。Flutter 版の `form_fields.dart` /
 * `detail_page.dart` と同じ規則:
 *
 *   ・区画の `visibleWhen` が満たされなければ**区画ごと出さない**（中の項目は検証も
 *     されない＝`FormValidator` も同じ条件を見る）
 *   ・項目の `roles` に当たらない人には**その項目を出さない**
 *   ・出す項目が1つも無い区画は、**題も出さない**（題だけ残ると空の枠に見える）
 *
 * 項目の `visibleWhen` は**ここでは見ない**（値が変わるたびに変わるので、項目を描く
 * 部品がその場で見る）。
 *
 * 0.9.19 までブラウザ版は区画を1本に潰して描いていたので、**区画の題が出ず、
 * 項目の `roles` も効いていなかった**（admin にしか見せない項目が全員に出た）。
 */
export function visibleSections(
  form: FormDefinition,
  record: DataRecord,
  roles: readonly string[],
  mode?: string,
): VisibleSection[] {
  const out: VisibleSection[] = [];
  for (const section of form.sections) {
    // **条件は書かれているときだけ見る**（`evaluateCondition` は「無ければ満たす」と
    // 答えるので、表示の条件ではそのまま渡してよいが、読み違えないよう明示する）。
    if (section.visibleWhen !== undefined && !evaluateCondition(section.visibleWhen, record, mode)) {
      continue;
    }
    const fields = section.fields.filter((one) => isAllowed(one.roles, roles));
    if (fields.length === 0) continue;
    out.push({ title: section.title === "" ? undefined : section.title, fields });
  }
  return out;
}
