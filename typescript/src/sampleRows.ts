// 帳票を見せるための、それらしい行を作る。
//
// **AI も人も、データが無いと紙を見られない。** 「刷ったらどう見えるか」を確かめたい
// ときに、まずデータを用意しろというのは順番が逆（そこで止まると誰も確かめない）。
//
// 作る値は定義から決める（項目名と型）。**でたらめではなく、構造が見える形**にする:
//   ・グループの項目は**まとまって**変わる（コントロールブレイクなので、混ざると
//     グループ見出しと小計が意味を持たない）
//   ・数は桁が違う値を混ぜる（桁区切り・右寄せが効いているかを見るため）
//   ・日付は並ぶ（並び順の指定が効いているかを見るため）
//
// これは**見せるための行**で、業務のデータではない。使う側が「作った行だ」と分かる
// ように、呼び出し側が必ずそう書くこと（`hatake paper` / MCP の道具はそうしている）。

import { type ColumnDefinition, ColumnTypes, type ReportPageDefinition } from "./definition.js";

/** 日付らしい項目名（型が書かれていないときの推測）。 */
const DATE_WORDS = ["date", "day", "日", "期日", "納期"];

const looksLikeDate = (column: ColumnDefinition): boolean =>
  column.type === ColumnTypes.date ||
  DATE_WORDS.some((word) => column.field.toLowerCase().includes(word.toLowerCase()));

/**
 * 帳票の見本になる行を [count] 件作る。
 *
 * グループがある定義では、その項目が**まとまって**変わる（前半・後半で2グループ）。
 * 合計の対象になっている項目は、必ず数を入れる（列に無い項目でも入れる＝
 * 合計だけに出る項目があるため）。
 */
export function sampleRows(
  page: ReportPageDefinition,
  count = 6,
): Record<string, unknown>[] {
  const columns = page.table.columns;
  const groups = page.report.groups;
  const rows: Record<string, unknown>[] = [];
  const half = Math.max(1, Math.ceil(count / 2));

  for (let i = 0; i < count; i++) {
    const row: Record<string, unknown> = {};
    for (const column of columns) {
      row[column.field] = value(column, i);
    }
    // グループの項目は前半・後半で分ける（並んでいる行にする）。
    groups.forEach((group, depth) => {
      const found = columns.find((column) => column.field === group.field);
      const label = found?.label ?? group.label;
      // 内側のグループは、外側の中でさらに分かれる。
      const bucket = depth === 0 ? (i < half ? "A" : "B") : i % 2 === 0 ? "1" : "2";
      row[group.field] = `${label}${bucket}`;
    });
    // 合計の対象は必ず数（列に無い項目でも、合計には出る）。
    for (const total of page.report.totals) {
      if (typeof row[total.field] === "number") continue;
      row[total.field] = (i + 1) * 100;
    }
    rows.push(row);
  }
  return rows;
}

/** 1つの値。桁の違う数・並ぶ日付・見分けの付く文字。 */
function value(column: ColumnDefinition, i: number): unknown {
  if (column.type === ColumnTypes.number) {
    // 桁を変える（桁区切りと右寄せが効いているかを見るため）。
    return [1200, 98, 1250000, 4500, 320000, 75][i % 6] ?? (i + 1) * 100;
  }
  if (looksLikeDate(column)) {
    return `2026-04-${String((i % 28) + 1).padStart(2, "0")}`;
  }
  if (column.type === ColumnTypes.boolean) return i % 2 === 0;
  return `${column.label}${i + 1}`;
}
