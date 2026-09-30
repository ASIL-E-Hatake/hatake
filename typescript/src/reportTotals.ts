import { AggregateOps, type ReportDefinition } from "./definition.js";
import type { ReportBlock } from "./report.js";

/** 小計・総計の升に**添える言葉**（同じ列に2つ以上の合計を書いたときだけ出す）。 */
export const REPORT_TOTAL_WORDS: Readonly<Record<string, string>> = {
  [AggregateOps.sum]: "合計",
  [AggregateOps.count]: "件数",
  [AggregateOps.avg]: "平均",
  [AggregateOps.min]: "最小",
  [AggregateOps.max]: "最大",
};

/**
 * 1列ぶんの小計・総計の字。**1要素が1行**（升の中で縦に積む）。
 *
 * 決めるのはここだけで、画面（Flutter / Vue / React）と紙（`hatake_print`）は
 * 出てきた行を描くだけ。Dart 版は `hatake_core` の `reportTotalLines`。
 * 同じ答えになることは `spec/conformance/report_totals.json` が見ている。
 *
 *   ・その列の合計が**1つだけ**なら、今までどおり値だけ（件数は「2 件」）
 *   ・**2つ以上**なら1つ1行にして、何の数かを添える（「合計 ¥6,360」「件数 2」）。
 *     並べて1行に詰めると（「¥6,360 / 2 件」）、狭い列で切れて片方が読めない
 *
 * 添えるかどうかは**書いた数**で決める（値の有無ではない）。同じ帳票の中で、
 * 升によって言葉が付いたり付かなかったりしないように。
 *
 * [format] はその列の升と同じ書式（金額など）。件数は数を数えただけなので通さない。
 * [countSuffix] は1つだけのときの件数の後ろの語（紙は `PrintStyle` で変えられる）。
 */
export function reportTotalLines(
  report: ReportDefinition,
  field: string,
  block: Pick<ReportBlock, "totals">,
  format: (value: number) => string,
  countSuffix = "件",
): string[] {
  const declared: number[] = [];
  report.totals.forEach((total, i) => {
    if (total.field === field) declared.push(i);
  });
  const stacked = declared.length > 1;
  const lines: string[] = [];
  for (const i of declared) {
    if (i >= block.totals.length) continue;
    const value = block.totals[i];
    if (value === null || value === undefined) continue;
    const aggregate = report.totals[i].aggregate;
    const isCount = aggregate === AggregateOps.count;
    if (!stacked) {
      lines.push(isCount ? `${Math.trunc(value)} ${countSuffix}` : format(value));
      continue;
    }
    const word = REPORT_TOTAL_WORDS[aggregate] ?? aggregate;
    lines.push(`${word} ${isCount ? `${Math.trunc(value)}` : format(value)}`);
  }
  return lines;
}

/**
 * 小計・総計の行が**何行ぶんの高さ**を使うか（同じ列に書いた合計の数の最大）。
 *
 * 紙はこの数だけ行を取る。帳票の中で一定なので、升ごとに行の高さが揺れない。
 */
export function reportTotalDepth(report: ReportDefinition): number {
  const counts = new Map<string, number>();
  for (const total of report.totals) {
    counts.set(total.field, (counts.get(total.field) ?? 0) + 1);
  }
  return Math.max(1, ...counts.values());
}
