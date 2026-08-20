// ReportDocument + 定義 → PrintLayout（紙の上の座標）。
//
// 紙の体裁の要点は3つ。
//
//   ・**紙から溢れない**。画面のプレビューは行が入り切らなければ伸びればよいが、
//     紙は伸びない。`rowsPerPage` 行が必ず1枚に載るよう、行の高さと文字の大きさを
//     上限つきで縮める（伸ばしはしない）
//   ・**列は定義どおり**。`column.width` をポイントとして使い、指定の無い列が
//     残りを分ける。全部足して紙幅を超えたら、全体を同じ率で縮める
//   ・**画面と同じ見た目**。列の順・寄せ（number は右）・書式（`format`）・
//     見えない列（`roles`）・小計の言葉まで、帳票プレビューと同じ規則
//
// 紙の分かれ目は決め直さない（`buildReport` が `rowsPerPage` で分けた ReportSheet
// 1枚 = PrintPage 1枚）。画面で見た枚数と刷った枚数がずれないのは、これが理由。

import 'dart:math' as math;

import 'package:hatake_core/hatake_core.dart';

import 'print_layout.dart';
import 'print_metrics.dart';
import 'print_paper.dart';
import 'print_style.dart';

/// 指定の無い列に最低これだけは渡す（狭すぎる列は読めない）。
const double _minFlexWidth = 40;

/// 帳票を紙に組む。
///
/// [document] は `buildReport` が作ったもの。[formatters] を渡すと画面と同じ書式で
/// 印字される（渡さなければ組み込みの書式だけ）。[roles] はその印刷を頼んだ人の
/// 役割 — **見えない列は刷らない**（画面で隠している列が紙で漏れたら意味がない）。
PrintLayout layoutReport(
  ReportPageDefinition page,
  ReportDocument document, {
  FormatterRegistry? formatters,
  Set<String> roles = const {},
  PrintStyle style = const PrintStyle(),
}) {
  final paper = paperOf(page.report.paper);
  if (document.isEmpty) {
    return PrintLayout(paper: paper, pages: const [], title: page.title);
  }
  final registry = formatters ?? FormatterRegistry();
  final columns = [
    for (final column in page.table.columns)
      if (isAllowed(column.roles, roles)) column,
  ];

  final left = style.margin;
  final usable = paper.width - style.margin * 2;
  final widths = _columnWidths(columns, usable, style.columnGap);
  final xs = _columnXs(widths, left, style.columnGap);

  // 縦の割り付け（どの紙も同じ位置から始まる）。
  final titleBaseline = style.margin + style.titleSize;
  final headingBaseline =
      titleBaseline + style.titleSize * 0.5 + style.headingSize;
  final headingRuleY = headingBaseline + style.headingSize * 0.45;
  final bodyTop = headingRuleY + 2;
  final bodyBottom = paper.height - style.margin;
  final footerBaseline = bodyBottom + style.headingSize;

  // 1枚に載る行数。ReportSheet の方が多いことは無いが、行数の指定が壊れていても
  // 溢れないよう、実際のブロック数も見る。
  final rows = math.max(
    page.report.rowsPerPage,
    document.sheets.fold<int>(0, (most, s) => math.max(most, s.blocks.length)),
  );
  final rowHeight =
      math.min(style.rowHeight, (bodyBottom - bodyTop) / math.max(rows, 1));
  final bodySize = math.min(style.bodySize, rowHeight * 0.62);

  final pages = <PrintPage>[
    for (final sheet in document.sheets)
      PrintPage(
        number: sheet.number,
        items: [
          ..._sheetHeader(
            sheet: sheet,
            page: page,
            style: style,
            total: document.totalPages,
            left: left,
            usable: usable,
            titleBaseline: titleBaseline,
            headingBaseline: headingBaseline,
            headingRuleY: headingRuleY,
            columns: columns,
            widths: widths,
            xs: xs,
          ),
          for (var i = 0; i < sheet.blocks.length; i++)
            ..._block(
              block: sheet.blocks[i],
              page: page,
              style: style,
              registry: registry,
              columns: columns,
              widths: widths,
              xs: xs,
              left: left,
              usable: usable,
              top: bodyTop + rowHeight * i,
              rowHeight: rowHeight,
              size: bodySize,
            ),
          if (style.footer.isNotEmpty)
            PrintText(
              x: left,
              y: footerBaseline,
              width: usable,
              text: style.fill(style.footer, sheet.number, document.totalPages),
              size: style.headingSize,
            ),
        ],
      ),
  ];

  return PrintLayout(paper: paper, pages: pages, title: page.title);
}

/// 列の幅。`width` の指定はポイントとして使い、指定の無い列が残りを分ける。
/// 足して紙幅を超えたら全体を同じ率で縮める（紙に横スクロールは無い）。
List<double> _columnWidths(
  List<ColumnDefinition> columns,
  double usable,
  double gap,
) {
  if (columns.isEmpty) return const [];
  final space = usable - gap * (columns.length - 1);
  final fixed = columns.fold<double>(0, (sum, c) => sum + (c.width ?? 0));
  final flexCount = columns.where((c) => c.width == null).length;
  final flex = flexCount == 0
      ? 0.0
      : math.max(_minFlexWidth, (space - fixed) / flexCount);
  final widths = [for (final column in columns) column.width ?? flex];
  final total = widths.fold<double>(0, (sum, w) => sum + w);
  if (total <= space || total <= 0) return widths;
  final scale = space / total;
  return [for (final w in widths) w * scale];
}

