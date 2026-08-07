// 行 + ReportDefinition → ReportDocument（帳票の中立な出力形）。
//
// コントロールブレイク（並び順に見て、キーが変わったら小計を出して見出しを
// 出す）＋ 行数でページを割る。並べ替えは Repository の責務。
// Dart / Java 版と同じ出力になること（conformance）。

import { type ReportDefinition } from "./definition.js";
import { AggregateRegistry } from "./aggregate.js";

/** 帳票の1行が何であるか。開いた文字列。 */
export const ReportBlockKinds = {
  groupHeader: "groupHeader",
  detail: "detail",
  subtotal: "subtotal",
  grandTotal: "grandTotal",
} as const;

/** 帳票の1行。 */
export interface ReportBlock {
  kind: string;
  /** グループの深さ（0 が最も外側）。明細と総計は -1。 */
  level: number;
  /** グループ見出しのラベル（それ以外は空）。 */
  label: string;
  /** グループ見出しの値。 */
  value?: unknown;
  /** 明細のレコード。 */
  row: Record<string, unknown>;
  /** 小計・総計の値。report.totals と同じ順序（項目名ではなく位置で対応）。 */
  totals: (number | null)[];
}

/** 1枚の用紙。 */
export interface ReportSheet {
  /** 1始まりのページ番号。 */
  number: number;
  blocks: ReportBlock[];
}

/** 帳票1本ぶんの出力。 */
export interface ReportDocument {
  sheets: ReportSheet[];
  totalPages: number;
}

/** 未設定と null を同じ扱いにする（言語をまたいで挙動を合わせるため）。 */
const sameKey = (a: unknown, b: unknown): boolean =>
  (a == null && b == null) || a === b;

const block = (partial: Partial<ReportBlock> & { kind: string }): ReportBlock => ({
  level: -1,
  label: "",
  row: {},
  totals: [],
  ...partial,
});

/** rows を report の構造に従って帳票へ組む。 */
export function buildReport(
  report: ReportDefinition,
  rows: Record<string, unknown>[],
  aggregates: AggregateRegistry = new AggregateRegistry(),
): ReportDocument {
  if (rows.length === 0) return { sheets: [], totalPages: 0 };

  const blocks: ReportBlock[] = [];
  // ページを強制的に変える位置（blocks の index）。
  const forcedBreaks = new Set<number>();
  const openKeys: unknown[] = report.groups.map(() => null);
  const openRows: Record<string, unknown>[][] = report.groups.map(() => []);
  let started = false;

  const totalsOf = (group: Record<string, unknown>[]): (number | null)[] =>
    report.totals.map((t) => aggregates.aggregate(t.aggregate, group, t.field));

  for (const row of rows) {
    let breakAt = started ? report.groups.length : 0;
    if (started) {
      for (let level = 0; level < report.groups.length; level++) {
        if (!sameKey(row[report.groups[level].field], openKeys[level])) {
          breakAt = level;
          break;
        }
      }
    }

    if (breakAt < report.groups.length) {
      // 閉じる階層の小計は深い方から。
      if (started && report.totals.length > 0) {
        for (let level = report.groups.length - 1; level >= breakAt; level--) {
          blocks.push(
            block({
              kind: ReportBlockKinds.subtotal,
              level,
              totals: totalsOf(openRows[level]),
            }),
          );
        }
      }
      // 改ページ指定のあるグループが変わったら、そこから次の紙へ。
      const forced =
        started && report.groups.slice(breakAt).some((g) => g.pageBreak);
      if (forced) forcedBreaks.add(blocks.length);
      // 開く階層の見出しは外側から。
      for (let level = breakAt; level < report.groups.length; level++) {
        const group = report.groups[level];
        openKeys[level] = row[group.field] ?? null;
        openRows[level] = [];
        blocks.push(
          block({
            kind: ReportBlockKinds.groupHeader,
            level,
            label: group.label,
            value: openKeys[level],
          }),
        );
      }
      started = true;
    }

    for (const group of openRows) group.push(row);
    blocks.push(block({ kind: ReportBlockKinds.detail, row }));
  }

  // 最後に開いていた階層を閉じ、総計を出す。
  if (report.totals.length > 0) {
    for (let level = report.groups.length - 1; level >= 0; level--) {
      blocks.push(
        block({
          kind: ReportBlockKinds.subtotal,
          level,
          totals: totalsOf(openRows[level]),
        }),
      );
    }
    blocks.push(
      block({ kind: ReportBlockKinds.grandTotal, totals: totalsOf(rows) }),
    );
  }

  return paginate(blocks, forcedBreaks, report.rowsPerPage);
}

/** 1ブロック＝1行として数え、rowsPerPage ごとに紙を分ける。 */
function paginate(
  blocks: ReportBlock[],
  forcedBreaks: Set<number>,
  rowsPerPage: number,
): ReportDocument {
  const capacity = rowsPerPage < 1 ? 1 : rowsPerPage;
  const sheets: ReportSheet[] = [];
  let current: ReportBlock[] = [];

  const flush = (): void => {
    if (current.length === 0) return;
    sheets.push({ number: sheets.length + 1, blocks: current });
    current = [];
  };

  for (let i = 0; i < blocks.length; i++) {
    if (forcedBreaks.has(i) || current.length >= capacity) flush();
    current.push(blocks[i]);
  }
  flush();
  return { sheets, totalPages: sheets.length };
}
