// 行 + ReportDefinition → ReportDocument。
//
// やっていることは昔からある帳票そのもの: **コントロールブレイク**（並び順に
// 見て、キーが変わったら小計を出して見出しを出す）＋ 行数でページを割る。
// 並べ替えは Repository の責務（言語をまたいでソート差が出ないようにするため、
// ここでは並べ替えない）。
//
// Dart / TS / Java の3版で同じ出力になるよう実装をそろえること（conformance）。

import '../definition/report_definition.dart';
import 'aggregate.dart';
import 'report_document.dart';

/// [rows] を [report] の構造に従って帳票へ組む。
///
/// [aggregates] を渡せば集約オペレーションを差し替え・追加できる。
ReportDocument buildReport(
  ReportDefinition report,
  List<Map<String, Object?>> rows, {
  AggregateRegistry? aggregates,
}) {
  if (rows.isEmpty) return ReportDocument.empty;
  final registry = aggregates ?? AggregateRegistry();

  final blocks = <ReportBlock>[];
  // ページを強制的に変える位置（blocks の index）。
  final forcedBreaks = <int>{};

  // 各グループ階層の「いま開いているキー」と、その階層に溜まっている行。
  final openKeys = List<Object?>.filled(report.groups.length, null);
  final openRows = List.generate(
    report.groups.length,
    (_) => <Map<String, Object?>>[],
  );
  var started = false;

  List<num?> totalsOf(List<Map<String, Object?>> group) => [
        for (final total in report.totals)
          registry.aggregate(total.aggregate, group, field: total.field),
      ];

  for (final row in rows) {
    // 何段目から変わったか（未開始なら最上位から）。
    var breakAt = started ? report.groups.length : 0;
    if (started) {
      for (var level = 0; level < report.groups.length; level++) {
        if (row[report.groups[level].field] != openKeys[level]) {
          breakAt = level;
          break;
        }
      }
    }

    if (breakAt < report.groups.length) {
      // 閉じる階層の小計は深い方から。
      if (started && report.totals.isNotEmpty) {
        for (var level = report.groups.length - 1; level >= breakAt; level--) {
          blocks.add(ReportBlock(
            kind: ReportBlockKinds.subtotal,
            level: level,
            totals: totalsOf(openRows[level]),
          ));
        }
      }
      // 改ページ指定のあるグループが変わったら、そこから次の紙へ。
      final forced = started &&
          report.groups
              .sublist(breakAt)
              .any((group) => group.pageBreak);
      if (forced) forcedBreaks.add(blocks.length);
      // 開く階層の見出しは外側から。
      for (var level = breakAt; level < report.groups.length; level++) {
        final group = report.groups[level];
        openKeys[level] = row[group.field];
        openRows[level] = [];
        blocks.add(ReportBlock(
          kind: ReportBlockKinds.groupHeader,
          level: level,
          label: group.label,
          value: openKeys[level],
        ));
      }
      started = true;
    }

    for (final group in openRows) {
      group.add(row);
    }
    blocks.add(ReportBlock(kind: ReportBlockKinds.detail, row: row));
  }

  // 最後に開いていた階層を閉じ、総計を出す。
  if (report.totals.isNotEmpty) {
    for (var level = report.groups.length - 1; level >= 0; level--) {
      blocks.add(ReportBlock(
        kind: ReportBlockKinds.subtotal,
        level: level,
        totals: totalsOf(openRows[level]),
      ));
    }
    blocks.add(ReportBlock(
      kind: ReportBlockKinds.grandTotal,
      totals: totalsOf(rows),
    ));
  }

  return _paginate(blocks, forcedBreaks, report.rowsPerPage);
}

/// 1ブロック＝1行として数え、[rowsPerPage] ごとに紙を分ける。
ReportDocument _paginate(
  List<ReportBlock> blocks,
  Set<int> forcedBreaks,
  int rowsPerPage,
) {
  final capacity = rowsPerPage < 1 ? 1 : rowsPerPage;
  final sheets = <ReportSheet>[];
  var current = <ReportBlock>[];

  void flush() {
    if (current.isEmpty) return;
    sheets.add(ReportSheet(number: sheets.length + 1, blocks: current));
    current = [];
  }

  for (var i = 0; i < blocks.length; i++) {
    if (forcedBreaks.contains(i) || current.length >= capacity) flush();
    current.add(blocks[i]);
  }
  flush();
  return ReportDocument(sheets);
}