List<double> _columnXs(List<double> widths, double left, double gap) {
  final xs = <double>[];
  var x = left;
  for (final width in widths) {
    xs.add(x);
    x += width + gap;
  }
  return xs;
}

/// 表題・ページ番号・列見出し（どの紙にも出る）。
List<PrintItem> _sheetHeader({
  required ReportSheet sheet,
  required ReportPageDefinition page,
  required PrintStyle style,
  required int total,
  required double left,
  required double usable,
  required double titleBaseline,
  required double headingBaseline,
  required double headingRuleY,
  required List<ColumnDefinition> columns,
  required List<double> widths,
  required List<double> xs,
}) {
  final number = style.pageNumber.isEmpty
      ? ''
      : style.fill(style.pageNumber, sheet.number, total);
  final numberWidth =
      number.isEmpty ? 0.0 : textWidth(number, style.headingSize) + 8;
  return [
    PrintText(
      x: left,
      y: titleBaseline,
      width: usable - numberWidth,
      text: clipToWidth(page.title, style.titleSize, usable - numberWidth),
      size: style.titleSize,
      bold: true,
    ),
    if (number.isNotEmpty)
      PrintText(
        x: left,
        y: titleBaseline,
        width: usable,
        text: number,
        size: style.headingSize,
        align: PrintAligns.right,
      ),
    for (var i = 0; i < columns.length; i++)
      PrintText(
        x: xs[i],
        y: headingBaseline,
        width: widths[i],
        text: clipToWidth(columns[i].label, style.headingSize, widths[i]),
        size: style.headingSize,
        align: _alignOf(columns[i]),
      ),
    PrintRule(x: left, y: headingRuleY, width: usable),
  ];
}

/// 1ブロック（見出し / 明細 / 小計 / 総計）を1行に組む。
List<PrintItem> _block({
  required ReportBlock block,
  required ReportPageDefinition page,
  required PrintStyle style,
  required FormatterRegistry registry,
  required List<ColumnDefinition> columns,
  required List<double> widths,
  required List<double> xs,
  required double left,
  required double usable,
  required double top,
  required double rowHeight,
  required double size,
}) {
  // ベースラインは行の下から少し上（文字の下に伸びる部分ぶん）。
  final baseline = top + rowHeight - rowHeight * 0.3;
  switch (block.kind) {
    case ReportBlockKinds.groupHeader:
      // 見出しは文章なので行いっぱいに書く（狭い1列目に押し込めると切れる）。
      final indent = 10.0 * block.level;
      final width = usable - indent;
      return [
        PrintText(
          x: left + indent,
          y: baseline,
          width: width,
          text:
              clipToWidth('${block.label}: ${block.value ?? ''}', size, width),
          size: size,
          bold: true,
        ),
        PrintRule(x: left, y: top + rowHeight, width: usable, thickness: 0.4),
      ];
    case ReportBlockKinds.detail:
      return [
        for (var i = 0; i < columns.length; i++)
          PrintText(
            x: xs[i],
            y: baseline,
            width: widths[i],
            text: clipToWidth(
              _cell(registry, columns[i], block.row[columns[i].field]),
              size,
              widths[i],
            ),
            size: size,
            align: _alignOf(columns[i]),
          ),
      ];
    case ReportBlockKinds.subtotal:
    case ReportBlockKinds.grandTotal:
      final isGrand = block.kind == ReportBlockKinds.grandTotal;
      final label = isGrand ? style.grandTotalLabel : style.subtotalLabel;
      return [
        PrintRule(x: left, y: top, width: usable, thickness: 0.4),
        // 総計の上は二重線（日本の帳票の作法）。
        if (isGrand)
          PrintRule(x: left, y: top + 1.6, width: usable, thickness: 0.4),
        for (var i = 0; i < columns.length; i++)
          PrintText(
            x: xs[i],
            y: baseline,
            width: widths[i],
            // 画面の帳票と同じ規則: 1列目は見出し、以降は自分の列の数字。
            text: clipToWidth(
              i == 0
                  ? label
                  : _totalFor(registry, page.report, style, columns[i], block),
              size,
              widths[i],
            ),
            size: size,
            bold: true,
            align: i == 0 ? PrintAligns.left : _alignOf(columns[i]),
          ),
      ];
    default:
      // 知らない種類（プラグインが増やしたもの）は刷らない。落とさない。
      return const [];
  }
}

String _cell(
  FormatterRegistry registry,
  ColumnDefinition column,
  Object? value,
) {
  if (column.format != null) {
    return registry.format(column.format!, value, column.config);
  }
  return value?.toString() ?? '';
}

/// その列に属する小計・総計。同じ列に2つ（`sum` と `count`）あれば並べる。
String _totalFor(
  FormatterRegistry registry,
  ReportDefinition report,
  PrintStyle style,
  ColumnDefinition column,
  ReportBlock block,
) {
  final parts = <String>[];
  for (var i = 0; i < report.totals.length; i++) {
    final total = report.totals[i];
    if (total.field != column.field) continue;
    if (i >= block.totals.length) continue;
    final value = block.totals[i];
    if (value == null) continue;
    // 件数は数を数えただけなので、列の書式（金額など）を通さない。
    parts.add(total.aggregate == AggregateOps.count
        ? '${value.toInt()} ${style.countSuffix}'
        : _cell(registry, column, value));
  }
  return parts.join(' / ');
}

/// 数は右、それ以外は左（紙の上の作法。画面の帳票と同じ）。
String _alignOf(ColumnDefinition column) => column.type == ColumnTypes.number
    ? PrintAligns.right
    : PrintAligns.left;
